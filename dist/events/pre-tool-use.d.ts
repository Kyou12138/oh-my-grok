import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
export declare function handlePreToolUse(input: HookInput, cfg: EnvConfig): {
    output: HookOutput;
    exitCode: number;
};
