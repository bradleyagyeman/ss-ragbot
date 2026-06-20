import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError, loadAppConfig } from "../src/config/env.js";

const originalEnv = { ...process.env };
const createdDirs: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnv };
  const { rm } = await import("node:fs/promises");
  await Promise.all(createdDirs.map((directory) => rm(directory, { recursive: true, force: true })));
  createdDirs.length = 0;
});

describe("loadAppConfig", () => {
  it("applies defaults, file config, env vars, and explicit overrides in precedence order", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ss-ragbot-config-"));
    createdDirs.push(directory);
    const configPath = path.join(directory, "config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          dbUrl: "postgres://file-user:pw@localhost:5432/file_db",
          migratorDbUrl: "postgres://file-migrator:pw@localhost:5432/file_db",
          answer: {
            model: "gemini-from-file",
          },
          retrieval: {
            limit: 11,
          },
          chunking: {
            sizeChars: 1400,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.DB_URL = "postgres://env-user:pw@localhost:5432/env_db";
    process.env.MIGRATOR_DB_URL = "postgres://env-migrator:pw@localhost:5432/env_db";
    process.env.RETRIEVAL_LIMIT = "7";
    delete process.env.CHUNK_SIZE_CHARS;
    delete process.env.CHUNK_OVERLAP_CHARS;

    const config = await loadAppConfig({
      configPath,
      answerModel: "gemini-from-override",
      logLevel: "debug",
    });

    expect(config.dbUrl).toBe("postgres://env-user:pw@localhost:5432/env_db");
    expect(config.migratorDbUrl).toBe("postgres://env-migrator:pw@localhost:5432/env_db");
    expect(config.answer.provider).toBe("google");
    expect(config.answer.model).toBe("gemini-from-override");
    expect(config.retrieval.limit).toBe(7);
    expect(config.chunking.sizeChars).toBe(1400);
    expect(config.chunking.overlapChars).toBe(200);
    expect(config.wiki.apiUrl).toBe("https://shadowslave.fandom.com/api.php");
    expect(config.logLevel).toBe("debug");
    expect(config.configPaths.explicit).toBe(configPath);
  });

  it("fails clearly when DB_URL is missing", async () => {
    delete process.env.DB_URL;
    delete process.env.MIGRATOR_DB_URL;

    await expect(loadAppConfig()).rejects.toBeInstanceOf(ConfigError);
  });
});
