# 架构

状态：与代码同步（只记录已实现的部分）

## 目录

| 路径 | 职责 |
|---|---|
| `src/world/types.ts` | 世界、格子、角色、信息条目的数据类型 |
| `src/world/terrain.ts` | 地形渗透率、通道系数、阈值、颜色 |
| `src/world/field.ts` | 声音/气味的预算扩散（桶队列 Dijkstra）、视觉的视线判定 |
| `src/world/generate.ts` | 四种尺寸预设、确定性 demo 世界生成 |
| `src/world/manor.ts` | 庄园场景（手写布局，120×80×4） |
| `src/sim/types.ts` | 角色状态、记忆、动作、状态 patch、`Mind` 接口 |
| `src/sim/scenario.ts` | 庄园八人的初始条目与共享 `infoId` |
| `src/sim/tools.ts` | 行动工具定义：move / speak / tell / attack / ability |
| `src/sim/usage.ts` | 模型调用用量计量（按阶段 / 回合） |
| `src/sim/metrics.ts` | 世界演进度量：信息势、主题熵、说法熵、共识、空间熵、信息流与结论 |
| `src/sim/llm-transport.ts` | 浏览器侧补全通道：POST `/evoverse/chat` |
| `src/sim/engine.ts` | 回合推进、资格判定、三阶段调度、结算、状态收尾 |
| `src/sim/mock-mind.ts` | 确定性思考层（不调模型，驱动完整流水线） |
| `src/sim/llm-mind.ts` | LLM 思考层：提示词、JSON 契约、`complete` 传输注入 |
| `src/sim/summarize.ts` | 回合总结：模板实现与 LLM 实现 |
| `src/ui/EventLog.tsx` | 最近事件流 |
| `src/ui/OverviewPanel.tsx` | 角色总览（状态、需求、位置、最近行动） |
| `src/ui/LogPanel.tsx` | 回合日志（摘要、行动、状态变化、信息、事件、JSON 导出） |
| `src/ui/UsagePanel.tsx` | 模型用量仪表盘 |
| `src/ui/MetricsPanel.tsx` | 数学观测面板：相平面、度量卡片、自动结论 |
| `src/ui/MapPanel.tsx` | 主界面外壳：顶栏、层切换、通道、快捷键 |
| `src/ui/Map2D.tsx` | Canvas 2D：平移、缩放、光标、悬停、点选 |
| `src/ui/Map3D.tsx` | three.js 等距叠层：多层同屏、非活动层淡出、射线点选 |
| `src/ui/Inspector.tsx` | 角色与格子的检查器 |
| `src/client/index.ts` | dsh 客户端插件入口：注册 `main` keyed slot 与侧边栏入口 |
| `src/client/SidebarIcon.tsx` | 侧边栏图标 |
| `src/index.ts` | Node 半占位，P1 起放世界服务与工具 |
| `scripts/build-plugin.mjs` | esbuild 打包：`lib/index.js`（ESM）+ `lib/client.js`（`__ModuleLoader__` 闭包工厂） |
| `cordis.patch.yml` | 组合包层：按包名插入 `evoverse` 行 |

## 已实现

- 多层二维格子；层间默认不连通，楼梯格建立双向垂直边，三态（open / blocked / destroyed）。
- 地形五类（地面、墙、门、窗、虚空），每格带四通道渗透率；虚空阻断所有通道。
- 两个场景：程序生成的 demo 世界，以及庄园地图上的「私立雾影学园」剧本（120×80×4，18 名能力者，12 条地图世界信息）。
- 视觉场按观察者做视线判定（Bresenham + 不透明格阻挡）；声音、气味按预算扩散，支持跨层（3× 垂直损耗）。
- 四种尺寸预设：100×100、40×60、30×30、20×20；层数随预设（3 或 2）。
- 2D/3D 双视图、层切换、通道叠加、角色与格子检查器、键盘快捷键。
- 2D 按当前层的内容范围自动取景（有虚空时）；3D 非活动层只显示墙体并按高低着色（低于当前层偏冷、高于偏暖）。
- 角色仿真：每人 18–19 条初始记忆（自我 / 信条与世界观 / 事实 / 关于他人的事实 / 往事 / 秘密 / 传闻）；信条条目直接约束行动方向，生命 5 格、能力状态（名称 / 等级 / 负荷 / 稳定·亢进·暴走·封印 / 代价）、需求三维、对他人的态度（立场 + 一句话）、目标、关注、关系计数。
- 格子位置：每个非虚空格都带区域 id（23 个区域 + 校园外围），区域表保存名称与一句静态描述；角色提示里带「所在位置」，格子检查器显示区域与描述。
- 地图世界信息：开局在具体格子铺 12 条（公告、霜、锁链声、花香、脚印等），部分长期存在（ttl 99），部分只维持几轮。
- 伤害：`attack` 按手段扣血（徒手/推搡 1、武器 2），`ability` 的 self/other 治疗回 1 点；归零后失能，不再进入回合。
- 行动工具：`move` / `speak` / `tell` / `attack` / `ability`，一轮只能调用一个；定义集中在 `src/sim/tools.ts`，mock 与 LLM 提示词共用。
- 边界：这些动作目前由模拟引擎直接执行，尚未注册为 dsh 工具；接 dsh 工具流水线需要每角色一个真实会话（P3）。
- 每轮流程：资格判定（可感知的新信息 / 需求越阈 / 目标受阻 / 休息满两轮）→ feeling（按通道计算感知强度，300 以上给全文、50–299 给模糊版）→ thinking（0–4 条想法 + 至多一个意图 + 状态 patch）→ acting（一次写调用）→ 结算（按先手、冲突失败、关系计数、机械漂移、patch 提交、反馈摘要）。
- 感知近似：视觉走视线，声音每格 50、气味每格 100，隔墙额外损耗；空间信息过期后从所有格子消失。
- 界面：下一轮 / 自动播放，事件流，检查器显示需求、态度、目标、记忆（带 provenance）与上一轮想法/行动。
- 右侧面板三个页签：检查器（角色 / 格子，含该格本轮信息与本轮事件）、总览（世界指标 + 全部角色状态）、回合（每轮摘要与明细）。
- 回合记录：每轮保存行动（含成功/失败）、事件、本轮发射的信息、状态 patch 与异步生成的摘要；`exportLog()` 导出 JSON，供分析与复现。
- 摘要异步生成：默认模板实现（即时、可复现），`createLlmSummarizer(complete)` 已实现，等待宿主注入传输。
- 思考层可替换：`mock-mind` 用于无桥场景与预算外角色；`llm-mind` 通过宿主桥调用真实模型。
- 提示拼装：角色的全部记忆、全部关注主题、完整反馈摘要与全部可感知候选都进提示，不做位置截断（上下文预算充足）；`feel` 也不再限制候选条数。
- 模型桥：Node 半注册 `POST /evoverse/chat`，用 `ctx.llm.stream` 和插件配置（`deepseek-flash` / `low`）转发；页面启动时注入 `EVOVERSE_BRIDGE_KEY`，请求必须带 `x-evoverse-key`。客户端每轮最多 3 个角色走 LLM（感受 + 思考 + 行动），其余回落确定性思考层；每轮另有 1 次异步总结。
- 用量仪表盘：按阶段（感受 / 思考 / 总结）与回合统计调用数、输入 / 输出 / 缓存 tokens 和错误数；顶栏显示累计调用与 tokens。
- 数学观测：每轮采集 10 个度量——信息势（共享信息上、按关注主题与社会通透性加权的最新说法差）、活动率、主题熵、说法熵、认知冲突、谣言穿透、共识度、空间熵、场质量、信息枢纽影响力；面板给出「信息势 × 活动」相平面、逐轮回读与自动结论（热寂 / 停滞 / 演进 / 趋同 / 分裂）。
- 开发态调试入口：`window.__evoverse`（仅 `import.meta.env.DEV`，插件打包时为 false）。
- 客户端面板包了错误边界（渲染失败显示错误页与"重新挂载"）；3D 卸载时释放 WebGL 上下文；插件热重载后若布局仍选中本面板，会自动重新选中一次。

## 打包与安装

- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，`dsh.client` 声明 web 平台与依赖包；`exports` 暴露 `.` 与 `./client`。
- 客户端包用 esbuild 打成闭包工厂：three.js 打进包内，`react` / `react-dom` 走宿主模块表，CSS 内联成一次 `<style>` 注入。
- 安装：`pnpm dsh plugin --profile <name> add <仓库路径>`，profile 的 bundles 列表末尾会追加 `evoverse`；启动 `pnpm dsh --profile <name>`。
- 已验证：侧边栏入口出现、主面板替换会话区、庄园场景与 three.js 3D 可用、切回会话时面板卸载。宿主日志无报错。

## 未实现

编年史与回放持久化、与 dsh 会话的绑定（每角色一个真实会话）、LLM 传输、物品与 `use` 的真实效果（目前只记关系与记忆）。

## 参数

通道系数与地形渗透率以 W3 为准，代码中集中在 `src/world/terrain.ts`，不在此重复。
