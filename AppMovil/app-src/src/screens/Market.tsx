import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Search, Phone, Route, ClipboardList, Check, Trophy, ArrowRight, FileText } from 'lucide-react'
import { useApp, DEFAULT_BUSINESS } from '../state'
import { Btn, Card, Chips, DemoTag, ErrorBox, Field, Loading, NumInput, Select, Tag, TextInput, Title, LineChart, Bars, Empty } from '../components/ui'
import { SatMap } from '../components/SatMap'
import { getBuyers, getPrices } from '../services'
import { CROPS } from '../services/demoData'
import { useAsync } from '../lib/useAsync'
import { addDays, businessResult, fmtDate, mxn, num, saleResult, type SaleOption } from '../lib/calc'
import type { Business } from '../types'

const TABS = [{ v: 'precios', label: 'Precios' }, { v: 'vender', label: 'Dónde vender' }, { v: 'comparar', label: 'Comparador' }, { v: 'negocio', label: 'Mi negocio' }, { v: 'simulador', label: '¿Qué pasaría si…?' }, { v: 'plan', label: 'Mi plan' }]
export default function Market() {
  const { sub, go } = useApp()
  const s = sub.market
  return (
    <div className="rise space-y-4">
      <Chips value={s} onChange={(v) => go('market', v)} options={TABS} />
      {s === 'precios' && <Prices />}{s === 'vender' && <Sell />}{s === 'comparar' && <Compare />}
      {s === 'negocio' && <Model />}{s === 'simulador' && <Sim />}{s === 'plan' && <Plan />}
    </div>
  )
}
const SourceLine = ({ text }: { text: string }) => <div className="flex flex-wrap items-center gap-2"><DemoTag /><span className="text-[13px] font-semibold text-graphite/70">{text}</span></div>

function Prices() {
  const { data, loading, error, reload } = useAsync(getPrices, [])
  const [open, setOpen] = useState('Maíz')
  if (loading) return <Loading text="Consultando precios…" />
  if (error || !data) return <ErrorBox msg={error || 'Sin datos'} retry={reload} />
  const sel = data.find((d) => d.crop === open)!
  return (
    <div className="space-y-3">
      <Title sub="Precio por tonelada en tu región">Precios agrícolas</Title>
      <Card className="bg-warning/20 border-warning/50 text-[15px] font-bold">Precios de ejemplo para la demostración. No son precios actuales ni oficiales.</Card>
      {data.map((d) => (
        <Card key={d.crop} onClick={() => setOpen(d.crop)} className={open === d.crop ? '!border-forest border-2' : ''}>
          <div className="flex items-center justify-between"><div><p className="text-lg font-extrabold text-forest">{d.crop}</p><p className="text-sm font-semibold text-graphite/65">{d.region}</p></div>
            <div className="text-right"><p className="text-xl font-extrabold">{mxn(d.price)}<span className="text-sm text-graphite/60 font-bold"> /t</span></p>
              <p className={`font-extrabold text-[15px] flex items-center justify-end gap-1 ${d.change >= 0 ? 'text-natural' : 'text-clay'}`}>{d.change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{d.change >= 0 ? '+' : ''}{d.change.toFixed(1)} % en 12 meses</p></div></div>
        </Card>))}
      <Card><p className="font-extrabold text-forest mb-1">Tendencia · {sel.crop}</p>
        <LineChart data={sel.series.map((v, i) => ({ label: `Mes ${i + 1}`, value: v }))} unit="MXN/t" color="#174C38" />
        <div className="mt-2"><SourceLine text={`${sel.source} · ${sel.updated} · ${sel.unit}`} /></div></Card>
    </div>
  )
}

function Sell() {
  const { go } = useApp()
  const { data, loading, error, reload } = useAsync(getBuyers, [])
  const [q, setQ] = useState(''), [crop, setCrop] = useState('Todos'), [type, setType] = useState('Todos'), [sel, setSel] = useState<string | null>(null)
  const list = useMemo(() => (data || []).filter((b) => (crop === 'Todos' || b.crop === crop) && (type === 'Todos' || b.type === type) && (b.name + b.place).toLowerCase().includes(q.toLowerCase())), [data, q, crop, type])
  if (loading) return <Loading text="Buscando compradores…" />
  if (error || !data) return <ErrorBox msg={error || 'Sin datos'} retry={reload} />
  const cur = data.find((b) => b.id === sel)
  return (
    <div className="space-y-3">
      <Title sub="Compradores, acopios, cooperativas y comercializadores">Dónde puedo vender</Title>
      <Card className="bg-warning/20 border-warning/50 text-[15px] font-bold">Todos los compradores son FICTICIOS, creados para la demostración.</Card>
      <div className="relative"><Search size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural" /><TextInput className="!pl-11" placeholder="Buscar por nombre o lugar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar comprador" /></div>
      <Chips value={crop} onChange={setCrop} options={['Todos', 'Maíz', 'Frijol', 'Sorgo', 'Trigo'].map((v) => ({ v }))} />
      <Chips value={type} onChange={setType} options={['Todos', 'Centro de acopio', 'Cooperativa', 'Comercializador'].map((v) => ({ v }))} />
      <div className="relative rounded-3xl overflow-hidden">
        <SatMap center={{ lat: 20.5, lon: -103.5 }} polygon={[{ x: 46, y: 46 }, { x: 54, y: 46 }, { x: 54, y: 54 }, { x: 46, y: 54 }]} className="h-56" label="MAPA DE DEMOSTRACIÓN"
          markers={list.map((b) => { const r = Math.min(44, 8 + b.km * 0.4); return { id: b.id, name: b.name, selected: b.id === sel, x: 50 + Math.cos((b.angle * Math.PI) / 180) * r, y: 50 - Math.sin((b.angle * Math.PI) / 180) * r, onClick: () => setSel(b.id) } })} />
      </div>
      {list.length === 0 && <Empty icon={<Search size={28} />} title="Sin resultados" text="Prueba con otro cultivo o tipo de comprador." action={<Btn v="soft" onClick={() => { setQ(''); setCrop('Todos'); setType('Todos') }}>Quitar filtros</Btn>} />}
      {list.map((b) => (
        <Card key={b.id} onClick={() => setSel(b.id === sel ? null : b.id)} className={b.id === sel ? '!border-forest border-2' : ''}>
          <div className="flex justify-between gap-2"><div><p className="font-extrabold text-forest text-[17px]">{b.name}</p><p className="text-sm font-semibold text-graphite/65">{b.type} · {b.place}</p></div>
            <Tag tone="warn">FICTICIO</Tag></div>
          <div className="flex gap-4 mt-2 font-bold"><span>{b.crop}</span><span>{mxn(b.price)}/t</span><span className="flex items-center gap-1"><Route size={15} />{b.km} km</span></div>
          {b.id === sel && <div className="mt-3 pt-3 border-t border-sand space-y-2 text-[15px] font-semibold"><p className="flex gap-2"><ClipboardList size={18} className="shrink-0 text-natural" />{b.req}</p><p className="flex gap-2"><Phone size={18} className="shrink-0 text-natural" />{b.contact}</p>
            <Btn className="w-full" onClick={() => { localStorage.setItem('agrovia:cmpCrop', b.crop); go('market', 'comparar') }}>Comparar opciones de {b.crop}<ArrowRight size={18} /></Btn></div>}
        </Card>))}
    </div>
  )
}

function useOptions(crop: string) {
  const b = useAsync(getBuyers, []), p = useAsync(getPrices, [])
  const opts: SaleOption[] = []
  const ref = p.data?.find((x) => x.crop === crop)
  if (ref) opts.push({ id: 'ref', name: 'Mercado regional (precio de referencia)', km: 10, price: ref.price })
  ;(b.data || []).filter((x) => x.crop === crop).forEach((x) => opts.push({ id: x.id, name: x.name + ' (ficticio)', km: x.km, price: x.price }))
  return { opts, loading: b.loading || p.loading, error: b.error || p.error, reload: () => { b.reload(); p.reload() } }
}
export const RATE = 3.5, OTHER = 120
function Compare() {
  const { business } = useApp()
  const [crop, setCrop] = useState(() => localStorage.getItem('agrovia:cmpCrop') || business.crop)
  const [tons, setTons] = useState(() => +(business.area * business.yieldT).toFixed(1) || 20)
  const [rate, setRate] = useState(RATE), [other, setOther] = useState(OTHER)
  const [over, setOver] = useState<Record<string, number>>({})
  const { opts, loading, error, reload } = useOptions(crop)
  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const rows = opts.map((o) => { const oo = { ...o, price: over[o.id] ?? o.price }; return { o: oo, r: saleResult(oo, tons, rate, other) } }).sort((a, b) => b.r.net - a.r.net)
  return (
    <div className="space-y-3">
      <Title sub="¿Dónde te queda más dinero después de costos?">Comparador comercial</Title>
      <Field label="Cultivo"><Select value={crop} onChange={(v) => { setCrop(v); setOver({}) }} options={Object.keys(CROPS)} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Toneladas" unit="t"><NumInput value={tons} onChange={setTons} /></Field>
        <Field label="Transporte" unit="$/t·km" help="Costo estimado de mover una tonelada un kilómetro. Valor de ejemplo editable."><NumInput value={rate} onChange={setRate} /></Field>
        <Field label="Otros" unit="$/t" help="Otros costos por tonelada: carga, maniobras, comisión, empaque."><NumInput value={other} onChange={setOther} /></Field>
      </div>
      {rows.length === 0 && <Empty icon={<Search size={28} />} title="Sin opciones" text="No hay compradores de demostración para este cultivo." />}
      {rows.map(({ o, r }, i) => (
        <Card key={o.id} className={i === 0 ? '!bg-soft !border-forest border-2' : ''}>
          {i === 0 && <p className="flex items-center gap-1.5 text-forest font-extrabold text-sm mb-1"><Trophy size={16} />MÁS CONVENIENTE SEGÚN TUS DATOS</p>}
          <p className="font-extrabold text-[17px]">{o.name}</p>
          <p className="text-sm font-semibold text-graphite/70 mb-2">{o.km} km de distancia</p>
          <Field label="Precio por tonelada" unit="MXN/t"><NumInput value={o.price} onChange={(n) => setOver({ ...over, [o.id]: n })} /></Field>
          <dl className="grid grid-cols-2 gap-y-1 text-[15px] font-semibold">
            <dt>Ingreso bruto</dt><dd className="text-right font-extrabold">{mxn(r.gross)}</dd><dt>Transporte (est.)</dt><dd className="text-right">− {mxn(r.transport)}</dd>
            <dt>Otros costos</dt><dd className="text-right">− {mxn(r.others)}</dd><dt className="font-extrabold text-forest text-lg">Ingreso neto (est.)</dt><dd className="text-right font-extrabold text-forest text-lg">{mxn(r.net)}</dd></dl>
        </Card>))}
      {rows.length > 1 && <Card><p className="font-extrabold text-forest mb-2">Ingreso neto estimado</p><Bars items={rows.map(({ o, r }) => ({ label: o.name.replace(' (ficticio)', ''), value: r.net }))} fmt={mxn} highlight={0} /></Card>}
      <SourceLine text="Estimación con precios y costos de ejemplo; ajústalos con tus datos reales." />
    </div>
  )
}

const COSTS: [keyof Business, string][] = [['seeds', 'Semillas'], ['fert', 'Fertilizantes'], ['water', 'Agua'], ['labor', 'Mano de obra'], ['machinery', 'Maquinaria'], ['transport', 'Transporte'], ['other', 'Otros costos']]
function Model() {
  const { business: b, set, parcel, go } = useApp()
  const r = businessResult(b)
  const up = (k: keyof Business, v: number | string) => set({ business: { ...b, [k]: v } })
  const pickCrop = (c: string) => set({ business: { ...b, crop: c, yieldT: CROPS[c].yieldT, price: CROPS[c].price } })
  return (
    <div className="space-y-4">
      <Title sub="Captura tus costos y mira si el cultivo deja ganancia.">Mi modelo de negocio</Title>
      <Card className="bg-warning/20 border-warning/50 text-[15px] font-bold">Los valores iniciales son un ejemplo. Cámbialos por los tuyos. Todos los resultados son estimaciones.</Card>
      {parcel?.areaHa && +parcel.areaHa !== b.area && <Btn v="soft" className="w-full" onClick={() => up('area', +parcel.areaHa)}>Usar la superficie de mi parcela ({parcel.areaHa} ha)</Btn>}
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cultivo"><Select value={b.crop} onChange={pickCrop} options={Object.keys(CROPS)} /></Field>
        <Field label="Superficie" unit="ha"><NumInput value={b.area} onChange={(n) => up('area', n)} /></Field>
        <Field label="Rendimiento esperado" unit="t/ha" help="Toneladas que esperas cosechar por hectárea."><NumInput value={b.yieldT} onChange={(n) => up('yieldT', n)} /></Field>
        <Field label="Precio de venta" unit="MXN/t"><NumInput value={b.price} onChange={(n) => up('price', n)} /></Field>
      </div>
      <p className="font-extrabold text-forest -mb-2">Costos totales de la temporada (MXN)</p>
      <div className="grid grid-cols-2 gap-x-3 pt-2">{COSTS.map(([k, l]) => <Field key={k} label={l} unit="MXN"><NumInput value={b[k] as number} onChange={(n) => up(k, n)} /></Field>)}</div>
      <Card className={`${r.profit >= 0 ? '!bg-forest text-warm' : '!bg-clay text-warm'}`}>
        <p className="text-sm font-extrabold tracking-wide text-warning">GANANCIA ESTIMADA</p>
        <p className="text-4xl font-extrabold">{mxn(r.profit)}</p>
        <p className="font-bold text-soft">Margen {num(r.margin, 1)} % {r.profit < 0 && '· con estos datos habría pérdida'}</p></Card>
      <Card><dl className="divide-y divide-sand/70 font-semibold">
        {[['Inversión total', mxn(r.invest)], ['Costo por hectárea', mxn(r.costPerHa) + '/ha'], ['Rendimiento estimado', num(r.production, 1) + ' t'], ['Costo por tonelada', mxn(r.costPerTon) + '/t'], ['Ingresos potenciales', mxn(r.income)], ['Punto de equilibrio', num(r.breakevenT, 1) + ' t (' + num(r.breakevenYield, 2) + ' t/ha)']].map(([k, v]) => <div key={k} className="flex justify-between py-2.5 gap-3"><dt>{k}</dt><dd className="font-extrabold text-right">{v}</dd></div>)}</dl>
        <p className="text-[13px] mt-2 font-semibold text-graphite/65">Punto de equilibrio: toneladas que debes vender al precio indicado para recuperar tu inversión.</p></Card>
      <div className="grid grid-cols-2 gap-3"><Btn v="soft" onClick={() => go('market', 'simulador')}>Simular escenarios</Btn><Btn onClick={() => go('market', 'plan')}>Crear mi plan</Btn></div>
      <button className="w-full text-sm font-bold text-graphite/70 underline py-2" onClick={() => set({ business: DEFAULT_BUSINESS })}>Restablecer valores de ejemplo</button>
    </div>
  )
}

function Sim() {
  const { business: base } = useApp()
  const [s, setS] = useState<Business>(base)
  const [pct, setPct] = useState({ fert: 0, transport: 0, invest: 0 })
  const adj = { ...s, fert: s.fert * (1 + pct.fert / 100), transport: s.transport * (1 + pct.transport / 100), other: s.other + (businessResult(s).invest * pct.invest) / 100 }
  const rb = businessResult(base), rs = businessResult(adj)
  const sens = Array.from({ length: 9 }, (_, i) => { const f = 0.6 + i * 0.1; return { label: mxn(adj.price * f), value: businessResult({ ...adj, price: adj.price * f }).profit } })
  const setCrop = (c: string) => setS({ ...s, crop: c, yieldT: CROPS[c].yieldT, price: CROPS[c].price })
  const sl = (label: string, k: 'fert' | 'transport' | 'invest') => (
    <Field label={`${label}: ${pct[k] > 0 ? '+' : ''}${pct[k]} %`}><input type="range" min={-50} max={50} step={5} value={pct[k]} onChange={(e) => setPct({ ...pct, [k]: +e.target.value })} className="w-full h-10 accent-[#174C38]" /></Field>)
  return (
    <div className="space-y-4">
      <Title sub="Cambia una variable y mira qué pasa con tu ganancia.">Simulador: ¿Qué pasaría si…?</Title>
      <Tag tone="warn">Todo lo que ves aquí es una ESTIMACIÓN</Tag>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cultivo"><Select value={s.crop} onChange={setCrop} options={Object.keys(CROPS)} /></Field>
        <Field label="Superficie" unit="ha"><NumInput value={s.area} onChange={(n) => setS({ ...s, area: n })} /></Field>
        <Field label="Rendimiento" unit="t/ha"><NumInput value={s.yieldT} onChange={(n) => setS({ ...s, yieldT: n })} /></Field>
        <Field label="Precio de venta" unit="MXN/t"><NumInput value={s.price} onChange={(n) => setS({ ...s, price: n })} /></Field>
      </div>
      {sl('Fertilizantes', 'fert')}{sl('Transporte', 'transport')}{sl('Inversión adicional (otros)', 'invest')}
      <Card className={rs.profit >= 0 ? '!bg-forest text-warm' : '!bg-clay text-warm'}><p className="text-sm font-extrabold text-warning tracking-wide">GANANCIA DEL ESCENARIO (EST.)</p><p className="text-4xl font-extrabold">{mxn(rs.profit)}</p>
        <p className="font-bold text-soft">{rs.profit - rb.profit >= 0 ? '+' : '−'} {mxn(Math.abs(rs.profit - rb.profit))} frente a tu modelo actual · margen {num(rs.margin, 1)} %</p></Card>
      <Card><p className="font-extrabold text-forest mb-2">Comparación de escenarios</p>
        <Bars fmt={mxn} items={[{ label: 'Inversión · modelo actual', value: rb.invest, color: '#C4B58A' }, { label: 'Inversión · escenario', value: rs.invest, color: '#A3A872' }, { label: 'Ganancia · modelo actual', value: rb.profit, color: '#6D9872' }, { label: 'Ganancia · escenario', value: rs.profit, color: '#174C38' }]} /></Card>
      <Card><p className="font-extrabold text-forest">Si el precio cambia…</p><p className="text-sm font-semibold text-graphite/70 mb-1">Ganancia estimada según el precio de venta (desde −40 % hasta +20 %)</p>
        <LineChart data={sens} unit="MXN" color="#174C38" /></Card>
      <Btn v="ghost" className="w-full" onClick={() => { setS(base); setPct({ fert: 0, transport: 0, invest: 0 }) }}>Volver a mi modelo actual</Btn>
    </div>
  )
}

function Plan() {
  const { business: b, plan, set, parcel, go } = useApp()
  const { opts, loading } = useOptions(b.crop)
  const r = businessResult(b)
  if (loading) return <Loading />
  const best = opts.map((o) => ({ o, n: saleResult(o, r.production, RATE, OTHER).net })).sort((x, y) => y.n - x.n)[0]
  const sow = parcel?.sowingDate || new Date().toISOString().slice(0, 10)
  const draft = { crop: b.crop, area: b.area, invest: r.invest, production: r.production, harvestDate: addDays(sow, CROPS[b.crop]?.cycle || 130), market: best ? best.o.name : 'Sin definir', breakeven: r.breakevenT, profit: r.profit }
  const p = plan ? { ...plan } : draft
  const stale = plan && (plan.invest !== r.invest || plan.crop !== b.crop || plan.area !== b.area)
  const rows: [string, string][] = [['Cultivo elegido', p.crop], ['Superficie', num(p.area, 1) + ' ha'], ['Inversión', mxn(p.invest)], ['Producción esperada', num(p.production, 1) + ' t (est.)'], ['Fecha de cosecha', fmtDate(p.harvestDate) + ' (est.)'], ['Mercado objetivo', p.market], ['Punto de equilibrio', num(p.breakeven, 1) + ' t'], ['Ganancia potencial', mxn(p.profit) + ' (est.)']]
  return (
    <div className="space-y-4">
      <Title sub="Resumen de tu temporada">Mi plan de producción</Title>
      {r.invest === 0 && <Empty icon={<FileText size={28} />} title="Falta capturar tus costos" text="Para armar el plan, registra primero tu modelo de negocio." action={<Btn onClick={() => go('market', 'negocio')}>Ir a Mi modelo de negocio</Btn>} />}
      <Card className="!p-0 overflow-hidden">
        {parcel && <SatMap center={parcel.center} polygon={parcel.polygon} className="h-32" />}
        <div className="p-4"><div className="flex justify-between items-center mb-2"><p className="font-extrabold text-forest text-lg">{plan ? 'Plan guardado' : 'Borrador del plan'}</p>{plan ? <Tag tone="dark"><Check size={14} />Guardado</Tag> : <Tag tone="warn">Sin guardar</Tag>}</div>
          <dl className="divide-y divide-sand/70 font-semibold">{rows.map(([k, v]) => <div key={k} className="flex justify-between py-2.5 gap-3"><dt className="text-graphite/70">{k}</dt><dd className="font-extrabold text-right">{v}</dd></div>)}</dl>
          <p className="text-[13px] font-semibold text-graphite/65 mt-2">Las cifras son estimaciones basadas en tus datos y en precios de demostración. La cosecha se calcula con un ciclo promedio del cultivo desde la siembra.</p></div>
      </Card>
      {stale && <p role="alert" className="text-sm font-bold rounded-2xl bg-warning/25 p-3">Tu modelo cambió desde que guardaste el plan. Actualízalo para reflejarlo.</p>}
      <Btn className="w-full" disabled={r.invest === 0} onClick={() => set({ plan: { createdAt: new Date().toISOString(), ...draft } })}>{plan ? 'Actualizar mi plan de producción' : 'Crear mi plan de producción'}</Btn>
      {plan && <p role="status" className="text-center font-bold text-forest">Plan guardado el {fmtDate(plan.createdAt.slice(0, 10))}.</p>}
    </div>
  )
}
