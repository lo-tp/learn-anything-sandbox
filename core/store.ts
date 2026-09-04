/**
 * Minimal standalone store for the sandbox app.
 *
 * Carries only what the `/sandbox` route needs — a minimal copy of the
 * `learn-anything` store's demo lookup (not the full store, which drags in
 * drizzle/pg). The route's `@/core/store` import resolves to this file.
 */

/**
 * A demo served to a demo page (ADR 0007): the derived ESM module plus its
 * `demo_parts` stepper count, `null` when the demo has no stepper.
 */
export interface Demo {
  js: string;
  parts: number | null;
}

/**
 * Look up a demo by its URL slug — the public-safe read (ADR 0007): a
 * discovered slug serves that demo to anyone; the slug is the
 * confidentiality.
 *
 * STUB (#32): the `session_messages.demo_js`/`demo_slug` columns are not in
 * the database yet, so this deliberately does not touch the db — it returns
 * random demo data for any slug. Replace with a Drizzle lookup on
 * `demo_slug` (unknown slug → `null`) when the columns land.
 */
export async function getDemoBySlug(slug: string): Promise<Demo | null> {
  const parts = 1 + Math.floor(Math.random() * 3);
  const js = [
    `// random stub demo for slug "${slug}" (#32 — db columns not landed yet)`,
    "export default function Demo() {",
    `  return <div>random stub demo: ${slug}</div>;`,
    "}",
  ].join("\n");
  return { js, parts };
}
