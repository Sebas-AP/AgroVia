import { useEffect, useRef, useState } from 'react'
import { Activity, MessageCircle, Send, Mic, History, Sparkles, RefreshCw, AlertTriangle, Trash2, CheckCircle2, HelpCircle, ShieldCheck, Lightbulb } from 'lucide-react'
import { useApp } from '../state'
import { Btn, Card, Chips, DemoTag, ErrorBox, Loading, LineChart, Sheet, Tag, Title, Bars } from '../components/ui'
import { SatMap, NdviLegend } from '../components/SatMap'
import { ViaAvatar } from '../components/brand'
import { askVia, getIndicators, summarize, buildAnalysis, type Indicator } from '../services'
import { DEMO_PARCEL } from '../services/demoData'
import { useAsync } from '../lib/useAsync'
import type { Analysis, Msg } from '../types'

export default function Intel() {
  const { sub, go } = useApp()
  const s = sub.intel
  return (
    <div className="rise">
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-3xl bg-sand/70 mb-4">
        {([['pulso', 'Pulso agrícola', <Activity size={18} key="a" />], ['via', 'VÍA asistente', <MessageCircle size={18} key="b" />]] as const).map(([k, l, i]) => (
          <button key={k} onClick={() => go('intel', k)} aria-pressed={s === k} className={`min-h-12 rounded-2xl font-extrabold text-[15px] flex items-center justify-center gap-2 transition ${s === k ? 'bg-forest text-warm' : 'text-graphite'}`}>{i}{l}</button>))}
      </div>
      {s === 'via' ? <Via /> : <Pulso />}
    </div>
  )
}

const KIND_TONE = { Histórico: 'sand', 'Observación satelital': 'soft', Estimación: 'warn', 'Pronóstico externo': 'dark' } as const
const PERIODS = [{ v: '3', label: '3 meses' }, { v: '6', label: '6 meses' }, { v: '12', label: '12 meses' }]

function Pulso() {
  const { parcel } = useApp()
  const { data, loading, error, reload } = useAsync(getIndicators, [])
  const [layer, setLayer] = useState('ndvi')
  const [per, setPer] = useState('12')
  const [map, setMap] = useState<'ndvi' | 'vision'>('ndvi')
  const p = parcel || DEMO_PARCEL
  const n = +per
  if (loading) return <Loading text="Leyendo el pulso de tu campo…" />
  if (error || !data) return <ErrorBox msg={error || 'Sin datos'} retry={reload} />
  const cur = data.find((i) => i.id === layer) as Indicator
  const val = summarize(cur, n)
  const ndvi = data[0]
  const lastN = ndvi.series[ndvi.series.length - 1].value
  const vegPct = Math.round(Math.min(1, lastN / 0.8) * 100)
  return (
    <div className="space-y-4">
      <Title sub="Explora tu campo con datos ambientales y satelitales.">Pulso agrícola</Title>
      {!parcel && <Card className="bg-warning/20 border-warning/50 text-[15px] font-bold">Aún no registras tu parcela: se muestra el área de demostración.</Card>}
      <div>
        <SatMap center={p.center} polygon={p.polygon} layer={map} ndvi={lastN} className="h-60 rounded-3xl" label={map === 'ndvi' ? 'NDVI · DEMOSTRACIÓN' : 'IMAGEN DE DEMOSTRACIÓN'} />
        <div className="mt-2 flex gap-2">
          <Chips value={map} onChange={(v) => setMap(v as 'ndvi' | 'vision')} options={[{ v: 'ndvi', label: 'Capa NDVI' }, { v: 'vision', label: 'Imagen satelital' }]} /></div>
        {map === 'ndvi' && <div className="mt-2"><NdviLegend /></div>}
      </div>
      <section>
        <p className="font-extrabold text-forest mb-2">Capa o indicador</p>
        <Chips value={layer} onChange={setLayer} options={data.map((i) => ({ v: i.id, label: i.name.split(' (')[0] }))} />
        <p className="font-extrabold text-forest mt-3 mb-2">Periodo analizado</p>
        <Chips value={per} onChange={setPer} options={PERIODS} />
      </section>
      <Card className="space-y-3" key={cur.id}>
        <div className="flex flex-wrap gap-2"><Tag tone={KIND_TONE[cur.kind]}>{cur.kind}</Tag><DemoTag text={cur.status.toUpperCase()} /></div>
        <h3 className="text-lg font-extrabold text-forest">{cur.name}</h3>
        <p className="text-4xl font-extrabold text-forest">{val.toLocaleString('es-MX', { maximumFractionDigits: cur.decimals, minimumFractionDigits: cur.decimals })}<span className="text-base font-bold text-graphite/60 ml-1.5">{cur.unit}</span></p>
        <p className="text-sm font-bold text-graphite/70 -mt-2">{cur.agg === 'sum' ? 'Total' : cur.agg === 'avg' ? 'Promedio' : 'Último valor'} de los últimos {n} meses</p>
        <LineChart data={cur.series.slice(-n)} color={cur.color} unit={cur.unit} decimals={cur.decimals} />
        <div className="rounded-2xl bg-soft p-3 text-[15px] font-semibold"><b className="flex items-center gap-1.5 text-forest"><Lightbulb size={16} />En palabras sencillas</b>{cur.explain}</div>
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-semibold">
          <dt className="text-graphite/60">Fuente</dt><dd>{cur.source}</dd><dt className="text-graphite/60">Actualización</dt><dd>{cur.updated}</dd><dt className="text-graphite/60">Disponibilidad</dt><dd>{cur.status}: valores de ejemplo, no reales</dd></dl>
      </Card>
      <section>
        <Title sub="Cambio de cobertura (demostración)">Cobertura del terreno</Title>
        <Card><Bars fmt={(n) => n + ' %'} items={[{ label: 'Con vegetación · hace 1 año', value: Math.max(10, vegPct - 12), color: '#A3A872' }, { label: 'Con vegetación · ahora', value: vegPct }, { label: 'Suelo descubierto · ahora', value: 100 - vegPct, color: '#C4B58A' }]} highlight={1} />
          <div className="mt-3"><DemoTag /></div></Card>
      </section>
      <Card className="bg-ivory border-sand">
        <p className="font-extrabold text-forest flex items-center gap-1.5 mb-2"><ShieldCheck size={18} />Cómo leer estos datos</p>
        <ul className="text-[15px] font-semibold space-y-1.5 list-disc pl-5">
          <li><b>Histórico:</b> lo que ya pasó (clima de años anteriores).</li><li><b>Observación satelital:</b> lo que ve el satélite.</li>
          <li><b>Estimación:</b> un cálculo, puede variar.</li><li><b>Pronóstico externo:</b> lo que se espera que pase. Aún no está conectado.</li>
          <li>Los datos de NASA son históricos o satelitales: no son pronósticos exactos de lluvia en tu parcela.</li></ul>
      </Card>
    </div>
  )
}

const QUICK = ['¿Qué condiciones tiene mi parcela?', '¿Qué cultivo me conviene?', '¿Cómo estarán las lluvias?', '¿Qué significan los datos satelitales?', '¿Cómo puedo mejorar mi producción?', '¿Qué riesgos debo prevenir?']
const WELCOME = '¡Hola! Soy VÍA, tu compañero agrícola. Conozco los datos disponibles de tu parcela y estoy aquí para ayudarte a tomar mejores decisiones'

function Via() {
  const { chat, set, parcel, business } = useApp()
  const ind = useAsync(getIndicators, [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [hist, setHist] = useState(false)
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const started = chat.length > 0 || busy
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, busy])

  const send = async (q: string, base: Msg[] = chat) => {
    q = q.trim(); if (!q || busy) return
    const um: Msg = { id: crypto.randomUUID(), role: 'user', text: q, ts: Date.now() }
    const withUser = [...base, um]
    set({ chat: withUser }); setText(''); setBusy(true)
    try {
      const r = await askVia(q, { parcel, business }, ind.data || (await getIndicators()))
      set({ chat: [...withUser, { id: crypto.randomUUID(), role: 'via', ts: Date.now(), ...r }] })
    } catch (e) {
      set({ chat: [...withUser, { id: crypto.randomUUID(), role: 'via', ts: Date.now(), error: true, text: (e as Error).message }] })
    } finally { setBusy(false) }
  }
  const retry = (i: number) => { const q = chat[i - 1]?.text; if (q) send(q, chat.slice(0, i - 1)) }
  const analyze = () => {
    if (!parcel) return send('Analizar mi parcela')
    send('Analizar mi parcela')
  }
  const mic = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }) // eslint-disable-line
    const R = SR.SpeechRecognition || SR.webkitSpeechRecognition
    if (!R) return setNote('Tu navegador no permite dictado por voz. Escribe tu pregunta.')
    const r = new R(); r.lang = 'es-MX'; setListening(true); setNote('Escuchando… habla ahora.')
    r.onresult = (e: any) => { setText(e.results[0][0].transcript); setNote('') } // eslint-disable-line
    r.onerror = () => setNote('No se pudo usar el micrófono. Revisa el permiso o escribe tu pregunta.')
    r.onend = () => setListening(false)
    r.start()
  }
  const questions = chat.filter((m) => m.role === 'user')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ViaAvatar size={52} active={busy} />
        <div className="flex-1"><h2 className="text-xl font-extrabold text-forest leading-tight">VÍA</h2><p className="text-sm font-bold text-natural">{busy ? 'Escribiendo…' : 'Tu compañero agrícola'}</p></div>
        <button onClick={() => setHist(true)} className="min-h-11 px-3 rounded-2xl bg-soft text-forest font-bold flex items-center gap-1.5"><History size={18} />Historial</button>
      </div>
      {!started && (
        <Card className="space-y-3">
          <div className="rounded-2xl rounded-tl-md bg-soft p-3.5 text-[16px] font-semibold">{WELCOME}.</div>
          <Btn onClick={analyze} className="w-full"><Sparkles size={18} />Analizar mi parcela</Btn>
          <p className="font-extrabold text-forest">O pregúntame:</p>
          <div className="flex flex-wrap gap-2">{QUICK.map((q) => <button key={q} onClick={() => send(q)} className="min-h-11 rounded-2xl border-2 border-sand bg-warm px-3.5 py-2 text-left text-[15px] font-bold active:scale-[.98]">{q}</button>)}</div>
          {!parcel && <p className="text-sm font-bold text-[#7a5a0a]">Aún no registras tu parcela; si no hay datos te lo diré y no inventaré nada.</p>}
        </Card>
      )}
      {started && (
        <div className="space-y-3" aria-live="polite">
          <div className="rounded-2xl rounded-tl-md bg-soft p-3.5 text-[16px] font-semibold max-w-[92%]">{WELCOME}.</div>
          {chat.map((m, i) => m.role === 'user' ? (
            <div key={m.id} className="flex justify-end"><div className="rounded-2xl rounded-tr-md bg-forest text-warm p-3.5 text-[16px] font-semibold max-w-[85%]">{m.text}</div></div>
          ) : (
            <div key={m.id} className="flex gap-2 items-start"><ViaAvatar size={32} />
              {m.analysis ? <AnalysisCard a={m.analysis} /> : m.error ? (
                <div className="rounded-2xl rounded-tl-md bg-clay/10 border-2 border-clay/30 p-3.5 max-w-[88%]"><p className="font-extrabold text-clay flex items-center gap-1.5"><AlertTriangle size={16} />No pude responder</p><p className="text-[15px] font-semibold mb-2">{m.text}. Revisa tu conexión.</p><Btn v="soft" onClick={() => retry(i)}><RefreshCw size={16} />Reintentar</Btn></div>
              ) : <div className="rounded-2xl rounded-tl-md bg-soft p-3.5 text-[16px] font-semibold max-w-[88%] whitespace-pre-line">{m.text}</div>}
            </div>
          ))}
          {busy && <div className="flex gap-2 items-center"><ViaAvatar size={32} active /><div className="rounded-2xl bg-soft px-4 py-3 flex gap-1.5" aria-label="VÍA está escribiendo">{[0, 1, 2].map((d) => <span key={d} className="dot size-2.5 rounded-full bg-forest" style={{ animationDelay: d * 0.2 + 's' }} />)}</div></div>}
          <div ref={end} />
          {!busy && <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4"><button onClick={analyze} className="shrink-0 min-h-11 px-4 rounded-full bg-forest text-warm font-bold text-[15px] flex items-center gap-1.5"><Sparkles size={16} />Analizar mi parcela</button>
            {QUICK.map((q) => <button key={q} onClick={() => send(q)} className="shrink-0 min-h-11 px-4 rounded-full border-2 border-sand bg-warm font-bold text-[15px]">{q}</button>)}</div>}
        </div>
      )}
      {note && <p role="status" className="text-sm font-bold rounded-2xl bg-warning/25 p-2.5">{note}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="sticky bottom-0 -mx-4 px-4 pb-1 pt-2 bg-ivory flex gap-2">
        <button type="button" onClick={mic} aria-label="Dictar con micrófono" className={`size-12 shrink-0 rounded-2xl grid place-items-center ${listening ? 'bg-warning' : 'bg-soft text-forest'}`}><Mic size={22} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu pregunta…" aria-label="Pregunta para VÍA" className="min-w-0 flex-1 min-h-12 rounded-2xl border-2 border-sand bg-warm px-3.5 text-base font-semibold outline-none focus:border-natural" />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Enviar" className="size-12 shrink-0 rounded-2xl bg-forest text-warm grid place-items-center disabled:opacity-40"><Send size={20} /></button>
      </form>
      {hist && (
        <Sheet title="Historial de preguntas" onClose={() => setHist(false)}>
          {questions.length === 0 ? <p className="font-semibold">Todavía no has hecho preguntas.</p> : (
            <div className="space-y-2">{[...questions].reverse().map((m) => <button key={m.id} className="w-full text-left rounded-2xl bg-warm border border-sand p-3 font-bold" onClick={() => { setHist(false); send(m.text || '') }}>{m.text}<span className="block text-[13px] text-graphite/60">{new Date(m.ts).toLocaleString('es-MX')} · toca para repetir</span></button>)}
              <Btn v="ghost" className="w-full !text-clay" onClick={() => { set({ chat: [] }); setHist(false) }}><Trash2 size={18} />Borrar conversación</Btn></div>)}
        </Sheet>
      )}
    </div>
  )
}

const BADGE = { Registrado: 'soft', Demostración: 'warn' } as const
function Sec({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div><p className="flex items-center gap-2 font-extrabold text-forest mb-1"><span className="size-6 rounded-full bg-forest text-warm text-sm grid place-items-center">{n}</span>{title}</p><div className="pl-8 text-[15px] font-semibold space-y-1">{children}</div></div>
}
export function AnalysisCard({ a }: { a: Analysis }) {
  return (
    <Card className="flex-1 min-w-0 space-y-4 !p-4">
      <p className="font-extrabold text-lg text-forest flex items-center gap-2"><Sparkles size={18} />Análisis de tu parcela</p>
      <div className="flex gap-1.5 flex-wrap"><Tag tone="soft"><CheckCircle2 size={13} />Comprobado</Tag><Tag tone="warn">Estimación</Tag><Tag tone="dark">Recomendación</Tag></div>
      <Sec n={1} title="Qué está sucediendo">{a.happening.map((h, i) => <p key={i}>• {h}</p>)}</Sec>
      <Sec n={2} title="Qué significa para el cultivo"><p>{a.meaning} <Tag tone="warn">Estimación</Tag></p></Sec>
      <Sec n={3} title="Qué alternativas existen">{a.alternatives.map((h, i) => <p key={i}>• {h}</p>)}</Sec>
      <div className="rounded-2xl bg-forest text-warm p-3.5"><p className="font-extrabold text-warning mb-1">4 · VÍA recomienda</p><p className="font-semibold">{a.recommendation}</p><p className="mt-2 text-soft text-sm font-bold">5 · ¿Por qué?</p><p className="font-semibold text-[15px]">{a.why}</p></div>
      <Sec n={6} title="Datos utilizados"><div className="flex flex-wrap gap-1.5">{a.used.map((u) => <Tag key={u.label} tone={BADGE[u.kind]}>{u.label} · {u.kind}</Tag>)}</div></Sec>
      <Sec n={7} title="Nivel de confianza"><p className="font-extrabold">{a.confidence.level} <span className="text-graphite/60">· datos completos: {a.confidence.pct} %</span></p><div className="h-3 rounded-full bg-sand overflow-hidden"><div className="h-full bg-natural" style={{ width: a.confidence.pct + '%' }} /></div><p className="text-sm">{a.confidence.note}</p></Sec>
      <Sec n={8} title="Información que todavía falta">{a.missing.map((h, i) => <p key={i} className="flex gap-1.5"><HelpCircle size={16} className="shrink-0 mt-0.5 text-warning" />{h}</p>)}</Sec>
    </Card>
  )
}
export { buildAnalysis }
