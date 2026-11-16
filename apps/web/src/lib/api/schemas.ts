import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
export const youtubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
export const contestantVideoSchema = z.object({
  id,
  youtubeVideoId: youtubeVideoIdSchema,
  position: z.union([z.literal(1), z.literal(2)]),
});
const contestantVideos = z.array(contestantVideoSchema).max(2).superRefine((videos, context) => {
  if (new Set(videos.map(video => video.youtubeVideoId)).size !== videos.length ||
      videos.some((video, index) => index > 0 && video.position <= videos[index - 1].position)) {
    context.addIssue({ code: "custom", message: "Invalid performance video order or duplicate video." });
  }
});
export const competitionSchema = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "COMPLETED"]),
  votingOpens: z.iso.datetime().nullable(),
  votingCloses: z.iso.datetime().nullable(),
  currency,
});
export const contestantSchema = z.object({
  id,
  competitionId: id,
  number: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().nullable(),
  imageUrl: z.string().nullable(),
  totalVotes: z.string().regex(/^(0|[1-9][0-9]*)$/),
  videos: contestantVideos,
});
export const votePackageSchema = z.object({
  id,
  competitionId: id,
  name: z.string().min(1),
  voteCount: z.number().int().positive(),
  priceKobo: z.number().int().positive(),
  currency,
});
export const contestantIdSchema = id;
export type Competition = z.infer<typeof competitionSchema>;
export type Contestant = z.infer<typeof contestantSchema>;
export type ContestantVideo = z.infer<typeof contestantVideoSchema>;
export type VotePackage = z.infer<typeof votePackageSchema>;
