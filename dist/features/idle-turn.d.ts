/**
 * Idle / empty assistant turn detection — yank agent back when work remains.
 */
export declare function isIdleAssistantMessage(msg?: string): boolean;
export declare function idleTurnStopReason(context: string): string;
