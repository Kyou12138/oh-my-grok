# oh-my-grok 设计文档

**日期：** 2026-07-11  
**状态：** 已批准（用户确认「可以」）  
**仓库路径：** `D:\Data\code\VibeCoding\oh-my-grok`  
**产品名称：** `oh-my-grok`（Grok Build 插件）

---

## 1. 背景与目标

### 1.1 问题

Grok Build CLI 提供了 hooks、skills、rules、plugins，但缺少类似 **oh-my-opencode / oh-my-openagent（omo）** 的「开箱即用 harness」：长任务续跑、skill 门禁、规划模式、todo 强制完成等。社区已有 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok)（Go），但我们需要：

- **TypeScript** 实现，Windows 一等公民  
- **完整对标 omo 核心 harness 语义**  
- **深度结合 obra/superpowers** 方法论 skills  

### 1.2 产品一句话

**oh-my-grok** 是 Grok Build 的生产力插件层：用 hooks **强制** harness 行为，用 Superpowers skills **引导**工程方法论；装上后像 omo 一样「写 ultrawork / 开循环就干活」，同时默认走 brainstorm → plan → TDD → review 的流程。

### 1.3 非目标（首版不做）

| 非目标 | 原因 |
|--------|------|
| omo Team Mode / tmux 多成员编排 | Grok 无对等进程编排 API |
| 完整 11-agent 模型路由矩阵 | Grok 侧模型选择面不同；二期再做薄 agents |
| Hashline / LSP 强拦 / AST-grep MCP | 增强项，非 harness 脊柱 |
| 独立桌面 App / 替代 Grok CLI | 本产品是插件，不是替代 harness |
| 复制 mihazs Go 源码 | 干净重写；仅对齐契约与语义 |

### 1.4 与相关项目关系

| 项目 | 关系 |
|------|------|
| [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | **语义参照**（Ralph、ulw、Todo Enforcer、IntentGate、Prometheus、Skill Gate 思想） |
| [obra/superpowers](https://github.com/obra/superpowers) | **方法论层**：vendor skills + first-prompt 引导 |
| [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) | **同名互斥**的另一实现（Go）；本仓库是 TS + Superpowers 一体化替代方案。**禁止双 enable** |

---

## 2. 用户与成功标准

### 2.1 目标用户

- 使用 **Grok Build CLI** 的开发者（Windows / macOS / Linux）  
- 熟悉或希望迁移 omo / Superpowers 工作流的人  

### 2.2 成功标准（可验收）

1. `grok plugin install <path> --trust` + enable 后，`grok inspect` 列出本插件 hooks 与 skills。  
2. 新 session 写入 fingerprint；首条 prompt 注入 `using-superpowers` 相关引导。  
3. `/ralph-loop` 未完成时，Stop 输出 `{"decision":"block","reason":"..."}` 并驱动续跑。  
4. 未 Read 相关 `SKILL.md` 时，对 Write/StrReplace 等突变工具 PreToolUse deny。  
5. 无 Grok CLI 的 CI 中，协议层 golden 测试（L0）全部通过。  

---

## 3. 总体架构

### 3.1 双层模型

```
┌──────────────────────────────────────────────────────────┐
│  oh-my-grok（Grok Build Plugin）                         │
│                                                          │
│  Layer A: Harness（对标 omo）     Layer B: Superpowers   │
│  · Skill Gate                     · using-superpowers    │
│  · Ralph / ulw-loop               · brainstorming        │
│  · Stop 链 / Todo enforcer        · writing-plans / TDD  │
│  · Boulder / Handoff              · debugging / review   │
│  · IntentGate / Prometheus        · verification / finish│
│  · rules + AGENTS.md 注入         · vendor/skills        │
│           hooks 强制执行  ×  skills 引导行为               │
└───────────────────────────┬──────────────────────────────┘
                            ▼
                     Grok Build CLI
```

- **Harness**：模型偷懒也难逃的循环与门禁。  
- **Superpowers**：正确工程流程（先设计、红绿重构、完成前验证）。  
- **Skill Gate**：两者的焊接点——突变前必须 Read 过相关 skill。  

### 3.2 仓库布局（单包，非多 packages）

```
oh-my-grok/
  plugin.json
  package.json
  hooks/hooks.json
  src/
    cli.ts                 # 入口：argv 事件 + fail-open
    protocol/              # IO 契约、字段归一化、fixtures
    events/                # 事件编排（不含业务规则）
    features/              # skill-gate, ralph, boulder, todo, handoff, prometheus, intent-gate
    state/                 # 路径、原子写、schemaVersion
  skills/                  # Grok 特有 skills
  rules/                   # 短规则（注入 UserPrompt）
  vendor/superpowers/      # 上游 skills（submodule 或 vendor 脚本）
  dist/cli.js              # 构建产物
  tests/protocol/
  tests/features/
  docs/
    contract.md            # 对内契约锁定
    superpowers/specs/     # 本设计
    superpowers/plans/     # 实现计划
  AGENTS.md
  README.md
```

### 3.3 运行时数据流

```
Grok 触发 hook
  → hooks.json command: node "${GROK_PLUGIN_ROOT}/dist/cli.js" <event>
  → stdin JSON + 环境变量（GROK_PLUGIN_ROOT, GROK_PLUGIN_DATA, GROK_SESSION_ID, …）
  → protocol.parse
  → events.<event> 编排 features
  → protocol.emit stdout JSON
  → exit code（deny 时 2，其余尽量 0）
```

**硬性约束：**

1. **每个 hook 事件在 hooks.json 只注册一条 command**（UserPrompt / Stop 在 runtime 内合并）。  
2. **Windows 禁止 bash 启动器**；直调 `node dist/cli.js`（后续可选 compile 二进制）。  
3. **feature throw → fail-open**（吞错 + 安全默认 + exit 0；PreToolUse deny 路径除外）。  

---

## 4. Hook 契约（权威）

> 官方文档可能不完整。以 **Grok 实测 + mihazs 已验证行为** 为权威，并在 `docs/contract.md` 与 golden fixtures 锁定。

### 4.1 事件与入口

| hooks.json 事件 | CLI 子命令 | 职责 |
|-----------------|------------|------|
| SessionStart | `session-start` | 重置会话状态、skill catalog、fingerprint、superpowers 引导准备 |
| UserPromptSubmit | `user-prompt` | **唯一**合并 `additionalContext` |
| PreToolUse（Write\|StrReplace\|EditNotebook\|Delete） | `pre-tool-use` | plan-mode → skill-gate |
| PostToolUse Read | `post-tool-read` | 标记 SKILL.md 已加载 |
| PostToolUse TodoWrite | `post-tool-todo` | 镜像 todos → `.omg/todos/` |
| Stop | `stop` | 续跑链 first-block-wins |
| SessionEnd | `session-end` | 清理会话状态 |

超时建议：SessionStart 30s，UserPrompt 20s，Pre/Post 10s，Stop 15s。

### 4.2 输出形状

| 场景 | stdout | exit |
|------|--------|------|
| PreToolUse deny | `{"decision":"deny","reason":"..."}` | 2 |
| PreToolUse allow | `{"decision":"allow"}` 或空 | 0 |
| Stop 续跑 | `{"decision":"block","reason":"<驱动下一轮的完整指令>"}` | 0 |
| Stop 放行 | `{}` | 0 |
| UserPrompt / SessionStart 注入 | `{"additionalContext":"..."}` | 0 |

**不要**在 Grok 路径默认使用 Claude 的 `hookSpecificOutput` 包裹。

### 4.3 输入归一化

protocol 层必须兼容字段别名，至少：

- `sessionId` / `GROK_SESSION_ID`  
- `cwd` / `workspaceRoot` / `GROK_WORKSPACE_ROOT`  
- `hookEventName` 大小写变体  
- Stop：`stopReason`、`last_assistant_message` 等别名统一到内部类型  

---

## 5. 状态模型

### 5.1 双命名空间

| 位置 | 所有者 | 内容 |
|------|--------|------|
| **工作区 `.omg/`** | oh-my-grok 运行时 | `boulder.json`、`plans/`、`todos/`、`ralph-loop.local.md`、`handoffs/`、`run-continuation/` |
| **会话状态** | 优先 `GROK_PLUGIN_DATA`，否则 `~/.grok/state/oh-my-grok/` | skill-gate catalog、todo-enforcer、stop-continuation pause、fingerprint |

- `OMG_STATE_DIR` 可覆盖工作区状态根（默认 `.omg`）。  
- 所有 JSON 含 `schemaVersion`；写盘使用 **tmp + rename** 原子写。  
- Session 亲和：一律绑定 `sessionId`。  

### 5.2 与 mihazs 冲突

同名插件 + 同 `.omg/` → **互斥**。文档与 SessionStart 应：

- 检测已启用的另一实现或可疑双 hook 迹象时注入警告  
- 明确要求：只 enable 一份 `oh-my-grok`  

---

## 6. 功能规格

### 6.1 Skill Gate

1. SessionStart：构建 skill catalog（扫描 plugin `skills/` + `vendor/superpowers/skills/`；若可用则结合 `grok inspect`）。  
2. PostToolUse(Read)：若路径命中 catalog 中 `SKILL.md`，记入 `skills.loaded`。  
3. PreToolUse(突变工具)：catalog 非空且 `skills.loaded` 为空 → deny，提示先 Read 匹配 skill。  
4. **fail-open**：catalog 为空时允许编辑（避免全新环境锁死）。  
5. UserPrompt：未加载 skill 时周期性提醒。  

### 6.2 Superpowers 集成

1. `vendor/superpowers/skills/` 由脚本或 submodule 同步上游 MIT 内容。  
2. `plugin.json`：`"skills": ["./skills", "./vendor/superpowers/skills"]`。  
3. 首条 UserPrompt（或 SessionStart 上下文）：注入 **using-superpowers** 引导——要求在创造性工作前走 brainstorming，实现走 TDD 等。  
4. **不复制** superpowers 正文到 `skills/`；oh-my-grok 自有 skills 仅 Grok 特有：  
   - `agent-skill-gate`  
   - `ralph-loop` / `ulw-loop` / `cancel-ralph`  
   - `handoff`  
   - `prometheus-plan`  
5. 若用户另装官方 Superpowers 插件导致 skill 重名：SessionStart 可提示；默认仍 vendor 以保证「一装即全」。  

### 6.3 Ralph / Ultrawork

- `/ralph-loop "task"`：写入 `.omg/ralph-loop.local.md`，进入 work-until-done。  
- `/ulw-loop` / 关键词 `ultrawork`/`ulw`：Ralph + 更强验证文案（IntentGate 可触发）。  
- `/cancel-ralph`：清除 loop 状态。  
- Stop：未出现完成标记（如约定的 `<promise>DONE</promise>` 或配置的完成条件）→ `decision:block` + 续跑指令。  
- **max-iterations** 与 cancel 语义必须可测，防止死循环烧 token。  

### 6.4 Todo / Boulder / Stop 链

**Stop 顺序（first block wins）：**

1. Ralph / Ultrawork  
2. Boulder（`.omg/boulder.json` + plans 进度）  
3. Todo 续跑（镜像自 TodoWrite；**todo enforcer**：cooldown、非 end_turn abort 窗口、max 续跑次数）  
4. 根/session `plan.md` 未勾项（fallback）  

- `/stop-continuation`：暂停 2–N 步（Ralph 是否受 pause 影响：**pause 时清除或跳过 loop，产品规则写死为「pause 跳过 2–N；Ralph 可用 cancel-ralph 明确取消」**——实现采用：**pause 期间跳过 Boulder/Todo/plan；Ralph 仍活跃除非 cancel 或 stop-continuation 同时清 loop 标志**；最终实现锁定为：**`/stop-continuation` 暂停全部自动续跑含 Ralph；`/cancel-ralph` 只清 Ralph；`/resume-continuation` 恢复**）。  
- `/resume-continuation`：恢复。  

### 6.5 Handoff

- `/handoff`：生成会话摘要到 `.omg/handoffs/`，并注入下一会话可读的 PHASE 说明。  

### 6.6 Prometheus（规划模式）

- `/plan` / `/prometheus`：访谈式规划，产出 `.omg/plans/*.md`。  
- plan-mode 激活时 PreToolUse：仅允许写入计划相关路径（`.omg/plans/**` 等），其余突变 deny。  
- `/start-work`：从 plan 进入 boulder 执行态。  

### 6.7 IntentGate

- 根据 prompt 关键词注入模式 banner：`search` / `analyze` / `team`（文案级）/ `hyperplan` / `ultrawork`。  
- 可用 `OMG_INTENT_GATE=0` 关闭。  

### 6.8 UserPrompt 合并顺序（固定）

1. using-superpowers（首 prompt 或按规则）  
2. skill-gate 主动提示  
3. 工作区 AGENTS.md + plugin `rules/*.md`（长度上限）  
4. Ralph / ultrawork 状态  
5. IntentGate  
6. Prometheus 命令/状态  
7. handoff / stop-continuation / resume  
8. Boulder 上下文  
9. skill 未加载提醒  

---

## 7. omo 能力映射

| omo | oh-my-grok | MVP |
|-----|------------|-----|
| ultrawork / ulw | 关键词 + `/ulw-loop` + Stop | ✅ |
| Ralph Loop | 状态文件 + Stop block | ✅ |
| Todo Enforcer | 镜像 + Stop + enforcer | ✅ |
| Prometheus | `/plan` + PreTool 限制 | ✅ |
| IntentGate | UserPrompt banner | ✅ |
| Rules / AGENTS.md | UserPrompt 注入 | ✅ |
| Skill 强制使用 | Skill Gate（Read SKILL.md） | ✅ |
| Handoff | `/handoff` | ✅ |
| Discipline Agents | `agents/` 薄定义 | 二期 |
| Hashline / LSP / AST | — | 二期 |
| Team Mode / tmux | — | 不做 |
| 内嵌搜索 MCP | 可选 | 可选 |

---

## 8. 配置

环境变量前缀 `OMG_*`：

| 变量 | 默认 | 含义 |
|------|------|------|
| `OMG_STATE_DIR` | `.omg` | 工作区状态目录名/路径 |
| `OMG_SKILL_GATE` | `1` | Skill Gate 开关 |
| `OMG_INTENT_GATE` | `1` | IntentGate 开关 |
| `OMG_PLAN_MODE` | `1` | Prometheus 相关 |
| `OMG_MAX_RALPH_ITER` | 合理上限（如 50） | Ralph 最大续跑 |
| `OMG_TODO_COOLDOWN_MS` | 5000 | Todo enforcer cooldown |

可选 `.omg/config.json` 覆盖（schema 版本化）。

---

## 9. 技术选型

| 项 | 选择 |
|----|------|
| 语言 | TypeScript（strict） |
| 开发 | Bun 优先；npm/pnpm 亦可 |
| 运行 | Node 20+（`node dist/cli.js`） |
| 运行时依赖 | **尽量零依赖**（仅 Node 内置） |
| 测试 | Vitest；L0 fixtures 精确匹配 JSON |
| 构建 | `tsc` 或 bun build → `dist/cli.js` |
| 后续可选 | `bun build --compile` 多平台二进制，hooks 指向二进制 |

---

## 10. 测试策略

| 层级 | 内容 | CI |
|------|------|-----|
| L0 协议 | stdin fixture → stdout 精确匹配 | ✅ |
| L1 特性 | Stop 链顺序、skill-gate、todo enforcer 时钟 | ✅ |
| L2 本机 | 真 Grok：fingerprint、banner、ralph 续 1 轮 | 本地 only |

**最小可验证路径（L2）：**

1. install + enable + inspect 见 hooks  
2. 新 session → fingerprint 更新  
3. UserPrompt banner 可被模型复述  
4. PreTool deny 探针生效  
5. Ralph 未 DONE 时 Stop block  

改 hooks 后需 **新 session 或 Hooks reload（Ctrl+L）**。

---

## 11. MVP 分期

### Week 1 — 接通

- 仓库脚手架、`plugin.json`、`hooks/hooks.json`、`src/cli.ts`、protocol + golden tests  
- SessionStart fingerprint  
- UserPrompt 固定 banner + using-superpowers 引导骨架  
- vendor/superpowers 路径与同步脚本  
- 文档：安装、契约  

### Week 2 — 续跑

- Ralph / ulw-loop / cancel-ralph  
- Todo 镜像 + Stop todo 续跑 + enforcer  
- stop-continuation / resume-continuation  

### Week 3 — 门禁与计划执行态

- Skill Gate 全流程  
- Boulder + Handoff  

### Week 4 — 规划与硬化

- IntentGate + Prometheus  
- Windows 路径、原子写、双装警告、超时与 max-iter  
- README / AGENTS.md 完整化  

---

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 官方 hook 文档与实测不符 | golden fixtures + L2 探针；docs/contract.md |
| 与 mihazs 双装 | 同名互斥文档；SessionStart 警告 |
| Node 冷启动超时 | 显式 timeout；后续 compile 二进制 |
| Stop 死循环 | enforcer + max-iter + cancel |
| Superpowers 体积/更新 | vendor 脚本 pin 版本；不改上游正文 |
| catalog 空导致全锁 | skill-gate fail-open |

---

## 13. 文档与发布

- **README.md**：人类安装与特性  
- **AGENTS.md**：给改插件的 agent 用  
- **docs/contract.md**：IO 契约  
- 安装示例：

```bash
grok plugin install "D:\Data\code\VibeCoding\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

- 验证：`grok plugin validate .`  

---

## 14. 开放决策（已关闭）

| 决策 | 结论 |
|------|------|
| 实现方案 | A：TypeScript 单包 |
| 插件名 | `oh-my-grok` |
| 状态目录 | `.omg/`（与 omo 习惯一致；与 mihazs 互斥） |
| Superpowers | vendor 进插件 + Skill Gate 强制 Read |
| omo 对标范围 | 核心 harness 全做；Team/Hashline 等二期或砍 |

---

## 15. 下一步

1. 用户审阅本 spec（本文件）。  
2. 通过后编写 `docs/superpowers/plans/2026-07-11-oh-my-grok-implementation.md`。  
3. 按 W1→W4 实现；TDD：先 L0 协议测试再写 features。  
