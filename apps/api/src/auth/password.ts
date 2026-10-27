import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 2 ** 17, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const dummy = "scrypt$131072$8$1$" + Buffer.alloc(32).toString("base64url") + "$" + Buffer.alloc(64).toString("base64url");
let inFlight = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Bound per-process memory as well as persistent request rates. No unbounded queue.
  if (inFlight >= 2) throw new PasswordCapacityError();
  inFlight++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
  } finally { inFlight--; }
}
export class PasswordCapacityError extends Error { constructor() { super("Authentication is busy."); } }
export async function hashPassword(password: string) {
  const salt = randomBytes(32);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(password: string, stored?: string) {
  const valid = /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{43}\$[A-Za-z0-9_-]{86}$/.test(stored || "");
  const parts = (valid ? stored! : dummy).split("$");
  const key = await derive(password, Buffer.from(parts[4], "base64url"));
  return timingSafeEqual(key, Buffer.from(parts[5], "base64url")) && valid;
}
