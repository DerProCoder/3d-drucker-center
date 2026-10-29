// Server-Hardware aus dem Server-Shop (PC-App): Serverschränke für die zweite Etage und Geräte zum Einbauen.
// Alles wird wie Regale als Karton geliefert (economy.furniture, kind unterscheidet die Arten).
//   units: Höheneinheiten (HE) – im Schrank so viele Plätze, bei Geräten so viele belegt
//   ports: Netzwerkanschlüsse hinten · series: Kategorie eines Servers (SERVER_SERIES)
//   ram/cores: Standardausstattung eines Servers beim Kauf (SERVER_RAM GB, SERVER_CORES Cores). Was ein Server
//              wirklich hat, ergibt sich aus seinen eingebauten Teilen (core/server-parts.js, servers.capacityOf)
//   slotSet: Steckplatz-Satz für die Bauteile (core/server-parts.js SLOT_SETS): 'server' frei auf- und abrüstbar,
//            'gpu' (GPU- und KI-GPU-Server) nur defekte Teile tauschen, 'nas-s'/'nas-l' NAS mit fester 32-Core-CPU
//   nas: true – Netzwerkspeicher (#46, core/nas.js) mit bays Festplatten-Schächten vorn; storage (GB Speicher beim
//        Kauf) und maxRam (GB) nur als Datenblatt-Werte, wirklich zählt die Ausstattung aus den Teilen
//   rentFactor: Mietpreis-Faktor des Modells, die Miete jeder VM darauf wird damit malgenommen (core/server-rentals.js)
//   power: Strom pro Spielstunde in Euro, solange das Gerät im Schrank steckt
//   drives: 'small' – Server mit 2,5-Zoll-Laufwerken hochkant (Frontblende), sonst je nach Größe
//   gpu: Frontblende mit großem Lüftergitter und GPU-Leuchten (models/server-textures.js)
//   rentable: false – nicht an Kunden vermietbar (KI-GPU-Server rechnen für die eigene KI, core/ai-service.js); hat
//             dann keinen rentFactor
// Firewall: Port 1 ist WAN (ins Internet: zu einem Patchpanel mit Leitung zum Internet-Anschluss an der Wand oder direkt dorthin), die übrigen sind LAN (zu Switches und Servern).
//   ports zählt alle Buchsen (WAN + LAN), portsLabel ist die Portzahl aus dem Namen, die vorn aufgedruckt ist:
//   „Firewall 4 Ports“ hat 1 × WAN + 3 × LAN, „Firewall 8 Ports“ 1 × WAN + 8 × LAN (dort meint die 8 die LAN-Ports)

// Kabelführung hinten im Schrank: links und rechts eine Leiste mit einem Clip alle clipEvery HE
export const CABLE_CLIP_EVERY = 2;

export const SERVER_RACKS = [
  { id: 'rack-12', kind: 'rack', name: 'Wandschrank 12 HE', units: 12, price: 350, color: 0x474d57 },
  { id: 'rack-24', kind: 'rack', name: 'Serverschrank 24 HE', units: 24, price: 800, color: 0x3d434c },
  { id: 'rack-42', kind: 'rack', name: 'Serverschrank 42 HE', units: 42, price: 1500, color: 0x343941 },
].map((r) => ({ ...r, clipEvery: CABLE_CLIP_EVERY }));

// Standardausstattung jedes Servers beim Kauf (2 × 32-Core-CPU, 8 × 64 GB RAM): Die VMs darauf dürfen zusammen nicht
// mehr RAM (GB) und Cores belegen, als der Server hat. Auf- und abrüsten über die Bauteile (core/server-parts.js)
export const SERVER_RAM = 512;
export const SERVER_CORES = 64;

// Server-Kategorien (Baureihen): im Shop je ein eigener Abschnitt, color färbt die Frontplatte (wird unten an die
// Server der Kategorie weitergegeben, damit models/ den Katalog nicht kennen muss)
export const SERVER_SERIES = [
  { id: 'standard', name: 'Standard' },
  { id: 'system-x', name: 'System X', color: 0xf2c419 },
  { id: 'risc', name: 'RISC', color: 0x10204a }, // sparsam: wenig Strom für die Miete, dafür teurer
  { id: 'ai', name: 'KI', color: 0x23a455 }, // nicht vermietbar: rechnen für die eigene KI (KI-Abo, core/ai-service.js)
  // Netzwerkspeicher (#46): helles Orange, heller als die orange Reihe „Private Server“ (#ff8a1f) im Serverraum
  { id: 'nas', name: 'NAS', color: 0xffb366 },
];

export const SERVER_DEVICES = [
  { id: 'server-1u', kind: 'server', series: 'standard', name: 'Mini-Server', units: 1, ports: 1, rentFactor: 1.0, power: 1.2, price: 600 },
  { id: 'server-2u', kind: 'server', series: 'standard', name: 'Server', units: 2, ports: 2, rentFactor: 1.3, power: 2.5, price: 1400 },
  { id: 'server-gpu', kind: 'server', series: 'standard', name: 'GPU-Server', units: 4, ports: 2, rentFactor: 2.5, power: 7, price: 4200, gpu: true },
  { id: 'systemx-s', kind: 'server', series: 'system-x', name: 'System X S', units: 1, ports: 2, rentFactor: 1.5, power: 1.5, price: 850 },
  { id: 'systemx-l', kind: 'server', series: 'system-x', name: 'System X L', units: 2, ports: 2, rentFactor: 1.5, power: 3.2, price: 2000 },
  { id: 'risc-s', kind: 'server', series: 'risc', name: 'RISC S', units: 1, ports: 2, rentFactor: 1.7, power: 0.8, price: 1100, drives: 'small' },
  { id: 'risc-l', kind: 'server', series: 'risc', name: 'RISC L', units: 2, ports: 2, rentFactor: 1.7, power: 1.8, price: 2700, drives: 'small' },
  // id wie AI_SERVER_ID in core/ai-service.js
  { id: 'server-ai', kind: 'server', series: 'ai', name: 'KI-GPU-Server', units: 4, ports: 2, rentable: false, power: 10, price: 17000, gpu: true },
  // NAS (#46): immer 32 Cores, beim Kauf 256 GB RAM und eine 512-GB-Platte; Strom + 0,05 € je Platte (core/server-parts.js)
  { id: 'nas-s', kind: 'server', series: 'nas', name: 'NAS S', units: 2, ports: 2, rentFactor: 1.2, power: 1.5, price: 3000, slotSet: 'nas-s', nas: true, bays: 4, cores: 32, ram: 256, storage: 512, maxRam: 512 },
  { id: 'nas-l', kind: 'server', series: 'nas', name: 'NAS L', units: 4, ports: 2, rentFactor: 1.2, power: 3, price: 7500, slotSet: 'nas-l', nas: true, bays: 12, cores: 32, ram: 256, storage: 512, maxRam: 1024 },
  { id: 'switch-8', kind: 'switch', name: 'Switch 8 Ports', units: 1, ports: 8, power: 0.2, price: 150 },
  { id: 'switch-24', kind: 'switch', name: 'Switch 24 Ports', units: 1, ports: 24, power: 0.4, price: 450 },
  { id: 'firewall', kind: 'firewall', name: 'Firewall 4 Ports', units: 1, ports: 4, portsLabel: 4, power: 0.3, price: 500 }, // id bleibt (alte Spielstände)
  { id: 'firewall-8', kind: 'firewall', name: 'Firewall 8 Ports', units: 1, ports: 9, portsLabel: 8, power: 0.45, price: 900 },
  { id: 'patch-12', kind: 'patch', name: 'Patchpanel 12 Ports', units: 1, ports: 12, power: 0, price: 80 },
  { id: 'patch-24', kind: 'patch', name: 'Patchpanel 24 Ports', units: 1, ports: 24, power: 0, price: 140 },
].map((d) => ({
  ...d,
  color: SERVER_SERIES.find((s) => s.id === d.series)?.color,
  ...(d.kind === 'server' ? { ram: d.ram ?? SERVER_RAM, cores: d.cores ?? SERVER_CORES, slotSet: d.slotSet ?? (d.gpu ? 'gpu' : 'server') } : {}),
}));

// Netzwerkkabel kommt als Rolle und landet direkt im Kabelvorrat (kein Karton). Jede Verbindung schneidet so viel ab,
// wie sie lang ist (core/servers.js, cableLength).
export const CABLE_ROLL = { id: 'cable-roll', name: 'Kabelrolle 100 m', meters: 100, price: 80 };
export const UNIT_METERS = 0.0445; // eine Höheneinheit in Metern (für die Kabellänge)

export const SERVER_HARDWARE = [...SERVER_RACKS, ...SERVER_DEVICES];
export const serverHardwareById = (id) => SERVER_HARDWARE.find((h) => h.id === id);
export const isServerHardware = (type) => !!type?.kind && SERVER_HARDWARE.includes(type);
// Ob Kunden VMs auf diesem Gerätetyp mieten können (alle Server außer den KI-GPU-Servern)
export const isRentableType = (type) => type?.kind === 'server' && type.rentable !== false;

export const KIND_NAMES = { rack: 'Serverschrank', server: 'Server', switch: 'Switch', firewall: 'Firewall', patch: 'Patchpanel' };

// Name eines Ports, wie er im Schrankfenster steht
export function portName(type, port) {
  if (type.kind === 'firewall') return port === 0 ? 'WAN' : `LAN ${port}`;
  return `${port + 1}`;
}
