import { useMemo, useRef, useState } from 'react'
import type { Pt } from '../types'

function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } }
const FIELD = ['#5E7F55', '#7A9462', '#A3A872', '#8C8F5A', '#C4B58A', '#6B8A5C', '#4F6F4A', '#9A8F63']
export const NDVI_STOPS = ['#a4472f', '#d49a1f', '#e6d26b', '#a9c46a', '#5f9a52', '#2d6b3d']
export const ndviColor = (v: number) => NDVI_STOPS[Math.max(0, Math.min(5, Math.floor(v * 6.5)))]

interface Props {
  center: { lat: number; lon: number }; polygon: Pt[]; onChange?: (p: Pt[]) => void; drawing?: boolean
  layer?: 'vision' | 'ndvi'; ndvi?: number; className?: string; label?: string; markers?: { x: number; y: number; id: string; selected?: boolean; onClick: () => void; name: string }[]
}
export function SatMap({ center, polygon, onChange, drawing, layer = 'vision', ndvi = 0.6, className = '', label = 'MAPA DE DEMOSTRACIÓN', markers }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const seed = Math.floor(Math.abs(center.lat * 1000 + center.lon * 777)) + 7
  const patches = useMemo(() => {
    const r = rng(seed), out: { x: number; y: number; w: number; h: number; c: string; rot: number }[] = []
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) out.push({ x: gx * 20, y: gy * 20, w: 20, h: 20, c: FIELD[Math.floor(r() * FIELD.length)], rot: r() > 0.5 ? 0 : 90 })
    return out
  }, [seed])
  const cells = useMemo(() => {
    const r = rng(seed + 3), out: { x: number; y: number; v: number }[] = []
    for (let gy = 0; gy < 20; gy++) for (let gx = 0; gx < 20; gx++) {
      const base = ndvi + Math.sin(gx / 2.6) * 0.1 + Math.cos(gy / 3.1) * 0.08 + (r() - 0.5) * 0.14
      out.push({ x: gx * 5, y: gy * 5, v: Math.max(0.05, Math.min(0.95, base)) })
    }
    return out
  }, [seed, ndvi])
  const pts = polygon.map((p) => `${p.x},${p.y}`).join(' ')
  const toPt = (e: React.PointerEvent): Pt => {
    const svg = ref.current!, m = svg.getScreenCTM()!.inverse(), p = svg.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(m)
    return { x: Math.max(1, Math.min(99, +q.x.toFixed(1))), y: Math.max(1, Math.min(99, +q.y.toFixed(1))) }
  }
  const editable = !!onChange
  return (
    <div className={`relative overflow-hidden bg-[#6B8A5C] ${className}`}>
      <svg ref={ref} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full block" style={{ touchAction: editable ? 'none' : 'auto' }}
        role="img" aria-label="Mapa satelital de demostración"
        onPointerDown={(e) => { if (drawing && onChange) onChange([...polygon, toPt(e)]) }}
        onPointerMove={(e) => { if (drag !== null && onChange) onChange(polygon.map((p, i) => (i === drag ? toPt(e) : p))) }}
        onPointerUp={() => setDrag(null)}>
        <defs>
          <pattern id="rowsA" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 1H2" stroke="#000" strokeOpacity=".09" strokeWidth=".5" /></pattern>
          <clipPath id="poly"><polygon points={pts} /></clipPath>
        </defs>
        {patches.map((p, i) => (<g key={i}><rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.c} />
          <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="url(#rowsA)" transform={p.rot ? `rotate(90 ${p.x + 10} ${p.y + 10})` : undefined} /></g>))}
        <path d="M0 82 C25 74 45 90 70 80 S95 72 100 76" stroke="#E8D9BF" strokeWidth="1.6" fill="none" opacity=".85" />
        <path d="M80 0 C78 25 88 40 84 62 S92 90 90 100" stroke="#6E9BA3" strokeWidth="2.2" fill="none" opacity=".8" />
        {layer === 'ndvi' && polygon.length > 2 && (
          <g clipPath="url(#poly)">{cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width="5.05" height="5.05" fill={ndviColor(c.v)} opacity=".92" />)}</g>
        )}
        {polygon.length > 2 && <polygon points={pts} fill={layer === 'ndvi' ? 'none' : '#E6B44D'} fillOpacity=".22" stroke="#FFFCF6" strokeWidth="1.1" strokeLinejoin="round" />}
        {polygon.length === 2 && <polyline points={pts} stroke="#FFFCF6" strokeWidth="1.1" fill="none" />}
        {editable && polygon.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#E6B44D" stroke="#FFFCF6" strokeWidth="1" style={{ cursor: 'grab' }}
            onPointerDown={(e) => { e.stopPropagation(); if (!drawing) { (e.target as Element).setPointerCapture(e.pointerId); setDrag(i) } }} />
        ))}
        {markers?.map((m) => (
          <g key={m.id} onClick={m.onClick} style={{ cursor: 'pointer' }} role="button" aria-label={m.name}>
            <circle cx={m.x} cy={m.y} r="6" fill={m.selected ? '#E6B44D' : '#174C38'} stroke="#FFFCF6" strokeWidth="1.2" />
            <circle cx={m.x} cy={m.y} r="2" fill="#FFFCF6" /></g>
        ))}
      </svg>
      <span className="absolute left-3 top-3 rounded-full bg-graphite/80 text-warm text-[12px] font-extrabold tracking-wide px-2.5 py-1.5">{label}</span>
      <span className="absolute right-3 bottom-3 rounded-full bg-graphite/70 text-warm text-[12px] font-bold px-2 py-1">8 m por unidad · 800 m</span>
    </div>
  )
}
export function NdviLegend() {
  return (
    <div>
      <div className="flex h-3.5 rounded-full overflow-hidden">{NDVI_STOPS.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
      <div className="flex justify-between text-[13px] font-bold mt-1 text-graphite/75"><span>Poca vegetación</span><span>Vigorosa</span></div>
    </div>
  )
}
