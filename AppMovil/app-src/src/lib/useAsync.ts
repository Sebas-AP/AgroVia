import { useCallback, useEffect, useState } from 'react'
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [s, set] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    set((p) => ({ ...p, loading: true, error: null }))
    fn().then((data) => alive && set({ data, loading: false, error: null }))
      .catch((e: Error) => alive && set({ data: null, loading: false, error: e.message || 'Error desconocido' }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...s, reload }
}
