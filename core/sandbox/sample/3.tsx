import { Slide } from "./shared";

export default function Slide3({ isActive }: { isActive: boolean }) {
  return (
    <Slide title="The Formula" subtitle="F = m · a" isActive={isActive}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '4.5rem',
            fontWeight: '700',
            color: '#fff',
            textShadow: '0 0 30px rgba(246,211,101,0.3)',
            letterSpacing: '8px',
            margin: '20px 0',
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {['F', '=', 'm', '·', 'a'].map((char, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                animation: 'bounce 1.2s ease-in-out infinite alternate',
                animationDelay: `${i * 0.15}s`,
              }}
            >
              {char}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '1.1rem', opacity: 0.8 }}>
          Force = mass × acceleration
        </div>
      </div>
    </Slide>
  );
}
