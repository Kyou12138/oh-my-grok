# oh-my-grok

[![CI](https://img.shields.io/badge/CI-npm%20run%20ci-brightgreen)](./scripts/ci.mjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Tests](https://img.shields.io/badge/tests-vitest-blue)](./CONTRIBUTING.md)

**中文** | [English](./README.en.md)

**Grok Build 上的 omo 式 harness + Superpowers 方法论。**

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
grok plugin install github.com/Kyou12138/oh-my-grok --trust
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

> **互斥：** 不要与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) **同时 enable**（同名 / 同 `.omg/` 会冲突）。

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

进入 **boulder** 执行（Atlas/Sisyphus）。可选只读评审：**Metis**（找缺口）、**Momus**（计划质量）。

---

## 你得到什么

| 层 | 已交付 |
|----|--------|
| **Harness** | Ralph / **ULW v2**（shell→verify）、**意图 Skill Gate**、**Hashline LINE#ID**、Stop 链、Todo/**Boulder**、IntentGate、Prometheus、Comment Checker、Agent Guard、Category、Diagnostics、Handoff、`/init-deep` |
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

## 命令

| 命令 | 作用 |
|------|------|
| `ultrawork` / `ulw` / `/ulw-loop` | ULW 循环（探索→实现→验证） |
| `/ralph-loop "…"` | 工作到完成 |
| `/cancel-ralph` | 取消循环 |
| `/plan` · `/prometheus` | 规划模式（只写 `.omg/plans/`） |
| `/start-work` | 从 plan 进入 boulder |
| `/cancel-boulder` | 清除 boulder |
| `/handoff` | 会话交接 → `.omg/handoffs/` |
| `/init-deep` | 生成层级 `AGENTS.md` |
| `/stop-continuation` · `/resume-continuation` | 暂停 / 恢复自动续跑 |

| 完成标记 | 含义 |
|----------|------|
| `<promise>VERIFIED</promise>` | 验证通过 — ULW 建议在 DONE 前先写 |
| `<promise>DONE</promise>` | 任务完成（ULW 需过证据门禁） |

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
