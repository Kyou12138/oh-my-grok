# Harness Light 目标架构（语义完整版）

**Status:** target design for **1.2 → 2.0** (not a big-bang rewrite of 1.1.x)  
**Date:** 2026-07-16  
**Product one-liner:** Grok Build 的 PreTool 纪律插件 — omo **Light 语义**，不是 Ultimate OS。

> **User-facing promises still ⊆ [contract.md](./contract.md).**  
> 本文件描述 **目标分层与 hard/soft 矩阵**；当前实现仍在单包 `src/features/*`，按阶段迁入。

---

## 1. 三层结构

```
┌─────────────────────────────────────────────────────────────┐
│  Plugin surface（插件面）                                     │
│  agents/ · skills/ · vendor/superpowers · rules/ · .mcp.json │
│  文案、方法论、可选 MCP —— 不决定硬 enforce                    │
└────────────────────────────┬────────────────────────────────┘
                             │ inject / catalog paths
┌────────────────────────────▼────────────────────────────────┐
│  omg-adapter-grok（宿主适配）                                  │
│  hooks.json · cli.ts · protocol/* · events/*                 │
│  PreTool 顺序编排 · fail-open · matcher 注册 · env/session IO  │
└────────────────────────────┬────────────────────────────────┘
                             │ pure decisions + state transitions
┌────────────────────────────▼────────────────────────────────┐
│  omg-core（纯逻辑，无 stdin/stdout，无 Grok 专用类型）          │
│  intent · loop (ULW/Ralph) · boulder/todo · edit-guard       │
│  (hashline rules) · comment · spawn-ledger · skill-catalog   │
│  输入：归一化 Snapshot；输出：Decision | StatePatch | Inject  │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 可依赖 | 禁止依赖 |
|----|--------|----------|
| **core** | 纯 TS、文件系统路径字符串、可选 `fs` 经 interface 注入 | `process.stdin`、hook envelope 字段名、Grok tool 字符串散落 |
| **adapter-grok** | core + protocol + paths/fs 实现 | 业务规则复制（应调用 core） |
| **plugin surface** | markdown / skill 路径 | 绕过 core 直接写门禁语义 |

---

## 2. 与 1.1.x 模块映射（现状 → 目标）

| 目标 core 模块 | 今日 `src/features/*`（近似） | hard / soft |
|----------------|-------------------------------|-------------|
| **intent** | `intent-gate.ts`, `think-mode.ts`, `category.ts`, `last-prompt.ts` | soft inject；category → PreTool once = hard |
| **loop** | `ralph.ts`（ULW/Ralph 相位、DONE/VERIFIED 判定） | soft 状态；证据门 = soft Stop + 可选 PreTool 联动见 §4 |
| **boulder / todo** | `todo-boulder.ts`, `prometheus.ts`（plan/start-work） | plan 锁 / prometheus 角色 = **hard**；Stop yank = soft |
| **edit-guard** | `hashline.ts`, `tool-paths.ts` | **hard** PreTool |
| **comment** | `comment-checker.ts` | hard if deny mode；aggregate Stop = soft |
| **spawn-ledger** | `spawn-followthrough.ts`, `category-discipline.ts`, `session-role.ts` | follow-through / guard spawn = **hard** |
| **skill-catalog** | `skill-gate.ts` | **hard** PreTool（plan-only skip） |
| **agent-permissions** | `agent-guard.ts` | **hard** |
| **diag** | `diagnostics.ts` | hard if `lastErrors` |
| **resume** | `session-resume.ts`, `handoff.ts` | soft inject / files |
| **adapter only** | `cli.ts`, `protocol/*`, `events/*`, `config.ts`, `rules.ts` | I/O |

对标 omo：覆盖 **Light + Ultimate 中不依赖** `session.prompt` 自动续跑 / 自定义 edit tool / Team·多模型 的语义。Hashline = **读缓存 + content 校验半边**（非 native edit tool）。

---

## 3. 续跑契约（诚实 + 完整语义）

| 通道 | 职责 | 宿主保证 |
|------|------|----------|
| **Stop** | 只跑状态机 → 写 `.omg` / pluginData；可输出 `decision:block` **供测试与未来宿主** | **当前 Grok 丢弃 stdout，不 re-prompt** |
| **SessionStart** | `OMG_SESSION_RESUME` + handoff + hard-gate 文案 | 若 inject 失败：仍写 **runtime 文件**（已有 `.omg` / session JSON）；skill/rules 要求 agent 读取 |
| **PreTool** | 唯一 **硬 enforce**：在「未完成工作 + 高风险/越权动作」上 **deny** | host 拦 tool |

### 3.1 禁止的设计

- 依赖 Stop stdout 作为「用户感知的续跑」  
- 承诺 PreTool 能拦 `end_turn` / 纯文本收工（无 tool 时宿主无 PreTool 钩子）  
- 把 Team Mode / 多模型路由写进 core  

### 3.2 允许的「PreTool 模拟 yank」（需防误伤）

仅当 **状态机未完成** 且工具落在 **明确危险/越权集合** 时 deny，并给出可恢复 reason：

| 状态条件（示例） | 可 deny 的动作（示例） | 不 deny（防误伤） |
|------------------|----------------------|-------------------|
| spawn pending + childFinished | 任意 **mutating** 写（已有 follow-through once） | Read、get_task_output、todo_write 状态更新 |
| plan-mode active | 写非 `.omg/plans/` | plan 文件 Write、spawn metis/momus（read-only 角色另拦） |
| prometheus role | 写非 plan 路径 | plan 路径、非 mutating |
| read-only / no-redelegate | Write、task/spawn | Read、只读 MCP |
| diag lastErrors | mutating 写 | shell 跑 diag、Read |
| boulder 未完成（可选，默认 off） | 全仓 Delete / 无 path 的 MultiEdit | 单文件编辑、todo/plan 更新 |
| ULW active 无 verify（**不**靠 PreTool 拦收工话术） | — | 用 SessionStart/skill 提醒；**不**拦 end_turn |

原则：**宁可漏 yank，不可拦合法推进**（fail-open 在边界）。

---

## 4. Core 公共类型（建议形状）

```ts
// 示意 — 实现时再落文件
type Decision =
  | { kind: "allow" }
  | { kind: "deny"; code: string; reason: string; once?: boolean };

type StatePatch = Record<string, unknown>; // 由 adapter 落到 pathsFor()

interface SessionSnapshot {
  sessionId: string;
  workspaceRoot: string;
  role?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  lastPrompt?: string;
  // 由 adapter 从 disk 读入的 loop/boulder/todo/spawn/diag 视图
  views: { ralph?; boulder?; todos?; spawn?; diag?; planMode? };
}
```

- **单元测试：** 只构造 `SessionSnapshot` → `Decision`，不启 CLI。  
- **适配测试：** envelope → snapshot → core → stdout/exit（现有 e2e 保留）。

---

## 5. 分阶段迁移（避免单日 monorepo）

| 阶段 | 动作 | 完成标准 |
|------|------|----------|
| **A. 文档边界（现在）** | 本文件 + CONTRIBUTING 指针；hard/soft 矩阵 | 贡献者不写 Stop yank 依赖 |
| **B. 逻辑收口（1.2.x）** | `tool-paths` / edit-guard 规则无 hook 依赖；PreTool 只编排 | 新 gate 先 core 单测 |
| **C. 目录分层（2.0 prep）** | `packages/omg-core` + `packages/omg-adapter-grok` 或 `src/core` + `src/adapter` | CI 双 package test；插件面不动 |
| **D. 1.2.0 产品含义** | **硬门禁 API 稳定**（matcher + deny code 列表冻结） | Release notes 只列 hard 清单 |

**不在迁移路径：** 为对标而 fork omo 源码；54+ lifecycle 对表冲数量。

---

## 6. 与 omo 的语义边界

| omo | Harness Light |
|-----|----------------|
| session.prompt 续跑 | **非目标** → state + PreTool + resume 文件 |
| native Hashline edit tool | **半边** cache + PreTool 校验 |
| Team / tmux / multi-model | **non-goal** |
| Todo stagnation / plan checkbox / skill intent | **已覆盖或 soft 状态**（1.1.x） |
| comment binary rewrite | partial patterns；AST 外置 MCP 可选 |

对标 KPI：**硬门禁可靠性 + 安装转化**，不是 omo issue 关闭数。

---

## 7. 成功标准（可验收）

1. README / description 口号 ⊆ contract + 本架构 hard 表。  
2. 任意新 gate：能指出属于 core 哪块、hard 还是 soft。  
3. PreTool 顺序仅存在于 adapter 一处（今日 `pre-tool-use.ts`）。  
4. Stop 链可测、可不被宿主执行，**不改变用户文档承诺**。  
5. 1.2.0：硬门禁列表有版本钉（deny code / matcher 表）；soft 仅 bugfix。

---

## 8. 非目标（钉死）

- OpenCode Team Mode / tmux  
- 多 provider 模型矩阵  
- 插件内完整 LSP/AST  
- 依赖 Stop stdout 的「强制续跑」营销  
- 设计阶段假装已 monorepo 完成  

---

## 相关文档

- [contract.md](./contract.md) — 宿主 I/O 权威  
- [omo-gap.md](./omo-gap.md) — 能力对照  
- [install-60s.md](./install-60s.md) — L2 真机  
- [superpowers/specs/2026-07-11-oh-my-grok-design.md](./superpowers/specs/2026-07-11-oh-my-grok-design.md) — 早期设计（Stop 续跑已 supersede）
