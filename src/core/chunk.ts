import type { ChunkRecord } from "../types/index.js";

export interface ChunkOptions {
  sizeChars: number;
  overlapChars: number;
}

export function chunkText(text: string, options: ChunkOptions): ChunkRecord[] {
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return [];
  }

  const chunks: ChunkRecord[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    let end = Math.min(start + options.sizeChars, normalized.length);
    if (end < normalized.length) {
      end = findBoundary(normalized, end);
    }

    const chunkTextValue = normalized.slice(start, end).trim();
    if (chunkTextValue.length > 0) {
      chunks.push({
        chunkIndex,
        chunkText: chunkTextValue,
        charCount: chunkTextValue.length,
      });
      chunkIndex += 1;
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(0, end - options.overlapChars);
  }

  return chunks;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBoundary(text: string, proposedEnd: number): number {
  for (let offset = 0; offset <= 120 && proposedEnd - offset > 0; offset += 1) {
    const current = text[proposedEnd - offset];
    if (current === "\n" || current === " " || current === "." || current === "!" || current === "?") {
      return proposedEnd - offset;
    }
  }

  return proposedEnd;
}
