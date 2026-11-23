// Read-only comparison: this SQL is an expected diff, never an executed change.
const expected = 'ALTER TABLE "Contestant" ALTER COLUMN "categoryId" DROP NOT NULL, ALTER COLUMN "subcategoryId" DROP NOT NULL;';
function assertFinalizedFixtureDiff(status, sql) {
  const normalized = sql.replace(/^\s*--[^\n]*$/gm, "").replace(/\s+/g, " ").trim();
  if (status !== 2 || normalized !== expected) {
    throw new Error("Finalized fixture drift must contain exactly its two deliberately required assignment columns.");
  }
}
module.exports = { assertFinalizedFixtureDiff };
