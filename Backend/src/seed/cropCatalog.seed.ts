import type { Firestore } from 'firebase-admin/firestore'
import { COLLECTIONS } from '../firestore/collections'
import type { CropCatalogEntry } from '../types/firestoreDocs'

const CROPS: CropCatalogEntry[] = [
  {
    id: 'corn',
    name: 'Grain corn',
    cycleDays: 120,
    baseTempC: 10,
    optimalTempC: 25,
    maxTempC: 35,
    waterRequiredMm: 500,
    fixesNitrogen: false,
    rootDepthCm: 100,
    organicMatterContribution: 'medium',
    pestRisk: ['fall armyworm', 'corn earworm'],
    plantingWindow: { start: '06-01', end: '07-15' },
    droughtTolerance: 'low',
    source: 'INIFAP',
    reference: 'INIFAP regional corn production guide, Durango',
    criterionType: 'documented',
  },
  {
    id: 'beans',
    name: 'Beans',
    cycleDays: 90,
    baseTempC: 10,
    optimalTempC: 22,
    maxTempC: 32,
    waterRequiredMm: 300,
    fixesNitrogen: true,
    rootDepthCm: 60,
    organicMatterContribution: 'high',
    pestRisk: ['bean weevil', 'whitefly'],
    plantingWindow: { start: '06-15', end: '07-31' },
    droughtTolerance: 'medium',
    source: 'INIFAP',
    reference: 'INIFAP regional bean production guide, Durango',
    criterionType: 'documented',
  },
  {
    id: 'forage-oats',
    name: 'Forage oats',
    cycleDays: 100,
    baseTempC: 5,
    optimalTempC: 18,
    maxTempC: 28,
    waterRequiredMm: 350,
    fixesNitrogen: false,
    rootDepthCm: 70,
    organicMatterContribution: 'medium',
    pestRisk: ['aphids'],
    plantingWindow: { start: '08-01', end: '09-15' },
    droughtTolerance: 'medium',
    source: 'FAO',
    reference: 'FAO GAEZ v5 crop suitability data, oats',
    criterionType: 'documented',
  },
  {
    id: 'forage-sorghum',
    name: 'Forage sorghum',
    cycleDays: 110,
    baseTempC: 12,
    optimalTempC: 28,
    maxTempC: 38,
    waterRequiredMm: 400,
    fixesNitrogen: false,
    rootDepthCm: 120,
    organicMatterContribution: 'medium',
    pestRisk: ['sorghum midge'],
    plantingWindow: { start: '06-01', end: '07-15' },
    droughtTolerance: 'high',
    source: 'none found',
    reference: 'No INIFAP/FAO/GAEZ figure found for this zone during this build; review before relying on it',
    criterionType: 'assumed',
  },
]

export async function seedCropCatalog(db: Firestore): Promise<void> {
  const batch = db.batch()
  for (const crop of CROPS) {
    batch.set(db.collection(COLLECTIONS.cropCatalog).doc(crop.id), crop)
  }
  await batch.commit()
}
