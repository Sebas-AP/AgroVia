import { useState } from 'react'
import { CloudRain, Droplets, Wind, Thermometer, MapPin, LocateFixed, Search, PencilLine, Eraser, Undo2, Check, Mountain, Sprout, Pencil, Fingerprint, Plus, Sparkles, Waves, Tractor, Layers, Leaf, CalendarDays, ChevronRight, Trash2 } from 'lucide-react'
import { useApp } from '../state'
import { Btn, Card, BackBar, DemoTag, Empty, ErrorBox, Field, Help, Loading, NumInput, Pick, Select, Stat, Tag, TextInput, Title, LineChart } from '../components/ui'
import { SatMap } from '../components/SatMap'
import { areaHa, centroid, fmtCoord, parseCoords, ptToCoord } from '../lib/geo'
import { getIndicators, getWeather, missingFields } from '../services'
import { DEMO_PARCEL, CROPS } from '../services/demoData'
import { getRealSnapshot } from '../services/backend'
import { useAsync } from '../lib/useAsync'
import { fmtDate, weatherRecommendation } from '../lib/calc'
import type { Parcel } from '../types'

const blank = (): Parcel => ({ id: crypto.randomUUID(), demo: false, name: '', areaHa: '', terrain: '', soil: '', water: '', irrigation: '', crop: '', sowingDate: '', stage: '', center: { lat: 20.5, lon: -103.5 }, polygon: [], country: '', state: '', municipality: '', locality: '', altitude: '', events: [], seasons: [] })

export default function ParcelModule() {
  const { sub, parcel, go } = useApp()
  const [editing, setEditing] = useState(false)
  const s = sub.parcel
  if (s === 'wizard') return <Wizard initial={editing && parcel ? parcel : blank()} onExit={() => { setEditing(false); go('parcel', 'summary') }} />
  if (!parcel) return <NoParcel start={() => go('parcel', 'wizard')} />
  if (s === 'huella') return <Huella />
  return <Summary edit={() => { setEditing(true); go('parcel', 'wizard') }} />
}

function NoParcel({ start }: { start: () => void }) {
  const { set } = useApp()
  return (
    <div className="space-y-4 rise">
      <Title sub="Tu parcela es el punto de partida de todo lo demás.">Mi parcela</Title>
      <Empty icon={<MapPin size={30} />} title="Aún no registras tu parcela" text="Son tres pasos cortos: ubicación, datos del cultivo y confirmación. Puedes omitir lo que no sepas."
        action={<div className="space-y-2"><Btn onClick={start} className="w-full">Registrar mi parcela</Btn><Btn v="ghost" className="w-full" onClick={() => set({ parcel: DEMO_PARCEL })}>Ver parcela de demostración</Btn></div>} />
    </div>
  )
}

function Summary({ edit }: { edit: () => void }) {
  const { parcel: p, go, set } = useApp()
  const w = useAsync(getWeather, [])
  const real = useAsync(() => p?.demo ? getRealSnapshot() : Promise.resolve(null), [p?.demo])
  if (!p) return null
  const miss = missingFields(p)
  const loc = [p.locality, p.municipality, p.state, p.country].filter(Boolean).join(', ')
  return (
    <div className="space-y-4 rise">
      <div className="-mx-4 -mt-4 relative">
        <SatMap center={p.center} polygon={p.polygon} className="h-64 rounded-b-[32px]" label={p.demo ? 'MAPA DE DEMOSTRACIÓN' : 'MAPA DE DEMOSTRACIÓN · sin servicio'} />
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-graphite/80 to-transparent rounded-b-[32px] text-warm">
          <h1 className="text-2xl font-extrabold leading-tight">{p.name}</h1>
          <p className="text-[15px] font-semibold flex items-center gap-1"><MapPin size={16} />{loc || 'Ubicación sin completar'}</p>
        </div>
      </div>
      {p.demo && <Card className="bg-warning/20 border-warning/50 flex items-center gap-3"><DemoTag text="PARCELA DE DEMOSTRACIÓN" /><p className="text-sm font-bold flex-1">Datos de ejemplo. Registra tu parcela real cuando quieras.</p></Card>}
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Sprout size={16} />} label="Cultivo" value={p.crop || 'Sin definir'} />
        <Stat icon={<Layers size={16} />} label="Superficie" value={p.areaHa || '—'} unit="ha" />
      </div>
      <Card className="bg-forest text-warm border-forest">
        <p className="text-sm font-extrabold tracking-wide text-warning flex items-center gap-1.5"><Sparkles size={16} />LO QUE DEBES SABER HOY</p>
        {w.loading || !w.data ? <p className="mt-2">Consultando…</p> : <p className="text-[17px] font-semibold mt-1.5 leading-snug">{weatherRecommendation(real.data?.airTempAvg ?? w.data.temp, real.data?.relativeHumidityAvg ?? w.data.humidity, w.data.rainProb)}</p>}
      </Card>
      <section>
        <Title sub="Condiciones disponibles ahora">Clima</Title>
        {w.loading ? <Loading /> : w.error ? <ErrorBox msg={w.error} retry={w.reload} /> : w.data && (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Thermometer size={16} />} label="Temperatura" value={real.data?.airTempAvg != null ? real.data.airTempAvg.toFixed(1) : String(w.data.temp)} unit="°C" />
              <Stat icon={<Droplets size={16} />} label="Humedad" value={real.data?.relativeHumidityAvg != null ? real.data.relativeHumidityAvg.toFixed(0) : String(w.data.humidity)} unit="%" />
              <Stat icon={<CloudRain size={16} />} label="Prob. de lluvia" value={String(w.data.rainProb)} unit="%" />
              <Stat icon={<Wind size={16} />} label="Viento" value={String(w.data.wind)} unit="km/h" />
            </div>
            {real.data?.airTempAvg != null ? (
              <div className="flex flex-wrap items-center gap-2 mt-3"><Tag tone="soft">REAL</Tag><span className="text-[13px] font-semibold text-graphite/70">NASA POWER · temperatura y humedad reales; lluvia y viento de ejemplo</span></div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-3"><DemoTag /><span className="text-[13px] font-semibold text-graphite/70">{w.data.source} · {w.data.updated}</span></div>
            )}
          </Card>
        )}
      </section>
      <section>
        <Title>Características del terreno</Title>
        <Card className="divide-y divide-sand/70">
          {[['Terreno', p.terrain], ['Suelo', p.soil], ['Agua', p.water], ['Riego', p.irrigation], ['Etapa', p.stage], ['Siembra', p.sowingDate ? fmtDate(p.sowingDate) : ''], ['Altitud', p.altitude ? p.altitude + ' m' : ''], ['Coordenadas', fmtCoord(ptToCoord(p.center, centroid(p.polygon)).lat, ptToCoord(p.center, centroid(p.polygon)).lon)]].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2.5 gap-3"><span className="text-graphite/70 font-semibold">{k}</span><span className="font-extrabold text-right">{v || <span className="text-warning-700 text-[#9a7210]">Sin definir</span>}</span></div>
          ))}
        </Card>
        {miss.length > 0 && <p className="text-sm font-bold text-[#7a5a0a] mt-2">Faltan datos: {miss.join(', ').toLowerCase()}. <button className="underline" onClick={edit}>Completar</button></p>}
      </section>
      <Card onClick={() => go('parcel', 'huella')} className="!bg-soft flex items-center gap-3">
        <span className="size-12 rounded-2xl bg-forest text-warm grid place-items-center"><Fingerprint /></span>
        <span className="flex-1"><b className="block text-lg text-forest">Huella inteligente</b><span className="text-[15px]">Identidad digital, historial y eventos de tu parcela</span></span><ChevronRight />
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Btn v="ghost" onClick={edit}><Pencil size={18} />Editar parcela</Btn>
        <Btn v="soft" onClick={() => go('intel', 'pulso')}>Ver Pulso agrícola</Btn>
      </div>
      <button className="w-full text-center text-sm font-bold text-clay py-2 flex items-center justify-center gap-1.5" onClick={() => confirm('¿Eliminar esta parcela de tu dispositivo?') && set({ parcel: null })}><Trash2 size={16} />Eliminar parcela</button>
    </div>
  )
}

const TERRAIN = [{ v: 'Plano' }, { v: 'Ladera' }, { v: 'Mixto' }]
const SOIL = [{ v: 'Arcilloso', hint: 'Pesado, retiene agua' }, { v: 'Arenoso', hint: 'Suelto, drena rápido' }, { v: 'Franco', hint: 'Equilibrado' }]
const WATER = [{ v: 'Abundante' }, { v: 'Suficiente' }, { v: 'Limitada' }, { v: 'Escasa' }]
const IRR = [{ v: 'Temporal (lluvia)' }, { v: 'Goteo' }, { v: 'Aspersión' }, { v: 'Surcos (gravedad)' }]
const STAGES = ['Preparación', 'Siembra', 'Germinación', 'Crecimiento', 'Floración', 'Llenado de grano', 'Cosecha']

function Wizard({ initial, onExit }: { initial: Parcel; onExit: () => void }) {
  const { set, go } = useApp()
  const [step, setStep] = useState(1)
  const [d, setD] = useState<Parcel>(initial)
  const [drawing, setDrawing] = useState(initial.polygon.length === 0)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const up = (k: keyof Parcel, v: unknown) => setD((o) => ({ ...o, [k]: v }))
  const setPoly = (polygon: typeof d.polygon) => setD((o) => ({ ...o, polygon, areaHa: polygon.length > 2 ? areaHa(polygon).toFixed(2) : o.areaHa }))
  const c = ptToCoord(d.center, centroid(d.polygon))
  const locate = () => {
    if (!navigator.geolocation) return setMsg({ t: 'Tu dispositivo no permite ubicación. Escribe las coordenadas manualmente.' })
    setMsg({ t: 'Pidiendo permiso de ubicación…', ok: true })
    navigator.geolocation.getCurrentPosition(
      (pos) => { setD((o) => ({ ...o, center: { lat: pos.coords.latitude, lon: pos.coords.longitude }, polygon: [], altitude: pos.coords.altitude ? String(Math.round(pos.coords.altitude)) : o.altitude })); setDrawing(true); setMsg({ t: 'Ubicación detectada. Ahora marca los vértices de tu parcela en el mapa.', ok: true }) },
      () => setMsg({ t: 'No se otorgó el permiso o no se pudo obtener la ubicación. Puedes escribir coordenadas.' }), { timeout: 10000 })
  }
  const doSearch = () => {
    const cc = parseCoords(search)
    if (cc) { setD((o) => ({ ...o, center: cc, polygon: [] })); setDrawing(true); setMsg({ t: 'Ubicación fijada por coordenadas.', ok: true }) }
    else setMsg({ t: 'Aún no hay un servicio de búsqueda de lugares conectado. Escribe coordenadas como «20.65, -103.35» o usa tu ubicación.' })
  }
  const next = () => {
    if (step === 2) {
      const e: Record<string, string> = {}
      if (!d.name.trim()) e.name = 'Escribe un nombre para reconocer tu parcela.'
      if (!(parseFloat(d.areaHa) > 0)) e.areaHa = 'Indica la superficie en hectáreas (mayor que 0) o dibuja el polígono.'
      if (d.sowingDate && new Date(d.sowingDate).getTime() > Date.now() + 365 * 864e5) e.sowingDate = 'La fecha parece estar muy lejos en el futuro.'
      setErrs(e)
      if (Object.keys(e).length) return
    }
    setStep(step + 1)
  }
  const save = () => { set({ parcel: d }); go('parcel', 'summary') }
  return (
    <div className="rise">
      <BackBar title={initial.name ? 'Editar parcela' : 'Registrar parcela'} onBack={step > 1 ? () => setStep(step - 1) : onExit} />
      <div className="flex gap-2 mb-1" aria-label={`Paso ${step} de 3`}>{[1, 2, 3].map((n) => <span key={n} className={`h-2 flex-1 rounded-full ${n <= step ? 'bg-forest' : 'bg-sand'}`} />)}</div>
      <p className="text-[15px] font-bold text-natural mb-4">Paso {step} de 3 · {['Ubicación', 'Información agrícola', 'Confirmación'][step - 1]}</p>
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2"><Btn v="soft" onClick={locate} className="flex-1"><LocateFixed size={18} />Usar mi ubicación</Btn></div>
          <div className="flex gap-2"><TextInput value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Buscar: coordenadas o lugar" aria-label="Buscar ubicación" /><Btn onClick={doSearch} className="!px-4" aria-label="Buscar"><Search size={20} /></Btn></div>
          {msg && <p role="status" className={`text-[15px] font-bold rounded-2xl p-3 ${msg.ok ? 'bg-soft text-forest' : 'bg-warning/25'}`}>{msg.t}</p>}
          <SatMap center={d.center} polygon={d.polygon} onChange={setPoly} drawing={drawing} className="h-72 rounded-3xl" />
          <p className="text-[15px] font-semibold text-graphite/80">{drawing ? 'Toca el mapa para marcar cada esquina de tu parcela. Necesitas al menos 3 puntos.' : 'Arrastra los puntos amarillos para ajustar el borde.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn v={drawing ? 'warn' : 'soft'} onClick={() => setDrawing(!drawing)}>{drawing ? <><Check size={18} />Terminar</> : <><PencilLine size={18} />Dibujar</>}</Btn>
            <Btn v="ghost" onClick={() => setPoly(d.polygon.slice(0, -1))} disabled={!d.polygon.length}><Undo2 size={18} />Deshacer</Btn>
          </div>
          <Btn v="ghost" onClick={() => { setPoly([]); setDrawing(true) }} disabled={!d.polygon.length} className="w-full"><Eraser size={18} />Borrar delimitación</Btn>
          <Card className="grid grid-cols-2 gap-3">
            <div><p className="text-sm font-bold text-graphite/60">Superficie calculada</p><p className="text-2xl font-extrabold text-forest">{d.polygon.length > 2 ? areaHa(d.polygon).toFixed(2) : '—'} <span className="text-sm">ha</span></p></div>
            <div><p className="text-sm font-bold text-graphite/60">Coordenadas</p><p className="text-[14px] font-extrabold text-forest">{fmtCoord(c.lat, c.lon)}</p></div>
            <p className="col-span-2 text-[13px] font-semibold text-graphite/65">En este mapa de demostración 100 unidades equivalen a 800 m. Con un servicio cartográfico real la medición se hará sobre el terreno.</p>
          </Card>
          <Title sub="Opcionales: complétalos si los conoces">Dónde está</Title>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="País"><TextInput value={d.country} onChange={(e) => up('country', e.target.value)} /></Field>
            <Field label="Estado"><TextInput value={d.state} onChange={(e) => up('state', e.target.value)} /></Field>
            <Field label="Municipio"><TextInput value={d.municipality} onChange={(e) => up('municipality', e.target.value)} /></Field>
            <Field label="Localidad"><TextInput value={d.locality} onChange={(e) => up('locality', e.target.value)} /></Field>
            <Field label="Altitud" unit="m"><NumInput value={parseFloat(d.altitude) || 0} onChange={(n) => up('altitude', n ? String(n) : '')} /></Field>
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <Field label="Nombre de la parcela" error={errs.name}><TextInput value={d.name} onChange={(e) => up('name', e.target.value)} placeholder="Ej. El Mirador" /></Field>
          <Field label="Superficie" unit="hectáreas" error={errs.areaHa} help="1 hectárea = 10,000 m². Si dibujaste tu parcela, se calcula sola; puedes corregirla."><NumInput value={parseFloat(d.areaHa) || 0} onChange={(n) => up('areaHa', n ? String(n) : '')} unit="ha" /></Field>
          <Field label="Tipo de terreno"><Pick value={d.terrain} onChange={(v) => up('terrain', v)} options={TERRAIN.map((o) => ({ ...o, icon: <Mountain size={18} /> }))} /></Field>
          <Field label="Tipo de suelo" help="Si no estás seguro, tómalo con la mano húmeda: si se moldea como churro es arcilloso; si se desmorona, arenoso."><Pick value={d.soil} onChange={(v) => up('soil', v)} options={SOIL} /></Field>
          <Field label="Disponibilidad de agua"><Pick value={d.water} onChange={(v) => up('water', v)} options={WATER.map((o) => ({ ...o, icon: <Waves size={18} /> }))} /></Field>
          <Field label="Sistema de riego"><Pick value={d.irrigation} onChange={(v) => up('irrigation', v)} options={IRR.map((o) => ({ ...o, icon: <Droplets size={18} /> }))} /></Field>
          <Field label="Cultivo actual"><Pick value={d.crop} onChange={(v) => up('crop', v)} options={[...Object.keys(CROPS), 'Otro'].map((v) => ({ v, icon: <Leaf size={18} /> }))} /></Field>
          <Field label="Fecha de siembra" error={errs.sowingDate}><TextInput type="date" value={d.sowingDate} onChange={(e) => up('sowingDate', e.target.value)} /></Field>
          <Field label="Etapa de crecimiento"><Select value={d.stage || 'No lo sé'} onChange={(v) => up('stage', v === 'No lo sé' ? '' : v)} options={['No lo sé', ...STAGES]} /></Field>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="!p-0 overflow-hidden">
            <SatMap center={d.center} polygon={d.polygon} className="h-48" />
            <div className="p-4 space-y-2">
              <h2 className="text-xl font-extrabold text-forest">{d.name}</h2>
              <p className="flex items-center gap-1.5 font-semibold"><MapPin size={16} />{[d.locality, d.municipality, d.state, d.country].filter(Boolean).join(', ') || 'Ubicación sin completar'}</p>
              <div className="flex flex-wrap gap-2"><Tag><Sprout size={14} />{d.crop || 'Cultivo sin definir'}</Tag><Tag><Layers size={14} />{d.areaHa} ha</Tag></div>
              <p className="text-sm font-bold text-graphite/70">{fmtCoord(c.lat, c.lon)}</p>
              {d.polygon.length < 3 && <p className="text-sm font-bold text-[#7a5a0a]">No delimitaste el polígono; puedes hacerlo luego editando la parcela.</p>}
              {missingFields(d).length > 0 && <p className="text-sm font-bold text-[#7a5a0a]">Pendiente: {missingFields(d).join(', ').toLowerCase()}.</p>}
            </div>
          </Card>
          <Btn onClick={save} className="w-full"><Check size={20} />Guardar mi parcela</Btn>
          <Btn v="ghost" onClick={() => setStep(1)} className="w-full">Editar información</Btn>
        </div>
      )}
      {step < 3 && <Btn onClick={next} className="w-full mt-2">Continuar</Btn>}
    </div>
  )
}

function Huella() {
  const { parcel: p, set, go } = useApp()
  const ind = useAsync(getIndicators, [])
  const [ev, setEv] = useState({ type: 'Riego', date: new Date().toISOString().slice(0, 10), note: '' })
  const [se, setSe] = useState({ year: String(new Date().getFullYear()), crop: 'Maíz', yieldT: '' })
  const [show, setShow] = useState<'' | 'ev' | 'se'>('')
  if (!p) return null
  const upd = (x: Partial<Parcel>) => set({ parcel: { ...p, ...x } })
  const ndvi = ind.data?.find((i) => i.id === 'ndvi')
  return (
    <div className="space-y-4 rise">
      <BackBar title="Huella inteligente" onBack={() => go('parcel', 'summary')} />
      <p className="text-[15px] font-semibold -mt-1">La identidad digital de tu parcela: lo que es, lo que ha sembrado y lo que ha pasado en ella.</p>
      <SatMap center={p.center} polygon={p.polygon} className="h-44 rounded-3xl" />
      <Card><p className="font-extrabold text-forest text-lg mb-1">{p.name}</p>
        <p className="text-[15px] font-semibold">{[p.terrain, p.soil && 'suelo ' + p.soil.toLowerCase(), p.areaHa && p.areaHa + ' ha', p.altitude && p.altitude + ' m s. n. m.'].filter(Boolean).join(' · ') || 'Sin datos del terreno'}</p></Card>
      <section><Title>Cultivos y temporadas</Title>
        <Card className="space-y-2">
          <div className="flex justify-between items-center"><span className="font-extrabold">Actual: {p.crop || 'Sin definir'}</span><Tag tone="dark">En curso</Tag></div>
          {p.seasons.length === 0 && <p className="text-[15px] text-graphite/70">Aún no hay temporadas anteriores. Agrega una para construir tu historial.</p>}
          {p.seasons.map((s) => (
            <div key={s.id} className="flex justify-between items-center border-t border-sand/70 pt-2 gap-2">
              <span className="font-bold">{s.year} · {s.crop}</span>
              <span className="flex items-center gap-2 font-semibold">{s.yieldT ? s.yieldT + ' t/ha' : 'sin rendimiento'}{s.demo && <DemoTag text="DEMO" />}</span>
            </div>))}
          {show === 'se' ? (
            <div className="border-t border-sand/70 pt-3">
              <div className="grid grid-cols-2 gap-x-3"><Field label="Año"><TextInput value={se.year} inputMode="numeric" onChange={(e) => setSe({ ...se, year: e.target.value })} /></Field>
                <Field label="Cultivo"><Select value={se.crop} onChange={(v) => setSe({ ...se, crop: v })} options={[...Object.keys(CROPS), 'Otro']} /></Field></div>
              <Field label="Rendimiento" unit="t/ha"><NumInput value={parseFloat(se.yieldT) || 0} onChange={(n) => setSe({ ...se, yieldT: n ? String(n) : '' })} /></Field>
              <Btn className="w-full" onClick={() => { upd({ seasons: [{ id: crypto.randomUUID(), ...se }, ...p.seasons] }); setShow('') }}>Guardar temporada</Btn>
            </div>) : <Btn v="soft" className="w-full" onClick={() => setShow('se')}><Plus size={18} />Agregar temporada</Btn>}
        </Card></section>
      <section><Title sub="Observación satelital de demostración">Evolución del vigor (NDVI)</Title>
        <Card>{ind.loading ? <Loading /> : ndvi ? <><LineChart data={ndvi.series} color={ndvi.color} unit="NDVI" decimals={2} /><div className="mt-2"><DemoTag /></div></> : <ErrorBox msg={ind.error || 'Sin datos'} retry={ind.reload} />}</Card></section>
      <section><Title>Registro de eventos</Title>
        <div className="space-y-2">
          {p.events.length === 0 && <Empty icon={<CalendarDays size={28} />} title="Sin eventos todavía" text="Anota riegos, fertilizaciones, plagas o cosechas para recordar qué pasó." />}
          {[...p.events].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
            <Card key={e.id} className="!p-3 flex items-start gap-3"><span className="size-10 shrink-0 rounded-xl bg-soft text-forest grid place-items-center"><Tractor size={18} /></span>
              <span className="flex-1"><b>{e.type}</b> <span className="text-sm text-graphite/60 font-semibold">· {fmtDate(e.date)}</span><span className="block text-[15px]">{e.note || 'Sin nota'}</span></span>
              <button aria-label="Eliminar evento" className="p-2 text-clay" onClick={() => upd({ events: p.events.filter((x) => x.id !== e.id) })}><Trash2 size={18} /></button></Card>))}
          {show === 'ev' ? (
            <Card><Field label="Tipo de evento"><Select value={ev.type} onChange={(v) => setEv({ ...ev, type: v })} options={['Riego', 'Siembra', 'Fertilización', 'Plaga o enfermedad', 'Lluvia fuerte', 'Cosecha', 'Otro']} /></Field>
              <Field label="Fecha"><TextInput type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></Field>
              <Field label="Nota (opcional)"><TextInput value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} /></Field>
              <Btn className="w-full" onClick={() => { upd({ events: [{ id: crypto.randomUUID(), ...ev }, ...p.events] }); setShow(''); setEv({ ...ev, note: '' }) }}>Guardar evento</Btn></Card>
          ) : <Btn v="soft" className="w-full" onClick={() => setShow('ev')}><Plus size={18} />Agregar evento</Btn>}
        </div></section>
    </div>
  )
}
export { Help }
