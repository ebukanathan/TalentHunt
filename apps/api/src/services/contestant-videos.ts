import type { Prisma } from "@prisma/client";

export const contestantVideoSelection = {
  orderBy: { position: "asc" },
  select: { id: true, youtubeVideoId: true, position: true },
} satisfies Prisma.Contestant$videosArgs;
