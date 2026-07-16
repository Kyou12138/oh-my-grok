# 路径边界加固设计

**日期：** 2026-07-16
**状态：** 已批准（采用共享路径边界层）
**范围：** Prometheus 计划写入门禁、plan-only Skill Gate 跳过、目录级规则注入

## 1. 背景

当前 `isPlanWritePath(file)` 通过字符串包含关系判断计划路径：只要路径中出现 `.omg/plans/`，或以 `plan-mode.json` 结尾，就会被视为计划写入。该判断同时服务于三条硬门禁语义：

1. plan-mode 仅允许计划文件写入；
2. Prometheus 角色仅允许计划文件写入；
3. plan-mode 的纯计划写入可跳过 Skill Gate。

只比较字符串无法表达真实文件系统边界。已复现以下误判：

```text
.omg/plans/../../src/app.ts  -> 允许
C:/outside/.omg/plans/x.md   -> 允许
src/plan-mode.json            -> 允许
```

第一种路径在工具执行时会解析到业务源码目录，却能绕过最先执行的计划门禁；第三种路径也没有任何宿主或插件内部需求。目录级规则注入已有 realpath 防护，但使用独立的 `startsWith("..")` 判断，未统一覆盖跨盘符、UNC 和符号链接边界。

## 2. 目标

1. 计划写入只允许落在当前配置对应的 `plansDir` 边界内。
2. 相对路径穿越、外部绝对路径、同前缀兄弟目录、跨盘符和边界内符号链接逃逸必须拒绝。
3. 相对路径、同一计划文件的绝对路径、自定义 `OMG_STATE_DIR` 与不存在的新文件必须正常工作。
4. Prometheus role、plan-mode 与 plan-only Skill Gate skip 必须调用同一判断，不能再次产生语义分叉。
5. 目录规则注入复用同一包含关系原语，外部文件或链接逃逸时不得读取工作区外内容。
6. 保持 PreTool 编排顺序、CLI 顶层 fail-open、hook 注册和用户文案主体不变。

## 3. 非目标

1. 本轮不迁移完整 `omg-core` / `adapter-grok` 目录结构。
2. 本轮不改变 Hashline 是否允许用户显式编辑工作区外文件的既有策略。
3. 本轮不改变 `OMG_STATE_DIR` 可配置为绝对路径的能力；配置后的状态根视为显式信任边界。
4. 本轮不解决检查完成后文件系统被并发替换的 TOCTOU 问题；宿主没有提供原子受限写接口。
5. npm 打包白名单、锁文件与真实跨平台 CI 作为下一阶段工程发布优化处理。

## 4. 方案决策

采用共享路径边界层，而不是在 Prometheus 内追加一个局部 `path.resolve` 判断。

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| Prometheus 最小补丁 | 改动最少 | 不能统一目录注入，容易遗漏符号链接和跨盘符 | 不采用 |
| 共享路径边界层 | 根因只实现一次，便于单测和后续迁移 core | 增加一个小型基础模块 | 采用 |
| 完整 core/adapter 迁移 | 长期边界最清晰 | 范围过大，会把安全修复与架构迁移耦合 | 后续阶段 |

共享层放在 `src/state/path-boundary.ts`。它负责文件系统路径规范化与边界比较，不包含 Prometheus、Skill Gate 或目录注入业务文案。未来迁移 `omg-core` 时，可将纯包含关系函数移入 core，将 realpath 解析留在 adapter/state。

## 5. 路径边界模块

### 5.1 公共能力

模块提供三个小接口：

```ts
canonicalizeTargetPath(baseDir: string, target: string): string | null
isPathInside(
  parent: string,
  candidate: string,
  pathFlavor?: Pick<typeof path, "relative" | "isAbsolute" | "sep">,
): boolean
isTargetInside(check: {
  boundary: string;
  baseDir: string;
  target: string;
}): boolean
```

职责如下：

| 接口 | 职责 |
|------|------|
| `canonicalizeTargetPath` | 将相对目标解析到 `baseDir`，并解析真实存在的最近祖先，兼容尚未创建的目标文件 |
| `isPathInside` | 比较两个已规范化绝对路径，接受父目录本身或其后代，拒绝父级逃逸和不同根路径；生产默认当前平台，测试可注入 `path.win32` / `path.posix` |
| `isTargetInside` | 同时规范化 `boundary` 与 `target` 后比较；对象参数避免三个路径字符串顺序混淆，任一路径无法安全解析时返回 `false` |

### 5.2 不存在目标的规范化

新计划文件和自定义状态根下的 `plansDir` 都可能尚不存在，不能直接依赖 `realpathSync(target)`。`canonicalizeTargetPath` 对边界与候选执行相同流程：

1. 使用 `path.resolve(baseDir, target)` 得到词法绝对路径；
2. 从目标向父级回溯，找到最近的已存在祖先；
3. 对该祖先执行 `fs.realpathSync.native`；
4. 将尚不存在的尾部片段重新附加到真实祖先；
5. 如果回溯到文件系统根仍找不到可解析祖先，返回 `null`。

这样既能处理尚未创建的 `plansDir` 和新文件，也能识别目标父目录中的 junction/symlink 是否已经跳出允许边界。Prometheus sticky role 即使没有先启动 plan-mode，也能判断并允许状态根内的第一个计划文件。

### 5.3 包含关系

`isPathInside` 使用 `path.relative(parent, candidate)`，仅在以下条件成立时返回 `true`：

```text
relative == ""
或
relative 不是绝对路径，且不等于 ".."，且不以 "..${path.sep}" 开头
```

不使用简单的 `startsWith("..")`，因为合法子目录名可以以两个点开头；同时必须检查 `path.isAbsolute(relative)`，以拒绝 Windows 跨盘符和不同 UNC 根。可注入的 `pathFlavor` 只服务于这个无文件系统副作用的比较原语，使任意开发平台都能确定性验证 `path.win32` 与 `path.posix` 语义；生产调用不传该参数。

### 5.4 信任边界

配置解析后的 `plansDir` 是允许边界根。边界根本身可以位于自定义绝对 `OMG_STATE_DIR`，也可以经过工作区根或状态根的符号链接；这些属于显式配置或现有状态布局。边界根以下的链接如果指向边界外，则候选真实路径不再位于真实边界根内，必须拒绝。

## 6. Prometheus 集成

`isPlanWritePath` 改为上下文感知接口：

```ts
isPlanWritePath(input: HookInput, cfg: EnvConfig, file: string): boolean
```

判断过程为：

1. 从 `pathsFor(input.workspaceRoot, input.sessionId, cfg).plansDir` 取得唯一边界；
2. 以 `input.workspaceRoot || input.cwd` 为相对路径基准；
3. 使用共享路径边界层判断 `file` 是否位于 `plansDir`；
4. 解析失败返回 `false`。

以下三个调用点必须统一改为传入相同上下文：

| 调用点 | 失败行为 |
|--------|----------|
| `planModeDeny` | 返回现有 Prometheus deny 文案和 exit 2 |
| `prometheusRoleDeny` | 返回现有 PROMETHEUS_ROLE deny 文案和 exit 2 |
| `isPlanModePlanOnlyWrite` | 返回 `false`，继续执行后续 Skill Gate |

删除 `norm.endsWith("plan-mode.json")` 例外。`plan-mode.json` 由插件内部状态函数写入，不经过用户工具的 PreTool 调用，因此不需要用户写入豁免。

批量编辑继续使用 `pathsFromToolInput` 提取所有目标。只有每个目标都位于计划目录时才允许；任一目标解析失败或越界，整次工具调用被拒绝。

## 7. 目录规则注入集成

`collectDirectoryContext` 删除本地的 `safeRealpath` 和 `isInside` 实现，改用共享路径边界层：

1. 规范化工作区根；
2. 规范化读取目标；已存在目标是文件时从其真实父目录开始遍历，已存在目标是目录时从该目录开始；
3. 目标不在工作区真实边界内时直接返回空字符串；
4. 向上遍历时，每一级仍需位于工作区真实边界内；
5. 任何权限、真实路径或文件读取错误都保持现有静默跳过行为。

不存在的目标保持当前兼容语义：将目标本身视作目录，而不是擅自改用 `path.dirname(target)`。这条路径只负责上下文注入，不是工具硬门禁，因此解析失败时不输出 deny，也不泄漏外部路径内容。

## 8. 错误处理

| 场景 | 计划写入门禁 | 目录规则注入 |
|------|--------------|--------------|
| 目标为空 | 现有 missing-path deny | 返回空字符串 |
| 最近祖先无法解析 | 拒绝该目标 | 返回空字符串 |
| 跨盘符或不同 UNC 根 | 拒绝该目标 | 返回空字符串 |
| 边界内链接指向外部 | 拒绝该目标 | 不读取外部内容 |
| 普通文件尚不存在 | 通过最近真实祖先完成判断 | 按现有行为处理 |
| 未预期异常逃出 feature | 保持 `cli.ts` 顶层 fail-open | 保持 `cli.ts` 顶层 fail-open |

计划模式本来就对缺失路径采取 fail-closed。把“无法证明位于计划目录”视为拒绝，是现有访问策略的精确定义，不改变 CLI 对进程崩溃或坏 JSON 的顶层 fail-open 契约。

deny reason 继续展示工具提供的原始路径，不展示规范化后的外部真实路径，避免在提示中额外暴露主机目录信息。

## 9. 测试设计

实现按 TDD 执行，先增加失败用例，再修改生产代码。

### 9.1 共享层单元测试

新增 `tests/path-boundary.test.ts`，覆盖：

1. 父目录自身、普通后代与尚不存在的新文件；
2. `../` 逃逸与同前缀兄弟目录；
3. 以两个点开头但仍位于边界内的合法目录名；
4. 外部绝对路径；
5. 注入 `path.win32`，用不依赖真实磁盘存在的 `C:\` / `D:\` 路径和不同 UNC 根测试跨根比较；
6. 注入 `path.posix` 验证 POSIX 外部绝对根；
7. junction/symlink 指向边界外；
8. 边界内链接仍指向边界内时允许；
9. 边界根与目标同时尚不存在时，使用最近真实祖先形成逻辑边界；
10. 无效或无法解析的根返回 `false`。

### 9.2 Prometheus 回归测试

扩充 `tests/prometheus.test.ts`：

1. 允许相对和绝对 `.omg/plans/<file>`；
2. 允许自定义相对及绝对状态目录中的计划文件；
3. 使用表驱动矩阵验证路径穿越、外部绝对路径、同前缀兄弟目录、跨根路径、任意 `plan-mode.json` 和链接逃逸；
4. 矩阵中的每个非法目标都必须让 `planModeDeny` 与 `prometheusRoleDeny` 返回拒绝，并让 `isPlanModePlanOnlyWrite` 返回 `false`；
5. MultiEdit 混合计划路径与越界路径时整体拒绝；
6. Prometheus sticky role 与 plan-mode 对同一路径给出一致结论。

`tests/pre-tool-orchestration.test.ts` 继续证明 plan-mode 仍早于 Hashline，确保本次修改没有改变硬门禁顺序。

### 9.3 目录注入回归测试

将 `tests/directory-inject.test.ts` 末尾永久跳过的空测试替换为真实 junction/symlink 测试。Windows 使用 `junction`，POSIX 使用目录 symlink；测试必须证明外部 `AGENTS.md` 未进入输出。当前开发环境已验证 Windows junction 无需额外权限即可创建。另加一个不存在目标路径用例，锁定“按目录处理”的现有兼容语义。

## 10. 兼容性与文档

用户可见的正确用法不变：plan-mode 仍允许 `.omg/plans/` 内写入，仍拒绝业务文件写入。以下行为属于漏洞修复，不提供兼容开关：

1. 通过路径穿越写入计划目录外；
2. 因路径字符串包含 `.omg/plans/` 而误放行外部路径；
3. 用户工具写入任意 `plan-mode.json`；
4. 通过计划目录下的链接写入边界外。

`docs/contract.md` 增加一句“plan-only 路径按规范化后的真实边界判断”，但不改变 PreTool 顺序。README 无需新增功能说明；现有“只允许写 `.omg/plans/`”将在实现后与真实行为一致。

## 11. 验收标准

1. 路径穿越、外部绝对路径、同前缀兄弟目录、跨根路径、任意 `plan-mode.json` 和链接逃逸在 `planModeDeny`、`prometheusRoleDeny` 中均被拒绝，且 `isPlanModePlanOnlyWrite` 均返回 `false`。
2. 原始复现路径 `.omg/plans/../../src/app.ts` 通过 PreTool 编排产生 deny 与 exit 2，而不是落入 Hashline 或 Skill Gate。
3. 合法计划相对路径、绝对路径、新文件和自定义状态目录保持允许。
4. 目录注入的真实 symlink/junction 测试通过，`tests/directory-inject.test.ts` 不再包含对应的 `describe.skip` 或 `it.skip`。
5. PreTool 顺序测试保持通过，CLI fail-open 测试保持通过。
6. `docs/contract.md` 已说明 plan-only 使用规范化真实边界，PreTool 顺序段保持不变。
7. `npm run build`、`npm test`、`npm run doctor`、`npm run validate` 全部通过。
8. 已提交的 `dist/` 与 TypeScript 源码一致，工作树没有遗漏的生成物变化。

## 12. 实施边界

本设计可以在一个实施计划内完成，建议拆为三个可独立验证的任务：

1. 共享路径边界模块及其单元测试；
2. Prometheus 三个调用点与硬门禁回归测试；
3. 目录注入迁移、真实链接测试、契约文档和全量验证。

以上任务共享同一基础模块，必须按顺序实施，不适合并行修改同一工作树。
