import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { importMarkdownDirectory } from "../src/core/import-files.js";

const createdDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(createdDirs.map((directory) => rm(directory, { recursive: true, force: true })));
  createdDirs.length = 0;
});

describe("importMarkdownDirectory", () => {
  it("parses frontmatter and body into chapter inputs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ss-ragbot-"));
    createdDirs.push(directory);
    const filePath = path.join(directory, "0001.md");
    await writeFile(
      filePath,
      `---
chapter_number: 1
title: "Chapter 1"
source_url: "https://example.com/chapter/1"
---

Chapter body text.
`,
      "utf8",
    );

    const chapters = await importMarkdownDirectory(directory);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[0].rawText).toContain("Chapter body text.");
  });
});
