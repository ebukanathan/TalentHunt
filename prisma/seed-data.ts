/** Fictional local-development fixtures. Keep IDs stable when editing package prices. */
export interface SeedPackage {
  id: string;
  name: string;
  voteCount: number;
  priceKobo: number;
}

export const DEMO_COMPETITION = {
  id: "demo-talenthunt-competition",
  name: "TalentHunt Demo",
  slug: "talenthunt-demo",
  description: "Fictional competition for local development. No real payments or votes.",
} as const;

export const DEMO_CONTESTANTS = [
  { id: "demo-talenthunt-contestant-001", number: "001", slug: "ada-demo", name: "Ada Demo" },
  { id: "demo-talenthunt-contestant-002", number: "002", slug: "bayo-demo", name: "Bayo Demo" },
  { id: "demo-talenthunt-contestant-003", number: "003", slug: "chika-demo", name: "Chika Demo" },
] as const;

/** Configurable demo prices only; these are not production pricing decisions. */
export const DEMO_PACKAGES: readonly SeedPackage[] = [
  { id: "demo-talenthunt-package-starter", name: "Starter", voteCount: 10, priceKobo: 100000 },
  { id: "demo-talenthunt-package-supporter", name: "Supporter", voteCount: 50, priceKobo: 500000 },
  { id: "demo-talenthunt-package-champion", name: "Champion", voteCount: 100, priceKobo: 1000000 },
];
