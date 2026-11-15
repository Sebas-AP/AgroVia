export interface Pt { x: number; y: number }
export interface ParcelEvent { id: string; date: string; type: string; note: string }
export interface Season { id: string; year: string; crop: string; yieldT: string; demo?: boolean }
export interface Parcel {
  id: string; demo: boolean; name: string; areaHa: string; terrain: string; soil: string; water: string;
  irrigation: string; crop: string; sowingDate: string; stage: string;
  center: { lat: number; lon: number }; polygon: Pt[];
  country: string; state: string; municipality: string; locality: string; altitude: string;
  events: ParcelEvent[]; seasons: Season[];
}
export interface Business {
  crop: string; area: number; seeds: number; fert: number; water: number; labor: number;
  machinery: number; transport: number; other: number; yieldT: number; price: number;
}
export interface Plan {
  createdAt: string; crop: string; area: number; invest: number; production: number;
  harvestDate: string; market: string; breakeven: number; profit: number;
}
export interface Analysis {
  happening: string[]; meaning: string; alternatives: string[]; recommendation: string; why: string;
  used: { label: string; kind: 'Registrado' | 'Demostración' }[]; confidence: { level: string; pct: number; note: string };
  missing: string[];
}
export interface Msg { id: string; role: 'user' | 'via'; text?: string; analysis?: Analysis; ts: number; error?: boolean }
