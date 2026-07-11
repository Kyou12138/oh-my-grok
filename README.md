# oh-my-grok

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Grok Build** 生产力插件：对标 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo / oh-my-opencode）的 harness 能力，内置 **Sisyphus 纪律 Agent 团队**，并深度结合 [obra/superpowers](https://github.com/obra/superpowers)。

> **Repo:** https://github.com/Kyou12138/oh-my-grok  
> **Requires:** [Grok Build CLI](https://x.ai) + Node.js 20+

---

## 为什么需要它

Vanilla Grok Build 很强，但长任务容易半途停、改文件不读 skill、编辑 stale、缺少 omo 式「纪律」。

**oh-my-grok** 用 hooks 强制：

- 工作循环（Ralph / Ultrawork）
- Skill Gate（改代码前先 Read `SKILL.md`）
- Hashline（先 Read 再改，拒绝 stale edit）
- Stop 续跑（todo / boulder / 诊断提醒）
- Sisyphus 编排协议 + Superpowers 方法论

---

## 三层架构（v0.2）

| 层 | 内容 |
|----|------|
| **Harness** | Skill Gate · Ralph/ULW · Stop 链 · Todo/Boulder · Handoff · IntentGate · Prometheus · **Hashline** · **Diagnostics** · **Hard Orchestration** |
| **Discipline Agents** | Sisyphus · Hephaestus · Prometheus · Atlas · Oracle · Explore · Librarian |
| **Superpowers** | `vendor/superpowers/skills`（brainstorming / TDD / writing-plans / …） |

---

## 安装

### 从 GitHub（推荐）

```bash
grok plugin install github.com/Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

或：

```bash
grok plugin install https://github.com/Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

### 从本地克隆

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
# dist/ 已提交；若改了源码再 build：
# npm install && npm run build

grok plugin install "$(pwd)" --trust   # Windows: 用绝对路径
grok plugin enable oh-my-grok
```

### 验证

```bash
grok plugin validate .
grok inspect    # 应能看到 hooks / skills / agents
```

**新开一个 Grok session**（或 TUI 里 reload Hooks），应看到 Sisyphus / Superpowers 注入。

> **互斥：** 不要与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) **同时 enable**（同名/同 `.omg/` 会冲突）。

---

## 快速上手

```text
ultrawork
/ralph-loop "修掉失败的测试"
/plan "给登录加 OAuth"
/start-work
/handoff
```

| 完成标记 | 含义 |
|----------|------|
| `<promise>DONE</promise>` | Ralph / ULW 任务完成 |
| `<promise>VERIFIED</promise>` | 验证通过（诊断/测试） |

---

## Slash 命令

| 命令 | 作用 |
|------|------|
| `/ralph-loop "…"` | 工作直到完成 |
| `/ulw-loop` · `/ultrawork` · `ulw` | Ultrawork 循环（探索→实现→验证） |
| `/cancel-ralph` | 取消循环 |
| `/plan` · `/prometheus` | Prometheus 规划模式（只写 `.omg/plans/`） |
| `/start-work` | 进入 boulder 执行（Atlas） |
| `/handoff` | 写会话交接摘要 |
| `/stop-continuation` · `/resume-continuation` | 暂停 / 恢复自动续跑 |

---

## Agents（Sisyphus 团队）

| Agent | 职责 |
|-------|------|
| **sisyphus** | 主 orchestrator：规划、委派、盯到做完 |
| **hephaestus** | 深度自治实现 |
| **prometheus** | 访谈式规划 |
| **atlas** | 按 plan 执行 |
| **oracle** | 只读架构 / 疑难会诊 |
| **explore** | 快速扫库 |
| **librarian** | 文档与外部调研 |

主会话默认注入 **Sisyphus** 纪律；复杂任务用 `spawn_subagent` 委派。

---

## Hook 行为摘要

### PreToolUse（写文件前）

1. Prometheus plan-mode 路径限制  
2. **Hashline** — 需先 Read；拒绝 stale `old_string`  
3. **Skill Gate** — catalog 非空时需已 Read 过 skill  

### Stop（续跑链，先命中先返回）

1. Ralph / ULW  
2. Boulder  
3. 未完成 Todo  
4. Diagnostics（有 `diagCommand` 错误硬拦；否则软提醒一次）  
5. plan 未勾 checkbox  

契约细节：[`docs/contract.md`](./docs/contract.md)

---

## 配置

### 工作区 `.omg/config.json`

复制示例：

```bash
mkdir -p .omg
cp docs/config.example.json .omg/config.json
```

```json
{
  "schemaVersion": 1,
  "hashline": true,
  "diagEnforce": true,
  "hardOrchestration": true,
  "diagCommand": "npm test",
  "maxRalphIter": 50
}
```

### 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `OMG_STATE_DIR` | `.omg` | 工作区状态目录 |
| `OMG_SKILL_GATE` | `1` | Skill Gate |
| `OMG_HASHLINE` | `1` | Hashline 护栏 |
| `OMG_DIAG_ENFORCE` | `1` | 诊断 / 验证提醒 |
| `OMG_HARD_ORCH` | `1` | 硬编排协议注入 |
| `OMG_INTENT_GATE` | `1` | Intent 横幅 |
| `OMG_PLAN_MODE` | `1` | Prometheus 写限制 |
| `OMG_DIAG_CMD` | _空_ | 写后自动诊断命令 |
| `OMG_MAX_RALPH_ITER` | `50` | Ralph 最大轮次 |

---

## 与 omo 的关系

| | oh-my-openagent (omo) | oh-my-grok |
|--|----------------------|------------|
| 宿主 | OpenCode / 多 harness | **Grok Build** |
| 编排 | 进程内多 agent / 多模型 | hooks + agents 定义 + spawn |
| 循环 / Gate | ✅ | ✅ |
| Hashline | ✅ | ✅（v0.2） |
| Team Mode / 跨厂路由 | ✅ | ❌（平台限制） |

思想对齐 omo，**干净实现**；不 fork omo 源码。Superpowers skills 以 MIT 上游 vendor。

---

## 开发

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
npm install          # 或 bun install
npm run build
npm test
npm run validate
npm run vendor:superpowers   # 刷新 vendor/superpowers
```

| 路径 | 说明 |
|------|------|
| `src/` | TypeScript hook runtime |
| `hooks/hooks.json` | Grok hook 清单 |
| `agents/` | Sisyphus 团队定义 |
| `skills/` | 插件自有 skills |
| `vendor/superpowers/` | 上游 Superpowers |
| `docs/contract.md` | Hook IO 契约 |
| `docs/superpowers/specs/` | 设计文档 |

---

## License

[MIT](./LICENSE)

- Superpowers skills：上游 [obra/superpowers](https://github.com/obra/superpowers) MIT  
- 「Grok」为 xAI 商标；本项目为社区插件，**非 xAI 官方产品**
