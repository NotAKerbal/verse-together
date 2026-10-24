import {expect,test} from "vitest";
import {monthGrid,shiftMonth,weekOf,isSafeSourceHref} from "../src/features/notes/journal";
test("month navigation crosses year boundaries and includes leap days",()=>{expect(shiftMonth("2026-12",1)).toBe("2027-01");expect(shiftMonth("2026-01",-1)).toBe("2025-12");expect(monthGrid("2024-02").filter(Boolean)).toHaveLength(29);expect(monthGrid("2026-02").filter(Boolean)).toHaveLength(28);expect(monthGrid("2026-10").length%7).toBe(0);});
test("week strip crosses month and year boundaries without skipping a day",()=>{expect(weekOf("2027-01-01")).toEqual(["2026-12-27","2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02"]);});
test("source hrefs accept exact reader fragments and reject external/unsafe forms",()=>{expect(isSafeSourceHref("/browse/bookofmormon/1-nephi/2#v-3")).toBe(true);for(const href of ["//evil.example","/\\evil.example","javascript:alert(1)","/notes\nheader"]){expect(isSafeSourceHref(href)).toBe(false);}});
