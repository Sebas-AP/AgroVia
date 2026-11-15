import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Info, Loader2, RefreshCw, X } from 'lucide-react'

export const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => {
  const cls = `rounded-3xl bg-warm p-4 shadow-[0_1px_0_rgba(23,76,56,.06),0_8px_24px_-14px_rgba(23,76,56,.25)] border border-sand/70 text-left ${className}`
  return onClick ? <button onClick={onClick} className={`${cls} w-full block active:scale-[.99] transition`}>{children}</button> : <div className={cls}>{children}</div>
}
type BtnProps = { 'aria-label'?: string; children: ReactNode; onClick?: () => void; v?: 'primary' | 'soft' | 'ghost' | 'warn'; className?: string; disabled?: boolean; type?: 'button' | 'submit' }
export function Btn({ 'aria-label': al, children, onClick, v = 'primary', className = '', disabled, type = 'button' }: BtnProps) {
  const s = { primary: 'bg-forest text-warm', soft: 'bg-soft text-forest', ghost: 'bg-transparent text-forest border-2 border-forest/25', warn: 'bg-warning text-graphite' }[v]
  return (
    <button type={type} aria-label={al} disabled={disabled} onClick={onClick}
      className={`min-h-12 px-5 rounded-2xl font-bold text-base inline-flex items-center justify-center gap-2 transition active:scale-[.98] disabled:opacity-40 ${s} ${className}`}>
      {children}
    </button>
  )
}
export const Tag = ({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'warn' | 'dark' | 'clay' | 'sand' }) => {
  const s = { soft: 'bg-soft text-forest', warn: 'bg-warning/30 text-[#6b4b05]', dark: 'bg-forest text-warm', clay: 'bg-clay/15 text-clay', sand: 'bg-sand text-graphite' }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold leading-none ${s}`}>{children}</span>
}
export const DemoTag = ({ text = 'DEMOSTRACIÓN' }: { text?: string }) => <Tag tone="warn">{text}</Tag>
export const Title = ({ children, sub }: { children: ReactNode; sub?: string }) => (
  <div className="mb-3"><h2 className="text-xl font-extrabold text-forest leading-tight">{children}</h2>{sub && <p className="text-[15px] text-graphite/75 mt-0.5">{sub}</p>}</div>
)
export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <button onClick={onBack} aria-label="Volver" className="size-11 rounded-2xl bg-soft text-forest grid place-items-center active:scale-95"><ArrowLeft size={22} /></button>
      <h1 className="text-xl font-extrabold text-forest">{title}</h1>
    </div>
  )
}
export function Help({ text }: { text: string }) {
  const [o, setO] = useState(false)
  return (
    <span className="inline-block align-middle">
      <button type="button" aria-label="Ayuda" onClick={() => setO(!o)} className="text-natural ml-1 p-1"><Info size={18} /></button>
      {o && <span className="block mt-1 rounded-xl bg-soft text-forest text-sm p-2.5 font-semibold">{text}</span>}
    </span>
  )
}
export function Field({ label, unit, help, error, children }: { label: string; unit?: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[15px] font-bold text-forest mb-1.5">{label}{unit && <span className="font-semibold text-graphite/60"> ({unit})</span>}{help && <Help text={help} />}</span>
      {children}
      {error && <span role="alert" className="flex items-center gap-1 text-sm font-bold text-clay mt-1"><AlertTriangle size={15} />{error}</span>}
    </label>
  )
}
const inputCls = 'w-full min-h-12 rounded-2xl border-2 border-sand bg-warm px-3.5 text-base font-semibold focus:border-natural outline-none'
export const TextInput = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className || ''}`} />
export function NumInput({ value, onChange, unit, step = 'any', min = 0 }: { value: number; onChange: (n: number) => void; unit?: string; step?: string; min?: number }) {
  return (
    <div className="relative">
      <input type="number" inputMode="decimal" min={min} step={step} placeholder="0" value={value === 0 ? '' : value}
        onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value) || 0))} className={`${inputCls} ${unit ? 'pr-20' : ''}`} />
      {unit && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-graphite/60 pointer-events-none">{unit}</span>}
    </div>
  )
}
export const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>{options.map((o) => <option key={o}>{o}</option>)}</select>
)
export function Pick({ value, onChange, options, unknown = true }: { value: string; onChange: (v: string) => void; options: { v: string; icon?: ReactNode; hint?: string }[]; unknown?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(value === o.v ? '' : o.v)}
          className={`min-h-14 rounded-2xl border-2 px-3 py-2 text-left transition active:scale-[.98] ${value === o.v ? 'border-forest bg-soft text-forest' : 'border-sand bg-warm'}`}>
          <span className="flex items-center gap-2 font-bold text-[15px]">{o.icon}{o.v}</span>
          {o.hint && <span className="block text-[13px] text-graphite/65 font-semibold">{o.hint}</span>}
        </button>
      ))}
      {unknown && <button type="button" onClick={() => onChange('')} className={`min-h-14 rounded-2xl border-2 border-dashed px-3 font-bold text-[15px] ${value === '' ? 'border-warning bg-warning/20' : 'border-sand text-graphite/70'}`}>No lo sé / omitir</button>}
    </div>
  )
}
export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; label?: string }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={`shrink-0 min-h-11 px-4 rounded-full font-bold text-[15px] transition ${value === o.v ? 'bg-forest text-warm' : 'bg-warm border-2 border-sand text-graphite'}`}>{o.label || o.v}</button>
      ))}
    </div>
  )
}
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-graphite/50" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div className="sheet w-full max-h-[85%] overflow-y-auto rounded-t-[28px] bg-ivory p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-extrabold text-forest">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="size-11 rounded-2xl bg-soft grid place-items-center"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  )
}
export const Loading = ({ text = 'Cargando datos…' }: { text?: string }) => (
  <div className="flex items-center gap-3 p-5 text-forest font-bold" role="status"><Loader2 className="animate-spin" />{text}</div>
)
export const ErrorBox = ({ msg, retry }: { msg: string; retry: () => void }) => (
  <Card className="border-clay/40"><div className="flex gap-3"><AlertTriangle className="text-clay shrink-0" /><div>
    <p className="font-extrabold text-clay">No pudimos cargar la información</p><p className="text-[15px] mb-3">{msg}. Revisa tu conexión e inténtalo de nuevo.</p>
    <Btn v="soft" onClick={retry}><RefreshCw size={18} />Reintentar</Btn></div></div></Card>
)
export const Empty = ({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) => (
  <Card className="text-center py-8"><div className="mx-auto size-16 rounded-full bg-soft text-forest grid place-items-center mb-3">{icon}</div>
    <p className="text-lg font-extrabold text-forest">{title}</p><p className="text-[15px] text-graphite/75 mb-4 mt-1">{text}</p>{action}</Card>
)

// ---------- Gráficas ----------
export function LineChart({ data, color = '#174C38', unit, decimals = 0, height = 130 }: { data: { label: string; value: number }[]; color?: string; unit?: string; decimals?: number; height?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const i = Math.min(sel ?? data.length - 1, data.length - 1)
  const W = 320, H = height, pad = 14
  const vs = data.map((d) => d.value), mn = Math.min(...vs), mx = Math.max(...vs), r = mx - mn || 1
  const x = (k: number) => pad + (k * (W - 2 * pad)) / Math.max(data.length - 1, 1)
  const y = (v: number) => H - pad - ((v - mn) / r) * (H - 2 * pad)
  const line = data.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ')
  return (
    <div>
      <p className="text-[15px] font-bold text-graphite mb-1">{data[i].label}: <span style={{ color }}>{data[i].value.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })} {unit}</span></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfica de evolución">
        <path d={`${line} L${x(data.length - 1)} ${H - pad} L${x(0)} ${H - pad}Z`} fill={color} opacity=".12" />
        <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, k) => (<g key={k} onClick={() => setSel(k)} style={{ cursor: 'pointer' }}>
          <circle cx={x(k)} cy={y(d.value)} r="14" fill="transparent" />
          <circle cx={x(k)} cy={y(d.value)} r={k === i ? 6 : 3} fill={k === i ? '#FFFCF6' : color} stroke={color} strokeWidth="3" /></g>))}
      </svg>
      <div className="flex justify-between text-[13px] font-semibold text-graphite/60"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div>
    </div>
  )
}
export function Bars({ items, fmt, highlight }: { items: { label: string; value: number; color?: string; sub?: string }[]; fmt: (n: number) => string; highlight?: number }) {
  const mx = Math.max(...items.map((i) => Math.abs(i.value)), 1)
  return (
    <div className="space-y-3">
      {items.map((it, k) => (
        <div key={k}>
          <div className="flex justify-between text-[15px] font-bold"><span>{it.label}</span><span className={it.value < 0 ? 'text-clay' : ''}>{fmt(it.value)}</span></div>
          <div className="h-3.5 rounded-full bg-sand/60 overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(Math.abs(it.value) / mx) * 100}%`, background: it.value < 0 ? '#a4472f' : k === highlight ? '#174C38' : it.color || '#6D9872' }} /></div>
          {it.sub && <p className="text-[13px] text-graphite/65 font-semibold mt-0.5">{it.sub}</p>}
        </div>
      ))}
    </div>
  )
}
export const Stat = ({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit?: string }) => (
  <div className="rounded-2xl bg-ivory p-3"><div className="flex items-center gap-1.5 text-natural text-sm font-bold">{icon}{label}</div>
    <p className="text-2xl font-extrabold text-forest leading-tight mt-0.5">{value}<span className="text-sm font-bold text-graphite/60 ml-1">{unit}</span></p></div>
)
