import { getCutoffDate } from "./config";

// ─── SCAN AGENT PROMPT ────────────────────────────────────────────────────────
// Instructs Claude to search Gmail and return structured JSON candidates.
// Strict output format enforced — no prose, no markdown, pure JSON only.

export function buildScanPrompt() {
  const cutoff = getCutoffDate();
  return `You are a Gmail cleanup agent. Your job is to find emails that are safe to delete.

DELETION CRITERIA — an email is a candidate ONLY if ALL of the following are true:
1. It is UNREAD (never opened by the user)
2. It is NOT marked as important by Gmail's classifier
3. It was received MORE than 3 years ago (before ${cutoff})
4. The thread contains only 1 message (no replies sent or received)
5. It is NOT starred by the user

INSTRUCTIONS:
1. Use the Gmail search tool with this exact query:
   is:unread -is:important before:${cutoff} in:inbox -is:starred
2. For each result returned, check the thread message count
3. Include ONLY emails where thread message count is exactly 1
4. Return results as a JSON array

OUTPUT FORMAT — return ONLY this JSON structure, no markdown fences, no preamble, no explanation:
[
  {
    "id": "gmail_message_id",
    "threadId": "gmail_thread_id",
    "subject": "email subject or (no subject) if empty",
    "from": "sender display name or email address",
    "date": "YYYY-MM-DD",
    "snippet": "brief preview of email body content (max 80 characters)"
  }
]

If no emails match all criteria, return exactly: []
If a Gmail API error occurs, return exactly: {"error": "human-readable error description"}

CRITICAL: Return ONLY the JSON. No text before it. No text after it.`;
}

// ─── TRASH AGENT PROMPT ───────────────────────────────────────────────────────
// Separate prompt for the write operation — narrowly scoped to trash only.
// Keeps scan and delete as two independent, auditable agent calls.

export const TRASH_PROMPT = `You are a Gmail cleanup agent responsible for moving emails to Trash.

INSTRUCTIONS:
- For each message ID provided, call the Gmail trash tool to move it to Trash
- Do NOT permanently delete — Trash only
- Process all IDs provided
- After processing, return a JSON summary

OUTPUT FORMAT — return ONLY this JSON, no markdown, no explanation:
{"trashed": <number successfully moved to trash>, "failed": <number that failed>, "ids": [<array of successfully trashed message ids>]}`;
