export interface InitDeepOptions {
    maxDepth?: number;
    createNew?: boolean;
}
export interface InitDeepResult {
    created: string[];
    skipped: string[];
    maxDepth: number;
}
export declare function detectInitDeep(prompt: string): boolean;
export declare function parseInitDeepOpts(prompt: string): InitDeepOptions;
export declare function runInitDeep(workspaceRoot: string, opts?: InitDeepOptions): InitDeepResult;
export declare function initDeepContext(result: InitDeepResult): string;
