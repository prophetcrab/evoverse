/**
 * dsh 客户端插件入口：把观察界面注册进 root 作用域的 `main` keyed slot，
 * 并在侧边栏加一个入口。打包由 `scripts/build-plugin.mjs` 产出 lib/client.js。
 */

import { PanelRoot } from './PanelRoot'
import { SidebarIcon } from './SidebarIcon'

export const NS = 'evoverse'
export const PANEL_ID = 'evoverse-map'

interface ClientContext {
  slots: {
    inject(name: string, factory: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): unknown
  }
  layout: {
    selectPanel(id: string | null): void
    panelInfo?: {
      getSnapshot?: () => { activePanelId?: string | null }
    }
  }
}

export const inject = ['slots', 'layout']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: PANEL_ID }, PanelRoot)
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 90,
    label: () => 'evoverse',
  }, SidebarIcon))

  // 客户端插件被热重载后，布局可能仍选中本面板而主槽已空；重新选中一次即可恢复。
  queueMicrotask(() => {
    try {
      const active = ctx.layout.panelInfo?.getSnapshot?.().activePanelId
      if (active === PANEL_ID) ctx.layout.selectPanel(PANEL_ID)
    } catch {
      // 槽注册尚未就绪时忽略，用户点一次侧边栏即可
    }
  })
}

/** 从其他插件或命令切入观察界面。 */
export function open(ctx: ClientContext): void {
  ctx.layout.selectPanel(PANEL_ID)
}
