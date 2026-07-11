/**
 * Think-mode (omo think-mode / ultrathink aligned) — UserPrompt injection.
 * Does not change model API params (host-limited); forces extended-effort protocol in context.
 */
export declare function detectThinkMode(prompt: string): boolean;
export declare function thinkModeBanner(active: boolean): string;
