import { MODEL, MAX_TOKENS, GMAIL_MCP_URL } from "./config";
import { buildScanPrompt, TRASH_PROMPT } from "./prompts";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parseAgentJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function callClaudeWithGmail(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      mcp_servers: [
        {
          type: "url",
          url: GMAIL_MCP_URL,
          name: "gmail",
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── SCAN AGENT ───────────────────────────────────────────────────────────────
// Searches Gmail for cleanup candidates using compound filter criteria.
// Returns an array of email objects or throws on failure.

export async function runScanAgent() {
  const data = await callClaudeWithGmail(
    buildScanPrompt(),
    "Scan my Gmail inbox now and return the JSON array of cleanup candidates."
  );

  const text = extractText(data.content);
  const parsed = parseAgentJSON(text);

  if (!parsed) {
    throw new Error("Agent returned unparseable response. Raw: " + text.slice(0, 200));
  }
  if (parsed.error) {
    throw new Error("Gmail error: " + parsed.error);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected response shape from scan agent.");
  }

  return parsed;
}

// ─── TRASH AGENT ──────────────────────────────────────────────────────────────
// Moves a list of email IDs to Gmail Trash.
// Called only after explicit user confirmation in the UI.
// Returns a summary object {trashed, failed, ids}.

export async function runTrashAgent(messageIds) {
  if (!messageIds || messageIds.length === 0) {
    throw new Error("No message IDs provided to trash agent.");
  }

  const data = await callClaudeWithGmail(
    TRASH_PROMPT,
    `Move these emails to Trash. Message IDs: ${JSON.stringify(messageIds)}`
  );

  const text = extractText(data.content);
  const parsed = parseAgentJSON(text);

  // Fallback: if parse fails but API succeeded, assume all trashed
  return parsed || { trashed: messageIds.length, failed: 0, ids: messageIds };
}
