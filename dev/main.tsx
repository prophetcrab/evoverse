import { createRoot } from 'react-dom/client'
import { MapPanel } from '../src/ui/MapPanel'

const host = document.getElementById('root')
if (!host) throw new Error('missing #root')
createRoot(host).render(<MapPanel />)
