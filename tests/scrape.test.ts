import { describe, expect, it } from "vitest";

import { collectChapterUrls, parseChapterPage } from "../src/core/scrape.js";

describe("collectChapterUrls", () => {
  it("deduplicates and sorts chapter links by chapter number", () => {
    const html = `
      <html>
        <body>
          <a href="/chapter-10/">Chapter 10</a>
          <a href="/chapter-2/">Chapter 2</a>
          <a href="/chapter-10/">Chapter 10 duplicate</a>
          <a href="/about">About</a>
        </body>
      </html>
    `;

    const urls = collectChapterUrls(html, "https://readshadowslave.com");

    expect(urls).toEqual([
      { chapterNumber: 2, url: "https://readshadowslave.com/chapter-2/" },
      { chapterNumber: 10, url: "https://readshadowslave.com/chapter-10/" },
    ]);
  });
});

describe("parseChapterPage", () => {
  it("extracts title, chapter number, source ref, and normalized body text", () => {
    const html = `
      <html>
        <head><title>Chapter 15 - Test Title</title></head>
        <body>
          <main>
            <h1>Chapter 15: Test Title</h1>
            <div class="chapter-content">
              <p>${"Sentence one. ".repeat(50)}</p>
              <p>${"Sentence two. ".repeat(50)}</p>
            </div>
          </main>
        </body>
      </html>
    `;

    const chapter = parseChapterPage("https://readshadowslave.com/chapter-15/", html);

    expect(chapter.chapterNumber).toBe(15);
    expect(chapter.title).toBe("Chapter 15: Test Title");
    expect(chapter.sourceName).toBe("readshadowslave");
    expect(chapter.sourceChapterRef).toBe("/chapter-15");
    expect(chapter.rawText).toContain("Sentence one.");
    expect(chapter.rawText.length).toBeGreaterThan(400);
  });
});
