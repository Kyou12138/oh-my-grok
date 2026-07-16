# 装后 60 秒（L2 真机）

> 宿主真相：[contract.md](./contract.md) — 仅 **PreToolUse** 硬拦。  
> 完整勾选清单：[acceptance.md](./acceptance.md)

## 三步成功路径

```bash
grok plugin install Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
# 新开 session 或 TUI reload Hooks
```

源码目录（可选）：

```bash
npm run doctor    # 含离线 PreTool Hashline 探针 → RESULT: healthy
```

## 真机探针（必过）

| 探针 | 操作 | 期望 |
|------|------|------|
| A Hashline | 对**已有**文件不 Read，直接 `search_replace` / Write | **PreTool deny** |
| B plan 锁 | `/plan "试"` 后写 `src/` | **deny**；写 `.omg/plans/*` 放行 |
| C Agent Guard（可选） | `/agent oracle` 后 Write 或 `task` | **deny** |

## 失败排查

| 症状 | 处理 |
|------|------|
| 完全无 deny | 是否 `enable`？是否**新 session** / reload Hooks？ |
| doctor 绿、TUI 无效果 | 装的是旧 path / 旧 clone；`plugin update` 或重装并确认 dist 版本 |
| 行为怪异、双重注入 | **禁止**与 [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) 双 enable |
| Windows 路径 | 本地装：绝对路径 + `--trust`；用 `node dist/cli.js`（无 bash launcher） |
| 以为 Stop 会自动续聊 | 当前 Grok **不会**；看 `.omg` 状态与下一轮 PreTool / SessionStart resume |

## 反馈

见 [acceptance.md](./acceptance.md) 模板。Issue 优先两类：**L2 探针失败**、**新工具名绕过 PreTool**。
