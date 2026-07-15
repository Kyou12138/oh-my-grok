# oh-my-grok 验收清单（v0.28+）

给人工 24h 摸测用。每项标 ✅ / ❌ / 跳过，并记下 session 截图或 `.omg/` 状态。

## 安装

- [ ] `grok plugin install Kyou12138/oh-my-grok --trust` + `enable`
- [ ] 新 session 出现 `OMG_SISYPHUS` / SessionStart 上下文
- [ ] `npm run doctor`（本地源码）RESULT: healthy

## 规划链

- [ ] `/plan "小功能"` → 仅允许写 `.omg/plans/`
- [ ] 未评审直接 `/start-work` → **PLAN_REVIEW** 拦截
- [ ] 勾选 Metis/Momus 或写 `VERDICT: PASS` 后 `/start-work` → boulder 激活

## 循环

- [ ] `ulw 修一个小 bug` 或 `/ulw-loop` → 进入 ULW
- [ ] 只说 `ok` / `继续` 且有未完成 todo → **IDLE** 或 TODO 续跑
- [ ] 否定话术 `not ULW_DONE` **不会**关掉 loop
- [ ] 正常 `<promise>VERIFIED</promise>` + DONE（多目标时 `GOAL_DONE`）可结束

## 角色与 spawn

- [ ] `/agent oracle` 后 Write 被 **AGENT_GUARD** 拦
- [ ] `/agent hephaestus` 后 Write 放行（即使 host 仍打 oracle 标签）
- [ ] spawn 子代理后仅回复「已派出」→ **SPAWN_FOLLOWTHROUGH** 再拉一次
- [ ] deep 类任务零 spawn → **CATEGORY_DISCIPLINE** 一次提示

## 编辑与注释

- [ ] 未 Read 的 Hashline 编辑被拒（若开启）
- [ ] 含 `// This function…` 的 slop 注释：soft 警告；deny 模式 PreTool 硬拒

## 其它命令

- [ ] `/handoff` 写出 `.omg/handoffs/*`
- [ ] 写过 handoff 后**新 session** 上下文含 `OMG_HANDOFF_RESUME` / 路径
- [ ] `/init-deep` 在有代码的子目录生成 `AGENTS.md`（不覆盖手写长文）
- [ ] `/stop-continuation` / `/resume-continuation`

## 已知非目标（不要求）

- Team Mode / tmux
- 多模型路由
- 插件内完整 LSP/AST

## 反馈模板

```
版本: 0.28.x
失败项:
复现步骤:
期望 / 实际:
.omg 相关文件:
```
