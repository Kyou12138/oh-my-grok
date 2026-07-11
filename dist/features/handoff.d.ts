import type { EnvConfig, HookInput } from "../protocol/types.js";
export declare function detectHandoff(prompt: string): boolean;
export declare function writeHandoffStub(input: HookInput, cfg: EnvConfig, prompt: string): string;
export declare function handoffContext(file: string): string;
