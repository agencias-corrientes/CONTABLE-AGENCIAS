export const OFFICIAL_AGENCY_GAME_CATALOG = [
  { name: "Quiniela Correntina", category: "Quiniela", sortOrder: 10, enabledByDefault: true, type: "regular" },
  { name: "Quiniela Al Toque", category: "Quiniela", sortOrder: 20, enabledByDefault: true, type: "regular" },
  { name: "Quiniela Poceada Correntina", category: "Poceada", sortOrder: 30, enabledByDefault: true, type: "regular" },
  { name: "Loto Plus", category: "Otros juegos", sortOrder: 40, enabledByDefault: true, type: "regular" },
  { name: "Loto 5 Plus", category: "Otros juegos", sortOrder: 50, enabledByDefault: true, type: "regular" },
  { name: "Quini 6", category: "Otros juegos", sortOrder: 60, enabledByDefault: true, type: "regular" },
  { name: "Brinco", category: "Otros juegos", sortOrder: 70, enabledByDefault: true, type: "regular" },
  { name: "Telekino", category: "Otros juegos", sortOrder: 80, enabledByDefault: true, type: "regular" },
  { name: "Quiniela Poceada Extra", category: "Poceada", sortOrder: 130, enabledByDefault: false, type: "special" },
  { name: "Quiniela Poceada Navidad", category: "Poceada", sortOrder: 140, enabledByDefault: false, type: "special" },
  { name: "Loto Plus Extra", category: "Otros juegos", sortOrder: 150, enabledByDefault: false, type: "special" },
] as const;

export type OfficialAgencyGame = (typeof OFFICIAL_AGENCY_GAME_CATALOG)[number];

export function getOfficialAgencyGame(name: string): OfficialAgencyGame | undefined {
  const normalized = name.trim().toLocaleLowerCase("es-AR");
  return OFFICIAL_AGENCY_GAME_CATALOG.find((game) => game.name.toLocaleLowerCase("es-AR") === normalized);
}
