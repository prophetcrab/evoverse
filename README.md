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

## 非目标

- 通用游戏引擎（渲染、物理、实时性）
- 通用编辑器（地图绘制、资源管理）——观察界面是目标，编辑不是
- 分布式与多世界实例
- agent 数量规模——要的是涌现质量与可解释性

## 路线图(验收驱动,验不过不进入下一阶段)

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| **P0** | 插件骨架:`apply` / `inject` / effect 生命周期,dsh 加载可见 | dsh 启动日志出现 evoverse,卸载无残留 | ⬜ |
| **P1** | 世界状态服务:最小世界模型 + 会话内读写工具 + 单层 2D 观察面板 | 模型可调用工具读写世界并得到一致快照 | ⬜ |
| **P2** | 回合推进 + 触发式规则 + 回放拖动条 | 一轮结算改变世界并可被解释回放 | ⬜ |
| **P3** | 多 agent:agents 接缝 + 群体交互 + 涌现记录 + 等距 3D 视图 | ≥2 agent 交互产生可追溯的涌现记录 | ⬜ |
| **P4** | 自演进:规则/策略的自我修改(带沙箱审批) | 世界规则被 agent 修改且通过审批留痕 | ⬜ |

## 文档

决策过程先行,其余按落地后的事实补写。规则见 [docs/README.md](docs/README.md)。

- [docs/open-questions.md](docs/open-questions.md) —— 待议议程
- [docs/adr/](docs/adr/README.md) —— 架构决策记录

## 当前状态

世界模型与观察界面已在本地和 dsh 宿主中跑通。插件已安装进 `evo` profile 并验证激活。

- 已实现：多层格子、地形与楼梯三态、四种尺寸、两个场景（程序生成 / 庄园地图上的「私立雾影学园」剧本，80×54×4、18 名能力者、12 条地图世界信息、每人 3–4 条主线认知）、三通道场（视觉走视线判定，声音/气味走预算扩散）、2D/3D 双视图、检查器、dsh 侧边栏入口与主面板
- 角色仿真：初始记忆与传闻、需求/态度/目标/能力状态、feeling→thinking→acting 三阶段、回合结算与状态更新；dsh 中所有存活角色每轮都走真实模型（感受/思考/行动三段），独立开发页回落确定性思考层
- 物理交互：物品背包与地面/容器、拿取/放下/给予/使用、设施开关/上锁/撬开/写黑板、武器射程与护具减伤、移动碰撞、能力暴走反噬、协作增伤
- 角色能力卡：18 个角色各有独立 tool call、射程/目标/伤害/状态；伤害、控制、治疗、信息、传送都能实际改变世界，暴走只在进入时反噬一次
- 每轮可先移动（最多 6 格）再执行一个行为；feel 同时订阅空间信息（含声音来源）与视野内人物
- 观察与分析：检查器 / 总览 / 回合 / 观测 / 用量五个页签，逐格本轮信息、每轮异步摘要、回合日志实时落盘（JSONL）与 JSON 导出、模型 token 用量仪表盘、数学观测（相平面 + 十个度量 + 自动结论）
- 运行：自动推演在切换 dsh 页面后继续；「重置」清空进度、重开场景并新起一份日志
- 未实现：编年史与回放、与 dsh 会话绑定、物品系统

## 开发

```bash
pnpm install
pnpm dev        # 独立页面 http://localhost:5188
pnpm typecheck
pnpm build      # 产出 dsh 可加载的 lib/index.js + lib/client.js
```

### 装进 dsh

```bash
# 1. 打包插件（three.js 会打进客户端包）
pnpm build

# 2. 在 dsh 仓库里创建/使用一个 profile
cd ~/project/deepseek-harness
#    若 profile 还没有 web 应用，先从模板复制：
#    cp -R ~/.dsh/profiles/web ~/.dsh/profiles/evo
pnpm dsh plugin --profile evo add /Users/crab/project/evoverse

# 3. 启动
pnpm dsh --profile evo
```

启动后侧边栏出现 **evoverse**，点击后会话区被地图面板替代；再点会话即切回。

开发环境要求：

| 项 | 要求 |
|---|---|
| Node | ≥ 24.9(本机已装 26.12.1) |
| pnpm | 已装 |
| dsh 源码 | `~/project/deepseek-harness`(本地工作区,`vendor/cordis` 可直接运行官方教程) |

## 参考

- dsh 插件模型:`deepseek-harness/docs/cordis-primer.md` 与 `docs/cordis-tutorial/`
- 架构总览:`deepseek-harness/docs/architecture.md`
- DeepSeek Harness:https://github.com/deepseek-ai/deepseek-harness
