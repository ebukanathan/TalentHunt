import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { provisionInitialAdmin } from "../src/auth/provision";

// No dotenv/DATABASE_URL fallback, command-line credentials or defaults.
async function main() {
  const target = process.env.ADMIN_PROVISION_DATABASE_URL;
  if (process.env.ADMIN_PROVISION_CONFIRM !== "initial-admin" || !target) throw new Error("Explicit provisioning target and confirmation required.");
  if (!["postgres:", "postgresql:"].includes(new URL(target).protocol)) throw new Error("PostgreSQL required.");
  let credentials: unknown;
  if (process.argv.slice(2).join(" ") === "--stdin") {
    if (stdin.isTTY) throw new Error("Use a protected redirected JSON stream.");
    let value = "";
    for await (const chunk of stdin) {
      value += String(chunk);
      if (Buffer.byteLength(value) > 4096) throw new Error("Input too large.");
    }
    credentials = JSON.parse(value);
  } else {
    if (process.argv.length > 2 || !stdin.isTTY || !stdout.isTTY) throw new Error("Interactive terminal or --stdin required.");
    const rl = createInterface({ input: stdin, output: stdout });
    const email = await rl.question("Initial admin email: ");
    rl.close();
    const masked = async (label: string) => {
      stdout.write(label);
      stdin.setRawMode(true);
      stdin.resume();
      try {
        return await new Promise<string>((resolve, reject) => {
          let password = "";
          const onData = (data: Buffer) => {
            for (const character of data.toString("utf8")) {
              if (character === "\u0003") { done(); reject(new Error("Cancelled.")); return; }
              if (character === "\r" || character === "\n") { done(); resolve(password); return; }
              if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
              else if (character >= " " && password.length < 129) password += character;
            }
          };
          const done = () => stdin.off("data", onData);
          stdin.on("data", onData);
        });
      } finally { stdin.setRawMode(false); stdin.pause(); stdout.write("\n"); }
    };
    const password = await masked("Password (16-128 characters, hidden): ");
    if (password !== await masked("Confirm password (hidden): ")) throw new Error("Passwords differ.");
    credentials = { email, password };
  }
  const db = new PrismaClient({ datasources: { db: { url: target } } });
  try { await provisionInitialAdmin(db, credentials); stdout.write("Initial administrator provisioned. No credentials were printed.\n"); }
  finally { await db.$disconnect(); }
}
main().catch(() => {
  console.error("Provisioning failed. Check explicit target, input policy and whether an administrator already exists. No existing credentials were replaced.");
  process.exitCode = 1;
});
