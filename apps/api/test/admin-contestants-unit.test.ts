import assert from "node:assert/strict";
import test from "node:test";
import { adminContestantQuery, createAdminContestant, patchAdminContestant } from "../src/validation/admin-contestants";
const input = { name: " Ada Example ", number: " 001 ", slug: " Ada-Example " };
test("contestant validation normalizes editable fields and preserves number identifiers", () => {
  assert.deepEqual(createAdminContestant.parse(input), { name: "Ada Example", number: "001", slug: "ada-example", isActive: true });
  assert.deepEqual(patchAdminContestant.parse({ bio: " ", imageUrl: "", isActive: false }), { bio: null, imageUrl: null, isActive: false });
  assert.equal(createAdminContestant.parse({ ...input, imageUrl: "https://images.example.com/photo.jpg" }).imageUrl, "https://images.example.com/photo.jpg");
});
test("strict create and patch inputs reject vote, attribution, ID and other mass assignment", () => {
  for (const field of ["id", "competitionId", "totalVotes", "payments", "allocations", "createdAt", "adminId"]) {
    assert.equal(createAdminContestant.safeParse({ ...input, [field]: "malicious" }).success, false);
    assert.equal(patchAdminContestant.safeParse({ [field]: "malicious" }).success, false);
  }
  for (const invalid of [{}, { name: " " }, { number: "a".repeat(21) }, { slug: "../bad" }, { slug: "<script>" }, { isActive: "false" },
    { bio: "a".repeat(5001) }, { name: "bad\u0000name" }, { imageUrl: "http://example.com/photo.jpg" }, { imageUrl: "javascript:alert(1)" },
    { imageUrl: "data:image/png;base64,abc" }, { imageUrl: "https://name:password@example.com/photo.jpg" }, { imageUrl: "https://example.com/#fragment" }, { imageUrl: "https://exam\nple.com/image.jpg" }]) {
    assert.equal(patchAdminContestant.safeParse(invalid).success, false);
  }
});
test("search and pagination are bounded and reject unknown/repeated/coerced query values", () => {
  assert.deepEqual(adminContestantQuery.parse({}), { q: "", status: "all", page: 1, pageSize: 25 });
  assert.deepEqual(adminContestantQuery.parse({ q: " Ada ", status: "inactive", page: "2", pageSize: "10" }), { q: "Ada", status: "inactive", page: 2, pageSize: 10 });
  for (const invalid of [{ q: "a".repeat(101) }, { q: "a\u0000b" }, { status: "deleted" }, { status: ["all", "active"] }, { page: "0" }, { page: "1.5" }, { page: "1e3" }, { pageSize: "101" }, { competitionId: "another" }]) assert.equal(adminContestantQuery.safeParse(invalid).success, false);
});
