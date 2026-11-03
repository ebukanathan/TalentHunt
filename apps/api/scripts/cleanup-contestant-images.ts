import { environment } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { SupabaseImageStorage } from "../src/storage/contestant-images";
import { AdminContestantImageService } from "../src/services/admin-contestant-images.service";
import { AdminContestantService } from "../src/services/admin-contestants.service";
import { PublicReadService } from "../src/services/public.service";

async function main() {
  if (!environment.storage) throw new Error("Storage configuration required.");
  const service = new AdminContestantImageService(prisma, new SupabaseImageStorage(environment.storage), new AdminContestantService(prisma, new PublicReadService(prisma)));
  console.log(JSON.stringify(await service.cleanup()));
}
main().catch(() => { console.error("Image cleanup failed. Retry after checking backend configuration and connectivity."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
