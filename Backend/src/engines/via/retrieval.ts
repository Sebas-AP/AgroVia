import type { ModeloClient } from '../../integration/modeloClient'
import type { CultivoInfo } from '../../integration/modeloTypes'

// Simple RAG for VÍA's AI polisher: no embeddings or vector store — the real INIFAP crop
// catalog (Modelo/datasets/cultivos_inifap.json, served live via GET /api/v1/cultivos) is small
// enough to keep in memory and match by keyword. Retrieval only ever returns text that is
// already in that dataset; it never generates or guesses agronomic facts.
// Caches only a successful, non-empty catalog — Modelo's free-tier cold starts (or a transient
// network error) must not poison this cache with [] for the rest of the process's lifetime.
let catalogCache: CultivoInfo[] | null = null
async function loadCatalog(client: ModeloClient): Promise<CultivoInfo[]> {
  if (catalogCache) {
    return catalogCache
  }
  try {
    const catalog = await client.cultivos()
    if (catalog.length > 0) {
      catalogCache = catalog
    }
    return catalog
  } catch {
    return []
  }
}

export async function retrieveCropNotes(
  client: ModeloClient, question: string, currentCrop?: string,
): Promise<string> {
  const catalog = await loadCatalog(client)
  if (catalog.length === 0) {
    return ''
  }
  const normalized = question
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const matches = catalog.filter((crop) =>
    normalized.includes(crop.nombre.toLowerCase().split(' ')[0])
    || normalized.includes(crop.cultivo_id.replace(/_/g, ' '))
    || crop.cultivo_id === currentCrop,
  )
  const picks = matches.length > 0 ? matches : catalog.slice(0, 3)
  const result = picks
    .map((crop) => `${crop.nombre} (ciclo ${crop.duracion_ciclo_dias.join('-')} días, ${crop.modalidad_recomendada.join('/')}): ${crop.notas_tecnicas}`)
    .join('\n')
  console.warn(`[via-rag] catalog=${catalog.length} picks=${picks.length} contextLen=${result.length}`)
  return result
}
