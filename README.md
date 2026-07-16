# oh-my-grok

[![CI](https://img.shields.io/badge/CI-npm%20run%20ci-brightgreen)](./scripts/ci.mjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Tests](https://img.shields.io/badge/tests-vitest-blue)](./CONTRIBUTING.md)

**中文** | [English](./README.en.md)

**Grok Build 上的 omo 式 harness + Superpowers 方法论。** · **v1.1.0**（对齐 [grok-build](https://github.com/xai-org/grok-build) 源码 hooks）

装一次，输入 `ultrawork`。Hooks 强制 agent 走完 **探索 → 实现 → 验证**，直到真正做完。

> **仓库：** https://github.com/Kyou12138/oh-my-grok  
> **依赖：** [Grok Build CLI](https://x.ai) + Node.js 20+  
> 社区插件，**非** xAI 官方产品。「Grok」为 xAI 商标。

---

## 解决什么问题

Vanilla Grok Build 很强，但长任务仍容易跑偏：

| 现象 | 没有 harness 时 |
|------|----------------|
| 半途而废 | 有未完成 todo 却宣称「完成了」 |
| 盲改代码 | 不读 skill、不读当前文件内容就改 |
| 跳过流程 | 没有 brainstorm → plan → TDD → verify |
| 软停 | 石头只推到半山就歇了 |

**oh-my-grok** = 缰绳：hooks **强制**纪律（循环、门禁、Stop 续跑）+ **Superpowers** 技能教你怎么正确交付。

---

## 30 秒安装

```bash
# 推荐：GitHub shorthand（user/repo）
grok plugin install Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

也可用完整 git URL：

```bash
grok plugin install https://github.com/Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

**新开一个 Grok session**（或 TUI 里 reload Hooks）。应能看到 Sisyphus / Superpowers 上下文注入。

**本地路径（Windows）：**

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
# dist/ 已提交；改源码后再 build：npm install && npm run build
grok plugin install "D:\path\to\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

---

## 分发渠道

oh-my-grok 是**社区插件,非 xAI 官方产品**(见顶部免责)。两条安装路径,信任链各自独立:

- **GitHub 直装(主路径,本仓库推荐)** — 即上面 `grok plugin install Kyou12138/oh-my-grok --trust`。`--trust` 是官方要求(插件会执行代码、读写本地数据),不依赖任何外部索引,随时可用。
- **官方插件市场(浏览)** — [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) 是 xAI 官方维护的插件索引,Grok Build 终端用 `/plugin`(或 `/marketplace`)交互浏览。其完整性由索引的 **commit-SHA pin** 保证(Grok Build clone 后 re-verify `git rev-parse HEAD == sha`),与 `--trust` 直装是**两条不同的信任链**。

> oh-my-grok **暂未收录**进官方 marketplace 索引,请用 GitHub 直装。两条路径均为社区,与 xAI 无隶属。

---

## 开箱 wow 路径（可复制）

### 1) Ultrawork — 干到验证过关

在 Grok 对话里：

```text
ultrawork 修掉失败的测试，不过绿不许停
```

**Harness 真实行为（有测试覆盖）：**

1. 启动 **ULW 循环**（阶段机：`explore → implement → verify`）
2. **Stop** 时若未完成 → **block** 并续跑
3. 无 explore/implement 证据 + 验证就写 `<promise>DONE</promise>` → **拒绝**
4. 建议顺序：先 `<promise>VERIFIED</promise>`，再 `<promise>DONE</promise>`
5. 跑 `npm test` 等 shell 会记入 verify 证据（`post-tool-shell`）

句中也可：`请 ulw 重构登录模块`。

### 2) Ralph — 命名任务循环

```text
/ralph-loop "把登录 bug 修完并补测试"
```

取消：`/cancel-ralph`。暂停全部自动续跑：`/stop-continuation`。

### 3) 先规划再执行

```text
/plan "给登录加 OAuth"
```

Plan-mode 下只允许写 `.omg/plans/`。然后：

```text
/start-work
```

进入 **boulder** 执行（Atlas/Sisyphus）。**须先完成计划评审**：在 plan 的 `## Review` 勾选 Metis/Momus，或写入 `VERDICT: PASS`，否则 `/start-work` 会被拦。

---

## 你得到什么

| 层 | 已交付 |
|----|--------|
| **Harness** | Ralph / **ULW v3 multi-goal**、**Hashline**（先 Read 再改）、**plan-review**、**spawn follow-through**（结果回收至多 2 次）、SessionStart **状态摘要**、Todo/Boulder、idle-turn、粘性 `/agent`、Category discipline、Comment aggregate、Agent Guard、Handoff 续跑、`/init-deep` |
| **纪律 Agents** | Sisyphus · Hephaestus · Prometheus · Atlas · Oracle · Explore · Librarian · Metis · Momus |
| **Superpowers** | Vendor MIT skills：brainstorming、writing-plans、TDD、verification-before-completion … |

### 诚实对比

| | Vanilla Grok | oh-my-grok | oh-my-openagent (omo) |
|--|--------------|------------|------------------------|
| 宿主 | Grok Build | **Grok Build** | OpenCode（+ Codex Light） |
| 长任务循环 / Stop 续跑 | 软 | **硬 hooks** | 硬 |
| Superpowers 方法论 | 可选 | **内置 + Skill Gate** | 另装 / 部分 |
| 多模型路由 | 宿主 | 薄 category + spawn | 完整矩阵 + fallback |
| Team Mode / tmux | — | **无**（平台限制） | 有（Ultimate） |
| LSP / AST / 50+ hooks | 宿主工具 | 插件内不提供完整套件 | 有 |

与 omo **语义对齐**；**不宣称** Team Mode、跨厂路由或完整工具 OS 对等。

---

## Hashline 怎么用

1. 先 **Read** 目标文件（缓存 LINE#ID）。  
2. **StrReplace / Write** 的 `old_string` 必须是当前文件里的原文。  
3. 可选：下一轮提示里的 `<HASHLINE_CACHE>` 用 `行号#TAG| 内容` 锚定。  
未先 Read 就改**已有文件**会被 PreTool 拒绝（见 skill `hashline-edit`）。

## 命令

| 命令 | 作用 |
|------|------|
| `ultrawork` / `ulw` / `/ulw-loop` | ULW 循环（探索→实现→验证） |
| `/ralph-loop "…"` | 工作到完成 |
| `/cancel-ralph` | 取消循环 |
| `/plan` · `/prometheus` | 规划模式（只写 `.omg/plans/`） |
| `/start-work` | 从 plan 进入 boulder |
| `/cancel-boulder` | 清除 boulder |
| `/agent <role>` · `/as <role>` | 粘性会话角色（Agent Guard） |
| `/handoff` | 会话交接 → `.omg/handoffs/` |
| `/init-deep` | 生成层级 `AGENTS.md` |
| `/stop-continuation` · `/resume-continuation` | 暂停 / 恢复自动续跑 |

| 完成标记 | 含义 |
|----------|------|
| `<promise>VERIFIED</promise>` | 验证通过 — ULW 建议在 DONE 前先写 |
| `<promise>DONE</promise>` | 任务完成（ULW 需过证据门禁 + 多目标 `GOAL_DONE`） |
| `GOAL_DONE: <text>` | 标记 ULW 多目标清单中的一项完成 |

---

## 信任与健康检查

```bash
npm install
npm run ci            # build + test + doctor + validate
# 或分开：
npm test
npm run doctor
npm run validate
```

- [CONTRIBUTING.md](./CONTRIBUTING.md) — 如何贡献  
- [CHANGELOG.md](./CHANGELOG.md) — 版本说明  
- [docs/contract.md](./docs/contract.md) — Hook I/O 契约  
- [docs/omo-gap.md](./docs/omo-gap.md) — 与 omo 能力对照（可做 / 阻塞）  
- [docs/acceptance.md](./docs/acceptance.md) — 人工验收勾选清单  
- **CI：** `npm run ci`（[`scripts/ci.mjs`](./scripts/ci.mjs)）。GitHub Actions 模板：[`docs/ci.workflow.yml`](./docs/ci.workflow.yml)

---

## 配置（可选）

```bash
mkdir -p .omg
cp docs/config.example.json .omg/config.json
```

常用开关：`hashline`、`skillGate`、`agentGuard`、`commentChecker`、`diagCommand`、`maxRalphIter`。  
环境变量：`OMG_SKILL_GATE`、`OMG_HASHLINE`、`OMG_AGENT_GUARD`、`OMG_COMMENT_CHECKER`、`OMG_DIAG_CMD` …

---

## 可选增强（MCP）

oh-my-grok **不内建** LSP/AST 工具套件（见 [omo-gap](./docs/omo-gap.md) 的 non-goal），但可与外部 MCP 协同。按是否随插件分发分两级：

**已随插件分发**

- **context7** — 官方库文档检索（[upstash/context7](https://github.com/upstash/context7)）。已在 [.mcp.json](./.mcp.json) 默认启用（`disabled: false`，npm 包 `@upstash/context7-mcp`），**装插件即加载，无需手动配置**。

**进阶可选（非 Grok 原生，需自行接入）**

oh-my-openagent 作者 [code-yeongyu](https://github.com/code-yeongyu) 的外部 stdio MCP，**不随本插件分发**，需自行 `grok mcp add`，且非为 Grok Build 原生设计：

- **lsp-tools-mcp**（[code-yeongyu/lsp-tools-mcp](https://github.com/code-yeongyu/lsp-tools-mcp)）— LSP 诊断桥（自 codex-lsp / omo 抽取）。⚠️ Windows 有已知启动缺陷（[oh-my-openagent #4262](https://github.com/code-yeongyu/oh-my-openagent/issues/4262)），Grok Build 下需手动注册 server 名。
- **ast-grep-skill**（[code-yeongyu/ast-grep-skill](https://github.com/code-yeongyu/ast-grep-skill)）— LLM 中立的 AST 搜索/重写 skill（覆盖 25 种语言，包装 `ast-grep`）。

> 上述外部 MCP **不**是 oh-my-grok 的内置能力，属「接入既有外部 server」的可选增强，与本仓库 LSP/AST non-goal 一致。

---

## 架构（简）

```
hooks/hooks.json → node dist/cli.js <event>
  → protocol → events → features (ralph, skill-gate, hashline, …)
  → .omg/ 工作区状态 + session skill catalog
```

贡献硬规则：每个 hook 事件只注册一条 command；异常 fail-open；Windows 用 `node dist/cli.js`（无 bash 启动器）。

---

## License

[MIT](./LICENSE)

- Superpowers skills：[obra/superpowers](https://github.com/obra/superpowers) MIT  
- 与 xAI 无隶属关系
