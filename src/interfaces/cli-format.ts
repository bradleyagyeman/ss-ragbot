export function formatCliError(message: string, useColor: boolean): string {
  const prefix = "ERROR:";
  if (!useColor) {
    return `${prefix} ${message}`;
  }

  const red = "\u001b[31m";
  const reset = "\u001b[0m";
  return `${red}${prefix}${reset} ${message}`;
}
