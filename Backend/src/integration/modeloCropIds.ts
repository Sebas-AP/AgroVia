// Crosswalk between the Backend's cropCatalog ids (Backend/src/seed/cropCatalog.seed.ts) and
// Modelo's INIFAP catalogue ids (Modelo/datasets/cultivos_inifap.json) — the two were seeded
// independently and use different naming conventions (English-ish short ids vs. Spanish INIFAP
// names), confirmed by listing Modelo's actual catalogue (`load_crops().keys()`).
//
// Only the 4 crops in the Backend's seed catalog are mapped. A crop with no entry here has its
// modelSuccess criterion omitted (an info gap, not an error) rather than guessing a Modelo id.
const BACKEND_TO_MODELO_CROP_ID: Record<string, string> = {
  corn: 'maiz_grano',
  beans: 'frijol_pinto',
  'forage-oats': 'avena_forrajera',
  'forage-sorghum': 'sorgo_forrajero',
}

export function toModeloCropId(backendCropId: string): string | null {
  return BACKEND_TO_MODELO_CROP_ID[backendCropId] ?? null
}
