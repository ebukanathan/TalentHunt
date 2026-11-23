const assert = require("node:assert/strict");
const test = require("node:test");
const { assertFinalizedFixtureDiff } = require("../scripts/qa-schema-drift.cjs");
const expected = '-- AlterTable\nALTER TABLE "Contestant" ALTER COLUMN "categoryId" DROP NOT NULL,\nALTER COLUMN "subcategoryId" DROP NOT NULL;\n';

test("finalized fixture permits only the two known nullability differences", () => {
  assert.doesNotThrow(() => assertFinalizedFixtureDiff(2, expected));
  for (const sql of ["", expected + 'DROP TABLE "Payment";', expected.replace('"subcategoryId"', '"competitionId"'), expected.replace(',\nALTER COLUMN "subcategoryId" DROP NOT NULL', '')]) {
    assert.throws(() => assertFinalizedFixtureDiff(2, sql), /exactly/);
  }
  for (const status of [0, 1, null]) assert.throws(() => assertFinalizedFixtureDiff(status, expected), /exactly/);
});
