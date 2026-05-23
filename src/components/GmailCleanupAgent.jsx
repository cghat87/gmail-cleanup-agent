import { useState, useEffect, useRef } from "react";
import { runScanAgent, runTrashAgent } from "../agent/gmailAgent";
import { getCutoffDate, formatDisplayDate } from "../agent/config";

// ─── STAGE MACHINE ────────────────────────────────────────────────────────────
// idle → scanning → preview → confirming → trashing → done → error

const FILTER_TAGS = [
  "UNREAD",
  "NOT IMPORTANT",
  `BEFORE ${getCutoffDate()}`,
  "SINGLE THREAD",
  "NOT STARRED",
];

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatusDot({ stage }) {
  const active = stage === "scanning" || stage === "trashing";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: active ? "#f0883e" : stage === "error" ? "#f87171" : "#3fb950",
        animation: active ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ fontSize: 10, color: "#484f58", letterSpacing: "0.8px" }}>
        {stage.toUpperCase()}
      </span>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "#0d1117", border: "1px solid #21262d",
      borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 90,
    }}>
      <div style={{ fontSize: 10, color: "#484f58", letterSpacing: "1px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function AgentLog({ logs, maxHeight = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  const colorMap = { error: "#f87171", success: "#3fb950", query: "#d2a8ff", info: "#8b949e", warn: "#f0883e" };

  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "7px 16px", borderBottom: "1px solid #161b22", fontSize: 10, color: "#484f58", letterSpacing: "1px" }}>
        AGENT LOG
      </div>
      <div ref={ref} style={{ padding: "12px 16px", maxHeight, overflowY: "auto" }}>
        {logs.length === 0 && <div style={{ fontSize: 11, color: "#30363d" }}>Initialising...</div>}
        {logs.map((l, i) => (
          <div key={i} style={{
            fontSize: 11, marginBottom: 6,
            color: colorMap[l.type] || "#8b949e",
            animation: "slideIn 0.2s ease",
            fontFamily: "inherit",
          }}>
            <span style={{ color: "#30363d" }}>[{l.ts}]</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function Spinner({ color = "#388bfd" }) {
  return (
    <div style={{
      width: 40, height: 40,
      border: "3px solid #21262d",
      borderTop: `3px solid ${color}`,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 16px",
    }} />
  );
}

function PrimaryButton({ onClick, disabled, children, variant = "blue" }) {
  const bg = {
    blue: "linear-gradient(135deg, #1f6feb, #388bfd)",
    red: "linear-gradient(135deg, #b91c1c, #ef4444)",
    ghost: "transparent",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className="btn-primary" style={{
      background: disabled ? "#21262d" : bg,
      border: variant === "ghost" ? "1px solid #30363d" : "none",
      borderRadius: 8,
      color: disabled ? "#484f58" : "#fff",
      fontSize: 12,
      fontWeight: 700,
      padding: "10px 24px",
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px",
      transition: "all 0.15s",
    }}>{children}</button>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function GmailCleanupAgent() {
  const [stage, setStage] = useState("idle");
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [scanTime, setScanTime] = useState(null);

  function addLog(msg, type = "info") {
    setLogs((l) => [...l, { msg, type, ts: new Date().toLocaleTimeString() }]);
  }

  // ── SCAN ────────────────────────────────────────────────────────────────────
  async function handleScan() {
    setStage("scanning");
    setEmails([]);
    setSelected(new Set());
    setLogs([]);
    setError("");
    setResult(null);
    const t0 = Date.now();
    try {
      addLog("Connecting to Gmail via MCP...", "info");
      addLog(`Query: is:unread -is:important before:${getCutoffDate()} in:inbox -is:starred`, "query");
      addLog("Fetching metadata and evaluating thread counts...", "info");
      const found = await runScanAgent();
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setScanTime(elapsed);
      addLog(`Scan complete in ${elapsed}s — ${found.length} candidate(s) found`, found.length > 0 ? "success" : "warn");
      setEmails(found);
      setSelected(new Set(found.map((e) => e.id)));
      setStage("preview");
    } catch (e) {
      addLog(`Error: ${e.message}`, "error");
      setError(e.message);
      setStage("error");
    }
  }

  // ── TRASH ───────────────────────────────────────────────────────────────────
  async function handleTrash() {
    const ids = [...selected];
    if (!ids.length) return;
    setStage("trashing");
    addLog(`Moving ${ids.length} email(s) to Trash...`, "info");
    try {
      const res = await runTrashAgent(ids);
      addLog(`Done — ${res.trashed} trashed, ${res.failed} failed`, res.failed === 0 ? "success" : "warn");
      setResult(res);
      setStage("done");
    } catch (e) {
      addLog(`Trash error: ${e.message}`, "error");
      setError(e.message);
      setStage("error");
    }
  }

  function toggleEmail(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === emails.length ? new Set() : new Set(emails.map((e) => e.id))
    );
  }

  function handleReset() {
    setStage("idle");
    setEmails([]);
    setSelected(new Set());
    setLogs([]);
    setError("");
    setResult(null);
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0c10",
      color: "#c9d1d9",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        .row-hover:hover { background: rgba(48,54,61,0.4) !important; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      {/* HEADER */}
      <div style={{
        borderBottom: "1px solid #161b22",
        padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(13,17,23,0.97)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #1f6feb, #388bfd)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🗑️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>Gmail Cleanup Agent</div>
            <div style={{ fontSize: 10, color: "#484f58" }}>Claude Sonnet · Gmail MCP · Claude Pro</div>
          </div>
        </div>
        <StatusDot stage={stage} />
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>

        {/* FILTER TAGS */}
        <div style={{
          background: "#0d1117", border: "1px solid #21262d",
          borderRadius: 8, padding: "12px 18px", marginBottom: 20,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ fontSize: 10, color: "#484f58", marginRight: 4 }}>ACTIVE FILTERS</span>
          {FILTER_TAGS.map((f, i) => (
            <span key={i} style={{
              background: "rgba(88,166,255,0.08)", border: "1px solid rgba(88,166,255,0.2)",
              borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600,
              color: "#58a6ff", letterSpacing: "0.5px",
            }}>{f}</span>
          ))}
        </div>

        {/* ── IDLE ── */}
        {stage === "idle" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid #21262d",
              borderRadius: 12, padding: "40px 32px", textAlign: "center", marginBottom: 16,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>
                Ready to scan your inbox
              </div>
              <div style={{ fontSize: 13, color: "#484f58", marginBottom: 28, lineHeight: 1.8, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                Finds emails older than 3 years that are unread, unimportant, and have no replies.<br />
                You review everything before any action is taken.
              </div>
              <PrimaryButton onClick={handleScan} variant="blue">▶ RUN CLEANUP SCAN</PrimaryButton>
              <div style={{ marginTop: 12, fontSize: 11, color: "#30363d" }}>
                Nothing is deleted until you confirm · Trash = 30-day recovery window
              </div>
            </div>
            <div style={{
              background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)",
              borderRadius: 8, padding: "12px 16px", fontSize: 11, color: "#fca5a5",
              display: "flex", gap: 10,
            }}>
              <span>⚠️</span>
              <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.6 }}>
                <strong>Safety:</strong> Agent moves to Trash only — never permanent delete.
                Starred and important emails are always skipped. You confirm before anything is touched.
              </span>
            </div>
          </div>
        )}

        {/* ── SCANNING ── */}
        {stage === "scanning" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid #21262d",
              borderRadius: 12, padding: "36px", textAlign: "center", marginBottom: 16,
            }}>
              <Spinner color="#388bfd" />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", marginBottom: 6 }}>
                Agent is scanning your inbox...
              </div>
              <div style={{ fontSize: 11, color: "#484f58" }}>
                Claude is querying Gmail via MCP and evaluating each email against all criteria
              </div>
            </div>
            <AgentLog logs={logs} />
          </div>
        )}

        {/* ── PREVIEW ── */}
        {stage === "preview" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <StatCard label="FOUND" value={emails.length} color="#58a6ff" />
              <StatCard label="SELECTED" value={selected.size} color="#3fb950" />
              <StatCard label="SKIPPED" value={emails.length - selected.size} color="#8b949e" />
              <StatCard label="SCAN TIME" value={`${scanTime}s`} color="#d2a8ff" />
            </div>

            {emails.length === 0 ? (
              <div style={{
                background: "#0d1117", border: "1px solid #21262d",
                borderRadius: 12, padding: "40px 32px", textAlign: "center",
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#3fb950", marginBottom: 8 }}>Inbox is clean!</div>
                <div style={{ fontSize: 13, color: "#484f58", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                  No emails matched all cleanup criteria.
                </div>
                <div style={{ marginTop: 20 }}>
                  <PrimaryButton onClick={handleReset} variant="ghost">← Back</PrimaryButton>
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  background: "#0d1117", border: "1px solid #21262d",
                  borderRadius: 8, overflow: "hidden", marginBottom: 14,
                }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "40px 1fr 190px 100px",
                    padding: "9px 16px", borderBottom: "1px solid #21262d",
                    fontSize: 10, color: "#484f58", letterSpacing: "0.8px",
                  }}>
                    <div onClick={toggleAll} style={{ cursor: "pointer", color: selected.size === emails.length ? "#58a6ff" : "#484f58" }}>
                      {selected.size === emails.length ? "☑" : "☐"}
                    </div>
                    <div>SUBJECT / PREVIEW</div>
                    <div>FROM</div>
                    <div>DATE</div>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {emails.map((email, i) => (
                      <div key={email.id} className="row-hover" onClick={() => toggleEmail(email.id)} style={{
                        display: "grid", gridTemplateColumns: "40px 1fr 190px 100px",
                        padding: "10px 16px",
                        borderBottom: i < emails.length - 1 ? "1px solid #161b22" : "none",
                        cursor: "pointer",
                        background: selected.has(email.id) ? "rgba(88,166,255,0.04)" : "transparent",
                        animation: `fadeIn 0.3s ease ${i * 25}ms both`,
                        transition: "background 0.15s",
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 3,
                          border: `1.5px solid ${selected.has(email.id) ? "#58a6ff" : "#30363d"}`,
                          background: selected.has(email.id) ? "#58a6ff" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, color: "#fff", flexShrink: 0, transition: "all 0.15s",
                        }}>
                          {selected.has(email.id) ? "✓" : ""}
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ fontSize: 12, color: "#e6edf3", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {email.subject || "(no subject)"}
                          </div>
                          <div style={{ fontSize: 10, color: "#484f58", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                            {email.snippet}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.from}
                        </div>
                        <div style={{ fontSize: 11, color: "#484f58" }}>
                          {formatDisplayDate(email.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  background: "#0d1117", border: "1px solid #21262d",
                  borderRadius: 8, padding: "14px 18px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ fontSize: 12, color: "#8b949e", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <strong style={{ color: "#e6edf3" }}>{selected.size}</strong> of {emails.length} selected.
                    {" "}<span style={{ color: "#484f58" }}>Deselect any to keep.</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <PrimaryButton onClick={handleReset} variant="ghost">← Rescan</PrimaryButton>
                    <PrimaryButton onClick={() => setStage("confirming")} disabled={selected.size === 0} variant="red">
                      🗑️ MOVE {selected.size} TO TRASH
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CONFIRMING ── */}
        {stage === "confirming" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 12, padding: "40px 32px", textAlign: "center",
            }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", marginBottom: 10 }}>Final Confirmation</div>
              <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 6, fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.7 }}>
                You are about to move <strong style={{ color: "#f87171" }}>{selected.size} email(s)</strong> to Trash.
              </div>
              <div style={{ fontSize: 12, color: "#484f58", marginBottom: 32, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                Gmail keeps Trash for 30 days — fully recoverable within that window.
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <PrimaryButton onClick={() => setStage("preview")} variant="ghost">← Go Back</PrimaryButton>
                <PrimaryButton onClick={handleTrash} variant="red">✓ YES, MOVE TO TRASH</PrimaryButton>
              </div>
            </div>
          </div>
        )}

        {/* ── TRASHING ── */}
        {stage === "trashing" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid #21262d",
              borderRadius: 12, padding: "36px", textAlign: "center", marginBottom: 16,
            }}>
              <Spinner color="#ef4444" />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", marginBottom: 6 }}>
                Moving {selected.size} email(s) to Trash...
              </div>
              <div style={{ fontSize: 11, color: "#484f58" }}>
                Claude is calling gmail.trash() via MCP for each confirmed email
              </div>
            </div>
            <AgentLog logs={logs} />
          </div>
        )}

        {/* ── DONE ── */}
        {stage === "done" && result && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid rgba(63,185,80,0.3)",
              borderRadius: 12, padding: "40px 32px", textAlign: "center", marginBottom: 16,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#3fb950", marginBottom: 16 }}>Cleanup Complete</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
                <StatCard label="TRASHED" value={result.trashed} color="#3fb950" />
                <StatCard label="FAILED" value={result.failed} color={result.failed > 0 ? "#f87171" : "#484f58"} />
                <StatCard label="NEXT RUN" value="Sunday" color="#58a6ff" />
              </div>
              <div style={{ fontSize: 12, color: "#484f58", marginBottom: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                To recover: Gmail → Trash → select → Move to Inbox (within 30 days)
              </div>
              <PrimaryButton onClick={handleReset} variant="blue">↺ Run Again</PrimaryButton>
            </div>
            <AgentLog logs={logs} maxHeight={140} />
          </div>
        )}

        {/* ── ERROR ── */}
        {stage === "error" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{
              background: "#0d1117", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 12, padding: "36px 32px", textAlign: "center",
            }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>❌</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171", marginBottom: 12 }}>Agent Error</div>
              <div style={{
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#fca5a5",
                fontFamily: "inherit", marginBottom: 24, textAlign: "left",
              }}>{error}</div>
              <div style={{ fontSize: 12, color: "#484f58", marginBottom: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                Check that Gmail is connected in Claude Settings → Connections, then retry.
              </div>
              <PrimaryButton onClick={handleReset} variant="ghost">↺ Try Again</PrimaryButton>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{
          marginTop: 24, padding: "12px 0",
          borderTop: "1px solid #161b22",
          fontSize: 10, color: "#30363d",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4,
        }}>
          <span>Gmail Cleanup Agent · Claude Sonnet + Gmail MCP</span>
          <span>Trash only · 30-day recovery · Human confirmation required</span>
        </div>
      </div>
    </div>
  );
}
