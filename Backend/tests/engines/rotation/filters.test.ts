import { describe, it, expect } from 'vitest'
import { filterCompatibleCrops } from '../../../src/engines/rotation/filters'
import type { PlotSnapshot, CropCatalogEntry } from '../../../src/types/firestoreDocs'

const basePlot: PlotSnapshot = {
  ownerUid: 'owner', name: 'plot', center: { lat: 0, lon: 0 }, areaHa: 1, mode: 'rainfed',
  currentCrop: 'corn', declaredSoilType: 'unknown', elevationM: 0, country: 'Mexico', state: '',
  municipality: '', locality: '', powerCellId: '', gpmCellId: '', smapCellId: '',
  priorities: { water: 0, income: 0, forage: 0, nitrogen: 0, erosion: 0, organicMatter: 0, market: 0 },
  constraints: { waterAvailability: 'low', equipment: [] }, origin: 'demo',
  createdAt: '', updatedAt: '',
}

function crop(id: string, droughtTolerance: CropCatalogEntry['droughtTolerance']): CropCatalogEntry {
  return {
    id, name: id, cycleDays: 100, baseTempC: 10, optimalTempC: 20, maxTempC: 30, waterRequiredMm: 400,
    fixesNitrogen: false, rootDepthCm: 50, organicMatterContribution: 'medium', pestRisk: [],
    plantingWindow: { start: '06-01', end: '07-01' }, droughtTolerance, source: 'test', reference: 'test',
    criterionType: 'assumed',
  }
}

describe('filterCompatibleCrops', () => {
  it('excludes a drought-intolerant crop when water availability is low', () => {
    const catalog = [crop('thirsty-crop', 'low'), crop('hardy-crop', 'high')]
    const result = filterCompatibleCrops(basePlot, catalog)
    expect(result.map((c) => c.id)).toEqual(['hardy-crop'])
  })

  it('keeps every crop when water availability is high', () => {
    const plot = { ...basePlot, constraints: { ...basePlot.constraints, waterAvailability: 'high' as const } }
    const catalog = [crop('thirsty-crop', 'low'), crop('hardy-crop', 'high')]
    const result = filterCompatibleCrops(plot, catalog)
    expect(result).toHaveLength(2)
  })
})
