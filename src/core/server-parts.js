// Server aus Bauteilen: Jeder Server besteht aus Teilen in Steckplätzen (Mainboard, CPUs, RAM-Riegel, Netzteil,
// Lüfter …). Aus den eingebauten Teilen ergeben sich Cores und RAM (Platz für VMs, core/server-rentals.js) und der
// Strom (power des Modells × Cores / Standard-Cores, mindestens die Hälfte). Man kann aufrüsten (bis 128 Cores /
// 1024 GB), abrüsten (nur so weit, wie die VMs darauf noch Platz haben) und defekte Teile tauschen.
//
// Teilearten (PART_KINDS) und Steckplatz-Sätze je Modell (SLOT_SETS, Modell → slotSet in core/server-catalog.js) sind
// erweiterbar, z. B. für die NAS (#46: Teileart Festplatte, Sätze 'nas-s'/'nas-l' mit fester CPU, RAM-Maximum und
// Festplatten-Schächten; Speicher, Einsetzen und Herausnehmen der Platten im Schrank in core/nas.js).
//   layout:   Steckplatz-Satz wie im 3D-Modul (models/server-parts.js): { cpus, ram, fans, bays }
//   slots:    Steckplätze je Teileart (aus layout, slotsFromLayout: board, cpu, ram, psu, fan, disk)
//   required: so viele Teile je Art braucht der Server mindestens, sonst ist er „unvollständig“ und offline
//   standard: Ausstattung beim Kauf (Teile-IDs je Art, von Steckplatz 0 an)
//   locked:   Teilearten, die sich nicht auf- oder abrüsten lassen – ein defektes Teil darf nur gegen dasselbe Teil
//             der Standardausstattung getauscht werden (GPU- und KI-GPU-Server: alle Arten, NAS: die CPU)
//   allowed:  erlaubte Teile je Art (fehlt eine Art, passt jedes Teil dieser Art)
//   max:      Höchstwerte der Summen (cores, ram, …), z. B. höchstens 1024 GB RAM
//
// Ausstattung je Gerät (Map Geräte-ID → { slots: { Art: [Teile-ID | null, …] }, broken: Set der Steckplatz-IDs }) wird beim
// ersten Zugriff mit der Standardausstattung angelegt – auch für Server aus alten Spielständen.
// Überhitzt ein Server (core/server-climate.js, Status 'broken'), geht ein bestimmtes Teil kaputt: meist ein Lüfter,
// seltener Netzteil, Mainboard, CPU oder RAM. Tauscht man es (ausbauen – das defekte Teil wird entsorgt – und ein
// Teil aus dem Teilelager einbauen), läuft der Server wieder. Die Reparatur durch den Techniker (30 % des Kaufpreises,
// climate.repair) ersetzt alle defekten Teile.
// Ausnahme Festplatten (#49): Eine defekte Platte legt die NAS nicht lahm (stopsServer) – die NAS bleibt online, ihr
// Speicher (capacity.storage) sinkt nur um die defekte Platte. Welche Speicher-Verträge dann nicht mehr passen, regelt
// core/storage-rentals.js.
// Teilelager: ausgebaute (heile) Teile und gekaufte Teile, wie der Kabelvorrat. Bestellungen kommen gesammelt als ein
// Paket nach economy.deliverySeconds (läuft in echter Zeit, advance(seconds)).
// Ohne Three.js und DOM.
import { SERVER_CORES, SERVER_RAM } from './server-catalog.js';

// Teilearten: name (Einzahl), plural, values – Werte, die die Teile dieser Art beisteuern
export const PART_KINDS = [
  { id: 'board', name: 'Mainboard', plural: 'Mainboards' },
  { id: 'cpu', name: 'CPU', plural: 'CPUs', values: ['cores'] },
  { id: 'ram', name: 'RAM-Riegel', plural: 'RAM-Riegel', values: ['ram'] },
  { id: 'psu', name: 'Netzteil', plural: 'Netzteile' },
  { id: 'fan', name: 'Lüfter', plural: 'Lüfter' },
  // Festplatten (#46) stecken nur in den Schächten der NAS (Steckplätze bay0 …); storage = Speicher in GB
  { id: 'disk', name: 'Festplatte', plural: 'Festplatten', values: ['storage'] },
];
export const partKindById = (id) => PART_KINDS.find((k) => k.id === id) ?? null;

// Teilekatalog (auch für den Teile-Shop #44): cores bzw. ram (GB) sind die Werte, die das Teil beisteuert
export const SERVER_PARTS = [
  { id: 'cpu-10', kind: 'cpu', name: 'CPU 10 Cores', cores: 10, price: 250 },
  { id: 'cpu-20', kind: 'cpu', name: 'CPU 20 Cores', cores: 20, price: 450 },
  { id: 'cpu-32', kind: 'cpu', name: 'CPU 32 Cores', cores: 32, price: 700 },
  { id: 'cpu-64', kind: 'cpu', name: 'CPU 64 Cores', cores: 64, price: 1300 },
  { id: 'ram-32', kind: 'ram', name: 'RAM 32 GB', ram: 32, price: 90 },
  { id: 'ram-64', kind: 'ram', name: 'RAM 64 GB', ram: 64, price: 170 },
  { id: 'ram-128', kind: 'ram', name: 'RAM 128 GB', ram: 128, price: 320 },
  { id: 'mainboard', kind: 'board', name: 'Mainboard', price: 400 },
  { id: 'psu', kind: 'psu', name: 'Netzteil', price: 150 },
  { id: 'fan', kind: 'fan', name: 'Lüfter', price: 25 },
  // Festplatten für die NAS (#46): storage ist der Wert für die Summen (Speicher der NAS), gb dieselbe Zahl für die
  // 3D-Modelle (models/server-parts.js createDisk, Werkbank, Teile-Shop). power: Strom je eingebauter Platte (€/h)
  ...[[512, 'Festplatte 512 GB', 60], [2048, 'Festplatte 2 TB', 150], [4096, 'Festplatte 4 TB', 260], [8192, 'Festplatte 8 TB', 450]]
    .map(([gb, name, price]) => ({ id: `disk-${gb}`, kind: 'disk', name, storage: gb, gb, power: 0.05, price })),
];
export const partById = (id) => SERVER_PARTS.find((p) => p.id === id) ?? null;
export const partsOfKind = (kind) => SERVER_PARTS.filter((p) => p.kind === kind);

// Steckplätze aus einem Steckplatz-Satz wie im 3D-Modul (models/server-parts.js): { cpus, ram, fans, bays } –
// Mainboard und Netzteil hat jeder Server genau einmal, Schächte (bays) nehmen Festplatten (Teileart 'disk', #46)
export const slotsFromLayout = ({ cpus = 2, ram = 16, fans = 2, bays = 0 } = {}) => ({
  board: 1, cpu: cpus, ram, psu: 1, fan: fans, ...(bays ? { disk: bays } : {}),
});
const ALL_KINDS = ['board', 'cpu', 'ram', 'psu', 'fan', 'disk'];
const SERVER_LAYOUT = Object.freeze({ cpus: 2, ram: 16, fans: 2, bays: 0 });
const SERVER_SLOTS = slotsFromLayout(SERVER_LAYOUT);
const SERVER_REQUIRED = { board: 1, cpu: 1, ram: 1, psu: 1, fan: 2 };
// Standardausstattung: 2 × 32 Cores, 8 × 64 GB = 64 Cores / 512 GB (wie SERVER_CORES / SERVER_RAM). Die RAM-Riegel
// verteilen sich auf beide CPUs: ram0–3 bei cpu0, ram8–11 bei cpu1 (ram0–7 gehören zu cpu0, ram8–15 zu cpu1)
const SERVER_STANDARD = {
  board: ['mainboard'], cpu: ['cpu-32', 'cpu-32'], ram: [0, 1, 2, 3, 8, 9, 10, 11].reduce((list, i) => { list[i] = 'ram-64'; return list; }, Array(16).fill(null)), psu: ['psu'], fan: ['fan', 'fan'],
};

// Steckplatz-Sätze je Modell (Name in server-catalog.js: slotSet)
export const SLOT_SETS = {
  // Normale Server: frei auf- und abrüstbar bis 128 Cores / 1024 GB
  server: { layout: SERVER_LAYOUT, slots: SERVER_SLOTS, required: SERVER_REQUIRED, standard: SERVER_STANDARD, locked: [], max: { cores: 128, ram: 1024 } },
  // GPU- und KI-GPU-Server: nur defekte Teile tauschen, nicht auf- oder abrüsten
  gpu: { layout: SERVER_LAYOUT, slots: SERVER_SLOTS, required: SERVER_REQUIRED, standard: SERVER_STANDARD, locked: ALL_KINDS, max: { cores: 128, ram: 1024 } },
  // NAS (#46): 1 CPU-Sockel mit fester 32-Core-CPU (nur gegen dieselbe tauschen, wenn sie defekt ist), RAM aufrüstbar,
  // Festplatten-Schächte (Platten sind kein Pflichtteil – ohne Platte läuft die NAS, hat aber keinen Speicher)
  'nas-s': nasSet({ ram: 4, bays: 4, maxRam: 512 }),
  'nas-l': nasSet({ ram: 8, bays: 12, maxRam: 1024 }),
};

// Steckplatz-Satz einer NAS: Kauf-Ausstattung 4 × 64 GB RAM (256 GB), 1 × 512-GB-Platte, CPU 32 Cores
function nasSet({ ram, bays, maxRam }) {
  const layout = Object.freeze({ cpus: 1, ram, fans: 2, bays });
  return {
    layout,
    slots: slotsFromLayout(layout),
    required: SERVER_REQUIRED,
    standard: { board: ['mainboard'], cpu: ['cpu-32'], ram: ['ram-64', 'ram-64', 'ram-64', 'ram-64'], psu: ['psu'], fan: ['fan', 'fan'], disk: ['disk-512'] },
    locked: ['cpu'],
    allowed: { cpu: ['cpu-32'] },
    max: { cores: 32, ram: maxRam },
  };
}

// Welches Teil bei Überhitzung kaputtgeht: Gewicht je Teileart (meist ein Lüfter)
export const FAILURE_WEIGHTS = { fan: 0.6, psu: 0.15, board: 0.1, cpu: 0.1, ram: 0.05, disk: 0.05 };
// Teilearten, deren Defekt den Server nicht lahmlegt (#49): Eine defekte Festplatte fällt nur selbst aus
const SOFT_FAILURE_KINDS = ['disk'];
// Ob ein defektes Teil dieser Art den Server offline schaltet (Lüfter, Netzteil, Mainboard, CPU, RAM: ja)
export const stopsServer = (kind) => !SOFT_FAILURE_KINDS.includes(kind);
// Techniker-Aufschlag auf die Plattenpreise, wenn nur Festplatten defekt sind (#49)
const DISK_REPAIR_SHARE = 0.3;

// Steckplatz-Satz eines Modells (Typ aus dem Katalog bzw. Gerät) oder null (kein Server, keine Teile)
export function slotSetOf(typeOrDevice) {
  const type = typeOrDevice?.type ?? typeOrDevice;
  if (type?.kind !== 'server') return null;
  return SLOT_SETS[type.slotSet] ?? SLOT_SETS.server;
}

// Steckplatz-Satz für das 3D-Modul (models/server-parts.js createOpenServer): { cpus, ram, fans, bays } oder null
export const layoutOf = (typeOrDevice) => slotSetOf(typeOrDevice)?.layout ?? null;

// Ob sich ein Modell auf- und abrüsten lässt (GPU- und KI-GPU-Server nicht: nur defekte Teile tauschen)
export function isUpgradable(typeOrDevice) {
  const set = slotSetOf(typeOrDevice);
  return !!set && Object.keys(set.slots).some((kind) => !set.locked.includes(kind));
}

// Summe der Werte (cores, ram, …) einer Liste von Teile-IDs
function sumValues(ids) {
  const sum = { cores: 0, ram: 0 };
  for (const id of ids) {
    const part = partById(id);
    if (!part) continue;
    for (const key of partKindById(part.kind)?.values ?? []) sum[key] = (sum[key] ?? 0) + (part[key] ?? 0);
  }
  return sum;
}

// Werte der Standardausstattung eines Modells: { cores, ram, … } (Server ohne Satz: SERVER_CORES / SERVER_RAM)
export function standardCapacity(typeOrDevice) {
  const set = slotSetOf(typeOrDevice);
  if (!set) return { cores: SERVER_CORES, ram: SERVER_RAM };
  return sumValues(Object.values(set.standard).flat());
}

// Steckplatz-IDs wie im 3D-Modul (models/server-parts.js createOpenServer): board, psu, cpu0 …, ram0 … (zuerst die
// RAM-Plätze der cpu0), fan0 …, bay0 … (Festplatten-Schächte)
const SLOT_PREFIX = { cpu: 'cpu', ram: 'ram', fan: 'fan', disk: 'bay' };
const SINGLE_SLOTS = ['board', 'psu'];
export const slotId = ({ kind, index }) => (SINGLE_SLOTS.includes(kind) ? kind : `${SLOT_PREFIX[kind] ?? kind}${index}`);
// Steckplatz als { kind, index } – nimmt auch eine ID wie 'ram3' oder 'board'; null, wenn unbekannt
export function toSlot(slot) {
  if (slot && typeof slot === 'object') return { kind: slot.kind, index: slot.index ?? 0 };
  if (typeof slot !== 'string') return null;
  if (SINGLE_SLOTS.includes(slot)) return { kind: slot, index: 0 };
  const m = /^([a-z]+)(\d+)$/.exec(slot);
  const kind = m && Object.keys(SLOT_PREFIX).find((k) => SLOT_PREFIX[k] === m[1]);
  return kind ? { kind, index: Number(m[2]) } : null;
}
const slotKey = slotId;
// „2 Lüfter“ bzw. „Netzteil“ (für Gründe)
const countText = (kind, n) => (n === 1 ? partKindById(kind).name : `${n} ${partKindById(kind).plural}`);

export class ServerParts {
  // climate: core/server-climate.js (Defekte bei Überhitzung, Techniker-Reparatur) – fehlt es, gibt es keine Defekte
  constructor(economy, servers, climate = null) {
    this.economy = economy;
    this.servers = servers;
    this.climate = climate;
    this.loadouts = new Map(); // Geräte-ID → { slots: { Art: [Teile-ID | null] }, broken: Set Steckplatz-IDs wie 'fan0' }
    this.stock = new Map();    // Teilelager: Teile-ID → Anzahl (nur heile Teile)
    this.deliveries = [];      // Bestellungen unterwegs: { arriveIn (Sekunden), items: { Teile-ID: Anzahl } }
    this.random = Math.random; // austauschbar für Tests
    // (type, data) => void – 'parts-delivered' { items, count }, 'installed' { device, slot, part },
    // 'removed' { device, slot, part, scrapped (defektes Teil entsorgt) }, 'fixed' { device } (kein defektes Teil mehr –
    // der Server läuft wieder, sobald er vollständig ist)
    this.onEvent = null;
    // Weitere Belegung außer VMs: (device, capacity) => Grund oder null, wenn sie mit capacity nicht mehr passt.
    // core/nas.js setzt das (vermieteter Speicher, #47: „Belegt: 3,5 TB vermietet“) – gilt für Ausbau und Tausch
    // an der Werkbank wie im Schrank
    this.extraShortage = () => null;

    // core/servers.js kennt die Teile nicht – Kapazität, Strom und „unvollständig“ kommen über diese Rückrufe
    servers.capacityOf = (device) => this.capacity(device);
    servers.powerOf = (device) => this.power(device);
    servers.buildProblem = (device) => this.problem(device);
    if (climate) {
      climate.failPart = (device) => this.failPart(device);
      climate.repairParts = (device) => this.repairAll(device);
      climate.brokenPart = (device) => this.blockingParts(device)[0]?.part.name ?? null;
      climate.hasBrokenParts = (device) => this.brokenParts(device).length > 0;
      climate.partsRepairCost = (device) => this.diskRepairCost(device);
    }
  }

  // ---------- Ausstattung ----------

  // Ausstattung eines Geräts (beim ersten Zugriff die Standardausstattung), oder null für Geräte ohne Teile
  loadoutOf(device) {
    const set = slotSetOf(device);
    if (!set) return null;
    let loadout = this.loadouts.get(device.id);
    if (!loadout) {
      loadout = this.standardLoadout(set);
      this.loadouts.set(device.id, loadout);
    }
    return loadout;
  }

  standardLoadout(set) {
    const slots = {};
    for (const [kind, count] of Object.entries(set.slots)) {
      slots[kind] = Array.from({ length: count }, (_, i) => set.standard[kind]?.[i] ?? null);
    }
    return { slots, broken: new Set() };
  }

  // Alle Steckplätze für Anzeigen (Werkbank #45): [{ kind, index, part (oder null), broken, locked }]
  slotsOf(device) {
    const loadout = this.loadoutOf(device);
    if (!loadout) return [];
    const set = slotSetOf(device);
    return Object.entries(loadout.slots).flatMap(([kind, list]) => list.map((id, index) => ({
      id: slotId({ kind, index }), kind, index, part: partById(id), broken: loadout.broken.has(slotKey({ kind, index })), locked: set.locked.includes(kind),
    })));
  }

  // Eingebaute Teile-IDs einer Art (ohne leere Plätze)
  partsIn(device, kind) {
    return (this.loadoutOf(device)?.slots[kind] ?? []).filter(Boolean);
  }

  // Defekte Teile: [{ kind, index, part }]
  brokenParts(device) {
    return this.slotsOf(device).filter((s) => s.broken && s.part);
  }

  // Defekte Teile, die den Server lahmlegen (alles außer Festplatten, #49): [{ kind, index, part }]
  blockingParts(device) {
    return this.brokenParts(device).filter((s) => stopsServer(s.kind));
  }

  // Ob noch ein defektes Teil steckt, das den Server lahmlegt
  hasBlocking(loadout) {
    return [...loadout.broken].some((key) => stopsServer(toSlot(key)?.kind));
  }

  // Eingebaute Teile-IDs, die zur Kapazität zählen: defekte Festplatten nicht (#49), andere defekte Teile schon (der
  // Server läuft dann ohnehin nicht). override: { kind, index, partId } – so tun, als steckte dort partId (heil)
  countedIds(loadout, override = null) {
    return Object.entries(loadout.slots).flatMap(([kind, list]) => list.map((id, index) => {
      if (override && kind === override.kind && index === override.index) return override.partId;
      return !stopsServer(kind) && loadout.broken.has(slotKey({ kind, index })) ? null : id;
    })).filter(Boolean);
  }

  // Platz für VMs aus den eingebauten Teilen (defekte zählen mit – der Server läuft dann ohnehin nicht): { cores, ram }
  // NAS dazu storage: Speicher aus den heilen Platten (defekte Platten zählen nicht, #49)
  // Geräte ohne Teile (Switches …): ihre Katalogwerte bzw. 0
  capacity(device) {
    const loadout = this.loadoutOf(device);
    if (!loadout) return { cores: device?.type?.cores ?? 0, ram: device?.type?.ram ?? 0 };
    return sumValues(this.countedIds(loadout));
  }

  // Strom pro Spielstunde: power × Cores / Standard-Cores des Modells, mindestens die Hälfte (Geräte ohne Teile: power),
  // dazu der eigene Strom eingebauter Teile (Festplatten der NAS: 0,05 € je Platte)
  power(device) {
    const base = device.type.power ?? 0;
    const loadout = this.loadoutOf(device);
    if (!loadout) return base;
    const standard = standardCapacity(device).cores || 1;
    const parts = Object.values(loadout.slots).flat().reduce((sum, id) => sum + (partById(id)?.power ?? 0), 0);
    return base * Math.max(0.5, this.capacity(device).cores / standard) + parts;
  }

  // Welche Pflichtteile fehlen: [{ kind, missing }]
  missingParts(device) {
    const set = slotSetOf(device);
    if (!set) return [];
    return Object.entries(set.required)
      .map(([kind, need]) => ({ kind, missing: need - this.partsIn(device, kind).length }))
      .filter((m) => m.missing > 0);
  }

  // Warum der Server wegen seiner Teile nicht läuft, oder null: unvollständig (Pflichtteil fehlt) oder zu klein für
  // die VMs darauf (z. B. nach dem Ausbau einer defekten CPU). Zu wenig Speicher für vermietete Daten legt die NAS
  // nicht lahm (#49) – dann sind nur einzelne Speicher-Verträge offline (core/storage-rentals.js)
  problem(device) {
    if (!slotSetOf(device)) return null;
    const missing = this.missingParts(device);
    if (missing.length) {
      const list = missing.map((m) => countText(m.kind, m.missing));
      const many = list.length > 1 || missing[0].missing > 1;
      const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0];
      return `unvollständig – ${text} ${many ? 'fehlen' : 'fehlt'}`;
    }
    const short = this.vmShortage(device, this.capacity(device));
    return short ? `zu klein – ${short.replace('Belegt: ', '')}` : null;
  }

  // Grund, wenn die VMs auf dem Server mehr brauchen als capacity, oder null
  vmShortage(device, capacity) {
    const used = this.servers.usageOf(device);
    if (used.cores > capacity.cores) return `Belegt: VMs brauchen ${used.cores} Cores`;
    if (used.ram > capacity.ram) return `Belegt: VMs brauchen ${used.ram} GB RAM`;
    return null;
  }

  // Wie vmShortage, dazu weitere Belegung (vermieteter Speicher der NAS) – für Ausbau und Tausch
  shortage(device, capacity) {
    return this.vmShortage(device, capacity) ?? this.extraShortage(device, capacity);
  }

  // Kapazität, wenn im Steckplatz slot statt des jetzigen Teils partId (oder nichts) steckte (defekte Platten zählen
  // wie in capacity nicht)
  capacityWith(device, slot, partId) {
    return sumValues(this.countedIds(this.loadoutOf(device), { kind: slot.kind, index: slot.index, partId }));
  }

  // Grund, wenn die Kapazität die Höchstwerte des Satzes übersteigt, oder null
  maxProblem(device, capacity) {
    const max = slotSetOf(device).max ?? {};
    if (max.cores && capacity.cores > max.cores) return `Höchstens ${max.cores} Cores in diesem Server`;
    if (max.ram && capacity.ram > max.ram) return `Höchstens ${max.ram} GB RAM in diesem Server`;
    return null;
  }

  // Gemeinsame Prüfung des Steckplatzes: Grund oder null
  slotProblem(device, slot) {
    const loadout = this.loadoutOf(device);
    if (!loadout) return 'Dieses Gerät hat keine Steckplätze';
    if (!slot) return 'Diesen Steckplatz gibt es nicht';
    const list = loadout.slots[slot?.kind];
    if (!list || !Number.isInteger(slot.index) || slot.index < 0 || slot.index >= list.length) return 'Diesen Steckplatz gibt es nicht';
    return null;
  }

  // ---------- Einbauen und Ausbauen ----------

  // Grund, warum das Teil partId nicht in den Steckplatz slot ({ kind, index } oder ID wie 'ram3') passt, oder null
  installProblem(device, slot, partId) {
    slot = toSlot(slot);
    const problem = this.slotProblem(device, slot);
    if (problem) return problem;
    const part = partById(partId);
    if (!part) return 'Unbekanntes Teil';
    if (part.kind !== slot.kind) return `Passt nicht – Steckplatz für ${partKindById(slot.kind).name}`;
    if (this.loadoutOf(device).slots[slot.kind][slot.index]) return 'Steckplatz belegt – erst ausbauen';
    const set = slotSetOf(device);
    if (set.allowed?.[slot.kind] && !set.allowed[slot.kind].includes(partId)) return `Nur ${set.allowed[slot.kind].map((id) => partById(id)?.name).join(' oder ')} passt hier`;
    if (set.locked.includes(slot.kind) && partId !== set.standard[slot.kind]?.[slot.index]) {
      const same = partById(set.standard[slot.kind]?.[slot.index]);
      return same ? `Nicht aufrüstbar – nur ${same.name} passt hier` : 'Nicht aufrüstbar – hier bleibt der Platz frei';
    }
    const max = this.maxProblem(device, this.capacityWith(device, slot, partId));
    if (max) return max;
    if (this.stockOf(partId) < 1) return `Kein Teil „${part.name}“ im Teilelager – im Teile-Shop kaufen`;
    return null;
  }

  // Teil aus dem Teilelager einbauen; gibt true zurück, wenn es geklappt hat
  install(deviceId, slot, partId) {
    slot = toSlot(slot);
    const device = this.economy.furnitureById(deviceId);
    if (!device || this.installProblem(device, slot, partId)) return false;
    this.takeStock(partId);
    this.loadoutOf(device).slots[slot.kind][slot.index] = partId;
    this.onEvent?.('installed', { device, slot: { ...slot }, part: partById(partId) });
    this.economy.notify();
    return true;
  }

  // Teil in den ersten freien Steckplatz seiner Art einbauen: { ok, slot } oder { ok: false, reason }
  installAny(deviceId, partId) {
    const device = this.economy.furnitureById(deviceId);
    const part = partById(partId);
    const list = this.loadoutOf(device)?.slots[part?.kind];
    if (!list) return { ok: false, reason: !part ? 'Unbekanntes Teil' : 'Dafür hat das Gerät keinen Steckplatz' };
    const index = list.indexOf(null);
    if (index === -1) return { ok: false, reason: `Alle Steckplätze für ${partKindById(part.kind).plural} belegt` };
    const slot = { kind: part.kind, index };
    const reason = this.installProblem(device, slot, partId);
    if (reason) return { ok: false, reason };
    this.install(device.id, slot, partId);
    return { ok: true, slot };
  }

  // Grund, warum das Teil im Steckplatz nicht heraus darf, oder null. Defekte Teile dürfen immer heraus.
  removeProblem(device, slot) {
    slot = toSlot(slot);
    const problem = this.slotProblem(device, slot);
    if (problem) return problem;
    const loadout = this.loadoutOf(device);
    if (!loadout.slots[slot.kind][slot.index]) return 'Steckplatz ist leer';
    if (loadout.broken.has(slotKey(slot))) return null;
    if (slotSetOf(device).locked.includes(slot.kind)) return 'Nicht auf- oder abrüstbar – nur defekte Teile lassen sich gegen das gleiche Teil tauschen';
    return this.shortage(device, this.capacityWith(device, slot, null));
  }

  // Teil ausbauen: heile Teile kommen ins Teilelager, defekte werden entsorgt. Gibt true zurück, wenn es geklappt hat.
  remove(deviceId, slot) {
    slot = toSlot(slot);
    const device = this.economy.furnitureById(deviceId);
    if (!device || this.removeProblem(device, slot)) return false;
    this.takeOut(device, slot);
    this.economy.notify();
    return true;
  }

  // Ausbauen ohne Prüfung (remove, replace)
  takeOut(device, slot) {
    const loadout = this.loadoutOf(device);
    const key = slotKey(slot);
    const partId = loadout.slots[slot.kind][slot.index];
    const scrapped = loadout.broken.delete(key);
    loadout.slots[slot.kind][slot.index] = null;
    if (!scrapped) this.addStock(partId);
    this.onEvent?.('removed', { device, slot: { ...slot }, part: partById(partId), scrapped });
    // Läuft wieder: kein defektes Teil mehr, bzw. das letzte lahmlegende ist raus (defekte Platten stören nicht, #49)
    if (scrapped && (!loadout.broken.size || (stopsServer(slot.kind) && !this.hasBlocking(loadout)))) this.fixed(device);
  }

  // Grund, warum sich das Teil im Steckplatz nicht gegen partId tauschen lässt, oder null
  replaceProblem(device, slot, partId) {
    slot = toSlot(slot);
    const problem = this.slotProblem(device, slot);
    if (problem) return problem;
    const loadout = this.loadoutOf(device);
    const current = loadout.slots[slot.kind][slot.index];
    if (!current) return this.installProblem(device, slot, partId);
    const broken = loadout.broken.has(slotKey(slot));
    const set = slotSetOf(device);
    if (set.locked.includes(slot.kind) && !broken) return 'Nicht auf- oder abrüstbar – nur defekte Teile lassen sich gegen das gleiche Teil tauschen';
    if (current === partId && !broken) return 'Dieses Teil steckt schon';
    // Prüfen wie beim Einbau in einen leeren Platz (ohne „belegt“)
    loadout.slots[slot.kind][slot.index] = null;
    const reason = this.installProblem(device, slot, partId);
    loadout.slots[slot.kind][slot.index] = current;
    if (reason) return reason;
    // Auch beim Tausch eines defekten Teils müssen die VMs danach Platz haben – dasselbe Teil geht immer
    return current === partId ? null : this.shortage(device, this.capacityWith(device, slot, partId));
  }

  // Teil in einem Schritt tauschen (z. B. defekten Lüfter gegen neuen): altes heraus (heil ins Lager, defekt entsorgt),
  // neues aus dem Lager hinein. Gibt true zurück, wenn es geklappt hat.
  replace(deviceId, slot, partId) {
    slot = toSlot(slot);
    const device = this.economy.furnitureById(deviceId);
    if (!device || this.replaceProblem(device, slot, partId)) return false;
    if (this.loadoutOf(device).slots[slot.kind][slot.index]) this.takeOut(device, slot);
    return this.install(device.id, slot, partId);
  }

  // ---------- Defekte ----------

  // Überhitzung (core/server-climate.js): ein bestimmtes heiles Teil geht kaputt, meist ein Lüfter.
  // Gibt { kind, index, part, stops } zurück oder null (kein Server bzw. kein heiles Teil). stops: legt das Teil den
  // Server lahm (false bei einer Festplatte, #49 – die NAS läuft weiter, core/server-climate.js)
  failPart(device) {
    const loadout = this.loadoutOf(device);
    if (!loadout) return null;
    const working = this.slotsOf(device).filter((s) => s.part && !s.broken);
    if (!working.length) return null;
    // Arten nach Gewicht, häufigste zuerst (Lüfter)
    const kinds = [...new Set(working.map((s) => s.kind))].sort((a, b) => (FAILURE_WEIGHTS[b] ?? 0.05) - (FAILURE_WEIGHTS[a] ?? 0.05));
    const weights = kinds.map((k) => FAILURE_WEIGHTS[k] ?? 0.05);
    let roll = this.random() * weights.reduce((a, b) => a + b, 0);
    const kind = kinds.find((k, i) => (roll -= weights[i]) < 0) ?? kinds[kinds.length - 1];
    const candidates = working.filter((s) => s.kind === kind);
    const slot = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
    loadout.broken.add(slotKey(slot));
    this.economy.notify();
    return { kind: slot.kind, index: slot.index, part: slot.part, stops: stopsServer(slot.kind) };
  }

  // Bestimmtes Teil als defekt markieren (alte Spielstände, Tests). Gibt true zurück, wenn dort ein Teil steckt.
  markBroken(device, slot) {
    slot = toSlot(slot);
    const loadout = this.loadoutOf(device);
    if (this.slotProblem(device, slot) || !loadout.slots[slot.kind][slot.index]) return false;
    loadout.broken.add(slotKey(slot));
    return true;
  }

  // Preis des Technikers, wenn nur Festplatten defekt sind (#49): Summe ihrer Preise + 30 % (wie REPAIR_SHARE in
  // core/server-climate.js), gerundet. Ist ein anderes Teil defekt (oder keins), null – dann 30 % des Kaufpreises
  diskRepairCost(device) {
    const broken = this.brokenParts(device);
    if (!broken.length || broken.some((s) => stopsServer(s.kind))) return null;
    return Math.round(broken.reduce((sum, s) => sum + s.part.price, 0) * (1 + DISK_REPAIR_SHARE));
  }

  // Techniker-Reparatur (climate.repair): alle defekten Teile werden ersetzt
  repairAll(device) {
    const loadout = this.loadoutOf(device);
    if (loadout) loadout.broken.clear();
  }

  // Kein lahmlegendes defektes Teil mehr: Server läuft wieder (Status in core/server-climate.js zurücksetzen)
  fixed(device) {
    this.climate?.resume(device.id);
    this.onEvent?.('fixed', { device });
  }

  // ---------- Teilelager ----------

  stockOf(partId) {
    return this.stock.get(partId) ?? 0;
  }

  // Teilelager für Anzeigen: [{ part, count }] in Katalog-Reihenfolge (nur vorhandene)
  get stockList() {
    return SERVER_PARTS.filter((p) => this.stockOf(p.id) > 0).map((part) => ({ part, count: this.stockOf(part.id) }));
  }

  get stockCount() {
    let sum = 0;
    for (const n of this.stock.values()) sum += n;
    return sum;
  }

  addStock(partId, count = 1) {
    if (!partById(partId) || !(count > 0)) return;
    this.stock.set(partId, this.stockOf(partId) + count);
  }

  takeStock(partId, count = 1) {
    const left = this.stockOf(partId) - count;
    if (left < 0) return false;
    if (left) this.stock.set(partId, left);
    else this.stock.delete(partId);
    return true;
  }

  // ---------- Kaufen (Teile-Shop #44) ----------

  // Preis einer Bestellung { Teile-ID: Anzahl }
  orderPrice(items) {
    return Object.entries(items).reduce((sum, [id, n]) => sum + (partById(id)?.price ?? 0) * Math.max(0, n | 0), 0);
  }

  // Grund, warum die Bestellung gerade nicht geht, oder null. upperFloor: ob die zweite Etage (Serverraum) steht
  orderProblem(items, upperFloor) {
    if (!upperFloor) return 'Erst die zweite Etage bauen (Ausbau)';
    const entries = Object.entries(items ?? {}).filter(([, n]) => n > 0);
    if (!entries.length) return 'Nichts ausgewählt';
    if (entries.some(([id, n]) => !partById(id) || !Number.isInteger(n))) return 'Unbekanntes Teil';
    if (!this.economy.canAfford(this.orderPrice(items))) return 'Zu wenig Geld';
    return null;
  }

  // Bestellung { Teile-ID: Anzahl }: Geld weg, kommt als ein Paket nach economy.deliverySeconds ins Teilelager
  order(items, upperFloor) {
    if (this.orderProblem(items, upperFloor) || !this.economy.spend(this.orderPrice(items))) return false;
    const clean = Object.fromEntries(Object.entries(items).filter(([, n]) => n > 0));
    this.deliveries.push({ arriveIn: this.economy.deliverySeconds, items: clean });
    this.economy.notify();
    return true;
  }

  // Einzelnes Teil (oder count Stück) bestellen
  buy(partId, count = 1, upperFloor = true) {
    return this.order({ [partId]: count }, upperFloor);
  }

  get nextArrival() {
    return this.deliveries.length ? Math.max(0, Math.min(...this.deliveries.map((d) => d.arriveIn))) : null;
  }

  // Läuft in echter Zeit: angekommene Pakete ins Teilelager
  advance(seconds) {
    if (!this.deliveries.length) return;
    for (const d of this.deliveries) d.arriveIn -= seconds;
    const arrived = this.deliveries.filter((d) => d.arriveIn <= 0);
    if (!arrived.length) return;
    this.deliveries = this.deliveries.filter((d) => d.arriveIn > 0);
    const items = {};
    for (const d of arrived) {
      for (const [id, n] of Object.entries(d.items)) {
        this.addStock(id, n);
        items[id] = (items[id] ?? 0) + n;
      }
    }
    const count = Object.values(items).reduce((a, b) => a + b, 0);
    this.onEvent?.('parts-delivered', { items, count });
    this.economy.notify();
  }

  // ---------- Speichern ----------

  toJSON() {
    const devices = this.economy.furniture
      .filter((f) => slotSetOf(f))
      .map((f) => {
        const loadout = this.loadoutOf(f);
        return { id: f.id, slots: Object.fromEntries(Object.entries(loadout.slots).map(([k, list]) => [k, [...list]])), broken: [...loadout.broken] };
      });
    return {
      stock: Object.fromEntries(this.stock),
      deliveries: this.deliveries.map((d) => ({ arriveIn: d.arriveIn, items: { ...d.items } })),
      devices,
    };
  }

  // Ohne Daten (alte Spielstände): alle Server mit Standardausstattung, leeres Teilelager. Nach climate.load aufrufen:
  // Server, die dort defekt sind, aber kein defektes Teil haben (alte Stände), bekommen einen defekten Lüfter; Server mit
  // lahmlegendem defektem Teil gelten dort als defekt. Eine NAS, die nur wegen einer defekten Platte als defekt
  // gespeichert ist (Stände bis #49), läuft wieder – nur ihre Platte bleibt defekt.
  load(data) {
    this.loadouts.clear();
    this.stock.clear();
    for (const [id, n] of Object.entries(data?.stock ?? {})) if (n > 0) this.addStock(id, Math.floor(n));
    this.deliveries = (data?.deliveries ?? [])
      .filter((d) => d?.items)
      .map((d) => ({ arriveIn: d.arriveIn ?? 0, items: Object.fromEntries(Object.entries(d.items).filter(([id, n]) => partById(id) && n > 0)) }));
    for (const saved of data?.devices ?? []) {
      const device = this.economy.furnitureById(saved.id);
      const set = slotSetOf(device);
      if (!set) continue;
      const slots = {};
      for (const [kind, count] of Object.entries(set.slots)) {
        const list = saved.slots?.[kind] ?? [];
        slots[kind] = Array.from({ length: count }, (_, i) => (partById(list[i])?.kind === kind ? list[i] : null));
      }
      const broken = new Set((saved.broken ?? []).map(toSlot).filter((s) => s && slots[s.kind]?.[s.index]).map(slotId));
      this.loadouts.set(device.id, { slots, broken });
    }
    // Abgleich mit dem Klima (Status 'broken')
    if (this.climate) {
      for (const device of this.economy.furniture.filter((f) => slotSetOf(f))) {
        const loadout = this.loadoutOf(device);
        const status = this.climate.devices.get(device.id)?.status;
        const blocking = this.hasBlocking(loadout);
        if (status === 'broken' && !loadout.broken.size) {
          const fan = loadout.slots.fan?.findIndex(Boolean) ?? -1;
          if (fan !== -1) loadout.broken.add(slotKey({ kind: 'fan', index: fan }));
          else this.failPart(device);
        } else if (status === 'broken' && !blocking) {
          this.climate.resume(device.id); // nur defekte Platten: die NAS läuft weiter (#49)
        } else if (blocking && status !== 'broken') {
          this.climate.device(device.id).status = 'broken';
        }
      }
    }
  }
}
