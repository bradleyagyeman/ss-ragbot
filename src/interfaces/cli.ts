#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { answerQuestion } from "../core/answer.js";
import { ingestFromMarkdown, ingestFromScrape } from "../core/ingest.js";
import { resolveQueryScope } from "../core/query-scope.js";
import { SpoilerBoundaryError } from "../core/spoiler-boundaries.js";
import { syncWikiEntities } from "../core/wiki-entities.js";
import { loadAppConfig } from "../config/env.js";
import { closePool, getPool } from "../db/connection.js";
import { getDbStatus } from "../db/queries.js";
import { getMigrationStatus, runMigrations } from "../db/migrations.js";
import { searchChunks } from "../core/retrieve.js";
import { formatHuman, formatJson, formatPlain } from "./output.js";
import { formatCliError } from "./cli-format.js";
import { createLogger } from "../utils/logger.js";
import { readStdinText } from "../utils/fs.js";
import type {
  AppConfig,
  DoctorResult,
  OutputMode,
  SearchResult,
} from "../types/index.js";

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

const packageJsonUrl = new URL("../../package.json", import.meta.url);
const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as { version: string };

const program = new Command();
program
  .name("ss-ragbot")
  .description("CLI-first canon-grounded RAG bot for Shadow Slave.")
  .version(packageJson.version, "--version", "Print version to stdout.")
  .helpCommand("help [command]", "Show help for a command.")
  .showHelpAfterError()
  .configureOutput({
    outputError: (str, write) => write(str),
  })
  .option("-q, --quiet", "Reduce non-error output.")
  .option("-v, --verbose", "Increase diagnostic output.")
  .option("--json", "Emit machine-readable JSON.")
  .option("--plain", "Emit stable plain-text output.")
  .option("--no-color", "Disable color output.")
  .option("--config <path>", "Use a specific JSON config file.")
  .option("--no-input", "Disable all prompts.");

program
  .command("ask [question...]")
  .description("Answer a canon question using retrieved chapter evidence.")
  .option("--top-k <n>", "Number of chunks to retrieve.", parseInteger)
  .option("--spoiler-safe <phrase>", "Restrict retrieval to a spoiler-safe boundary. Quote multi-word values, for example: --spoiler-safe \"before second nightmare\" or --spoiler-safe \"before chapter 1729\". Slug forms also work.")
  .option("--chapter-from <n>", "Advanced: restrict retrieval to chapters greater than or equal to this number.", parseInteger)
  .option("--chapter-to <n>", "Advanced: restrict retrieval to chapters less than or equal to this number.", parseInteger)
  .option("--citations-only", "Skip answer generation and emit only retrieved evidence.")
  .option("--stdin", "Read the question from stdin.")
  .action(async (questionParts, options, command) => {
    const question = await resolveQuestion(questionParts, options.stdin);
    const context = await buildContext(command.parent?.opts() ?? {});
    const scope = resolveQueryScope(question, {
      chapterFrom: options.chapterFrom,
      chapterTo: options.chapterTo,
    }, options.spoilerSafe);
    const result = await answerQuestion(
      context.config,
      question,
      options.topK ?? context.config.retrieval.limit,
      scope.filters,
      options.citationsOnly ?? false,
      scope.emptyResultMessage,
      Boolean(scope.appliedSpoilerBoundary),
    );
    result.appliedSpoilerBoundary = scope.appliedSpoilerBoundary;
    render(command.parent?.opts() ?? {}, result);
  });

program
  .command("search [query...]")
  .description("Retrieve matching chapter chunks without answer generation.")
  .option("--top-k <n>", "Number of chunks to return.", parseInteger)
  .option("--spoiler-safe <phrase>", "Restrict retrieval to a spoiler-safe boundary. Quote multi-word values, for example: --spoiler-safe \"before second nightmare\" or --spoiler-safe \"before chapter 1729\". Slug forms also work.")
  .option("--chapter-from <n>", "Advanced: restrict retrieval to chapters greater than or equal to this number.", parseInteger)
  .option("--chapter-to <n>", "Advanced: restrict retrieval to chapters less than or equal to this number.", parseInteger)
  .action(async (queryParts, options, command) => {
    const query = joinQuery(queryParts);
    const context = await buildContext(command.parent?.opts() ?? {});
    const scope = resolveQueryScope(query, {
      chapterFrom: options.chapterFrom,
      chapterTo: options.chapterTo,
    }, options.spoilerSafe);
    const results = await searchChunks(context.config, query, options.topK ?? context.config.retrieval.limit, scope.filters);
    render(command.parent?.opts() ?? {}, {
      query,
      results,
      appliedSpoilerBoundary: scope.appliedSpoilerBoundary,
    } satisfies SearchResult);
  });

const ingest = program.command("ingest").description("Import or scrape corpus chapters.");

ingest
  .command("scrape")
  .description("Scrape chapters from the configured source index.")
  .option("-n, --dry-run", "Show what would be ingested without writing to the database.")
  .option("--limit <n>", "Limit chapter pages fetched.", parseInteger)
  .option("--start-at <n>", "Skip earlier chapters before ingestion.", parseInteger)
  .option("--reembed", "Regenerate embeddings even when chapter content is unchanged.")
  .option("-f, --force", "Continue past recoverable scrape warnings.")
  .action(async (options, command) => {
    const context = await buildContext(command.parent?.parent?.opts() ?? {});
    const result = await ingestFromScrape(context.config, {
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
      limit: options.limit,
      startAt: options.startAt,
      reembed: options.reembed ?? false,
      logger: context.logger,
    });
    render(command.parent?.parent?.opts() ?? {}, result);
  });

ingest
  .command("import [directory]")
  .description("Import Markdown chapters from a local directory.")
  .option("-n, --dry-run", "Show what would be imported without writing to the database.")
  .option("--glob <pattern>", "Override the Markdown file pattern within the input directory.", "*.md")
  .option("--reembed", "Regenerate embeddings even when chapter content is unchanged.")
  .option("-f, --force", "Continue past recoverable import warnings.")
  .action(async (directory, options, command) => {
    const context = await buildContext(command.parent?.parent?.opts() ?? {});
    const targetDirectory = directory ? path.resolve(process.cwd(), directory) : path.resolve(process.cwd(), "data/chapters");
    const result = await ingestFromMarkdown(context.config, targetDirectory, {
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
      globPattern: options.glob,
      reembed: options.reembed ?? false,
      logger: context.logger,
    });
    render(command.parent?.parent?.opts() ?? {}, result);
  });

const db = program.command("db").description("Database management.");
const metadata = program.command("metadata").description("Entity metadata management.");

db
  .command("migrate")
  .description("Apply SQL migrations.")
  .option("-n, --dry-run", "Show pending migrations without applying them.")
  .action(async (options, command) => {
    const context = await buildContext(command.parent?.parent?.opts() ?? {});
    const pool = getPool(context.config, "migrator");
    const pending = await runMigrations(pool, options.dryRun ?? false);
    render(command.parent?.parent?.opts() ?? {}, {
      applied: options.dryRun ? [] : pending,
      pending,
    });
  });

db
  .command("status")
  .description("Report chapter and chunk counts.")
  .action(async (_, command) => {
    const context = await buildContext(command.parent?.parent?.opts() ?? {});
    const status = await getDbStatus(getPool(context.config));
    render(command.parent?.parent?.opts() ?? {}, status);
  });

metadata
  .command("sync-wiki [entities...]")
  .description("Fetch wiki-backed entity metadata into the local database.")
  .option("-n, --dry-run", "Show what would be synced without writing to the database.")
  .action(async (entities, options, command) => {
    const context = await buildContext(command.parent?.parent?.opts() ?? {});
    const result = await syncWikiEntities(context.config, entities, options.dryRun ?? false);
    render(command.parent?.parent?.opts() ?? {}, result);
  });

program
  .command("doctor")
  .description("Validate configuration and local dependencies.")
  .action(async (_, command) => {
    const context = await buildContext(command.parent?.opts() ?? {});
    const result = await runDoctor(context.config);
    render(command.parent?.opts() ?? {}, result);
  });

program
  .command("completions <shell>")
  .description("Print a shell completion script.")
  .action((shell) => {
    const script = completionScript(shell);
    if (!script) {
      throw new CliError(`Unsupported shell: ${shell}`, 2);
    }
    process.stdout.write(script);
  });

await main();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    await closePool();
    const exitCode =
      error instanceof CliError || error instanceof SpoilerBoundaryError
        ? error.exitCode
        : (error as { exitCode?: number }).exitCode ?? 1;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${formatCliError(message, shouldUseColor(program.opts()))}\n`);
    process.exitCode = exitCode;
    return;
  }

  await closePool();
}

async function buildContext(globalOptions: Record<string, unknown>) {
  const outputMode = resolveOutputMode(globalOptions);
  const quiet = Boolean(globalOptions.quiet);
  const verbose = Boolean(globalOptions.verbose);
  const logLevel = quiet ? "warn" : verbose ? "debug" : undefined;
  const config = await loadAppConfig({
    configPath: toOptionalString(globalOptions.config),
    logLevel,
  });
  const logger = createLogger({
    level: logLevel ?? config.logLevel,
    useColor: shouldUseColor(globalOptions),
  });

  if (outputMode === "json" && globalOptions.plain) {
    throw new CliError("Use either --json or --plain, not both.", 2);
  }

  return { config, logger, outputMode };
}

function resolveOutputMode(globalOptions: Record<string, unknown>): OutputMode {
  if (globalOptions.json) {
    return "json";
  }
  if (globalOptions.plain) {
    return "plain";
  }
  return "human";
}

async function resolveQuestion(questionParts: string[], useStdin: boolean): Promise<string> {
  if (useStdin) {
    const stdinValue = (await readStdinText()).trim();
    if (!stdinValue) {
      throw new CliError("Expected question text on stdin.", 2);
    }
    return stdinValue;
  }

  const question = joinQuery(questionParts);
  if (!question) {
    throw new CliError("A question is required. Pass text or use --stdin.", 2);
  }

  return question;
}

function joinQuery(parts: string[]): string {
  const joined = parts.join(" ").trim();
  if (!joined) {
    throw new CliError("A query is required.", 2);
  }
  return joined;
}

function render(globalOptions: Record<string, unknown>, payload: unknown): void {
  const mode = resolveOutputMode(globalOptions);

  if (mode === "json") {
    process.stdout.write(formatJson(payload));
    return;
  }

  if (mode === "plain") {
    process.stdout.write(formatPlain(payload));
    return;
  }

  process.stdout.write(formatHuman(payload));
}

async function runDoctor(config: AppConfig): Promise<DoctorResult> {
  const checks = [
    {
      name: "config.dbUrl",
      ok: Boolean(config.dbUrl),
      details: "Application database URL loaded.",
    },
    {
      name: "config.migratorDbUrl",
      ok: Boolean(config.migratorDbUrl),
      details: "Migrator database URL loaded.",
    },
    {
      name: "config.answer.googleApiKey",
      ok: Boolean(config.answer.googleApiKey),
      details: config.answer.googleApiKey ? "Google API key configured." : "Google API key missing.",
    },
  ];

  try {
    await getPool(config, "app").query("SELECT 1");
    checks.push({
      name: "database.appConnectivity",
      ok: true,
      details: "Application role connected to Postgres.",
    });
  } catch (error) {
    checks.push({
      name: "database.appConnectivity",
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const migratorPool = getPool(config, "migrator");
    await migratorPool.query("SELECT 1");
    checks.push({
      name: "database.migratorConnectivity",
      ok: true,
      details: "Migrator role connected to Postgres.",
    });

    const status = await getMigrationStatus(migratorPool);
    checks.push({
      name: "database.migrations",
      ok: true,
      details: status.pending.length === 0 ? "No pending migrations." : `${status.pending.length} pending migration(s).`,
    });
  } catch (error) {
    checks.push({
      name: "database.migrations",
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function completionScript(shell: string): string | undefined {
  const commands = ["ask", "search", "ingest", "db", "metadata", "doctor", "completions", "help"];
  if (shell === "bash") {
    return `#!/usr/bin/env bash
_ss_ragbot_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${commands.join(" ")}" -- "$cur") )
}
complete -F _ss_ragbot_completions ss-ragbot
`;
  }

  if (shell === "zsh") {
    return `#compdef ss-ragbot
_ss_ragbot() {
  local -a commands
  commands=(${commands.join(" ")})
  _describe 'command' commands
}
compdef _ss_ragbot ss-ragbot
`;
  }

  if (shell === "fish") {
    return commands.map((command) => `complete -c ss-ragbot -f -a "${command}"`).join("\n") + "\n";
  }

  return undefined;
}

function shouldUseColor(globalOptions: Record<string, unknown>): boolean {
  if (globalOptions.color === false || process.env.NO_COLOR || process.env.TERM === "dumb") {
    return false;
  }

  return process.stderr.isTTY;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new CliError(`Invalid integer: ${value}`, 2);
  }
  return parsed;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
