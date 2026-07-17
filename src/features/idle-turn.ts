/**
 * Idle / empty assistant turn detection — yank agent back when work remains.
 */

const FLUFF =
  /^(ok|okay|sure|yes|no|done|thanks|thank you|继续|好的|嗯|哦|行|可以|收到|明白|了解|稍后|一会|没问题|了解了|着手处理|\.{1,6}|…+|👍|✅)[.。]?$/i;

export function isIdleAssistantMessage(msg?: string): boolean {
  if (msg === undefined || msg === null) return true;
  const t = msg.trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (FLUFF.test(t)) return true;
  // "I'll continue shortly." / "let me proceed" — no concrete deliverable
  // v1.1.50: Looking into it / One moment / Hang on / Bear with me
  if (
    /^i('ll| will)\s+(continue|get (right )?on it|do that|proceed|take a look)\b/i.test(
      t,
    ) ||
    /^let me (continue|proceed|check)\b/i.test(t) ||
    /^continuing(\s+shortly)?[\s.]*$/i.test(t) ||
    /^(working on it|on it|on it now|got it|understood|will do|will do that)[\s.]*$/i.test(
      t,
    ) ||
    /^(looking into it|taking a look|checking now|one moment|one sec|hang on|stand by|acknowledged|sounds good|right away|coming right up|give me a moment|just a second|bear with me)[\s.]*$/i.test(
      t,
    )
  ) {
    return true;
  }
  // Chinese status fluff without paths/tools (v1.1.13 + v1.1.50 我来看看/处理中)
  if (
    t.length < 48 &&
    /^(稍等|等一下|马上|即将|稍后继续|我先看看|我来看看|我看一下|先这样|好的我继续|继续处理|马上处理|这就开始|正在处理|处理中|着手处理|先摸一下)/.test(
      t,
    )
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
    "Continue with a real action:",
    "1) Read/search a file, or",
    "2) Edit code (`search_replace` / Write), or",
    "3) Run tests / diagnostics, or",
    "4) **task** + **get_task_output** if waiting on a subagent",
    "Do not reply with only 'ok' / '继续' / '稍等' / status fluff.",
  ].join("\n");
}
