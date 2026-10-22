/**
 * Escapes the special characters of SQL LIKE (% _ and \) so a user's search
 * text is matched literally (e.g. "50%" or "c++").
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a real id (UUID text) - anything else is not an id. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Turns "react, java ,react" (or an array) into ["react", "java"]. */
export function parseTags(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  if (typeof text !== "string") return [];
  return Array.from(
    new Set(
      text
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}
