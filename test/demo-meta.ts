/**
 * Page meta for the sandbox harness unit tests.
 *
 * `core/sandbox/framework.tsx` destructures `window.DEMO` at module scope
 * (exactly what the demo page does before loading the harness, ADR 0007), so
 * this module — imported **first** from the test files, ahead of the
 * framework import — must populate it before the framework module evaluates.
 */
(window as unknown as { DEMO: { slug: string; parts: number } }).DEMO = {
  slug: "sample",
  parts: 3,
};
export {};
