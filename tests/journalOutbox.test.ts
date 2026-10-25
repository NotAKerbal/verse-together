import { afterEach, expect, test, vi } from "vitest";
import { JournalOutbox, RevisionConflictError } from "../src/features/notes/journalOutbox";
afterEach(()=>vi.useRealTimers());
test("serializes typing during a save and uses the confirmed next revision",async()=>{
 vi.useFakeTimers();
 let release!:(value:{markdownRevision:number})=>void;
 const save=vi.fn().mockImplementationOnce(()=>new Promise(r=>{release=r;})).mockResolvedValue({markdownRevision:2});
 const outbox=new JournalOutbox(save);
 outbox.edit("note","one",0);outbox.flush("note");
 outbox.edit("note","two\n",0);outbox.flush("note");
 expect(save).toHaveBeenCalledTimes(1);
 release({markdownRevision:1});await Promise.resolve();
 await vi.advanceTimersByTimeAsync(900);
 expect(save).toHaveBeenLastCalledWith("note","two\n",1);
 expect(outbox.get("note")?.status).toBe("saved");outbox.dispose();
});
test("keeps recoverable text after errors and retries without claiming saved",async()=>{
 const save=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({markdownRevision:1});
 const outbox=new JournalOutbox(save);outbox.edit("note","  body\n",0);outbox.flush("note");await Promise.resolve();
 expect(outbox.get("note")).toMatchObject({status:"error",text:"  body\n",baseRevision:0});
 expect(outbox.hasUnsaved()).toBe(true);outbox.retry("note");await Promise.resolve();
 expect(outbox.get("note")).toMatchObject({status:"saved",text:"  body\n",baseRevision:1});outbox.dispose();
});
test("never overwrites a conflict until explicitly choosing the local text",async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValueOnce(new RevisionConflictError(4)).mockResolvedValue({markdownRevision:5});
 const outbox=new JournalOutbox(save);outbox.edit("note","mine",1);outbox.flush("note");await Promise.resolve();
 expect(outbox.get("note")).toMatchObject({status:"conflict",text:"mine",conflictRevision:4});
 outbox.edit("note","mine continued",1);await vi.advanceTimersByTimeAsync(3000);expect(save).toHaveBeenCalledTimes(1);
 outbox.keepMine("note");await Promise.resolve();expect(save).toHaveBeenLastCalledWith("note","mine continued",4);outbox.dispose();
});

// Deleting a note through the outbox (remove): its saves hold for the outcome, and once it is gone nothing
// brings its entry back, so no save error or unload warning outlives it.
function deferred<T = void>() {
 let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
 const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});
 return {promise,resolve,reject};
}
test("deleting cancels a pending save and forgets the note's text once the server confirms",async()=>{
 vi.useFakeTimers();const save=vi.fn().mockResolvedValue({markdownRevision:1});
 const outbox=new JournalOutbox(save);const other=vi.fn();outbox.subscribe(other);
 outbox.edit("note","typed, not yet saved",0);outbox.edit("kept","another note",0);
 const server=deferred();const removal=outbox.remove("note",()=>server.promise);
 await vi.advanceTimersByTimeAsync(3000);
 expect(save).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledWith("kept","another note",0);
 expect(outbox.get("note")).toMatchObject({status:"pending",text:"typed, not yet saved"});
 server.resolve();await removal;
 expect(outbox.get("note")).toBeUndefined();expect(outbox.getSnapshot().has("note")).toBe(false);
 expect(outbox.hasUnsaved()).toBe(false);
 // The editor flushing as it closes, or a stray change event, records and saves nothing.
 outbox.flush("note");outbox.edit("note","after delete",0);outbox.flushAll();await vi.advanceTimersByTimeAsync(3000);
 expect(outbox.get("note")).toBeUndefined();expect(save).toHaveBeenCalledTimes(1);outbox.dispose();
});
test("a save still in flight when the note is deleted cannot bring it back, whether it lands or fails",async()=>{
 for(const outcome of ["lands","fails"] as const){
  const request=deferred<{markdownRevision:number}>();const save=vi.fn().mockReturnValue(request.promise);
  const outbox=new JournalOutbox(save);outbox.edit("note","in flight",0);outbox.flush("note");
  expect(outbox.get("note")?.status).toBe("saving");
  await outbox.remove("note",async()=>{});
  expect(outbox.get("note")).toBeUndefined();
  if(outcome==="lands")request.resolve({markdownRevision:1});else request.reject(new Error("Draft not found"));
  await request.promise.catch(()=>{});await Promise.resolve();await Promise.resolve();
  expect(outbox.get("note")).toBeUndefined();expect(outbox.hasUnsaved()).toBe(false);
  outbox.dispose();
 }
});
test("a failed delete keeps the text, rethrows, and saves what was typed before and during the attempt",async()=>{
 vi.useFakeTimers();const save=vi.fn().mockResolvedValue({markdownRevision:1});
 const outbox=new JournalOutbox(save);outbox.edit("note","before",0);
 const server=deferred();const removal=outbox.remove("note",()=>server.promise);
 outbox.edit("note","before and during",0);outbox.flush("note");await vi.advanceTimersByTimeAsync(3000);
 expect(save).not.toHaveBeenCalled();
 server.reject(new Error("offline"));await expect(removal).rejects.toThrow("offline");
 expect(outbox.get("note")).toMatchObject({status:"pending",text:"before and during"});expect(outbox.hasUnsaved()).toBe(true);
 await vi.advanceTimersByTimeAsync(900);
 expect(save).toHaveBeenCalledWith("note","before and during",0);expect(outbox.get("note")?.status).toBe("saved");outbox.dispose();
});
test("a save landing during a failed delete leaves the newer typing to be saved afterwards",async()=>{
 vi.useFakeTimers();const first=deferred<{markdownRevision:number}>();
 const save=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({markdownRevision:2});
 const outbox=new JournalOutbox(save);outbox.edit("note","one",0);outbox.flush("note");
 const server=deferred();const removal=outbox.remove("note",()=>server.promise);
 outbox.edit("note","one two",0);first.resolve({markdownRevision:1});await vi.advanceTimersByTimeAsync(3000);
 expect(save).toHaveBeenCalledTimes(1);expect(outbox.get("note")).toMatchObject({status:"pending",baseRevision:1});
 server.reject(new Error("offline"));await expect(removal).rejects.toThrow();
 await vi.advanceTimersByTimeAsync(900);
 expect(save).toHaveBeenLastCalledWith("note","one two",1);expect(outbox.get("note")?.status).toBe("saved");outbox.dispose();
});
