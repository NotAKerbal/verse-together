import assert from "node:assert/strict";
import test from "node:test";
import { clerkCsvToEntries, parseCsv } from "./auth-migration.mjs";

test("parses quoted CSV fields with commas, quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"'],
  ]);
});

test("converts a Clerk export, marking only verified primary emails as verified", () => {
  const csv = [
    "id,first_name,last_name,primary_email_address,verified_email_addresses,password_digest",
    'user_2abcdefgh01,Alice,Smith,Alice@Example.com,"alice@example.com,old@example.com",$2a$10$secret',
    "user_2abcdefgh02,Bob,,bob@example.com,,$2a$10$secret",
    "user_2abcdefgh03,,,,,",
  ].join("\n");
  const { entries, skipped } = clerkCsvToEntries(csv);
  assert.deepEqual(entries, [
    { legacyClerkId: "user_2abcdefgh01", email: "alice@example.com", emailVerified: true, name: "Alice Smith" },
    { legacyClerkId: "user_2abcdefgh02", email: "bob@example.com", emailVerified: false, name: "Bob" },
  ]);
  assert.equal(skipped.length, 1);
  assert.ok(!JSON.stringify(entries).includes("secret"), "password digests are never copied");
});

test("refuses exports without the required columns", () => {
  assert.throws(() => clerkCsvToEntries("email,name\nx@example.com,X\n"), /id.*primary_email_address/);
});
