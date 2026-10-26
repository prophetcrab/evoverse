# ADR-0002 TypeScript ESM + Node ≥24.9 + pnpm

- 状态：已接受
- 日期：2026-10-26

## 背景

dsh 为 TypeScript ESM 项目。Cordis 的类型化事件与服务声明合并，是插件开发的主要收益。

## 决策

- TypeScript，`"type": "module"`。
- Node ≥ 24.9（本机 26.12.1），pnpm。
- `@deepseek-ai/cordis` 为 peerDependency。

## 候选

| 方案 | 取舍 |
|---|---|
| TS ESM | 与宿主同栈，`inject` 与事件名编译期可校验。接受 |
| 纯 JS | 失去类型检查与声明合并。否决 |
| cordis 作 dependency | 插件与宿主各持一份上下文，服务无法互通。否决 |

## 后果

- 需构建步骤；ESM 相对导入须带扩展名。
- P0 需确认 dsh 期望的 `exports` 字段与 peer 版本范围。
