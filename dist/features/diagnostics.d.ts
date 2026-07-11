import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface DiagState {
    schemaVersion: 1;
    needsVerify: boolean;
    lastErrors: string;
    lastRunAt: number;
    lastFiles: string[];
    verifiedAt: number;
    /** Soft mode (no diagCommand): only one Stop block per dirty cycle */
    softPrompted: boolean;
}
export declare function loadDiag(input: HookInput, cfg: EnvConfig): DiagState;
export declare function saveDiag(input: HookInput, cfg: EnvConfig, st: DiagState): void;
export declare function markDirty(input: HookInput, cfg: EnvConfig, file?: string): void;
export declare function markVerified(input: HookInput, cfg: EnvConfig): void;
export declare function markSoftPrompted(input: HookInput, cfg: EnvConfig): void;
export declare function runDiagCommand(input: HookInput, cfg: EnvConfig): DiagState;
export declare function isVerifiedMessage(msg?: string): boolean;
export declare function diagStopReason(input: HookInput, cfg: EnvConfig): string | null;
export declare function diagUserContext(input: HookInput, cfg: EnvConfig): string;
