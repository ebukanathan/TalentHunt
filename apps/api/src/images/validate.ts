import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "../config/storage";
import { HttpError } from "../http/errors";

export type ImageInput = { bytes: Buffer; filename: string; mimeType: string };
let processing = 0;
const invalid = () => new HttpError(400, "INVALID_IMAGE", "Choose a valid, non-animated JPG, PNG or WebP photograph.");
export async function normalizeImage(input: ImageInput) {
  if (input.bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "IMAGE_TOO_LARGE", "Photographs must be 5 MB or smaller.");
  if (!input.bytes.length || input.filename.length > 200 || /[/\\\x00-\x1f\x7f]/.test(input.filename)) throw invalid();
  const extension = /\.([a-z]+)$/i.exec(input.filename)?.[1].toLowerCase();
  const formats: Record<string, { format: string; mime: string }> = { jpg: { format: "jpeg", mime: "image/jpeg" }, jpeg: { format: "jpeg", mime: "image/jpeg" }, png: { format: "png", mime: "image/png" }, webp: { format: "webp", mime: "image/webp" } };
  const expected = extension ? formats[extension] : undefined;
  if (!expected || input.mimeType !== expected.mime) throw invalid();
  const b = input.bytes;
  const signature = b[0] === 255 && b[1] === 216 && b[2] === 255 ? "jpeg" : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
  if (signature !== expected.format) throw invalid();
  if (signature === "jpeg" && (b[b.length - 2] !== 255 || b[b.length - 1] !== 217)) throw invalid();
  if (signature === "webp" && b.readUInt32LE(4) + 8 !== b.length) throw invalid();
  if (signature === "png") {
    let offset = 8, ended = false;
    while (offset + 12 <= b.length) {
      const length = b.readUInt32BE(offset), type = b.toString("ascii", offset + 4, offset + 8);
      if (length > b.length - offset - 12 || type === "acTL") throw invalid();
      offset += length + 12;
      if (type === "IEND") { ended = length === 0 && offset === b.length; break; }
    }
    if (!ended) throw invalid();
  }
  if (processing >= 2) throw new HttpError(429, "IMAGE_PROCESSING_BUSY", "Image processing is busy. Try again shortly.");
  processing++;
  try {
    const image = sharp(b, { failOn: "warning", limitInputPixels: 16_000_000, sequentialRead: true }).timeout({ seconds: 10 });
    const metadata = await image.metadata();
    if (metadata.format !== expected.format || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) throw invalid();
    // Force full pixel decoding; never publish original bytes or preserved metadata.
    const output = await image.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (output.length > MAX_IMAGE_BYTES) throw invalid();
    return output;
  } catch { throw invalid(); }
  finally { processing--; }
}
