import type { CSSProperties } from "react";
import Slide1 from "./sample/1";
import Slide2 from "./sample/2";
import Slide3 from "./sample/3";
import Slide4 from "./sample/4";
import Slide5 from "./sample/5";

// One component per slide (sample/1.tsx … sample/5.tsx). The deck only owns
// the track geometry (stage/container/track/slide) + the active-slide math.
const slides = [Slide1, Slide2, Slide3, Slide4, Slide5];

// ---------- 主组件 ----------
// Controlled from OUTSIDE the iframe: the host posts DEMO_SET_PART, the
// harness re-renders this component with a new `part` — slide = part.
// Pure function of `part`: no internal slide state, no in-deck controls.
const Presentation = ({ part }: { part: number }) => {
  const total = slides.length;
  const current = Math.min(Math.max(part, 0), total - 1);

  // ----- 内联样式对象（全部） -----
  // Invisible deck stage: only the structural box the slide track needs to be
  // sized + clipped. No glass panel — the single dark card is the visual.
  const containerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    margin: '0 auto',
  };

  // Full-viewport centerer: the deck is vertically centered in the iframe
  // viewport (the canvas body is top-aligned, so the demo owns its layout).
  // Fills the viewport exactly (height: 100vh, no padding) so the card can
  // reach the screen edges in fullscreen. Using an exact height (not
  // minHeight) keeps body scrollHeight === viewport, so the host's
  // auto-height (which reads body scrollHeight) stays stable — no growth loop.
  const stageStyle: CSSProperties = {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    boxSizing: 'border-box',
  };

  const trackStyle = {
    display: 'flex',
    width: `${total * 100}%`,
    height: '100%',
    transform: `translateX(-${current * (100 / total)}%)`,
    transition: 'transform 0.7s cubic-bezier(0.65, 0, 0.35, 1)',
    willChange: 'transform',
  };

  const slideStyle: CSSProperties = {
    width: `${100 / total}%`,
    height: '100%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 30px',
    color: '#f0f4ff',
    boxSizing: 'border-box',
  };

  return (
    <div style={stageStyle}>
      <div style={containerStyle}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <div style={trackStyle}>
            {slides.map((Slide, index) => (
              <div key={index} style={slideStyle}>
                <Slide isActive={index === current} />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Presentation;
