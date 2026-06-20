import { load } from "cheerio";

import type { AppConfig, ChapterInput, Logger } from "../types/index.js";

export interface ScrapeOptions {
  limit?: number | undefined;
  startAt?: number | undefined;
  logger: Logger;
}

export async function scrapeChapters(
  config: AppConfig,
  options: ScrapeOptions,
): Promise<ChapterInput[]> {
  const indexHtml = await fetchHtml(config.source.indexUrl, config.source.requestTimeoutMs);
  const urls = collectChapterUrls(indexHtml, config.source.baseUrl)
    .filter((entry) => (options.startAt ? entry.chapterNumber >= options.startAt : true))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);

  options.logger.info("discovered chapter urls", { count: urls.length });

  const chapters: ChapterInput[] = [];
  for (const entry of urls) {
    const html = await fetchHtml(entry.url, config.source.requestTimeoutMs);
    chapters.push(parseChapterPage(entry.url, html));
  }

  return chapters;
}

export function collectChapterUrls(
  indexHtml: string,
  baseUrl: string,
): Array<{ chapterNumber: number; url: string }> {
  const $ = load(indexHtml);
  const seen = new Map<number, string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const absoluteUrl = new URL(href, baseUrl).toString();
    const chapterNumber = extractChapterNumber(`${$(element).text()} ${absoluteUrl}`);
    if (!chapterNumber) {
      return;
    }

    if (!seen.has(chapterNumber)) {
      seen.set(chapterNumber, absoluteUrl);
    }
  });

  return [...seen.entries()]
    .map(([chapterNumber, url]) => ({ chapterNumber, url }))
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

export function parseChapterPage(url: string, html: string): ChapterInput {
  const $ = load(html);
  $("script, style, noscript").remove();

  const title =
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    `Chapter ${extractChapterNumber(url) ?? "Unknown"}`;

  const rawText = extractBestText($);
  if (!rawText) {
    throw new Error(`Unable to extract chapter body from ${url}`);
  }

  const chapterNumber = extractChapterNumber(`${title} ${url}`);
  if (!chapterNumber) {
    throw new Error(`Unable to determine chapter number for ${url}`);
  }

  return {
    chapterNumber,
    title,
    sourceName: "readshadowslave",
    sourceUrl: url,
    sourceChapterRef: new URL(url).pathname.replace(/\/+$/, "") || `/chapter/${chapterNumber}`,
    rawText,
  };
}

function extractBestText($: ReturnType<typeof load>): string {
  const selectors = [
    "article",
    "main",
    ".entry-content",
    ".chapter-content",
    ".post-content",
    ".content",
    ".text-left",
    ".reader-content",
  ];

  const candidates = selectors
    .flatMap((selector) =>
      $(selector)
        .toArray()
        .map((element) => $(element).text().trim()),
    )
    .filter((value) => value.length > 400);

  const selected = candidates.sort((left, right) => right.length - left.length)[0];
  return normalizeScrapedText(selected ?? $("body").text());
}

function normalizeScrapedText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractChapterNumber(input: string): number | undefined {
  const match = input.match(/chapter[^0-9]{0,10}(\d{1,5})/i) ?? input.match(/\/(\d{1,5})(?:\/)?$/);
  if (!match) {
    return undefined;
  }

  const captured = match[1];
  if (!captured) {
    return undefined;
  }

  const parsed = Number.parseInt(captured, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ss-ragbot/1.0 (+https://github.com/bradagy/ss-ragbot)",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
