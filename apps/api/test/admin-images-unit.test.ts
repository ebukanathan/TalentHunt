import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { readStorageConfiguration } from "../src/config/storage";
import { normalizeImage } from "../src/images/validate";
import { SupabaseImageStorage } from "../src/storage/contestant-images";

test("storage configuration is opt-in, rejects public/unsafe keys and redacts invalid values", () => {
  assert.equal(readStorageConfiguration({}), null);
  for (const input of [{ SUPABASE_URL: "http://unsafe.example" }, { SUPABASE_SECRET_KEY: "private-invalid-value" },
    { SUPABASE_URL: "https://project.supabase.co/path", SUPABASE_SECRET_KEY: "sb_secret_" + "a".repeat(30) },
    { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sb_publishable_" + "a".repeat(30) }]) {
    assert.throws(() => readStorageConfiguration(input), error => error instanceof Error && !error.message.includes("private-invalid-value"));
  }
  assert.ok(readStorageConfiguration({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_" + "a".repeat(30) }));
});
test("all supported formats decode fully to metadata-free WebP with bounded dimensions", async () => {
  for (const [format, extension, mimeType] of [["jpeg", "jpg", "image/jpeg"], ["png", "png", "image/png"], ["webp", "webp", "image/webp"]] as const) {
    const bytes = await sharp({ create: { width: 2100, height: 100, channels: 3, background: "red" } }).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const output = await normalizeImage({ bytes, filename: `photo.${extension}`, mimeType });
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp"); assert.ok(metadata.width! <= 2000 && metadata.height! <= 2000);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  }
});
test("forged MIME/extensions, SVG, traversal names, malformed/truncated/oversized/dimension bombs reject", async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
  for (const input of [
    { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), filename: "photo.png", mimeType: "image/png" },
    { bytes, filename: "photo.jpg", mimeType: "image/jpeg" }, { bytes, filename: "photo.png", mimeType: "image/jpeg" },
    { bytes, filename: "../photo.png", mimeType: "image/png" }, { bytes, filename: "photo.png.exe", mimeType: "image/png" },
    { bytes: bytes.subarray(0, 45), filename: "photo.png", mimeType: "image/png" },
    { bytes: Buffer.alloc(5_000_001), filename: "photo.png", mimeType: "image/png" },
    { bytes: await sharp({ create: { width: 9000, height: 1, channels: 3, background: "red" } }).png().toBuffer(), filename: "photo.png", mimeType: "image/png" },
  ]) await assert.rejects(normalizeImage(input));
});
test("storage sends only generated keys and never relays provider errors or secret keys", async () => {
  const original = globalThis.fetch;
  const config = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_" + "f".repeat(30) };
  const key = "contestants/show/person/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.webp";
  try {
    globalThis.fetch = (async () => Response.json({ message: config.SUPABASE_SECRET_KEY }, { status: 503 })) as typeof fetch;
    const storage = new SupabaseImageStorage(config);
    assert.match(storage.publicUrl(key), /\/storage\/v1\/object\/public\/contestant-images\/contestants\//);
    await assert.rejects(storage.upload(key, Buffer.from("fixture")), error => error instanceof Error && !error.message.includes(config.SUPABASE_SECRET_KEY));
    await assert.rejects(storage.remove("../../other-bucket"));
  } finally { globalThis.fetch = original; }
});
