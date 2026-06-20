import type { RetrievedChunk } from "../types/index.js";

export function buildAnswerPrompt(question: string, chunks: RetrievedChunk[]): string {
  const context = chunks
    .map(
      (chunk) =>
        [
          `Chapter ${chunk.chapterNumber}: ${chunk.chapterTitle}`,
          `Source: ${chunk.sourceUrl}`,
          `Chunk ${chunk.chunkIndex}`,
          chunk.chunkText,
        ].join("\n"),
    )
    .join("\n\n---\n\n");

  return [
    "You are a canon-grounded Shadow Slave lore assistant.",
    "Use only the supplied evidence.",
    "If the evidence is insufficient, say that there is not enough evidence.",
    "Do not speculate, theorize, or invent chapter references.",
    "Do not include inline chapter numbers or source URLs in the prose answer; the CLI renders citations separately.",
    "Answer in concise prose and ground every claim in the provided context.",
    "",
    `Question: ${question}`,
    "",
    "Evidence:",
    context,
  ].join("\n");
}
