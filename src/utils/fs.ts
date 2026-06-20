import { homedir } from "node:os";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

export function expandHome(input: string): string {
  if (!input.startsWith("~/")) {
    return input;
  }

  return path.join(homedir(), input.slice(2));
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(targetPath: string): Promise<T | undefined> {
  if (!(await pathExists(targetPath))) {
    return undefined;
  }

  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

export function resolveDefaultConfigPaths() {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
    ? expandHome(process.env.XDG_CONFIG_HOME)
    : path.join(homedir(), ".config");

  return {
    project: path.resolve(process.cwd(), "ss-ragbot.config.json"),
    user: path.join(xdgConfigHome, "ss-ragbot", "config.json"),
    system: "/etc/ss-ragbot/config.json",
  };
}

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regex}$`);
}
