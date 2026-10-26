import { Component, type ReactNode } from 'react'
import { MapPanel } from '../ui/MapPanel'

interface State {
  error: Error | null
}

/** 面板级错误边界：渲染失败时给出可恢复的错误页，而不是留下空白。 */
export class PanelBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="evoverse-crash">
          <h2>evoverse 面板出错</h2>
          <p className="muted">重新挂载后通常可以恢复；若反复出现，刷新页面。</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" onClick={() => this.setState({ error: null })}>重新挂载</button>
        </div>
      )
    }
    return this.props.children
  }
}

export function PanelRoot() {
  return (
    <PanelBoundary>
      <MapPanel />
    </PanelBoundary>
  )
}
