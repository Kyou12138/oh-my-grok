# oh-my-grok 验收清单（v1.1.21+）

> **权威宿主契约：** [contract.md](./contract.md) — 仅 **PreToolUse** 硬拦；Stop / UserPrompt stdout 当前 Grok **丢弃**。  
> 自动化 handler 报告（历史）：[acceptance-report-0.30.md](./acceptance-report-0.30.md)

分层：

| 层 | 含义 | 是否发布门禁 |
|----|------|--------------|
| **L0** | `npm run ci`（build + test + doctor + validate） | **必过** |
| **L1** | 单测/契约覆盖的状态机（Stop 文案、否定 DONE 等） | 已在 CI；**不**当「宿主会 yank」验收 |
| **L2** | 真机 Grok CLI：install + **PreTool deny 探针** | **装机必过**；Stop yank **不是**必过项 |

---

## L0 — 自动化（CI / 本地源码）

- [ ] `npm run ci` 全绿
- [ ] `npm run doctor` → `RESULT: healthy`
- [ ] `npm run validate` → plugin/hooks/agents OK

---

## L2 — 真机（装上立刻有感，60s）

> 下列任一项失败 = 安装/配置问题，优先修；**不要**用「Stop 没续跑」当失败标准。

- [ ] `grok plugin install Kyou12138/oh-my-grok --trust` + `enable`（**勿**与 mihazs/oh-my-grok 双开）
- [ ] 新 session 或 Hooks reload
- [ ] 插件源码目录 `npm run doctor` healthy（或文档指向的健康检查）
- [ ] **PreTool 探针 A — Hashline：** 对已有文件 **不** `read_file` 直接 `search_replace`/Write → **deny**
- [ ] **PreTool 探针 B — plan 锁：** `/plan "试一下"` 后写 `src/` 业务路径 → **deny**；写 `.omg/plans/*` → 放行
- [ ] **PreTool 探针 C — Agent Guard（可选）：** `/agent oracle` 后 Write → **deny**

可选录屏：探针 A 的 30 秒 GIF（README wow path）。

---

## L1 — 状态机 / soft（有测试即可，不要求宿主 yank）

下列由 CI 覆盖；真机上 Stop **可能不会**自动重提示，属 **host-limited**，标 ⏭ 可接受。

- [x] ULW / Ralph 状态写入 `.omg`；假 DONE / `not ULW_DONE` 不会当完成
- [x] `/start-work` 无 review → PLAN_REVIEW；无 task checkbox → PLAN_FORMAT
- [x] SessionStart / handoff resume 路径存在（新 session 摘要）
- [x] `/stop-continuation` 暂停**插件侧**门禁逻辑
- [ ] ~~Stop idle 必须自动 yank~~ → **非 L2 必过**（见 contract）

---

## 非目标（永不要求）

- Team Mode / tmux  
- 多模型路由矩阵  
- 插件内完整 LSP/AST  
- 与 omo Ultimate 功能数对表  
- Stop stdout 驱动宿主续聊  

---

## 反馈模板

```
版本: （填 package.json version，当前 ≥1.1.26）
OS / Grok Build 版本:
L0: npm run ci → 
L2 探针 A Hashline deny: ✅/❌
L2 探针 B plan 锁: ✅/❌
L2 探针 C Agent Guard（可选）/agent oracle 后 Write 或 task: ✅/❌
失败项 / 复现:
期望 / 实际:
.omg / doctor 输出摘要:
```
