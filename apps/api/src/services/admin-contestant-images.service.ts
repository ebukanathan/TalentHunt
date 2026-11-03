import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import { normalizeImage, type ImageInput } from "../images/validate";
import { managedKey, type ImageStorage } from "../storage/contestant-images";
import type { AdminContestantService } from "./admin-contestants.service";

const day = 24 * 60 * 60 * 1000;
const conflict = () => new HttpError(409, "IMAGE_CHANGED", "The photograph changed during this request. Reload before retrying.");
export class AdminContestantImageService {
  constructor(private readonly db: PrismaClient, private readonly storage: ImageStorage,
    private readonly contestants: Pick<AdminContestantService, "get">, private readonly now = () => new Date()) {}

  async upload(id: string, input: ImageInput, adminId: string) {
    const { contestant } = await this.contestants.get(id);
    const bytes = await normalizeImage(input);
    const objectKey = `contestants/${contestant.competitionId}/${id}/${randomUUID()}.webp`;
    const imageUrl = this.storage.publicUrl(objectKey);
    // Journal BEFORE dispatch. Even an unknown upload outcome can be reconciled after a crash.
    const operation = await this.db.contestantImageOperation.create({ data: {
      contestantId: id, objectKey, imageUrl, previousUrl: contestant.imageUrl, nextAttemptAt: new Date(this.now().getTime() + day),
    } });
    await this.storage.upload(objectKey, bytes);
    // Never eagerly delete on transaction error: its commit result might be unknown.
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ContestantImageOperation" WHERE id = ${operation.id} FOR UPDATE`;
      const current = await tx.contestantImageOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (current.state !== "PENDING") throw conflict();
      const changed = await tx.contestant.updateMany({ where: { id, competitionId: contestant.competitionId, imageUrl: contestant.imageUrl }, data: { imageUrl } });
      if (changed.count !== 1) throw conflict();
      await tx.contestantImageOperation.update({ where: { id: operation.id }, data: { state: "ATTACHED" } });
      if (contestant.imageUrl) await tx.contestantImageOperation.updateMany({ where: { imageUrl: contestant.imageUrl, state: "ATTACHED" }, data: { state: "CLEANUP", nextAttemptAt: new Date(this.now().getTime() + 3600000) } });
      await tx.auditLog.create({ data: { adminId, action: "CONTESTANT_IMAGE_CHANGED", entityType: "Contestant", entityId: id,
        details: { before: contestant.imageUrl, after: imageUrl } } });
    });
    return { imageUrl };
  }
  async remove(id: string, adminId: string) {
    const { contestant } = await this.contestants.get(id);
    if (!contestant.imageUrl) return { imageUrl: null };
    const previousUrl = contestant.imageUrl;
    await this.db.$transaction(async tx => {
      const changed = await tx.contestant.updateMany({ where: { id, competitionId: contestant.competitionId, imageUrl: contestant.imageUrl }, data: { imageUrl: null } });
      if (changed.count !== 1) throw conflict();
      await tx.contestantImageOperation.updateMany({ where: { imageUrl: previousUrl, state: "ATTACHED" }, data: { state: "CLEANUP", nextAttemptAt: new Date(this.now().getTime() + 3600000) } });
      await tx.auditLog.create({ data: { adminId, action: "CONTESTANT_IMAGE_REMOVED", entityType: "Contestant", entityId: id, details: { before: contestant.imageUrl, after: null } } });
    });
    return { imageUrl: null };
  }

  /** Bounded, restartable job. Claim before I/O so attach and cleanup cannot race. */
  async cleanup(limit = 20) {
    const due = await this.db.contestantImageOperation.findMany({ where: { state: { in: ["PENDING", "CLEANUP", "DELETING"] }, nextAttemptAt: { lte: this.now() } }, orderBy: { nextAttemptAt: "asc" }, take: Math.max(1, Math.min(limit, 100)) });
    let deleted = 0;
    for (const item of due) {
      if (!managedKey(item.objectKey) || this.storage.publicUrl(item.objectKey) !== item.imageUrl) continue;
      const claimed = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "ContestantImageOperation" WHERE id = ${item.id} FOR UPDATE`;
        const row = await tx.contestantImageOperation.findUniqueOrThrow({ where: { id: item.id } });
        if (!["PENDING", "CLEANUP", "DELETING"].includes(row.state) || row.nextAttemptAt > this.now()) return false;
        if (await tx.contestant.count({ where: { imageUrl: item.imageUrl } })) {
          await tx.contestantImageOperation.update({ where: { id: item.id }, data: { state: "ATTACHED" } });
          return false;
        }
        await tx.contestantImageOperation.update({ where: { id: item.id }, data: { state: "DELETING", attempts: { increment: 1 }, nextAttemptAt: new Date(this.now().getTime() + 60000) } });
        return true;
      });
      if (!claimed) continue;
      try {
        await this.storage.remove(item.objectKey);
        await this.db.contestantImageOperation.updateMany({ where: { id: item.id, state: "DELETING" }, data: { state: "DELETED" } });
        deleted++;
      } catch {
        // No provider details or credentials in logs; persisted backoff remains restartable.
        await this.db.contestantImageOperation.updateMany({ where: { id: item.id, state: "DELETING" }, data: { nextAttemptAt: new Date(this.now().getTime() + Math.min(day, 60000 * 2 ** Math.min(item.attempts, 10))) } });
      }
    }
    return { examined: due.length, deleted };
  }
}
