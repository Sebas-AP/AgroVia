export type DataMode = 'real' | 'simulated'

// Real providers are the default whenever a Modelo base URL is configured. Simulated data is
// now an explicit opt-in: either set USE_SIMULATED_PROVIDERS=true on purpose for a demo, or
// leave MODELO_BASE_URL unset (the service starts and says so on /health, it never pretends).
export function resolveDataMode(env: NodeJS.ProcessEnv = process.env): DataMode {
  if (env.USE_SIMULATED_PROVIDERS === 'true') {
    return 'simulated'
  }
  return env.MODELO_BASE_URL ? 'real' : 'simulated'
}

// Returns the reason a deployment is running on simulated data, or null when it is configured
// for real data. Logged once at startup instead of failing hard, so a local checkout without the
// Modelo service still boots for UI work.
export function simulatedModeWarning(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.USE_SIMULATED_PROVIDERS === 'true') {
    return 'USE_SIMULATED_PROVIDERS=true: every provider is simulated. Do not present this as real data.'
  }
  if (!env.MODELO_BASE_URL) {
    return 'MODELO_BASE_URL is not set: falling back to simulated providers. Set MODELO_BASE_URL for real data.'
  }
  return null
}
