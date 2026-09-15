/**
 * Re-insert a dropped closing backtick on KaTeX `math={String.raw`…`}` templates.
 *
 *   math={String.raw`(x - x_1)(x - x_2)}      // missing the backtick before `}`
 *
 * rewritten to
 *
 *   math={String.raw`(x - x_1)(x - x_2)`}
 *
 *
 * For each `math={String.raw` marker, walk forward tracking JSX `{}` nesting and
 * skipping `\` escapes. If the closing backtick comes first, leave it; otherwise
 * splice `` ` `` in just before the JSX-closing `}` (depth → 0). The depth tracking
 * keeps this safe for brace-heavy math like `\frac{b}{a}`.
 */
export function preProcess(source: string): string {
  const markerRegex = /math\s*=\s*\{\s*String\.raw`/g;
  let result = "";
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = markerRegex.exec(source)) !== null) {
    const contentStart = m.index + m[0].length;

    let j = contentStart;
    let depth = 1; // depth of the JSX { … }
    let hasClosingTick = false;
    let jsxCloseIdx = -1;

    while (j < source.length) {
      const c = source[j];

      if (c === "\\") {
        j += 2; // skip escape sequences: \{ \} \` \\
        continue;
      }
      if (c === "`") {
        hasClosingTick = true;
        j++;
        break;
      }
      if (c === "{") {
        depth++;
        j++;
        continue;
      }
      if (c === "}") {
        depth--;
        if (depth === 0) {
          jsxCloseIdx = j;
          break;
        }
        j++;
        continue;
      }
      j++;
    }

    if (hasClosingTick) {
      // Already correct: copy through the backtick, keep scanning.
      result += source.slice(cursor, j);
      cursor = j;
      markerRegex.lastIndex = j;
    } else if (jsxCloseIdx !== -1) {
      // Missing backtick: splice it in just before the closing }.
      result += source.slice(cursor, jsxCloseIdx) + "`}";
      cursor = jsxCloseIdx + 1;
      markerRegex.lastIndex = cursor;
    } else {
      // Unterminated (no closing backtick and no JSX close before EOF): give up
      // on this one — esbuild will still surface the real error.
      result += source.slice(cursor);
      return result;
    }
  }

  result += source.slice(cursor);
  return result;
}
