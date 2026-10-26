/** 侧边栏入口图标：一个简洁的菱形，尺寸由侧边栏传入。 */

export function SidebarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  )
}
