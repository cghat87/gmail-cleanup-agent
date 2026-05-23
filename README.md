# Gmail Cleanup Agent

An agentic AI tool that finds and removes old, unread, unimportant emails from your Gmail inbox. Built with **Claude Sonnet** and **Gmail MCP** — no backend, no local credentials, runs directly in Claude.ai.

---

## What It Does

Every Sunday, you run this agent. It:

1. Searches your Gmail inbox using a compound filter query
2. Identifies emails that are genuinely safe to delete
3. Shows you a preview table before touching anything
4. Waits for your explicit confirmation
5. Moves approved emails to Trash (not permanent delete)
6. Shows a run summary report

---

## Filter Criteria

An email is queued for deletion **only if all five conditions are true**:

| Condition | Gmail Query | Reason |
|---|---|---|
| Never opened | `is:unread` | If you never read it, it had no value |
| Not important | `NOT is:important` | Gmail's own classifier agrees it's low priority |
| Older than 3 years | `before:YYYY/MM/DD` | Enough time has passed that it's no longer relevant |
| No replies | `thread.count == 1` | No conversation was ever attached to it |
| Not starred | `NOT is:starred` | You never manually flagged it to keep |

If any single condition fails, the email is skipped. Conservative by design.

---

## Architecture

```
You (Sunday morning)
  │  click Run
  ▼
React UI (Claude.ai Artifact or local Vite app)
  │  user prompt
  ▼
Claude Sonnet (Anthropic API)
  │  tool calls via MCP
  ▼
Gmail MCP Server (gmailmcp.googleapis.com)
  │  OAuth2
  ▼
Gmail API
  │  search → metadata → trash
  ▼
Preview → Confirm → Trash → Report
```

### Five Layers

| Layer | Component | Role |
|---|---|---|
| Trigger | React UI | Manual run button (Sundays) |
| Agent | Claude Sonnet | Reasoning, tool orchestration, filter logic |
| Tools | Gmail MCP | search, getMessage, listLabels, trash |
| Filter | Client logic | Compound criteria evaluation |
| Output | React UI | Preview table → confirmation gate → summary |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| AI Model | Claude Sonnet (`claude-sonnet-4-20250514`) |
| Tool Connectivity | Gmail MCP (Model Context Protocol) |
| Auth | OAuth2 via Claude.ai connected apps |
| Styling | Inline CSS (no dependencies) |
| Fonts | IBM Plex Mono + IBM Plex Sans |

---

## Project Structure

```
gmail-cleanup-agent/
├── src/
│   ├── agent/
│   │   ├── config.js          # Model config, MCP URL, date helpers
│   │   ├── prompts.js         # System prompts for scan and trash agents
│   │   └── gmailAgent.js      # Anthropic API call functions
│   ├── components/
│   │   └── GmailCleanupAgent.jsx   # Main React component (UI + state machine)
│   ├── App.jsx                # Root component
│   └── main.jsx               # React entry point
├── index.html
├── vite.config.js
├── package.json
├── .gitignore
└── README.md
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- A Claude Pro account with Gmail connected (Settings → Connections → Gmail)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/gmail-cleanup-agent.git
cd gmail-cleanup-agent

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app opens at `http://localhost:3000`.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`.

---

## Running as a Claude.ai Artifact

You do not need a local setup. The entire agent can run as an Artifact inside Claude.ai:

1. Open Claude.ai (Pro account required)
2. Ensure Gmail is connected: **Settings → Connections → Gmail**
3. Paste the contents of `src/components/GmailCleanupAgent.jsx` into a new Artifact
4. Run it — Gmail MCP is already live through your session

---

## Safety Design

| Safety Measure | Implementation |
|---|---|
| No auto-execution | Two explicit confirmation steps before any write action |
| Trash not delete | Agent calls `gmail.trash()` — not permanent delete |
| 30-day recovery | Gmail Trash is purged after 30 days; emails recoverable until then |
| Conservative filter | All 5 criteria must pass; any failure = skip |
| Starred always skipped | `NOT is:starred` is a hard filter, never overridden |
| Important always skipped | `NOT is:important` is a hard filter, never overridden |
| Human in the loop | Preview table shown; user can deselect any email before confirming |

---

## How the Agent Works — Technical Detail

### Two Separate API Calls

The agent is split into two distinct Claude calls for safety and clarity:

**Call 1 — Scan Agent**
```
System: Detailed filter rules + JSON output format instructions
User:   "Scan my inbox and return candidates"
Tools:  Gmail MCP (read-only: search, getMessage)
Output: JSON array of email candidates
```

**Call 2 — Trash Agent**
```
System: Narrow instruction — trash these IDs only
User:   "Move these message IDs to Trash: [...]"
Tools:  Gmail MCP (write: trash)
Output: JSON summary {trashed, failed, ids}
```

Scan can fail safely without touching anything. Trash only runs after user confirmation.

### System Prompt Design

The scan prompt enforces strict output format:

```
Return ONLY a JSON array. No markdown fences. No preamble. No explanation.
```

This is critical. Without this, the LLM wraps output in explanation text and `JSON.parse()` fails.

### State Machine

The UI has 7 states: `idle → scanning → preview → confirming → trashing → done → error`

Each state renders a different screen. Transitions are one-directional except for reset.

---

## Scheduling — Running Every Sunday Automatically

Currently manual (click Run). To automate:

**Option A — Google Apps Script (free, no infra)**
```javascript
// In Google Apps Script, set a weekly Sunday trigger
function runCleanupAgent() {
  // Call your deployed endpoint or trigger via webhook
}
```

**Option B — GitHub Actions (free tier)**
```yaml
on:
  schedule:
    - cron: '0 8 * * 0'  # Every Sunday at 8am UTC
```

**Option C — Vercel Cron (if deployed)**
```json
{ "crons": [{ "path": "/api/run-cleanup", "schedule": "0 8 * * 0" }] }
```

---

## Limitations

| Limitation | Detail |
|---|---|
| "Never opened" proxy | Uses `is:unread` as a proxy. Emails marked read by apps/filters may be missed. |
| Thread count accuracy | Depends on Gmail MCP returning accurate thread metadata |
| Batch size | Processes up to 50 emails per run to avoid API timeouts |
| No true scheduling | Requires manual trigger or separate cron setup |
| Claude Pro required | Gmail MCP connection requires a Claude Pro account |

---

## Future Improvements

- [ ] True Sunday auto-scheduling via Google Apps Script
- [ ] Configurable year threshold (currently hardcoded at 3 years)
- [ ] Category-based filtering (Promotions, Social, Updates tabs)
- [ ] Unsubscribe detection — identify and surface mailing list emails
- [ ] Run history log stored locally
- [ ] Email size estimation to show storage freed

---

## Contributing

Pull requests welcome. Please open an issue first to discuss significant changes.

---

## License

MIT — use freely, modify as needed.

---

## Author

**Chiranjib Ghatak**  
Senior Architect  
Built with Claude Sonnet + Gmail MCP as a reference implementation for agentic AI workflows.
# gmail-cleanup-agent
