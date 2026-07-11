/**
 * Thin category layer — route work style without multi-model matrix.
 * Aligns with omo categories at the prompt/delegation level.
 */
export type WorkCategory = "visual-engineering" | "ultrabrain" | "deep" | "artistry" | "quick" | "writing" | "unspecified-high" | "unspecified-low" | null;
export declare function detectCategory(prompt: string): WorkCategory;
export declare function categoryBanner(cat: WorkCategory): string;
