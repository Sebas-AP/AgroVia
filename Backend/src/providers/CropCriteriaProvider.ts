import type { Firestore } from 'firebase-admin/firestore'
import { COLLECTIONS } from '../firestore/collections'
import type { CropCatalogEntry } from '../types/firestoreDocs'

export class CropCriteriaProvider {
  constructor(private readonly db: Firestore) {}

  async getCriteria(cropId: string): Promise<CropCatalogEntry | null> {
    const doc = await this.db.collection(COLLECTIONS.cropCatalog).doc(cropId).get()
    if (!doc.exists) {
      return null
    }
    return doc.data() as CropCatalogEntry
  }
}
