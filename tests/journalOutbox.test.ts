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
