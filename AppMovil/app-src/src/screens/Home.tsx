import { AlertTriangle, ArrowRight, CloudSun, Droplets, MapPin, Sprout, Activity, Store, Sparkles, Wind, CloudRain, Thermometer, Map as MapIcon } from 'lucide-react'
import { useApp } from '../state'
import { Btn, Card, DemoTag } from '../components/ui'
import { ViaAvatar } from '../components/brand'
import { SatMap } from '../components/SatMap'
import { getBuyers, getIndicators, getWeather } from '../services'
import { useAsync } from '../lib/useAsync'
import { DEMO_PARCEL } from '../services/demoData'
import { mxn } from '../lib/calc'

export default function Home() {
  const { parcel, userName, go, set, business } = useApp()
  const w = useAsync(getWeather, []), ind = useAsync(getIndicators, []), buyers = useAsync(getBuyers, [])
  const hr = new Date().getHours()
  const greet = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches'
  const ndvi = ind.data?.[0]
  const nv = ndvi?.series[ndvi.series.length - 1].value
  const crop = parcel?.crop || business.crop
  const best = (buyers.data || []).filter((b) => b.crop === crop).sort((a, b) => b.price - a.price)[0]
  return (
    <div className="space-y-4 rise">
      <div>
        <p className="text-[15px] font-bold text-natural">{greet}{userName ? `, ${userName}` : ''}</p>
        <h1 className="text-[26px] font-extrabold text-forest leading-tight mt-0.5">Tu campo tiene mucho que contar. AGROVÍA te ayuda a entenderlo</h1>
      </div>
      {parcel ? (
        <button onClick={() => go('parcel', 'summary')} className="block w-full text-left rounded-[28px] overflow-hidden relative active:scale-[.99] transition">
          <SatMap center={parcel.center} polygon={parcel.polygon} className="h-44" />
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-graphite/85 to-transparent text-warm">
            <p className="text-xl font-extrabold leading-tight">{parcel.name}</p>
            <p className="text-[15px] font-semibold flex items-center gap-1"><MapPin size={15} />{[parcel.municipality, parcel.state].filter(Boolean).join(', ') || 'Ubicación sin completar'}</p></div>
        </button>
      ) : (
        <Card className="!bg-forest text-warm border-forest space-y-3"><p className="text-xl font-extrabold">Empecemos por tu parcela</p><p className="text-[15px] font-semibold text-soft">Regístrala en tres pasos y desbloquea datos, recomendaciones y mercado.</p>
          <Btn v="warn" className="w-full" onClick={() => go('parcel', 'wizard')}>Registrar mi parcela</Btn>
          <Btn v="ghost" className="w-full !text-warm !border-warm/40" onClick={() => set({ parcel: DEMO_PARCEL })}>Explorar parcela de demostración</Btn></Card>
      )}
      <Card className="flex items-center gap-4">
        <CloudSun size={36} className="text-warning shrink-0" />
        <div className="flex-1">
          {w.data ? <><p className="text-3xl font-extrabold text-forest leading-none">{w.data.temp}°C</p>
            <p className="text-[14px] font-bold text-graphite/70 mt-1 flex gap-3 flex-wrap"><span className="flex items-center gap-1"><CloudRain size={14} />{w.data.rainProb} %</span><span className="flex items-center gap-1"><Droplets size={14} />{w.data.humidity} %</span><span className="flex items-center gap-1"><Wind size={14} />{w.data.wind} km/h</span></p></> : <p className="font-bold">Consultando clima…</p>}
        </div><div className="text-right"><DemoTag text={w.data?.status === 'Conectado' ? 'REAL' : 'DEMOSTRACIÓN'} /><p className="text-[12px] font-semibold text-graphite/60 mt-1">{w.data?.source || 'Pronóstico no conectado'}</p></div>
      </Card>
      <Card className="border-warning border-2 !bg-warning/15 flex gap-3">
        <AlertTriangle className="text-[#8a6208] shrink-0 mt-0.5" />
        <div><p className="font-extrabold text-[#6b4b05]">Alerta de hoy</p><p className="text-[16px] font-semibold">{w.data?.note || 'Revisando condiciones…'}</p><p className="text-[13px] font-bold text-graphite/60 mt-1">Mensaje de demostración</p></div>
      </Card>
      {ndvi && nv !== undefined && (
        <Card onClick={() => go('intel', 'pulso')} className="flex items-center gap-4">
          <span className="size-14 rounded-2xl bg-soft grid place-items-center text-forest"><Activity size={26} /></span>
          <span className="flex-1"><span className="block text-sm font-bold text-natural">Vigor de vegetación (NDVI)</span><span className="block text-2xl font-extrabold text-forest">{nv.toFixed(2)} <span className="text-sm font-bold text-graphite/60">{nv > 0.55 ? 'vigorosa' : nv > 0.35 ? 'moderada' : 'baja'}</span></span><span className="text-[13px] font-bold text-[#7a5a0a]">{ndvi.status === 'Disponible' ? 'REAL · satélite ORNL/MODIS' : 'DEMOSTRACIÓN · satélite no conectado'}</span></span><ArrowRight className="text-natural" /></Card>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {[{ k: 'parcel', l: 'Mi parcela', i: <MapIcon size={26} />, s: 'summary' }, { k: 'intel', l: 'Inteligencia agrícola', i: <Activity size={26} />, s: 'pulso' }, { k: 'market', l: 'Mercado', i: <Store size={26} />, s: 'precios' }].map((m) => (
          <button key={m.k} onClick={() => go(m.k as 'parcel', m.s)} className="rounded-3xl bg-warm border border-sand p-3 min-h-28 flex flex-col items-start justify-between active:scale-95 transition text-forest">{m.i}<span className="font-extrabold text-[15px] leading-tight text-left">{m.l}</span></button>))}
      </div>
      <Card onClick={() => go('intel', 'via')} className="!bg-soft flex gap-3 items-start">
        <ViaAvatar size={44} /><span className="flex-1"><span className="flex items-center gap-1.5 font-extrabold text-forest"><Sparkles size={16} />VÍA te sugiere</span>
          <span className="block text-[16px] font-semibold mt-0.5">{parcel ? `Pídeme que analice ${parcel.name.split(' (')[0]}: te explico qué pasa, qué significa y qué datos aún faltan.` : 'Cuando registres tu parcela podré analizarla. Mientras tanto, pregúntame lo que quieras.'}</span></span>
      </Card>
      {best && (
        <Card onClick={() => go('market', 'comparar')} className="flex items-center gap-3">
          <span className="size-12 rounded-2xl bg-forest text-warm grid place-items-center"><Sprout /></span>
          <span className="flex-1"><span className="block text-sm font-bold text-natural">Oportunidad destacada</span><span className="block font-extrabold text-forest">{best.crop} · {mxn(best.price)}/t</span><span className="text-sm font-semibold">{best.name} · {best.km} km</span><span className="block"><DemoTag text="COMPRADOR FICTICIO" /></span></span><ArrowRight className="text-natural" /></Card>
      )}
      <p className="text-center text-sm font-bold text-graphite/55 pt-2 flex items-center justify-center gap-1.5"><Thermometer size={14} />Del espacio a tu tierra</p>
    </div>
  )
}
