export default function Slide4() {
  const [part, ] = { 0 };
  const [showCheck, setShowCheck] = React.useState(false);

  const checkExpr = "4x − (x − 3)";
  const checkAnswer = "4x − x + 3 = 3x + 3";

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "var(--on-surface)", maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ color: "var(--primary)", marginBottom: 16, fontSize: 22 }}>自检：你能独立做了吗？</h2>

      <div style={{
        background: "var(--surface-container)",
        borderRadius: 12,
        padding: "24px 28px",
        marginBottom: 20,
      }}>
        <p style={{ fontSize: 17, marginBottom: 12 }}>尝试展开：</p>
        <div style={{ fontSize: 22, marginBottom: 12 }}>
          <MathText content={String.raw`$4x - (x - 3)$`} />
        </div>

        <p style={{ fontSize: 14, color: "var(--on-surface-variant)", marginBottom: 16 }}>
          提示：括号前是负号，所以括号内的 <MathText content={String.raw`$x$`} /> 和 <MathText content={String.raw`$-3$`} /> 都要变号。
        </p>

        <button
          onClick={() => setShowCheck(true)}
          style={{
            background: "var(--primary)",
            color: "var(--on-primary)",
            border: "none", borderRadius: 8, padding: "10px 20px",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          查看答案
        </button>

        {showCheck && (
          <div style={{
            marginTop: 16,
            background: "var(--surface-container-low)",
            borderRadius: 8,
            padding: "14px 18px",
            fontSize: 17,
            lineHeight: 2,
          }}>
            <MathText content={String.raw`$4x - (x - 3) = 4x - x + 3 = 3x + 3$`} /><br />
            <span style={{ fontSize: 14, color: "var(--on-surface-variant)" }}>
              <MathText content={String.raw`$x$`} /> → <MathText content={String.raw`$-x$`} />（变号），<MathText content={String.raw`$-3$`} /> → <MathText content={String.raw`$+3$`} />（负负得正）✓
            </span>
          </div>
        )}
      </div>

      <div style={{
        background: "var(--secondary-container)",
        color: "var(--on-secondary-container)",
        borderRadius: 10,
        padding: "16px 20px",
        fontSize: 15,
        lineHeight: 1.8,
      }}>
        <strong>口诀（每次代入前默念一遍）：</strong><br />
        见负号，全变号；<br />
        见正号，直接过。<br />
        “全”字是重点——<strong>每一项</strong>，没有例外。
      </div>
    </div>
  );
}
