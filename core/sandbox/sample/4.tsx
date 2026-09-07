import { Slide } from "./shared";

export default function Slide4({ isActive }: { isActive: boolean }) {
  return (
    <Slide title="Real‑World Example" subtitle="Pushing a Cart" isActive={isActive}>
      <div style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ fontSize: '2rem', textAlign: 'center' }}>🛒</div>
        <p style={{ margin: '12px 0' }}>
          <strong style={{ color: '#f6d365' }}>Same force</strong> on a lighter cart →
          <span style={{ color: '#ffb3b3' }}> bigger acceleration</span>.
        </p>
        <p style={{ margin: '12px 0' }}>
          <strong style={{ color: '#f6d365' }}>Heavier cart</strong> needs
          <span style={{ color: '#8fcbff' }}> more force</span> for same acceleration.
        </p>
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '20px',
            padding: '16px',
            marginTop: '16px',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>⚖️</span> F = m · a – always works!
        </div>
      </div>
    </Slide>
  );
}
