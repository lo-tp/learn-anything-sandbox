import type { ComponentType, CSSProperties } from "react";

// Shared wrapper for the `sample_N` single-slide demos. Centers the slide
// card in a full-viewport stage (20px 30px padding, border-box), so the
// presentation card breathes at the viewport edges. The 100vh stage also
// keeps body scrollHeight === viewport, so the harness's auto-height
// (which reads body scrollHeight) stays stable.
const stageStyle: CSSProperties = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px 30px",
  boxSizing: "border-box",
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
