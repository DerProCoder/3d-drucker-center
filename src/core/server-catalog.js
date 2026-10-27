// Server-Hardware aus dem Server-Shop (PC-App): Serverschränke für die zweite Etage und Geräte zum Einbauen.
// Alles wird wie Regale als Karton geliefert (economy.furniture, kind unterscheidet die Arten).
//   units: Höheneinheiten (HE) – im Schrank so viele Plätze, bei Geräten so viele belegt
//   ports: Netzwerkanschlüsse hinten · series: Kategorie eines Servers (SERVER_SERIES) · income: Einnahmen pro Spielstunde, solange der Server online ist
//   power: Strom pro Spielstunde in Euro, solange das Gerät im Schrank steckt
// Firewall: Port 1 ist WAN (zum Patchpanel, also ins Internet), die übrigen sind LAN (zu Switches und Servern).

// Kabelführung hinten im Schrank: links und rechts eine Leiste mit einem Clip alle clipEvery HE
export const CABLE_CLIP_EVERY = 2;

export const SERVER_RACKS = [
  { id: 'rack-12', kind: 'rack', name: 'Wandschrank 12 HE', units: 12, price: 350, color: 0x474d57 },
  { id: 'rack-24', kind: 'rack', name: 'Serverschrank 24 HE', units: 24, price: 800, color: 0x3d434c },
  { id: 'rack-42', kind: 'rack', name: 'Serverschrank 42 HE', units: 42, price: 1500, color: 0x343941 },
].map((r) => ({ ...r, clipEvery: CABLE_CLIP_EVERY }));

// Server-Kategorien (Baureihen): im Shop je ein eigener Abschnitt, color färbt die Frontplatte (wird unten an die
// Server der Kategorie weitergegeben, damit models/ den Katalog nicht kennen muss)
export const SERVER_SERIES = [
  { id: 'standard', name: 'Standard' },
  { id: 'system-x', name: 'System X', color: 0xf2c419 },
];

export const SERVER_DEVICES = [
  { id: 'server-1u', kind: 'server', series: 'standard', name: 'Mini-Server', units: 1, ports: 1, income: 12, power: 1.2, price: 600 },
  { id: 'server-2u', kind: 'server', series: 'standard', name: 'Server', units: 2, ports: 2, income: 30, power: 2.5, price: 1400 },
  { id: 'server-gpu', kind: 'server', series: 'standard', name: 'GPU-Server', units: 4, ports: 2, income: 85, power: 7, price: 4200 },
  { id: 'systemx-s', kind: 'server', series: 'system-x', name: 'System X S', units: 1, ports: 2, income: 16, power: 1.5, price: 850 },
  { id: 'systemx-l', kind: 'server', series: 'system-x', name: 'System X L', units: 2, ports: 2, income: 40, power: 3.2, price: 2000 },
  { id: 'switch-8', kind: 'switch', name: 'Switch 8 Ports', units: 1, ports: 8, power: 0.2, price: 150 },
  { id: 'switch-24', kind: 'switch', name: 'Switch 24 Ports', units: 1, ports: 24, power: 0.4, price: 450 },
  { id: 'firewall', kind: 'firewall', name: 'Firewall', units: 1, ports: 4, power: 0.3, price: 500 },
  { id: 'patch-12', kind: 'patch', name: 'Patchpanel 12 Ports', units: 1, ports: 12, power: 0, price: 80 },
  { id: 'patch-24', kind: 'patch', name: 'Patchpanel 24 Ports', units: 1, ports: 24, power: 0, price: 140 },
].map((d) => ({ ...d, color: SERVER_SERIES.find((s) => s.id === d.series)?.color }));

// Netzwerkkabel kommt als Rolle und landet direkt im Kabelvorrat (kein Karton). Jede Verbindung schneidet so viel ab,
// wie sie lang ist (core/servers.js, cableLength).
export const CABLE_ROLL = { id: 'cable-roll', name: 'Kabelrolle 100 m', meters: 100, price: 80 };
export const UNIT_METERS = 0.0445; // eine Höheneinheit in Metern (für die Kabellänge)

export const SERVER_HARDWARE = [...SERVER_RACKS, ...SERVER_DEVICES];
export const serverHardwareById = (id) => SERVER_HARDWARE.find((h) => h.id === id);
export const isServerHardware = (type) => !!type?.kind && SERVER_HARDWARE.includes(type);

export const KIND_NAMES = { rack: 'Serverschrank', server: 'Server', switch: 'Switch', firewall: 'Firewall', patch: 'Patchpanel' };

// Name eines Ports, wie er im Schrankfenster steht
export function portName(type, port) {
  if (type.kind === 'firewall') return port === 0 ? 'WAN' : `LAN ${port}`;
  return `${port + 1}`;
}
