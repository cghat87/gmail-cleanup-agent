// ─── MODEL CONFIG ─────────────────────────────────────────────────────────────
export const MODEL = "claude-sonnet-4-20250514";
export const MAX_TOKENS = 1000;

// ─── MCP SERVER ───────────────────────────────────────────────────────────────
export const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";

// ─── FILTER CONFIG ────────────────────────────────────────────────────────────
export const YEARS_THRESHOLD = 3;
export const BATCH_SIZE = 50; // max emails trashed per run

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
export function getCutoffDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - YEARS_THRESHOLD);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function formatDisplayDate(str) {
  try {
    return new Date(str).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return str;
  }
}
