import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Business, Msg, Parcel, Plan } from './types'

export const DEFAULT_BUSINESS: Business = {
  crop: 'Maíz', area: 10, seeds: 18000, fert: 42000, water: 8000, labor: 30000, machinery: 25000,
  transport: 6000, other: 5000, yieldT: 5, price: 6200,
}
interface AppState { userName: string; parcel: Parcel | null; chat: Msg[]; business: Business; plan: Plan | null }
const KEY = 'agrovia:v1'
const initial: AppState = { userName: '', parcel: null, chat: [], business: DEFAULT_BUSINESS, plan: null }
function load(): AppState {
  try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return initial }
}

export type Tab = 'home' | 'parcel' | 'intel' | 'market'
interface Ctx extends AppState {
  set: (p: Partial<AppState>) => void
  reset: () => void
  tab: Tab; sub: Record<string, string>
  go: (tab: Tab, sub?: string) => void
}
const C = createContext<Ctx>(null as never)
export const useApp = () => useContext(C)

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(load)
  const [tab, setTab] = useState<Tab>('home')
  const [sub, setSub] = useState<Record<string, string>>({ parcel: 'summary', intel: 'pulso', market: 'precios' })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* almacenamiento lleno o bloqueado */ } }, [s])
  const go = (t: Tab, sb?: string) => { setTab(t); if (sb) setSub((p) => ({ ...p, [t]: sb })) }
  return (
    <C.Provider value={{ ...s, set: (p) => setS((o) => ({ ...o, ...p })), reset: () => { setS(initial); setTab('home') }, tab, sub, go }}>
      {children}
    </C.Provider>
  )
}
