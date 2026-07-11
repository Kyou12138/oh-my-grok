# oh-my-grok

Grok Build 生产力插件：对标 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo）的 harness，内置 **Sisyphus 纪律 agent 团队**，并深度结合 [obra/superpowers](https://github.com/obra/superpowers)。

## 三层架构（v0.2）

| 层 | 内容 |
|----|------|
| **Harness** | Skill Gate、Ralph / ULW、Stop 续跑、Todo/Boulder、Handoff、IntentGate、Prometheus `/plan`、**Hashline**、**Diagnostics Stop**、**Hard Orchestration** |
| **Discipline Agents** | Sisyphus、Hephaestus、Prometheus、Atlas、Oracle、Explore、Librarian |
| **Superpowers** | `vendor/superpowers/skills` + 本地 bootstrap skill |

### v0.2 相对 omo 补齐

| 能力 | 说明 |
|------|------|
| Hashline | Read 后缓存；未 Read / stale / old_string 不匹配则 deny |
| Hard orchestration | 每轮注入 Sisyphus 委派/验证硬协议 + comment checker |
| Diagnostics | 改文件后可配置 `diagCommand`；无命令时 Stop 软提醒一次 |
| 配置 | `.omg/config.json`（见 `docs/config.example.json`） |
| MCP | `.mcp.json` 含 Context7（默认 disabled，自行启用） |

## 快速安装

```bash
cd D:\Data\code\VibeCoding\oh-my-grok
npm install
npm run build
npm run vendor:superpowers   # 可选但推荐：拉取完整 Superpowers skills
npm test
npm run validate

grok plugin install "D:\Data\code\VibeCoding\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

新开一个 Grok session（或 Hooks reload）。

> **互斥：** 不要与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) 同时 enable。

## Slash 命令

| 命令 | 作用 |
|------|------|
| `/ralph-loop "…"` | 工作直到完成 |
| `/ulw-loop` / `/ultrawork` / `ulw` | Ultrawork 循环 |
| `/cancel-ralph` | 取消循环 |
| `/plan` / `/prometheus` | 规划模式（Prometheus） |
| `/start-work` | 进入 boulder 执行（Atlas） |
| `/handoff` | 会话交接 |
| `/stop-continuation` / `/resume-continuation` | 暂停/恢复自动续跑 |

完成 Ralph/ULW 时输出：`<promise>DONE</promise>`

## Agents（Sisyphus 团队）

| Agent | 职责 |
|-------|------|
| **sisyphus** | 主 orchestrator |
| **hephaestus** | 深度自治实现 |
| **prometheus** | 访谈式规划 |
| **atlas** | 按 plan 执行 |
| **oracle** | 只读架构/疑难会诊 |
| **explore** | 快速扫库 |
| **librarian** | 文档与外部调研 |

主会话默认注入 Sisyphus 纪律；需要时用 `spawn_subagent` 委派。

## 配置（环境变量）

| 变量 | 默认 | 含义 |
|------|------|------|
| `OMG_STATE_DIR` | `.omg` | 工作区状态目录 |
| `OMG_SKILL_GATE` | `1` | Skill Gate |
| `OMG_INTENT_GATE` | `1` | Intent 横幅 |
| `OMG_PLAN_MODE` | `1` | Prometheus 写限制 |
| `OMG_MAX_RALPH_ITER` | `50` | Ralph 最大轮次 |

## 开发

```bash
npm run build
npm test
```

设计文档：`docs/superpowers/specs/2026-07-11-oh-my-grok-design.md`  
Hook 契约：`docs/contract.md`

## License

MIT（Superpowers 上游 skills 亦为 MIT，见 vendor 说明）
