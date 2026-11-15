import { useEffect, useRef, useState } from 'react'
import { Bell, Home as HomeIcon, Map as MapIcon, Activity, Store, UserRound, AlertTriangle, Info, Trash2 } from 'lucide-react'
import { AppProvider, useApp, type Tab } from './state'
import { Logo } from './components/brand'
import { Btn, Card, Field, Sheet, TextInput, DemoTag } from './components/ui'
import { missingFields } from './services'
import Home from './screens/Home'
import ParcelModule from './screens/Parcel'
import Intel from './screens/Intel'
import Market from './screens/Market'

const NAV: { k: Exclude<Tab, 'home'>; l: string; i: typeof MapIcon }[] = [{ k: 'parcel', l: 'Mi parcela', i: MapIcon }, { k: 'intel', l: 'Inteligencia', i: Activity }, { k: 'market', l: 'Mercado', i: Store }]

function Shell() {
  const { tab, go, parcel, userName, set, reset, sub } = useApp()
  const [sheet, setSheet] = useState<'' | 'notif' | 'profile'>('')
  const [name, setName] = useState(userName)
  const main = useRef<HTMLElement>(null)
  useEffect(() => { main.current?.scrollTo({ top: 0 }) }, [tab, sub.parcel, sub.intel, sub.market])
  const notifs = [
    { t: 'Estás usando datos de demostración', d: 'Clima, satélite, precios y compradores son ejemplos; ninguna integración real está conectada.', i: <Info size={20} /> },
    ...(parcel ? [{ t: 'Alerta de hoy', d: 'Probabilidad de lluvia moderada (mensaje de demostración).', i: <AlertTriangle size={20} /> }, ...(missingFields(parcel).length ? [{ t: 'Faltan datos de tu parcela', d: missingFields(parcel).join(', '), i: <Info size={20} /> }] : [])] : [{ t: 'Registra tu parcela', d: 'Con ella VÍA y el Pulso agrícola trabajan con tus datos.', i: <MapIcon size={20} /> }]),
  ]
  return (
    <div className="h-dvh flex justify-center">
      <div className="relative w-full max-w-[430px] h-full flex flex-col bg-ivory sm:shadow-2xl overflow-hidden">
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-warm border-b border-sand/70">
          <button onClick={() => go('home')} aria-label="Ir al inicio"><Logo /></button>
          <div className="flex gap-2">
            <button onClick={() => setSheet('notif')} aria-label="Notificaciones" className="relative size-11 rounded-2xl bg-soft text-forest grid place-items-center"><Bell size={21} /><span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-warning" /></button>
            <button onClick={() => { setName(userName); setSheet('profile') }} aria-label="Perfil" className="size-11 rounded-2xl bg-forest text-warm grid place-items-center"><UserRound size={21} /></button>
          </div>
        </header>
        <main ref={main} className="flex-1 overflow-y-auto p-4">
          {tab === 'home' && <Home />}{tab === 'parcel' && <ParcelModule />}{tab === 'intel' && <Intel />}{tab === 'market' && <Market />}
        </main>
        <nav className="shrink-0 grid grid-cols-3 bg-warm border-t border-sand/70 px-2 pt-1.5 pb-2" aria-label="Módulos">
          {NAV.map(({ k, l, i: I }) => (
            <button key={k} onClick={() => go(k)} aria-current={tab === k} className={`min-h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-[13px] transition ${tab === k ? 'text-forest' : 'text-graphite/60'}`}>
              <span className={`px-5 py-1 rounded-full transition ${tab === k ? 'bg-soft' : ''}`}><I size={23} /></span>{l}</button>))}
        </nav>
        {sheet === 'notif' && <Sheet title="Notificaciones" onClose={() => setSheet('')}><div className="space-y-2">{notifs.map((n) => <Card key={n.t} className="flex gap-3"><span className="text-forest">{n.i}</span><span><b className="block">{n.t}</b><span className="text-[15px] font-semibold">{n.d}</span></span></Card>)}</div></Sheet>}
        {sheet === 'profile' && (
          <Sheet title="Mi perfil" onClose={() => setSheet('')}>
            <Field label="¿Cómo te llamamos?"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" /></Field>
            <Btn className="w-full mb-3" onClick={() => { set({ userName: name.trim() }); setSheet('') }}>Guardar</Btn>
            <p className="text-sm font-semibold mb-3 flex items-center gap-2"><DemoTag text="LOCAL" />Tus datos se guardan sólo en este dispositivo.</p>
            <Btn v="ghost" className="w-full !text-clay" onClick={() => { if (confirm('Se borrarán tu parcela, conversación, modelo y plan. ¿Continuar?')) { reset(); setSheet('') } }}><Trash2 size={18} />Borrar todos mis datos</Btn>
          </Sheet>
        )}
      </div>
    </div>
  )
}
export default function App() { return <AppProvider><Shell /></AppProvider> }
export { HomeIcon }
