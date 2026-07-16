import path from "node:path";
export type PathFlavor = Pick<typeof path, "relative" | "isAbsolute" | "sep">;
export interface TargetBoundaryCheck {
    boundary: string;
    baseDir: string;
    target: string;
}
/** 解析最近存在祖先的真实路径，并保留尚未创建的尾部片段。 */
export declare function canonicalizeTargetPath(baseDir: string, target: string): string | null;
/** 比较规范化绝对路径；不同盘符或 UNC 根产生绝对 relative，必须拒绝。 */
export declare function isPathInside(parent: string, candidate: string, pathFlavor?: PathFlavor): boolean;
export declare function isTargetInside(check: TargetBoundaryCheck): boolean;
