import type { AppliedSpoilerBoundary } from "../types/index.js";

interface SpoilerBoundaryDefinition {
  id: string;
  label: string;
  chapterTo: number;
  aliases: string[];
}

const SPOILER_BOUNDARIES: SpoilerBoundaryDefinition[] = [
  {
    id: "volume-1",
    label: "Volume 1: Child of Shadows",
    chapterTo: 95,
    aliases: ["volume 1", "volume-1", "vol 1", "vol-1", "child of shadows", "through volume 1", "up to volume 1"],
  },
  {
    id: "volume-2",
    label: "Volume 2: Demon of Change",
    chapterTo: 350,
    aliases: ["volume 2", "volume-2", "vol 2", "vol-2", "demon of change", "through volume 2", "up to volume 2"],
  },
  {
    id: "forgotten-shore",
    label: "Forgotten Shore",
    chapterTo: 350,
    aliases: ["forgotten shore", "forgotten-shore", "through forgotten shore", "up to forgotten shore"],
  },
  {
    id: "before-second-nightmare",
    label: "Before Second Nightmare",
    chapterTo: 600,
    aliases: [
      "before second nightmare",
      "before the second nightmare",
      "before-second-nightmare",
      "pre second nightmare",
      "pre-second-nightmare",
    ],
  },
  {
    id: "second-nightmare",
    label: "Second Nightmare",
    chapterTo: 742,
    aliases: [
      "second nightmare",
      "the second nightmare",
      "second-nightmare",
      "through second nightmare",
      "up to second nightmare",
    ],
  },
  {
    id: "before-third-nightmare",
    label: "Before Third Nightmare",
    chapterTo: 1230,
    aliases: [
      "before third nightmare",
      "before the third nightmare",
      "before-third-nightmare",
      "pre third nightmare",
      "pre-third-nightmare",
    ],
  },
  {
    id: "third-nightmare",
    label: "Third Nightmare",
    chapterTo: 1580,
    aliases: [
      "third nightmare",
      "the third nightmare",
      "third-nightmare",
      "through third nightmare",
      "up to third nightmare",
    ],
  },
];

export class SpoilerBoundaryError extends Error {
  readonly exitCode = 2;

  constructor(
    readonly input: string,
    readonly suggestions: string[],
    customMessage?: string,
  ) {
    super(customMessage ?? buildSpoilerBoundaryErrorMessage(input, suggestions));
  }
}

export function resolveSpoilerBoundary(input: string): AppliedSpoilerBoundary {
  const normalized = normalizeSpoilerBoundary(input);
  const match = SPOILER_BOUNDARIES.find(
    (boundary) => boundary.id === normalized || boundary.aliases.includes(normalized),
  );

  if (match) {
    return {
      input,
      id: match.id,
      label: match.label,
      chapterTo: match.chapterTo,
      kind: "named",
    };
  }

  const chapterBoundary = resolveChapterBoundary(input, normalized);
  if (chapterBoundary) {
    return chapterBoundary;
  }

  if (looksLikeChapterBoundary(normalized)) {
    throw new SpoilerBoundaryError(input, listSpoilerBoundarySuggestions(), buildInvalidChapterBoundaryMessage(input));
  }

  throw new SpoilerBoundaryError(input, listSpoilerBoundarySuggestions());
}

export function normalizeSpoilerBoundary(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
}

export function listSpoilerBoundarySuggestions(): string[] {
  return [
    "volume 1",
    "volume-1",
    "volume 2",
    "volume-2",
    "forgotten shore",
    "forgotten-shore",
    "before second nightmare",
    "before-second-nightmare",
    "second nightmare",
    "second-nightmare",
    "before third nightmare",
    "before-third-nightmare",
    "third nightmare",
    "third-nightmare",
  ];
}

function buildSpoilerBoundaryErrorMessage(input: string, suggestions: string[]): string {
  const parts = [`Unknown spoiler boundary: ${input}.`];
  const hint = buildSpoilerBoundaryHint(input);
  const chapterHint = buildChapterBoundaryHint(input);

  if (hint) {
    parts.push(
      [
        "Multi-word spoiler boundaries must be quoted, for example:",
        `  --spoiler-safe "${hint.quoted}"`,
        "You can also use the shell-safe form:",
        `  --spoiler-safe ${hint.slug}`,
      ].join("\n"),
    );
  }

  if (chapterHint) {
    parts.push(
      [
        "Chapter-based spoiler boundaries are also supported, for example:",
        `  --spoiler-safe "${chapterHint.quoted}"`,
        "You can also use the shell-safe form:",
        `  --spoiler-safe ${chapterHint.slug}`,
      ].join("\n"),
    );
  }

  parts.push(`Try one of: ${suggestions.slice(0, 6).join(", ")}`);
  return parts.join("\n");
}

function buildSpoilerBoundaryHint(input: string): { quoted: string; slug: string } | undefined {
  const normalized = normalizeSpoilerBoundary(input);
  if (!normalized || normalized.includes(" ") || normalized.includes("-")) {
    return undefined;
  }

  const candidate = SPOILER_BOUNDARIES.find((boundary) =>
    boundary.aliases.some((alias) => alias.startsWith(`${normalized} `) || alias.startsWith(`${normalized}-`))
      || boundary.id.startsWith(`${normalized}-`)
  );

  if (!candidate) {
    return undefined;
  }

  const quoted = candidate.aliases.find((alias) => alias.includes(" ")) ?? candidate.label.toLowerCase();
  return {
    quoted,
    slug: candidate.id,
  };
}

function resolveChapterBoundary(input: string, normalized: string): AppliedSpoilerBoundary | undefined {
  const matchers: Array<{
    pattern: RegExp;
    build: (chapter: number) => AppliedSpoilerBoundary;
  }> = [
    {
      pattern: /^before chapter (\d+)$/i,
      build: (chapter) => ({
        input,
        id: `before-chapter-${chapter}`,
        label: `Before Chapter ${chapter}`,
        chapterTo: chapter - 1,
        kind: "chapter",
      }),
    },
    {
      pattern: /^through chapter (\d+)$/i,
      build: (chapter) => ({
        input,
        id: `through-chapter-${chapter}`,
        label: `Through Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
    {
      pattern: /^up to chapter (\d+)$/i,
      build: (chapter) => ({
        input,
        id: `up-to-chapter-${chapter}`,
        label: `Up to Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
    {
      pattern: /^chapter (\d+)$/i,
      build: (chapter) => ({
        input,
        id: `chapter-${chapter}`,
        label: `Through Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
    {
      pattern: /^before-chapter-(\d+)$/i,
      build: (chapter) => ({
        input,
        id: `before-chapter-${chapter}`,
        label: `Before Chapter ${chapter}`,
        chapterTo: chapter - 1,
        kind: "chapter",
      }),
    },
    {
      pattern: /^through-chapter-(\d+)$/i,
      build: (chapter) => ({
        input,
        id: `through-chapter-${chapter}`,
        label: `Through Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
    {
      pattern: /^up-to-chapter-(\d+)$/i,
      build: (chapter) => ({
        input,
        id: `up-to-chapter-${chapter}`,
        label: `Up to Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
    {
      pattern: /^chapter-(\d+)$/i,
      build: (chapter) => ({
        input,
        id: `chapter-${chapter}`,
        label: `Through Chapter ${chapter}`,
        chapterTo: chapter,
        kind: "chapter",
      }),
    },
  ];

  for (const matcher of matchers) {
    const match = normalized.match(matcher.pattern);
    if (!match?.[1]) {
      continue;
    }

    const chapter = Number.parseInt(match[1], 10);
    if (!Number.isFinite(chapter) || chapter < 1) {
      return undefined;
    }

    return matcher.build(chapter);
  }

  return undefined;
}

function looksLikeChapterBoundary(normalized: string): boolean {
  return /\bchapter\b/.test(normalized) || normalized.includes("chapter-");
}

function buildInvalidChapterBoundaryMessage(input: string): string {
  return [
    `Invalid chapter-based spoiler boundary: ${input}. Expected a positive chapter number.`,
    'Try examples such as:',
    '  --spoiler-safe "before chapter 1729"',
    '  --spoiler-safe before-chapter-1729',
    '  --spoiler-safe "through chapter 500"',
    '  --spoiler-safe chapter-95',
  ].join("\n");
}

function buildChapterBoundaryHint(input: string): { quoted: string; slug: string } | undefined {
  const normalized = normalizeSpoilerBoundary(input);
  if (!normalized) {
    return undefined;
  }

  if (normalized === "before") {
    return {
      quoted: "before chapter 1729",
      slug: "before-chapter-1729",
    };
  }

  if (normalized === "through") {
    return {
      quoted: "through chapter 500",
      slug: "through-chapter-500",
    };
  }

  if (normalized === "up" || normalized === "upto" || normalized === "up-to") {
    return {
      quoted: "up to chapter 350",
      slug: "up-to-chapter-350",
    };
  }

  if (normalized === "chapter") {
    return {
      quoted: "chapter 95",
      slug: "chapter-95",
    };
  }

  if (!looksLikeChapterBoundary(normalized)) {
    return undefined;
  }

  return {
    quoted: "before chapter 1729",
    slug: "before-chapter-1729",
  };
}
