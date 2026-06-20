import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

import { expandHome, readJsonFile, resolveDefaultConfigPaths } from "../utils/fs.js";
import type { AppConfig } from "../types/index.js";

dotenv.config({ quiet: true });

const fileConfigSchema = z
  .object({
    dbUrl: z.string().optional(),
    migratorDbUrl: z.string().optional(),
    answer: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        googleApiKey: z.string().optional(),
      })
      .optional(),
    embedding: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        cacheDir: z.string().optional(),
      })
      .optional(),
    source: z
      .object({
        baseUrl: z.string().optional(),
        indexUrl: z.string().optional(),
        requestTimeoutMs: z.number().int().positive().optional(),
      })
      .optional(),
    chunking: z
      .object({
        sizeChars: z.number().int().positive().optional(),
        overlapChars: z.number().int().nonnegative().optional(),
      })
      .optional(),
    retrieval: z
      .object({
        limit: z.number().int().positive().optional(),
      })
      .optional(),
    wiki: z
      .object({
        apiUrl: z.string().url().optional(),
      })
      .optional(),
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  })
  .strict();

const configSchema = z.object({
  dbUrl: z.string().min(1, "DB_URL is required"),
  migratorDbUrl: z.string().min(1, "MIGRATOR_DB_URL is required"),
  answer: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    googleApiKey: z.string().optional(),
  }),
  embedding: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    cacheDir: z.string().min(1),
  }),
  source: z.object({
    baseUrl: z.string().url(),
    indexUrl: z.string().url(),
    requestTimeoutMs: z.number().int().positive(),
  }),
  chunking: z
    .object({
      sizeChars: z.number().int().positive(),
      overlapChars: z.number().int().nonnegative(),
    })
    .refine((value) => value.overlapChars < value.sizeChars, {
      message: "CHUNK_OVERLAP_CHARS must be smaller than CHUNK_SIZE_CHARS",
      path: ["overlapChars"],
    }),
  retrieval: z.object({
    limit: z.number().int().positive(),
  }),
  wiki: z.object({
    apiUrl: z.string().url(),
  }),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  configPaths: z.object({
    project: z.string(),
    user: z.string(),
    system: z.string(),
    explicit: z.string().optional(),
  }),
});

export interface ConfigOverrides {
  configPath?: string | undefined;
  answerModel?: string | undefined;
  answerProvider?: string | undefined;
  retrievalLimit?: number | undefined;
  logLevel?: "debug" | "info" | "warn" | "error" | undefined;
}

export class ConfigError extends Error {
  readonly exitCode = 3;
}

export async function loadAppConfig(overrides: ConfigOverrides = {}): Promise<AppConfig> {
  const defaults = resolveDefaultConfigPaths();
  const project = process.env.SS_RAGBOT_PROJECT_CONFIG
    ? path.resolve(process.cwd(), process.env.SS_RAGBOT_PROJECT_CONFIG)
    : defaults.project;
  const user = process.env.SS_RAGBOT_USER_CONFIG
    ? expandHome(process.env.SS_RAGBOT_USER_CONFIG)
    : defaults.user;
  const system = process.env.SS_RAGBOT_SYSTEM_CONFIG
    ? expandHome(process.env.SS_RAGBOT_SYSTEM_CONFIG)
    : defaults.system;
  const explicit = overrides.configPath ? path.resolve(process.cwd(), overrides.configPath) : undefined;

  const systemConfig = await readAndValidate(system);
  const userConfig = await readAndValidate(user);
  const projectConfig = await readAndValidate(project);
  const explicitConfig = explicit ? await readAndValidate(explicit) : undefined;

  const merged = deepMerge<Record<string, unknown>>(
    {
      migratorDbUrl: "",
      answer: {
        provider: "google",
        model: "gemini-2.5-flash",
      },
      embedding: {
        provider: "local",
        model: "Xenova/bge-small-en-v1.5",
        cacheDir: ".cache/models",
      },
      source: {
        baseUrl: "https://readshadowslave.com",
        indexUrl: "https://readshadowslave.com/chapters",
        requestTimeoutMs: 15000,
      },
      chunking: {
        sizeChars: 1600,
        overlapChars: 200,
      },
      retrieval: {
        limit: 8,
      },
      wiki: {
        apiUrl: "https://shadowslave.fandom.com/api.php",
      },
      logLevel: "info",
      configPaths: {
        project,
        user,
        system,
        explicit,
      },
    },
    {
      answer: {},
      embedding: {},
      source: {},
      chunking: {},
      retrieval: {},
      wiki: {},
    },
    systemConfig,
    userConfig,
    projectConfig,
    explicitConfig,
    fromEnv(project, user, system),
    fromOverrides(overrides),
  );

  try {
    const parsed = configSchema.parse(merged);
    return {
      ...parsed,
      answer: {
        ...parsed.answer,
        googleApiKey: parsed.answer.googleApiKey,
      },
      configPaths: {
        ...parsed.configPaths,
        explicit: parsed.configPaths.explicit,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ConfigError(error.issues.map((issue) => issue.message).join("; "));
    }

    throw error;
  }
}

async function readAndValidate(targetPath: string) {
  const raw = await readJsonFile<unknown>(targetPath);
  if (!raw) {
    return undefined;
  }

  return fileConfigSchema.parse(raw);
}

function fromEnv(projectPath: string, userPath: string, systemPath: string) {
  const output: Record<string, unknown> = {
    dbUrl: process.env.DB_URL,
    migratorDbUrl: process.env.MIGRATOR_DB_URL,
    answer: {
      provider: process.env.ANSWER_PROVIDER,
      model: process.env.ANSWER_MODEL,
      googleApiKey: process.env.GOOGLE_API_KEY,
    },
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER,
      model: process.env.EMBEDDING_MODEL,
      cacheDir: process.env.EMBEDDING_CACHE_DIR,
    },
    source: {
      baseUrl: process.env.SOURCE_BASE_URL,
      indexUrl: process.env.SOURCE_INDEX_URL,
      requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS),
    },
    chunking: {
      sizeChars: parseNumber(process.env.CHUNK_SIZE_CHARS),
      overlapChars: parseNumber(process.env.CHUNK_OVERLAP_CHARS),
    },
    retrieval: {
      limit: parseNumber(process.env.RETRIEVAL_LIMIT),
    },
    wiki: {
      apiUrl: process.env.WIKI_API_URL,
    },
    logLevel: process.env.LOG_LEVEL,
    configPaths: {
      project: projectPath,
      user: userPath,
      system: systemPath,
    },
  };

  return output;
}

function fromOverrides(overrides: ConfigOverrides) {
  const output: Record<string, unknown> = {};

  if (overrides.answerProvider || overrides.answerModel) {
    output.answer = {
      provider: overrides.answerProvider,
      model: overrides.answerModel,
    };
  }

  if (overrides.retrievalLimit !== undefined) {
    output.retrieval = {
      limit: overrides.retrievalLimit,
    };
  }

  if (overrides.logLevel) {
    output.logLevel = overrides.logLevel;
  }

  if (overrides.configPath) {
    output.configPaths = {
      explicit: path.resolve(process.cwd(), overrides.configPath),
    };
  }

  return output;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function deepMerge<T>(...values: Array<Partial<T> | undefined>): T {
  const output: Record<string, unknown> = {};

  for (const value of values) {
    if (!value) {
      continue;
    }

    for (const [key, nextValue] of Object.entries(value)) {
      if (nextValue === undefined) {
        continue;
      }

      if (isObject(nextValue) && isObject(output[key])) {
        output[key] = deepMerge(output[key] as Record<string, unknown>, nextValue);
        continue;
      }

      output[key] = nextValue;
    }
  }

  return output as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
