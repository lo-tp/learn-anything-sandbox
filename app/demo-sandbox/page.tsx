"use client";

/**
 * `/demo-sandbox` — a dev showcase host for the sample demo (#37).
 *
 * The minimal host side of the ADR 0007 protocol around
 * `<iframe sandbox="allow-scripts" src="/sandbox/sample">`: part stepper
 * (parent → sandbox `DEMO_SET_PART`), auto-height (sandbox → parent
 * `SANDBOX_RESIZE`, clamped), error banner (sandbox → parent
 * `SANDBOX_ERROR`), and a small protocol log so the channel is visible.
 *
 * Receipts are validated on `event.origin === "null"` (the opaque origin's
 * serialization) and field-by-field — never trusted wholesale. Append `?auto=1`
 * to auto-step through the parts (used by the headless e2e check).
 */
import { type CSSProperties, useEffect, useRef, useState } from "react";

const SLUG = "sample";
// Must match SAMPLE_PARTS in the route (one part per slide of the deck).
const SLIDES = 5;
// Roomy canvas: the sample is a slide deck (up to 1000×700), so the
// sandbox never shrinks below presentation size; SANDBOX_RESIZE can only
// grow it further, up to MAX_HEIGHT.
const MIN_HEIGHT = 720;
const MAX_HEIGHT = 1200;

export default function DemoSandboxPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState(0);
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

  // ?auto=1 — step through every slide so headless checks can watch the log.
  useEffect(() => {
    if (!window.location.search.includes("auto=1")) return;
    const timers = Array.from(
      { length: SLIDES - 1 },
      (_, i) => setTimeout(() => goPart(i + 1), 2500 * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parent → sandbox: the only outbound message, targetOrigin "*" (the app
  // origin is unknowable to the sandbox; delivery safety is field checks at
  // the receiver, per ADR 0007).
  function goPart(p: number) {
    const clamped = Math.min(Math.max(p, 0), SLIDES - 1);
    setPart(clamped);
    frameRef.current?.contentWindow?.postMessage({ type: "DEMO_SET_PART", part: clamped }, "*");
    say(`→ DEMO_SET_PART {part: ${clamped}}`);
  }

  const arrow: CSSProperties = {
    width: 36,
    height: 36,
    fontSize: 16,
    cursor: "pointer",
    border: "1px solid #888",
    borderRadius: "50%",
    background: "#fff",
  };
  const arrowDisabled: CSSProperties = { ...arrow, opacity: 0.3, cursor: "default" };
  const dot = (active: boolean): CSSProperties => ({
    width: 12,
    height: 12,
    padding: 0,
    cursor: "pointer",
    border: "none",
    borderRadius: "50%",
    background: active ? "#2563eb" : "#bbb",
    transform: active ? "scale(1.25)" : "scale(1)",
    transition: "all 0.2s ease",
  });

  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Demo sandbox — sample</h1>
      <p style={{ fontSize: 14, opacity: 0.7 }}>
        LLM-shaped demo TSX → esbuild → <code>/sandbox/sample/bundle.js</code> →
        <code> &lt;iframe sandbox=&quot;allow-scripts&quot;&gt; </code> (opaque origin).
      </p>
      {/* Slide controller — OUTSIDE the iframe: part = slide, posted as DEMO_SET_PART */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button
          style={part === 0 ? arrowDisabled : arrow}
          onClick={() => goPart(part - 1)}
          disabled={part === 0}
          aria-label="previous slide"
        >
          ◀
        </button>
        {Array.from({ length: SLIDES }, (_, i) => (
          <button
            key={i}
            style={dot(i === part)}
            onClick={() => goPart(i)}
            aria-label={`slide ${i + 1}`}
          />
        ))}
        <button
          style={part === SLIDES - 1 ? arrowDisabled : arrow}
          onClick={() => goPart(part + 1)}
          disabled={part === SLIDES - 1}
          aria-label="next slide"
        >
          ▶
        </button>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          slide {part + 1}/{SLIDES} · height: {height}px
        </span>
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
        ref={frameRef}
        sandbox="allow-scripts"
        src={`/sandbox/${SLUG}`}
        title="sample demo sandbox"
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
