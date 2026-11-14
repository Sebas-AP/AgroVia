export function isBareSoil(ndvi: number, qualityOk: boolean, ndviCoverThreshold: number): boolean | null {
  if (!qualityOk) {
    return null
  }
  return ndvi < ndviCoverThreshold
}
