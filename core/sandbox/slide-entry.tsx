import type { ComponentType, CSSProperties } from "react";

// Shared wrapper for the `sample_N` single-slide demos. Fills the slide
// card edge-to-edge in a full-viewport stage (no padding). The 100vh stage
// also keeps body scrollHeight === viewport, so the harness's auto-height
// (which reads body scrollHeight) stays stable.
const stageStyle: CSSProperties = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Wrap a slide component (`sample/N.tsx`) as a standalone one-part demo. */
export function slideEntry(Slide: ComponentType<{ isActive: boolean }>) {
  return function SlideDemo() {
    return (
      <div style={stageStyle}>
        <Slide isActive />
      </div>
    );
  };
}
