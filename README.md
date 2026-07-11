# oh-my-grok

Grok Build 的生产力插件层：对标 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo）的 harness 能力，并深度结合 [obra/superpowers](https://github.com/obra/superpowers) 工程方法论。

> **状态：** 设计已批准，实现进行中。  
> **设计文档：** [docs/superpowers/specs/2026-07-11-oh-my-grok-design.md](docs/superpowers/specs/2026-07-11-oh-my-grok-design.md)

## 定位

| 层 | 作用 |
|----|------|
| **Harness** | Skill Gate、Ralph / ulw-loop、Stop 续跑、Todo/Boulder、Handoff、IntentGate、Prometheus |
| **Superpowers** | brainstorm → plan → TDD → review → verify 工作流 skills（vendor） |

## 安装（实现后）

```bash
grok plugin install "D:\Data\code\VibeCoding\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

**注意：** 与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) **同名互斥**，不要双 enable。

## 开发

见设计文档与后续实现计划（`docs/superpowers/plans/`）。

## License

MIT（计划）
