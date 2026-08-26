export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;

  return acceptHeader
    .split(",")
    .map((entry) => entry.split(";", 1)[0].trim().toLowerCase())
    .includes("text/markdown");
}
