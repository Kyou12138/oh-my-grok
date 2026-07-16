import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface CommentHit {
    line: number;
    snippet: string;
    reason: string;
}
export interface CommentAggregateState {
    schemaVersion: 1;
    hitCount: number;
    files: string[];
    softPrompted: boolean;
    updatedAt: string;
}
export declare function findCommentSlop(content: string, filePath?: string): CommentHit[];
export declare function loadCommentAggregate(input: HookInput, cfg: EnvConfig): CommentAggregateState;
export declare function recordCommentSlop(input: HookInput, cfg: EnvConfig, filePath: string, hitCount: number): CommentAggregateState;
export declare function markCommentSoftPrompted(input: HookInput, cfg: EnvConfig): void;
/** Stop yank once when session accumulated enough slop hits. */
export declare function commentAggregateStopReason(input: HookInput, cfg: EnvConfig): string | null;
export declare function formatCommentHits(hits: CommentHit[], filePath: string): string;
/** Tools that carry new content we can scan for slop comments. */
export declare function isCommentScanTool(toolName?: string): boolean;
/** PreTool deny when commentCheckerDeny is on. */
export declare function commentCheckerPreDeny(input: HookInput, cfg: EnvConfig): string | null;
/** PostTool soft warning context + aggregate. */
export declare function commentCheckerPostWarn(input: HookInput, cfg: EnvConfig): string;
