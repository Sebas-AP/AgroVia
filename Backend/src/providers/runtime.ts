import { resolveDataMode, simulatedModeWarning, type DataMode } from '../config/dataMode'
import { ModeloClient } from '../integration/modeloClient'
import { ModeloClimateProvider, SimulatedClimateProvider, type ClimateProvider } from './ClimateProvider'
import { PowerSoilMoistureProvider, SimulatedSoilMoistureProvider, type SoilMoistureProvider } from './SoilMoistureProvider'
import { ModeloNdviProvider, SimulatedNdviProvider, type NdviProvider } from './NdviProvider'
import { ModeloPricesProvider } from './ModeloPricesProvider'
import { SimulatedPricesProvider, type PricesProvider } from './PricesProvider'

export interface RuntimeProviders {
  dataMode: DataMode
  // Null in simulated mode. The rotations route uses it for Modelo success predictions.
  modeloClient: ModeloClient | null
  climate: ClimateProvider
  soilMoisture: SoilMoistureProvider
  ndvi: NdviProvider
  prices: PricesProvider
}

// One wiring decision for every route: climate, soil moisture, NDVI and prices all switch
// together, so a deployment cannot accidentally serve real climate next to simulated prices.
export function createRuntimeProviders(env: NodeJS.ProcessEnv = process.env): RuntimeProviders {
  const dataMode = resolveDataMode(env)
  const modeloClient = dataMode === 'real'
    ? new ModeloClient({ baseUrl: env.MODELO_BASE_URL as string })
    : null

  if (modeloClient) {
    const climate = new ModeloClimateProvider(modeloClient)
    return {
      dataMode,
      modeloClient,
      climate,
      // Reuses the same climate provider and therefore the same real NASA POWER window.
      soilMoisture: new PowerSoilMoistureProvider(climate),
      ndvi: new ModeloNdviProvider(modeloClient),
      prices: new ModeloPricesProvider(modeloClient),
    }
  }

  return {
    dataMode,
    modeloClient: null,
    climate: new SimulatedClimateProvider(),
    soilMoisture: new SimulatedSoilMoistureProvider(),
    ndvi: new SimulatedNdviProvider(),
    prices: new SimulatedPricesProvider(),
  }
}

const warning = simulatedModeWarning()
if (warning && process.env.NODE_ENV !== 'test') {
  console.warn(`[agrovia] ${warning}`)
}

export const runtimeProviders = createRuntimeProviders()
