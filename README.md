# oh-my-grok

[![CI](https://img.shields.io/badge/CI-npm%20run%20ci-brightgreen)](./scripts/ci.mjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Tests](https://img.shields.io/badge/tests-vitest-blue)](./CONTRIBUTING.md)

**中文** | [English](./README.en.md)

**Grok Build 上的纪律 harness（Harness Light）+ Superpowers。** · **v1.1.33**

> **PreTool 硬门禁 + Agents/Skills 纪律** — 不是 OpenCode 全量 omo。  
> **宿主真相以 [docs/contract.md](./docs/contract.md) 为准**（当前 Grok 仅 PreToolUse 能硬拦工具）。

装一次 → `npm run doctor` 健康 → 盲改文件立刻被 **PreTool deny**。硬能力可演示；Stop 只写状态，不假装宿主自动 yank。

> **仓库：** https://github.com/Kyou12138/oh-my-grok  
> **依赖：** [Grok Build CLI](https://x.ai) + Node.js 20+  
> 社区插件，**非** xAI 官方产品。「Grok」为 xAI 商标。  
> ⚠️ **禁止与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) 双 enable**（同名 + `.omg` 冲突）。

---

## 解决什么问题

Vanilla Grok Build 很强，但长任务仍容易跑偏：

| 现象 | 没有 harness 时 |
|------|----------------|
| 盲改代码 | 不读当前内容 / 不读 skill 就 Write |
| 规划时漏写业务 | plan-mode 下改 `src/` 无人拦 |
| 角色越权 | 只读 specialist 仍在改文件 |
| 半途而废 | 有未完成 todo / plan 却宣称完成 |

**oh-my-grok** = **Grok 纪律插件**：

| 通道 | 实际作用（Grok Build 现状） |
|------|---------------------------|
| **PreToolUse** | **唯一硬 enforce**：deny 工具调用（Hashline、plan 锁、Agent Guard、Skill Gate、diag hard、spawn 回收…） |
| **PostTool / Stop** | 写 `.omg` / session 状态机；**stdout 宿主丢弃**，不保证自动续跑 |
| **SessionStart / skills / agents** | 注入纪律上下文；handoff / resume 摘要 |

KPI：**硬门禁可靠性 + 安装转化**，不是 omo issue 关闭数。语义对齐 omo；对标层级是 **Codex Light 同温层**，不是 Ultimate 功能清单。

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

**新开一个 Grok session**（或 TUI 里 reload Hooks）。

**装后 60 秒验收：**

```bash
# 在插件源码目录（或 clone 后）
npm run doctor    # 期望 RESULT: healthy
```

真机探针：在**未 Read** 的已有文件上直接 `search_replace` / Write → 应 **PreTool deny**（Hashline）。

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

## 开箱 wow 路径（30 秒硬感）

### 1) 盲改被拒（PreTool 硬门禁 — 立刻有感）

1. 打开任意**已有**源文件路径  
2. **不要**先 `read_file`，直接 `search_replace` / Write  
3. 期望：**工具被 deny**，reason 含 Hashline / Read-first  

这是装上后最值得录 GIF 的路径。

### 2) Plan-mode 锁路径

```text
/plan "给登录加 OAuth"
```

Plan-mode 下写 `src/` 业务文件 → **PreTool deny**；只允许写 `.omg/plans/`。

```text
/start-work
```

须先完成计划评审（`## Review` 勾选 Metis/Momus 或 `VERDICT: PASS`），且 plan 有**带标签** task checkbox，否则拒绝。激活 **boulder** + 可 seed todos。

### 3) Ultrawork 状态机（诚实说明）

```text
ultrawork 修掉失败的测试，不过绿不许停
```

| 行为 | 是否宿主硬 enforce |
|------|-------------------|
| 启动 ULW 阶段机 `explore → implement → verify` | 状态写入 `.omg` |
| 假 DONE / 否定话术 `not ULW_DONE` | 状态机拒绝「完成」标记（有测试） |
| `npm test` 等 shell 记入 verify 证据 | PostTool 写状态 |
| **Stop 自动 yank 续聊** | **否** — 当前 Grok 丢弃 Stop stdout；下一轮 PreTool / SessionStart resume 才读状态 |

取消：`/cancel-ralph`。暂停状态机：`/stop-continuation`（暂停的是**插件侧**自动门禁逻辑，不是宿主强制重提示）。

句中也可：`请 ulw 重构登录模块`。

---

## 你得到什么

| 层 | 已交付 | 硬 enforce？ |
|----|--------|-------------|
| **PreTool 门禁** | Hashline、plan 锁、Agent Guard、Skill Gate、diag hard、category-discipline、spawn follow-through PreTool | **是** |
| **状态机 / soft** | Ralph·ULW、Todo/Boulder、idle 检测、Stop 链、SessionStart resume、Handoff | 写 `.omg`；Stop **不**保证宿主续跑 |
| **纪律 Agents** | Sisyphus · Hephaestus · Prometheus · Atlas · Oracle · Explore · Librarian · Metis · Momus | 角色 + PreTool guard |
| **Superpowers** | Vendor MIT skills + Skill Gate | 意图匹配 + PreTool |

### 诚实对比（三列）

| | Vanilla Grok | **oh-my-grok** | omo Ultimate / Codex Light |
|--|--------------|----------------|----------------------------|
| 宿主 | Grok Build | **Grok Build** | OpenCode · Codex |
| **工具硬拦（PreTool）** | 无本插件门禁 | **有**（主战场） | 有（hook 面更宽） |
| Stop / idle **自动续跑** | 无 | **状态机 only**（host-limited） | Ultimate 可 session.prompt 级续跑 |
| Superpowers / skills | 可选 | **内置 + Gate** | 另装 / 部分 |
| 多模型路由 | 宿主 | **non-goal** | Ultimate 有 |
| Team Mode / tmux | — | **non-goal** | Ultimate 有 |
| 产品同温层 | — | **≈ Codex Light 纪律层** | Ultimate = 全量 OS |

与 omo **语义对齐**；KPI 是 **硬门禁可靠性**，不是 54+ hooks 数量或 Ultimate 功能对表。完整差距见 [docs/omo-gap.md](./docs/omo-gap.md)。

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
| `/stop-continuation` · `/resume-continuation` | 暂停 / 恢复**插件侧**门禁与状态 yank 逻辑 |

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
- [docs/contract.md](./docs/contract.md) — **宿主契约（权威）**；README 承诺 ⊆ 此文件  
- [docs/omo-gap.md](./docs/omo-gap.md) — Vanilla / omg / omo 对照  
- [docs/acceptance.md](./docs/acceptance.md) — 验收：L0 单测 · L2 真机 PreTool  
- [docs/install-60s.md](./docs/install-60s.md) — 装后 60 秒 + 失败排查  
- [docs/harness-light-architecture.md](./docs/harness-light-architecture.md) — 目标分层（core / adapter）  
- [docs/grok-build-source.md](./docs/grok-build-source.md) — grok-build 源码对齐笔记  
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
