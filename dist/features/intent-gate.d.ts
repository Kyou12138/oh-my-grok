export type IntentMode = "ultrawork" | "search" | "analyze" | "hyperplan" | "team" | "debug" | null;
export declare function detectIntent(prompt: string): IntentMode;
export declare function intentBanner(mode: IntentMode): string;
