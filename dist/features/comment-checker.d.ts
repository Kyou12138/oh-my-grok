import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface CommentHit {
    line: number;
    snippet: string;
    reason: string;
}
export declare function findCommentSlop(content: string, filePath?: string): CommentHit[];
export declare function formatCommentHits(hits: CommentHit[], filePath: string): string;
/** PreTool deny when commentCheckerDeny is on. */
export declare function commentCheckerPreDeny(input: HookInput, cfg: EnvConfig): string | null;
/** PostTool soft warning context. */
export declare function commentCheckerPostWarn(input: HookInput, cfg: EnvConfig): string;
