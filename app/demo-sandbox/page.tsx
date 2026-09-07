"use client";

/**
 * `/demo-sandbox` — a dev showcase host for the sample demos (#37).
 *
 * The minimal host side of the ADR 0007 protocol around
 * `<iframe sandbox="allow-scripts" src="/sandbox/sample_N">`: auto-height
 * (sandbox → parent `SANDBOX_RESIZE`, clamped), error banner (sandbox →
 * parent `SANDBOX_ERROR`), and a small protocol log so the channel is
 * visible. The host only receives: every demo is one part, so there is no
 * `DEMO_SET_PART` to send (the harness still supports it for multi-part
 * rows).
 *
 * Receipts are validated on `event.origin === "null"` (the opaque origin's
 * serialization) and field-by-field — never trusted wholesale.
 *
 * The picker switches between the hand-inserted demos the route dispatches
 * (#37): the one-part `/sandbox/sample_N` demos, each of which renders
 * `sample/N.tsx` standalone.
 */
import { type CSSProperties, useEffect, useState } from "react";

// Must mirror the hand-inserted demos the route resolves on disk:
// core/sandbox/sample_N.tsx renders sample/N.tsx standalone (one part each).
const DEMOS = [1, 2, 3, 4, 5].map((n) => ({ slug: `sample_${n}`, label: `slide ${n}` }));
// Roomy canvas: a slide is a presentation card (up to 1000×700), so the
// sandbox never shrinks below presentation size; SANDBOX_RESIZE can only
// grow it further, up to MAX_HEIGHT.
const MIN_HEIGHT = 720;
const MAX_HEIGHT = 1200;

export default function DemoSandboxPage() {
  const [height, setHeight] = useState(720);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("sample_1");
  const [log, setLog] = useState<string[]>([]);

  const say = (line: string) =>
    setLog((l) => [...l.slice(-19), `${new Date().toISOString().slice(11, 19)} ${line}`]);

  // Sandbox → parent: validate origin and shape on receipt.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "null") return; // only the opaque-origin sandbox
      const d = event.data as { type?: unknown; height?: unknown; message?: unknown } | null;
      if (d && d.type === "SANDBOX_RESIZE" && Number.isFinite(d.height)) {
        setHeight(Math.min(Math.max(d.height as number, MIN_HEIGHT), MAX_HEIGHT));
        say(`← SANDBOX_RESIZE height=${Math.round(d.height as number)}`);
      } else if (d && d.type === "SANDBOX_ERROR" && typeof d.message === "string") {
        setError(d.message);
        say(`← SANDBOX_ERROR ${d.message}`);
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  const demoTab = (active: boolean): CSSProperties => ({
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: 13,
    border: `1px solid ${active ? "#2563eb" : "#888"}`,
    borderRadius: 999,
    background: active ? "#2563eb" : "#fff",
    color: active ? "#fff" : "#333",
  });

  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Demo sandbox — {slug}</h1>
      <p style={{ fontSize: 14, opacity: 0.7 }}>
        LLM-shaped demo TSX → esbuild → <code>/sandbox/{slug}/bundle.js</code> →
        <code> &lt;iframe sandbox=&quot;allow-scripts&quot;&gt; </code> (opaque origin).
      </p>
      {/* Demo picker: one slide standalone (sample_N). */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {DEMOS.map((d) => (
          <button
            key={d.slug}
            style={demoTab(d.slug === slug)}
            onClick={() => {
              setSlug(d.slug);
              setError(null);
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #dc2626",
            color: "#991b1b",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          SANDBOX_ERROR: {error}
        </div>
      )}
      <iframe
        sandbox="allow-scripts"
        src={`/sandbox/${slug}`}
        title={`${slug} demo sandbox`}
        style={{
          width: "100%",
          height,
          border: "1px solid #bbb",
          borderRadius: 6,
          background: "#fff",
          display: "block",
        }}
      />
      <pre
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "#1e293b",
          color: "#a7f3d0",
          font: "12px/1.6 ui-monospace, monospace",
          borderRadius: 6,
          maxHeight: 180,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {log.join("\n") || "(no protocol messages yet)"}
      </pre>
    </main>
  );
}
