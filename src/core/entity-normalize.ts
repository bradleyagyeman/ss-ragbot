export function normalizeEntityText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/i, "")
    .trim();
}
