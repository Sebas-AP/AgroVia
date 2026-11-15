import type { Firestore } from 'firebase-admin/firestore'
import { COLLECTIONS } from '../firestore/collections'
import { computeCellId } from '../firestore/cellId'
import type { PlotSnapshot } from '../types/firestoreDocs'

export const DEMO_PLOT_ID = 'demo-guadalupe-victoria'

const CENTER = { lat: 24.4497, lon: -104.1225 }

export async function seedDemoPlot(db: Firestore): Promise<void> {
  const now = new Date().toISOString()
  const plot: PlotSnapshot = {
    ownerUid: 'demo-owner',
    name: 'Guadalupe Victoria demo plot',
    center: CENTER,
    areaHa: 9.6,
    mode: 'rainfed',
    currentCrop: 'corn',
    declaredSoilType: 'unknown',
    elevationM: 2000,
    country: 'Mexico',
    state: 'Durango',
    municipality: 'Guadalupe Victoria',
    locality: 'Guadalupe Victoria',
    powerCellId: computeCellId(CENTER.lat, CENTER.lon, 'power'),
    gpmCellId: computeCellId(CENTER.lat, CENTER.lon, 'gpm'),
    smapCellId: computeCellId(CENTER.lat, CENTER.lon, 'smap'),
    priorities: { water: 3, income: 3, forage: 2, nitrogen: 2, erosion: 2, organicMatter: 2, market: 2 },
    constraints: { waterAvailability: 'low', equipment: [] },
    origin: 'demo',
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.plots).doc(DEMO_PLOT_ID).set(plot)

  const seasons = [
    { id: '2024', year: 2024, crop: 'beans', origin: 'demo' },
    { id: '2025', year: 2025, crop: 'corn', origin: 'demo' },
  ]
  const batch = db.batch()
  for (const season of seasons) {
    const { id, ...data } = season
    batch.set(db.collection(COLLECTIONS.plotSeasons(DEMO_PLOT_ID)).doc(id), data)
  }
  await batch.commit()
}
