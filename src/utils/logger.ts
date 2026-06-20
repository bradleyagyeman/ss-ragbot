import { stderr } from "node:process";

import type { Logger } from "../types/index.js";

const RESET = "\u001b[0m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const GREEN = "\u001b[32m";

type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  level: LogLevel;
  useColor: boolean;
}

export function createLogger(options: LoggerOptions): Logger {
  const write = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (priorities[level] < priorities[options.level]) {
      return;
    }

    const payload = {
      level,
      message,
      ...fields,
    };

    const prefix = {
      debug: "DEBUG",
      info: "INFO",
      warn: "WARN",
      error: "ERROR",
    }[level];

    const color = options.useColor
      ? {
          debug: "",
          info: GREEN,
          warn: YELLOW,
          error: RED,
        }[level]
      : "";

    const suffix = color ? RESET : "";
    stderr.write(`${color}${prefix}${suffix} ${JSON.stringify(payload)}\n`);
  };

  return {
    debug(message, fields) {
      write("debug", message, fields);
    },
    info(message, fields) {
      write("info", message, fields);
    },
    warn(message, fields) {
      write("warn", message, fields);
    },
    error(message, fields) {
      write("error", message, fields);
    },
  };
}
