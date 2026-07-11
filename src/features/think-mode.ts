/**
 * Think-mode (omo think-mode / ultrathink aligned) — UserPrompt injection.
 * Does not change model API params (host-limited); forces extended-effort protocol in context.
 */

export function detectThinkMode(prompt: string): boolean {
  if (!prompt?.trim()) return false;
  const p = prompt.toLowerCase();
  return (
    /\bultrathink\b/.test(p) ||
    /\bthink\s+deep(?:ly)?\b/.test(p) ||
    /\bdeep\s+think(?:ing)?\b/.test(p) ||
    /\bextended\s+thinking\b/.test(p) ||
    /仔细想/.test(prompt) ||
    /深度思考/.test(prompt) ||
    /认真想/.test(prompt) ||
    /多想一[下步]/.test(prompt)
  );
}

export function thinkModeBanner(active: boolean): string {
  if (!active) return "";
  return [
    "<OMG_THINK_MODE>",
    "Extended-effort protocol (think-mode / ultrathink):",
    "1) Restate the real goal and constraints before acting.",
    "2) List 2–3 approaches + trade-offs; pick one with a reason.",
    "3) Surface risks / unknowns; do not skip verification.",
    "4) Prefer evidence (Read, tests, paths) over vibes.",
    "5) If ambiguous, ask or spawn oracle — do not guess production behavior.",
    "</OMG_THINK_MODE>",
  ].join("\n");
}
