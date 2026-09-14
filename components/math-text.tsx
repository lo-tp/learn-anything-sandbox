"use client";

import React, { useRef, useEffect } from 'react';
import temml from 'temml';
import type { Options } from 'temml';

// temml's auto-renderer (renderMathInElement) calls the *global* temml.render
// to avoid a circular import, so expose the ESM module as a global first.
(globalThis as { temml?: typeof temml }).temml ??= temml;

// renderMathInElement accepts auto-render options that the shipped .d.ts
// omits (it reuses the base Options type). Extend it for the delimiters.
type AutoRenderOptions = Options & {
  delimiters?: { left: string; right: string; display: boolean }[];
  fences?: string;
};

/**
 * Renders text with embedded LaTeX as native MathML.
 *
 * `content` is inserted as plain text (no HTML injection), then temml's
 * auto-renderer walks the text and converts delimited math in place.
 * Inline math uses `$…$` and display math uses `$$…$$`; text with no
 * math renders unchanged.
 */
export const MathText = ({
  content,
  className,
}: {
  content: string;
  className?: string;
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !content) return;

    // Insert as plain text, then render $…$ / $$…$$ in place.
    el.textContent = content;
    const options: AutoRenderOptions = {
      throwOnError: false,
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
    };
    temml.renderMathInElement(el, options);
  }, [content]);

  return <span ref={containerRef} className={className} />;
};
