/**
 * Idle / empty assistant turn detection — yank agent back when work remains.
 */

const FLUFF =
  /^(ok|okay|sure|yes|no|done|thanks|thank you|继续|好的|嗯|哦|行|可以|收到|明白|了解|稍后|一会|\.{1,6}|…+|👍|✅)\.?$/i;

export function isIdleAssistantMessage(msg?: string): boolean {
  if (msg === undefined || msg === null) return true;
  const t = msg.trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (FLUFF.test(t)) return true;
  // "I'll continue shortly." / "let me proceed" — no concrete deliverable
  if (
    /^i('ll| will)\s+(continue|get (right )?on it|do that|proceed)\b/i.test(t) ||
    /^let me (continue|proceed)\b/i.test(t) ||
    /^continuing(\s+shortly)?[\s.]*$/i.test(t) ||
    /^(working on it|on it|got it|understood|will do)[\s.]*$/i.test(t)
  ) {
    return true;
  }
  // pure ellipsis / emoji noise
  if (/^[\s.。…·•\-–—*⭐✨🚀✅❌]+$/u.test(t)) return true;
  // short status with no path/code/marker
  if (
    t.length < 40 &&
    !/[\\/]|\.(ts|tsx|js|py|go|rs|md)\b|promise>|TODO|fix|test|edit|read|spawn|implement/i.test(
      t,
    )
  ) {
    if (/^(i |i'm |im |we |let me |going to |trying )/i.test(t)) return true;
  }
  return false;
}

export function idleTurnStopReason(context: string): string {
  return [
    "IDLE TURN DETECTED — no concrete progress in the last reply.",
    context,
    "",
    "You MUST continue with a real action:",
    "1) Read/search a file, or",
    "2) Edit code, or",
    "3) Run tests / diagnostics",
    "Do not reply with only 'ok' / '继续' / status fluff.",
  ].join("\n");
}
