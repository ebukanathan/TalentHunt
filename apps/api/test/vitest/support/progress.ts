import { beforeEach, afterEach } from "vitest";
// Direct progress survives a stalled fixture teardown; names contain no records.
beforeEach(({ task }) => { process.stdout.write(`[financial:start] ${task.name}\n`); });
afterEach(({ task }) => { process.stdout.write(`[financial:end] ${task.name}\n`); });
