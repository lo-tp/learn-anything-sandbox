import { MathText } from "./MathText";

export default function Slide6() {
  const rowStyle = (bg: string) => ({
    display: "flex" as const,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--outline-variant)",
    background: bg,
    gap: 12,
  });

  return (
    <div style={{ background: "var(--surface)", color: "var(--on-surface)", padding: 32, fontFamily: "sans-serif" }}>
      <h1 style={{ color: "var(--primary)", fontSize: 28, marginBottom: 24, fontWeight: 700 }}>
        对照与自检：一次 vs. 二次
      </h1>

      {/* Comparison table */}
      <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ ...rowStyle("var(--primary-container)"), borderBottom: "none" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--on-primary-container)", flex: "0 0 30%" }}>维度</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--on-primary-container)", flex: "0 0 35%" }}>一次方程 $ax+b=0$</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--on-primary-container)", flex: 1 }}>二次方程 $ax^2+bx+c=0$</span>
        </div>
        <div style={rowStyle("var(--surface-container-low)")}>
          <span style={{ fontSize: 15, flex: "0 0 30%", fontWeight: 600 }}>求解方法</span>
          <span style={{ fontSize: 15, flex: "0 0 35%" }}>移项 + 除法</span>
          <span style={{ fontSize: 15, flex: 1 }}>配方 → 求根公式</span>
        </div>
        <div style={rowStyle("var(--surface-container-lowest)")}>
          <span style={{ fontSize: 15, flex: "0 0 30%", fontWeight: 600 }}>实数解个数</span>
          <span style={{ fontSize: 15, flex: "0 0 35%" }}>恒为 <span style={{ fontWeight: 700 }}>1 个</span>（$a\neq 0$）</span>
          <span style={{ fontSize: 15, flex: 1 }}>由 $\Delta$ 决定：<span style={{ fontWeight: 700 }}>0、1 或 2 个</span></span>
        </div>
        <div style={{ ...rowStyle("var(--surface-container-low)"), borderBottom: "none" }}>
          <span style={{ fontSize: 15, flex: "0 0 30%", fontWeight: 600 }}>"审判"量</span>
          <span style={{ fontSize: 15, flex: "0 0 35%" }}>无（永远有解）</span>
          <span style={{ fontSize: 15, flex: 1 }}>判别式 $\Delta = b^2 - 4ac$</span>
        </div>
      </div>

      {/* Key formula recap */}
      <div style={{
        background: "var(--surface-container-low)",
        borderRadius: 10,
        padding: "18px 20px",
        marginBottom: 20,
      }}>
        <p style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
          核心公式（锁定记忆）：
        </p>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <MathText content="$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$" />
        </div>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <MathText content="$$\Delta = b^2 - 4ac \begin{cases} > 0 & \Longrightarrow \; 2 \text{ 个不同实 根} \\[4pt] = 0 & \Longrightarrow \; 1 \text{ 个重根} \\[4pt] < 0 & \Longrightarrow \; 0 \text{ 个实根} \end{cases}$$" />
        </div>
      </div>

      {/* Self-check questions */}
      <div style={{
        background: "var(--secondary-container)",
        color: "var(--on-secondary-container)",
        borderRadius: 10,
        padding: "16px 20px",
      }}>
        <p style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>
          快速自检（动笔前判断 $\Delta$ 的符号即可）：
        </p>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
            (a) $2x^2 + 3x + 5 = 0$：$\Delta = 9 - 40 = -31 < 0$ → <span style={{ fontWeight: 600 }}>无实根</span>
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
            (b) $3x^2 - 6x + 3 = 0$：$\Delta = 36 - 36 = 0$ → <span style={{ fontWeight: 600 }}>一个重根 $x = 1$</span>
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
            (c) $x^2 + 2x - 8 = 0$：$\Delta = 4 + 32 = 36 > 0$ → <span style={{ fontWeight: 600 }}>两个实根</span>，$x = \dfrac{-2\pm 6}{2}$，即 $x=2$ 或 $x=-4$
          </p>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--on-secondary-container)" }}>
          <span style={{ fontWeight: 600 }}>习惯养成：</span> 拿到二次方程，<span style={{ fontWeight: 700 }}>先算 $\Delta$</span>，再决定下一步——这和你在一次方程组中"先变形、再代入、最后验证"的流程感是同一个学习策略：<span style={{ fontWeight: 700 }}>先判断结构，再执行计算。</span>
        </p>
      </div>
    </div>
  );
}
