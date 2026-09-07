import type { CSSProperties, ReactNode } from "react";

// Shared presentational pieces for the sample deck. Each slide (1.tsx … 5.tsx)
// renders its title + subtitle + body through <Slide>, so the card chrome
// (background, title/subtitle/body styling) lives in exactly one place.

const cardStyle = (isActive: boolean): CSSProperties => ({
  width: '100%',
  height: '100%',
  background: 'rgba(20,25,55,0.65)',
  backdropFilter: 'blur(4px)',
  borderRadius: '30px',
  padding: '40px 45px',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 15px 35px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  transition: 'transform 0.3s ease, opacity 0.6s ease',
  transform: isActive ? 'scale(1)' : 'scale(0.98)',
  opacity: isActive ? 1 : 0.7,
});

const titleStyle: CSSProperties = {
  fontSize: '3.2rem',
  fontWeight: '700',
  color: '#f6d365', // fallback
  // 用纯色替代渐变，因为内联不支持背景裁剪文字
  textShadow: '0 0 20px rgba(246,211,101,0.3)',
  marginBottom: '0.2em',
  letterSpacing: '-0.02em',
};

const subtitleStyle: CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: '300',
  color: '#b8c6ff',
  marginBottom: '0.6em',
};

const bodyStyle: CSSProperties = {
  fontSize: '1.2rem',
  lineHeight: '1.7',
  maxWidth: '700px',
  color: '#d0daff',
};

export function Slide({
  title,
  subtitle,
  isActive,
  children,
}: {
  title: string;
  subtitle: string;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <div style={cardStyle(isActive)}>
      <div style={titleStyle}>{title}</div>
      <div style={subtitleStyle}>{subtitle}</div>
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
