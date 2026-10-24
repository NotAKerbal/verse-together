import { expect, test } from "vitest";
import { headingRanges } from "../src/features/notes/markdownHeadings";
test("recognizes ATX headings without treating hashtags or indented code as headings",()=>{
 const text="# Title\n## Thought\n#faith is a tag\nText #hope\n    ## code\n####### invalid\n   ### Valid\n";
 expect(headingRanges(text).map(r=>[r.line,r.level,text.slice(r.from,r.prefixEnd)])).toEqual([[1,1,"# "],[2,2,"## "],[7,3,"   ### "]]);
});
test("leaves heading syntax inside both fence styles untouched",()=>{
 const text="````md\n## code\n```\n# still code\n````\n## Real\n~~~\n# hidden\n~~~\n# Last";
 expect(headingRanges(text).map(r=>r.line)).toEqual([6,10]);
});
test("offsets remain exact with CRLF and empty trailing lines",()=>{
 const text="First\r\n## Heading\r\n\r\n";
 expect(headingRanges(text)).toEqual([{line:2,from:7,prefixEnd:10,level:2}]);
});
