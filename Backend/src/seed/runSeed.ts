import { getAdminFirestore } from '../firestore/admin'
import { seedCropCatalog } from './cropCatalog.seed'
import { seedDemoPlot } from './demoPlot.seed'

async function main(): Promise<void> {
  const db = getAdminFirestore()
  await seedCropCatalog(db)
  await seedDemoPlot(db)
  console.log('Seed complete: cropCatalog (4 crops), demo plot with 2 seasons.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exitCode = 1
})
