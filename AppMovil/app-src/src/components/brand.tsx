export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="14" fill="#174C38" />
      <path d="M6 36 C16 28 32 28 42 36" stroke="#6D9872" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M9 41 C18 34 30 34 39 41" stroke="#DCE8CF" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M11 24 A14 14 0 0 1 37 20" stroke="#F5EFDF" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="1 5" />
      <circle cx="35" cy="14" r="4.5" fill="#E6B44D" />
    </svg>
  )
}
export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className={`text-xl font-extrabold tracking-wide ${light ? 'text-warm' : 'text-forest'}`}>AGROVÍA</span>
    </div>
  )
}
// VÍA: una hoja que dibuja un camino (vía) y una órbita satelital.
export function ViaAvatar({ size = 44, active }: { size?: number; active?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {active && <span className="absolute inset-0 rounded-full bg-natural" style={{ animation: 'pulse-ring 1.4s infinite' }} />}
      <svg viewBox="0 0 64 64" width={size} height={size} className="relative" role="img" aria-label="VÍA">
        <circle cx="32" cy="32" r="32" fill="#174C38" />
        <path d="M32 52 C15 45 13 26 32 11 C51 26 49 45 32 52Z" fill="#DCE8CF" />
        <path d="M32 49 C29 39 33 29 32 18" stroke="#174C38" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M31.5 40 C27 38 25 35 24 31 M32.5 33 C37 31 39 28 40 25" stroke="#6D9872" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M7 38 A26 26 0 0 1 20 9" stroke="#E6B44D" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="20" cy="9" r="3.2" fill="#E6B44D" />
      </svg>
    </span>
  )
}
