# evoverse

**agent 世界自演进引擎** —— 以 DeepSeek Harness(dsh)插件形式实现的一群 agent 与其世界共同演化的运行时。

一群 agent 生活在一个可持续演化的世界中:世界状态、规则与 agent 群体随时间自组织、自演进,涌现行为被记录、可回放。

> 前置知识项目: [`Harness-Learning`](https://github.com/prophetcrab/Harness-Learning)(用 Python 3.13 从零重写 dsh 机制以理解原理);本项目是其落地实现,直接构建在 dsh 的插件体系上。

## 形态决策

- **以 dsh 插件(Cordis Service)实现**,不修改 harness 主循环——新行为全部走文档化扩展点:
  - 本插件声明自己的服务(如 `ctx.world` 世界状态、`ctx.evolution` 演化循环);
  - 通过 `ctx.tools.register(defineTool(...))` 向模型暴露世界观测/操作工具;
  - 通过 `ctx.agents` 接缝做多 agent 协调,`ctx.on(...)` 观察工具与会话事件;
  - 所有注册走 `ctx.effect()` / `ctx.on()`,保证可卸载、可热重载。
- **组合方式**:cordis 配置装载——开发期用 `--patch` overlay 挂入本地 profile,发布后是普通 npm 包(`name` 即 cordis.yml 条目)。
- **技术栈**:TypeScript ESM(`"type": "module"`),Node ≥ 24.9,pnpm;`@deepseek-ai/cordis` 走 peerDependencies。

## 路线图(验收驱动,验不过不进入下一阶段)

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| **P0** | 插件骨架:`apply` / `inject` / effect 生命周期,dsh 加载可见 | dsh 启动日志出现 evoverse,卸载无残留 | ⬜ |
| **P1** | 世界状态服务:最小世界模型 + 会话内读写工具 | 模型可调用工具读写世界并得到一致快照 | ⬜ |
| **P2** | 演化循环:tick 事件 + 规则管线(waterfall)+ 演化观测工具 | 一个 tick 改变世界并可被解释回放 | ⬜ |
| **P3** | 多 agent:agents 接缝 + 群体交互 + 涌现事件记录 | ≥2 agent 交互产生可追溯的涌现记录 | ⬜ |
| **P4** | 自演进:规则/策略的自我修改(带沙箱审批) | 世界规则被 agent 修改且通过审批留痕 | ⬜ |

## 开发环境

| 项 | 要求 |
|---|---|
| Node | ≥ 24.9(本机已装 26.12.1) |
| pnpm | 已装 |
| dsh 源码 | `~/project/deepseek-harness`(本地工作区,`vendor/cordis` 可直接运行官方教程) |

## 参考

- dsh 插件模型:`deepseek-harness/docs/cordis-primer.md` 与 `docs/cordis-tutorial/`
- 架构总览:`deepseek-harness/docs/architecture.md`
- DeepSeek Harness:https://github.com/deepseek-ai/deepseek-harness
