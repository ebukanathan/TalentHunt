import busboy from "busboy";
import { Transform } from "node:stream";
import type { Request } from "express";
import { MAX_IMAGE_BYTES, MAX_IMAGE_REQUEST_BYTES } from "../config/storage";
import { HttpError } from "../http/errors";
import type { ImageInput } from "./validate";

/** Called only after session and CSRF checks. Counts the stream, including chunked bodies. */
export function readImage(request: Request): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    let count = 0, file: ImageInput | undefined, failure: HttpError | undefined;
    const bad = () => new HttpError(400, "INVALID_IMAGE_REQUEST", "Send exactly one photograph in the image field.");
    const large = () => new HttpError(413, "IMAGE_TOO_LARGE", "Photographs must be 5 MB or smaller.");
    let parser: ReturnType<typeof busboy>;
    try { parser = busboy({ headers: request.headers, preservePath: true, limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1, fields: 0, parts: 2, headerPairs: 50 } }); }
    catch { reject(bad()); return; }
    const cap = new Transform({ transform(chunk: Buffer, _encoding, next) {
      count += chunk.length; next(count > MAX_IMAGE_REQUEST_BYTES ? large() : null, chunk);
    } });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); request.off("aborted", aborted);
      request.unpipe(cap); cap.unpipe(parser); cap.destroy(); parser.destroy();
      if (error) { request.resume(); reject(error); } else resolve(file!);
    };
    const aborted = () => finish(bad());
    const timer = setTimeout(() => finish(new HttpError(408, "IMAGE_UPLOAD_TIMEOUT", "Image upload timed out.")), 30000);
    request.once("aborted", aborted);
    cap.on("error", error => finish(error)); parser.on("error", () => finish(bad()));
    parser.on("file", (name, stream, info) => {
      const chunks: Buffer[] = [];
      if (name !== "image" || file) failure = bad();
      file = { bytes: Buffer.alloc(0), filename: info.filename || "", mimeType: info.mimeType };
      stream.on("limit", () => { failure = large(); });
      stream.on("error", () => finish(bad()));
      stream.on("data", (chunk: Buffer) => { if (!failure) chunks.push(chunk); });
      stream.on("end", () => { if (file) file.bytes = Buffer.concat(chunks); });
    });
    for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const) parser.on(event, () => { failure = bad(); });
    parser.on("close", () => finish(failure || (!file ? bad() : undefined)));
    request.pipe(cap).pipe(parser);
  });
}
