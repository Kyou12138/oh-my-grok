export declare function ensureDir(dir: string): void;
export declare function readJson<T>(file: string, fallback: T): T;
export declare function writeJsonAtomic(file: string, data: unknown): void;
export declare function readText(file: string): string | null;
export declare function writeTextAtomic(file: string, text: string): void;
export declare function removeFile(file: string): void;
export declare function listFilesRecursive(dir: string, pred: (name: string) => boolean): string[];
