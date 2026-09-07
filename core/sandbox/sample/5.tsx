import { Slide } from "./shared";

export default function Slide5({ isActive }: { isActive: boolean }) {
  return (
    <Slide title="Summary" subtitle="Key takeaway" isActive={isActive}>
      <ul style={{ listStyle: 'none', padding: 0, fontSize: '1.2rem', textAlign: 'left' }}>
        <li style={{ margin: '12px 0' }}>✅ Force causes acceleration.</li>
        <li style={{ margin: '12px 0' }}>✅ Mass resists acceleration.</li>
        <li style={{ margin: '12px 0' }}>✅ F = m · a is the bridge.</li>
        <li style={{ margin: '12px 0' }}>✅ Direction matters – it&apos;s a vector!</li>
      </ul>
    </Slide>
  );
}
