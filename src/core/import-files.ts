import path from "node:path";
import { readFile } from "node:fs/promises";

import matter from "gray-matter";
import { z } from "zod";

import { globToRegExp, listFiles } from "../utils/fs.js";
import type { ChapterInput } from "../types/index.js";

const frontmatterSchema = z.object({
  chapter_number: z.number().int().positive(),
  title: z.string().min(1),
  source_url: z.string().url(),
});

export async function importMarkdownDirectory(
  directory: string,
  globPattern = "*.md",
): Promise<ChapterInput[]> {
  const files = await listFiles(directory);
  const matcher = globToRegExp(globPattern);
  const filtered = files.filter((file) => matcher.test(path.basename(file)));
  const chapters: ChapterInput[] = [];

  for (const filePath of filtered) {
    const raw = await readFile(filePath, "utf8");
    const parsed = matter(raw);
    const frontmatter = frontmatterSchema.parse(parsed.data);

    if (!parsed.content.trim()) {
      throw new Error(`Imported file has no body text: ${filePath}`);
    }

    chapters.push({
      chapterNumber: frontmatter.chapter_number,
      title: frontmatter.title,
      sourceName: "markdown",
      sourceUrl: frontmatter.source_url,
      sourceChapterRef: path.basename(filePath, path.extname(filePath)),
      rawText: parsed.content.trim(),
    });
  }

  return chapters.sort((left, right) => left.chapterNumber - right.chapterNumber);
}
