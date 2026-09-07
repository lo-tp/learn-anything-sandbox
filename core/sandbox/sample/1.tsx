import { Slide } from "./shared";

export default function Slide1({ isActive }: { isActive: boolean }) {
  return (
    <Slide
      title="Newton's Second Law"
      subtitle="Force, Mass & Acceleration"
      isActive={isActive}
    >
      <div style={{ fontSize: '1.2rem', marginTop: '0.5em', opacity: 0.7 }}>
        <span>⚡</span> The fundamental law of motion
      </div>
    </Slide>
  );
}
