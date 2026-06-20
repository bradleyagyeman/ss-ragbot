import { describe, expect, it } from "vitest";

import { formatCliError } from "../src/interfaces/cli-format.js";

describe("formatCliError", () => {
  it("prefixes errors for plain output", () => {
    expect(formatCliError("Unknown spoiler boundary: before.", false)).toBe(
      "ERROR: Unknown spoiler boundary: before.",
    );
  });

  it("renders a red error prefix when color is enabled", () => {
    expect(formatCliError("Unknown spoiler boundary: before.", true)).toBe(
      "\u001b[31mERROR:\u001b[0m Unknown spoiler boundary: before.",
    );
  });
});
