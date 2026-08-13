/** Slugifies a title for Columns/Authors/Categories. Non-Latin (e.g. Hebrew) titles fall back to a random suffix since there's nothing Latin to derive a slug from. */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${Math.random().toString(36).slice(2, 8)}`;
}
