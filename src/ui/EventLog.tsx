import type { World } from '../world/types'
import type { SimView } from '../sim/types'

interface Props {
  sim: SimView | null
  world: World
}

/** 回合事件流：只显示最近几条，完整记录在编年史里。 */
export function EventLog({ sim, world }: Props) {
  if (!sim || sim.events.length === 0) return null
  const name = (id?: string): string => world.characters.find(character => character.id === id)?.name ?? '某人'
  return (
    <div className="event-log">
      <div className="event-log-head">
        <span>最近事件</span>
        <span className="dim">行动 {sim.activity} · 张力 {Math.round(sim.tension)}</span>
      </div>
      {sim.events.slice(-6).reverse().map(event => (
        <div className="event-row" key={event.seq}>
          <span className="event-round">R{event.round}</span>
          <span className="event-actor">{event.actor ? name(event.actor) : '—'}</span>
          <span className="event-text">{event.text}</span>
        </div>
      ))}
    </div>
  )
}
