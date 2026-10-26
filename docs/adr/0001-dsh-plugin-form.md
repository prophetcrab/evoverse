# ADR-0001 以 dsh 插件形态实现，不 fork harness

- 状态：已接受
- 日期：2026-10-26

## 背景

evoverse 需要 agent 运行时（会话、工具、LLM、事件、多 agent）。dsh 已具备；fork 会与上游脱节，且掩盖"扩展点是否够用"这一信号。

## 决策

- 只用文档化扩展点，不改 harness 主循环。
- 自有服务：`ctx.world`、`ctx.chronicle`、`ctx.evolution`；P3 增 `ctx.population`。
- 工具走 `ctx.tools.register`，群体走 `ctx.agents`，轮次观察走 `ctx.sessions`。
- 注册一律走 `ctx.effect()` / `ctx.on()`，保证可卸载。
- 开发期 `--patch` overlay 挂本地 profile，发布为 npm 包。

## 候选

| 方案 | 取舍 |
|---|---|
| fork dsh 改主循环 | 表达力不受限，但与上游脱节、掩盖扩展点缺口。否决 |
| 自建运行时 | 完全掌控，但重写会话/工具/LLM，前置成本以月计。否决 |
| dsh 插件 | 受扩展点约束，换零维护运行时。接受 |

## 后果

- 正：运行时零维护；自动获得持久化、热重载、可观测。
- 负：世界推进不能侵入 `agent-loop`（见 open-questions G3）；上游破坏性变更会传导。
- 验证：P0 交付"能加载、卸载无残留"。
