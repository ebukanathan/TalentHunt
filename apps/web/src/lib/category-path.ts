export function categoryPath(categoryId: string, subcategoryId?: string) {
  return `/categories/${encodeURIComponent(categoryId)}${subcategoryId ? `/subcategories/${encodeURIComponent(subcategoryId)}` : ""}`;
}
export function scopedLeaderboardPath(categoryId: string, subcategoryId: string, admin = false) {
  return `${admin ? "/admin" : ""}/leaderboard?${new URLSearchParams({ categoryId, subcategoryId })}`;
}
