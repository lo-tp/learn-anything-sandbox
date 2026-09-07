import { Slide } from "./shared";

export default function Slide2({ isActive }: { isActive: boolean }) {
  return (
    <Slide title="Force & Acceleration" subtitle="What changes motion?" isActive={isActive}>
      <p style={{ marginBottom: '0.6em' }}>
        <strong style={{ color: '#f6d365' }}>Force</strong> – push or pull that changes motion.
      </p>
      <p style={{ marginBottom: '0.6em' }}>
        <strong style={{ color: '#f6d365' }}>Acceleration</strong> – how quickly velocity changes.
      </p>
      <div
        style={{
          background: 'rgba(255,215,100,0.12)',
          borderLeft: '4px solid #f6d365',
          padding: '16px 24px',
          borderRadius: '12px',
          marginTop: '16px',
          textAlign: 'left',
        }}
      >
        <div>🔹 More force → more acceleration</div>
        <div>🔹 More mass → less acceleration</div>
      </div>
    </Slide>
  );
}
