// Spielstand in localStorage: Geld, Spielzeit, Drucker, Lager, Regale, fertige Teile, Aufträge, Level, Erfolge
// und Hallen-Ausbau. Speichert automatisch alle paar Sekunden und beim Schließen des Tabs.
// game: { economy, orders, progress, achievements, upgrades, clock, staff, servers, climate, rentals, rentalAutomation, visitors, aiService, serverParts, workbench,
// nas, storageRentals, website }
import { PRINTERS, furnitureById, templateById } from './catalog.js';
import { SLOTS_PER_TABLE } from './upgrades.js';
import { DISPLAY_SPOTS } from './display-shelf.js';
import { BUNKER_ROW_X, BUNKER_ROW_Z, BUNKER_SPOTS_PER_FIELD, FIRST_BUNKER_SPOT, bunkerSpot } from './server-zones.js';
import { BASEMENT_WAN_PORT0 } from './cable-tray.js';

const KEY = 'druckercenter-save';
// 2: Drucker mit Spulenfächern (AMS) · 3: zwei Varianten – Pannen/Feuchte/Erfolge/Regale (#6) bzw.
// Ausbau + Spieluhr (#5) · 4: beides zusammen · 5: Aufträge mit Stufe am Empfang (counter/open/packed)
// 6: Ausstellungsregale an der Südwand (location 'wall') mit ausgestellten Teilen (parts)
// 12: Server-Vermietung (core/server-rentals.js) – wartende VM-Anfragen und laufende Verträge
// 13: Schalter „Automatik an/aus“ je Serverschrank (climate.racks[].auto, core/climate-automation.js)
// 14: Internet nur über den Wandanschluss, Kabel zwischen Schränken über das Kabelgitter (cables[].tray, Enden
//     { id: 'wan', port }, core/cable-tray.js) und einmalige Nachricht für alte Stände (servers.wanNotice)
// 15: Schalter „Automatische Vergabe an/aus“ der privaten Server (rentalAutomation.enabled, core/rental-automation.js),
//     automatisch vergebene VMs mit Kennzeichen (rentals.vms[].auto)
// 16: Besuchergruppen (core/visitors.js) – Termin der heutigen Gruppe und die letzten Bewertungen
// 17: KI-GPU-Server (core/ai-service.js) – Gesamteinnahmen aus dem KI-Abo (aiService.totalIncome)
// 18: Besucher in Grüppchen über den Tag (core/visitors.js) – Tagesplan, Tagesbilanz statt einer Gruppe mit Führer
// 19: Keller mit Treppenhaus und Keller-Fahrstuhl (core/upgrades.js: basement, basementElevator, …Ordered)
//     dazu ohne eigene Version: KI-Tagesverlauf (aiService.log aus core/ai-day-log.js) – fehlt er, beginnt die
//     Aufzeichnung beim Laden
// 20: Server aus Bauteilen (core/server-parts.js) – Ausstattung je Server, Teilelager und Lieferungen (serverParts)
//     dazu ohne eigene Version: Server auf der Werkbank (location 'bench', core/workbench.js) – alte Stände haben keinen
// 21: NAS (#46) – Festplatten je Schacht stecken in serverParts (devices[].slots.disk), kein eigenes Feld; alte Stände brauchen keine Umwandlung
// 22: Speicher-Vermietung auf NAS (core/storage-rentals.js) – Speicher-Anfragen und -Verträge (storageRentals)
// 23: Defekte Festplatte legt die NAS nicht mehr lahm (#49) – Speicher-Verträge, die nicht mehr auf die heilen Platten
//     passen, tragen stranded: true (storageRentals.contracts[].stranded)
// 24: Kellerausbau in Stufen (#50) – upgrades.basementStage/basementStageOrdered (0 = kein Keller, 1 = 20 × 20 m … 6)
//     und Feldtypen upgrades.basementFields (36 Einträge, core/basement-layout.js: 'storage' | 'bunker' | null)
// 25: Eigene Website (#54, core/website.js) – Einstellungen, Status (veröffentlicht, läuft, Hochfahren) und Statistik je
//     Tag (website); Online-Anfragen und Verträge daraus tragen source: 'website' (rentals/storageRentals, kein eigenes Feld)
// 26: Daten-Bunker mit Reihen wie im Rechenzentrum (#60, core/server-zones.js) – 120 statt 16 Plätze je Kellerfeld, neue
//     Platznummern (Schränke ziehen auf den nächstgelegenen freien Platz im selben Feld), Kabel im Bunker über Trassen
//     (cables[].reroute: core/servers.js verlegt sie beim Laden neu)
const VERSION = 26;
export const AUTOSAVE_SECONDS = 10;

// localStorage kann fehlen oder gesperrt sein (privater Modus) – dann läuft das Spiel einfach ohne Speichern
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSave() {
  return !!storage()?.getItem(KEY);
}

export function deleteSave() {
  storage()?.removeItem(KEY);
}

// carried: { spools, nozzles, sheet } in der Hand – Spulen werden als „im Lagerregal“, Düsen als „im Ersatzteilregal“,
// eine Holzplatte als „auf dem Stapel im Abstellraum“
// gespeichert, damit beim Neuladen nichts verloren geht
export function saveGame({ economy, orders, progress, achievements, upgrades, clock, staff, servers, climate, rentals, rentalAutomation, visitors, aiService, serverParts, storageRentals, website }, carried = {}) {
  const carriedSpools = Array.isArray(carried) ? carried : carried.spools ?? [];
  const shelf = economy.shelf.map((s) => ({ ...s }));
  const used = new Set(shelf.map((s) => s.shelfSlot));
  let free = 0;
  const furniture = economy.furniture.map((f) => ({
    id: f.id,
    typeId: f.type.id,
    // Getragene Regale landen beim Laden wieder im Abstellraum
    location: ['table', 'wall', 'shipping', 'server', 'rack', 'bench'].includes(f.location) ? f.location : 'storage',
    slot: ['table', 'wall', 'server'].includes(f.location) ? f.slot : null,
    rackId: f.location === 'rack' ? f.rackId : undefined, // Server-Hardware im Schrank (core/servers.js)
    unit: f.location === 'rack' ? f.unit : undefined,
    storageSpot: f.location === 'storage' ? f.storageSpot : null,
    arriveIn: f.arriveIn,
    spools: f.spools ? f.spools.map((s) => (s ? { ...s } : null)) : null,
    parts: f.parts ? f.parts.map((p) => (p ? { templateId: p.templateId, filamentIds: [...p.filamentIds] } : null)) : null,
    sheets: f.sheets ? f.sheets.map((s) => (s ? { ...s } : null)) : null,
    nozzles: f.nozzles,
  }));
  const partsRack = furniture.find((f) => f.typeId === 'parts-rack');
  if (partsRack) partsRack.nozzles += carried.nozzles ?? 0;
  for (const spool of carriedSpools) {
    while (used.has(free)) free++;
    used.add(free);
    shelf.push({ filamentId: spool.filamentId, grams: spool.grams, moisture: spool.moisture ?? 0, shelfSlot: free });
  }
  const data = {
    version: VERSION,
    savedAt: Date.now(),
    economy: {
      money: economy.money,
      unlimited: economy.unlimited,
      instantDelivery: economy.instantDelivery,
      carryAll: economy.carryAll,
      pendingCosts: economy.pendingCosts,
      nextPrinterId: economy.nextPrinterId,
      nextLooseId: economy.nextLooseId,
      // Getragene Drucker landen beim Laden wieder im Abstellraum
      printers: economy.printers.map((p) => ({
        id: p.id,
        modelId: p.model.id,
        location: p.location === 'table' || p.location === 'shipping' ? p.location : 'storage',
        slot: p.location === 'table' ? p.slot : null,
        storageSpot: p.location === 'storage' ? p.storageSpot : null,
        arriveIn: p.arriveIn,
        spools: p.spools.map((spool) => (spool ? { ...spool } : null)),
        activeSlot: p.activeSlot,
        accentSlot: p.accentSlot ?? null,
        multiSlots: p.multiSlots ?? null,
        ledColor: p.ledColor ?? null,
        speedId: p.speedId,
        clogged: p.clogged,
        nozzlePokes: p.nozzlePokes,
        nozzleWear: p.nozzleWear ?? 0,
        waste: p.waste ?? 0,
        sheet: p.sheet ? { ...p.sheet } : null,
        job: p.job ? { ...p.job } : null,
      })),
      shelf,
      woodStock: woodStockWith(economy.woodStock, carried.sheets ?? []),
      finishedParts: [...economy.finishedParts],
      looseParts: economy.looseParts.map((l) => ({ ...l })),
      accessories: [...economy.accessories],
      furniture,
      nextFurnitureId: economy.nextFurnitureId,
    },
    orders: {
      open: orders.open.map((o) => ({ ...o })),
      nextId: orders.nextId,
      untilNext: orders.untilNext,
      completed: orders.completed,
      stars: [...orders.stars],
    },
    progress: { xp: progress.xp },
    achievements: { stats: { ...achievements.stats }, unlocked: [...achievements.unlocked] },
    upgrades: {
      tables: upgrades.tables, tablesOrdered: upgrades.tablesOrdered,
      shelfLevels: upgrades.shelfLevels, shelfOrdered: upgrades.shelfOrdered,
      upperFloor: upgrades.upperFloor, upperFloorOrdered: upgrades.upperFloorOrdered,
      elevator: upgrades.elevator, elevatorOrdered: upgrades.elevatorOrdered,
      basement: upgrades.basement, basementOrdered: upgrades.basementOrdered,
      basementStage: upgrades.basementStage, basementStageOrdered: upgrades.basementStageOrdered,
      basementFields: upgrades.basementLayout.save(),
      basementElevator: upgrades.basementElevator, basementElevatorOrdered: upgrades.basementElevatorOrdered,
      deliveries: upgrades.deliveries.map((d) => ({ ...d })),
    },
    clock: { minutes: clock.minutes },
    staff: staff
      ? { workers: staff.workers.map((w) => ({ ...w })), nextId: staff.nextId, receptionist: staff.receptionist ? { ...staff.receptionist } : null }
      : undefined,
    servers: servers?.toJSON(),
    climate: climate?.toJSON(), // Lüfter und Temperaturen im Serverraum (core/server-climate.js)
    rentals: rentals?.toJSON(), // VM-Anfragen und Mietverträge (core/server-rentals.js)
    rentalAutomation: rentalAutomation?.toJSON(), // Schalter „Automatische Vergabe“ (core/rental-automation.js)
    visitors: visitors?.toJSON(), // Tagesplan der Besucher, Tagesbilanz und letzte Bewertungen (core/visitors.js)
    aiService: aiService?.toJSON(), // Gesamteinnahmen aus dem KI-Abo (core/ai-service.js)
    serverParts: serverParts?.toJSON(), // Bauteile je Server, Teilelager und Lieferungen (core/server-parts.js)
    storageRentals: storageRentals?.toJSON(), // Speicher-Anfragen und -Verträge auf den NAS (core/storage-rentals.js)
    website: website?.toJSON(), // eigene Website: Einstellungen, Status, Statistik (core/website.js)
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Alte Spielstände (Version 2) ins neue Format bringen: Spulen bekommen Feuchte und Regalplätze,
// fertige Teile eine Farbe (die erste passende, weil sie früher nicht gespeichert wurde),
// laufende Drucke haben ihr Filament schon beim Start abgezogen.
// Version 25 → 26 (#60): Bunker-Schränke auf die Reihen wie im Rechenzentrum. Jeder Schrank kommt auf den Platz im
// selben Kellerfeld, der seinem alten am nächsten liegt und noch frei ist (in der Reihenfolge der alten Plätze).
// Geräte bleiben im Schrank (rackId). Kabel mit einem Ende im Bunker (Keller-Anschluss oder Gerät in einem
// Bunker-Schrank) bekommen reroute: Ihre Wegpunkte gehören zum alten 1-m-Gitter und passen nicht auf die Trassen –
// core/servers.js verlegt sie beim Laden über den kürzesten Trassenweg neu (geht das nicht, kommt das Kabel
// vollständig in den Vorrat zurück).
const OLD_BUNKER_SPOTS = 16;
const OLD_BUNKER_X = [5.5, 6.5, 7.5, 8.5, 11.5, 12.5, 13.5, 14.5];
const OLD_BUNKER_Z = [6.5, 12.5];
function migrateBunkerRows(data) {
  const furniture = data.economy?.furniture ?? [];
  const racks = furniture
    .filter((f) => f.location === 'server' && Number.isInteger(f.slot) && f.slot >= FIRST_BUNKER_SPOT)
    .sort((a, b) => a.slot - b.slot);
  if (!racks.length) return;
  const used = new Set();
  for (const rack of racks) {
    const old = rack.slot - FIRST_BUNKER_SPOT;
    const field = Math.floor(old / OLD_BUNKER_SPOTS);
    const n = old % OLD_BUNKER_SPOTS;
    const ox = OLD_BUNKER_X[n % OLD_BUNKER_X.length];
    const oz = OLD_BUNKER_Z[Math.floor(n / OLD_BUNKER_X.length)];
    let best = null;
    let bestD = Infinity;
    for (let m = 0; m < BUNKER_SPOTS_PER_FIELD; m++) {
      const spot = bunkerSpot(field, m);
      if (used.has(spot)) continue;
      const d = Math.hypot(BUNKER_ROW_X[m % BUNKER_ROW_X.length] - ox, BUNKER_ROW_Z[Math.floor(m / BUNKER_ROW_X.length)] - oz);
      if (d < bestD) { bestD = d; best = spot; }
    }
    used.add(best);
    rack.slot = best;
  }
  const bunkerRacks = new Set(racks.map((r) => r.id));
  const inBunker = (ref) => {
    if (ref?.id === 'wan') return ref.port >= BASEMENT_WAN_PORT0;
    const device = furniture.find((f) => f.id === ref?.id);
    return !!device && device.location === 'rack' && bunkerRacks.has(device.rackId);
  };
  for (const c of data.servers?.cables ?? []) {
    if (inBunker(c.a) || inBunker(c.b)) c.reroute = true;
  }
}

function migrateV2(data) {
  const e = data.economy;
  let shelfSlot = 0;
  e.shelf = [];
  for (const [filamentId, spools] of e.filaments ?? []) {
    for (const grams of spools) e.shelf.push({ filamentId, grams, moisture: 0, shelfSlot: shelfSlot++ });
  }
  e.finishedParts = (e.finishedParts ?? []).map(([templateId, count]) => {
    const material = templateById(templateId)?.materials[0] ?? 'PLA';
    const filamentId = material === 'TPU' ? 'tpu-schwarz' : `${material.toLowerCase()}-weiß`;
    return [`${templateId}|${filamentId}`, count];
  });
  let spot = 0;
  for (const p of e.printers) {
    p.spools = p.spools.map((s) => (s ? { ...s, moisture: 0 } : null));
    p.storageSpot = p.location === 'table' ? null : spot++;
    if (p.job) Object.assign(p.job, { gramsUsed: templateById(p.job.templateId)?.grams ?? 0, prepaid: true });
  }
  data.version = 3;
  return data;
}

// Überschreibt den Zustand der übergebenen Objekte. Gibt false zurück, wenn kein (gültiger) Spielstand da ist.
export function loadGame({ economy, orders, progress, achievements, upgrades, clock, staff, servers, climate, rentals, rentalAutomation, visitors, aiService, serverParts, workbench, storageRentals, website }) {
  let data;
  try {
    data = JSON.parse(storage()?.getItem(KEY) ?? 'null');
  } catch {
    return false;
  }
  // Version 3 aus #5 (Ausbau) kennt noch kein Lager mit festen Plätzen – wie Version 2 umwandeln
  if (data?.version === 2 || (data?.version === 3 && !data.economy.shelf)) data = migrateV2(data);
  if (data?.version === 3) data.version = 4; // Version 3 aus #6: Ausbau und Uhr ergänzen unten Standardwerte
  // Version 4 kennt noch keinen Empfang: alle offenen Aufträge gelten als angenommen
  if (data?.version === 4) {
    for (const order of data.orders?.open ?? []) order.stage ??= 'open';
    data.version = 5;
  }
  if (data?.version === 5) data.version = 6; // Version 5 kennt noch keine Ausstellungsregale – nichts umzuwandeln
  if (data?.version === 6) data.version = 7; // Version 6 kennt noch keine zweite Etage – unten Standardwerte
  if (data?.version === 7) data.version = 8; // Version 7 kennt noch keine Server – unten Standardwerte
  // Version 8 zählt Patchkabel (10er-Packs) statt Meter von der Kabelrolle: je Patchkabel 1 m gutschreiben,
  // die Länge gesteckter Kabel rechnet core/servers.js beim Laden aus
  if (data?.version === 8) {
    const s = data.servers;
    if (s) {
      s.cableMeters = s.cableStock ?? 0;
      for (const d of s.deliveries ?? []) d.meters ??= 10;
    }
    data.version = 9;
  }
  // Version 9 merkt sich noch nicht, durch welche Clips ein Kabel läuft – servers.load legt es wie bisher durch
  // die nächsten Clips rechts (Servers.defaultClips)
  if (data?.version === 9) data.version = 10;
  if (data?.version === 10) data.version = 11; // Version 10 kennt noch kein Serverklima – Lüfter starten bei 50 %
  // Version 11 kennt noch keine Server-Vermietung: keine Mieter, keine Anfragen – alle Server sind frei und bringen
  // erst wieder Geld, wenn man VMs vermietet (rentals.load ohne Daten)
  if (data?.version === 11) data.version = 12;
  // Version 12 kennt noch keine Klima-Automatik: fehlt der Schalter, ist sie an (climate.load setzt auto = true)
  if (data?.version === 12) {
    for (const r of data.climate?.racks ?? []) r.auto ??= true;
    data.version = 13;
  }
  // Version 13 kennt noch keinen Internet-Anschluss an der Wand: Kabel bekommen einen leeren Gitterweg, es wird nichts
  // automatisch verkabelt – Schränke ohne Leitung zur Wand sind danach offline. Wer schon Serverhardware hat, bekommt
  // einmal den Hinweis (servers.wanNotice, main.js zeigt ihn beim ersten Spielstart und löscht ihn).
  if (data?.version === 13) {
    for (const c of data.servers?.cables ?? []) c.tray ??= [];
    const hasServers = (data.economy?.furniture ?? []).some((f) => f.location === 'server' || f.location === 'rack');
    if (hasServers) data.servers = { ...(data.servers ?? {}), wanNotice: true };
    data.version = 14;
  }
  // Version 14 kennt noch keine automatische Vergabe der VM-Anfragen: fehlt der Schalter, ist sie an. Bisherige VMs
  // hat der Spieler selbst vergeben (kein Kennzeichen vm.auto)
  if (data?.version === 14) {
    data.rentalAutomation ??= { enabled: true };
    data.version = 15;
  }
  // Version 15 kennt noch keine Besuchergruppen: kein Termin, keine Bewertungen – visitors.load ohne Daten plant
  // den Tag neu (siehe Version 17)
  if (data?.version === 15) {
    data.visitors ??= null;
    data.version = 16;
  }
  // Version 16 kennt noch keine KI: nichts verdient – die Stufe ergibt sich aus den KI-GPU-Servern (gibt es noch keine)
  if (data?.version === 16) {
    data.aiService ??= null;
    data.version = 17;
  }
  // Version 17 kennt nur eine große Gruppe mit Azubi als Führer: eine geplante oder laufende Gruppe wird verworfen,
  // die letzten Bewertungen bleiben (ohne Gruppennamen). Azubi-Reservierungen wurden nie gespeichert und es gibt sie
  // nicht mehr – kein Azubi bleibt reserviert. visitors.load plant für heute die restlichen Grüppchen.
  if (data?.version === 17) {
    const v = data.visitors;
    data.visitors = v
      ? { recentRatings: (v.recentRatings ?? []).map((r) => ({ size: r.size, stars: r.stars, day: r.day })), nextId: v.nextId ?? 1 }
      : null;
    data.version = 18;
  }
  // Version 18 kennt noch keinen Keller: nichts gekauft (die Felder fehlen einfach und gelten beim Laden als false)
  if (data?.version === 18) data.version = 19;
  // Version 19 kennt noch keine Bauteile: alle Server bekommen beim Laden die Standardausstattung (64 Cores / 512 GB),
  // defekte Server einen defekten Lüfter (serverParts.load ohne Daten gleicht mit dem Klima ab), VMs bleiben
  if (data?.version === 19) {
    data.serverParts ??= null;
    data.version = 20;
  }
  // Version 20 kennt noch keine NAS – die Platten stecken ohnehin in serverParts, nichts umzuwandeln
  if (data?.version === 20) data.version = 21;
  // Version 21 kennt noch keine Speicher-Vermietung: keine Speicher-Anfragen, keine Verträge (storageRentals.load ohne Daten)
  if (data?.version === 21) {
    data.storageRentals ??= null;
    data.version = 22;
  }
  // Version 22 kennt das Kennzeichen stranded nicht: alle Verträge gelten als laufend – passen sie nach einem
  // Plattendefekt nicht alle, ordnet storageRentals.strandedOn sie beim ersten Zugriff ein (ältere zuerst). Eine NAS,
  // die nur wegen einer defekten Platte als defekt gespeichert ist, läuft wieder (serverParts.load)
  if (data?.version === 22) {
    for (const c of data.storageRentals?.contracts ?? []) delete c.stranded;
    data.version = 23;
  }
  // Version 23 kennt noch keinen Kellerausbau: Wer einen Keller hat (oder bestellt), steht auf Stufe 1, Feld 0 ist Lager
  if (data?.version === 23) {
    if (data.upgrades) {
      data.upgrades.basementStage = data.upgrades.basement ? 1 : 0;
      data.upgrades.basementStageOrdered = data.upgrades.basementOrdered || data.upgrades.basement ? 1 : 0;
      data.upgrades.basementFields = null;
    }
    data.version = 24;
  }
  // Version 24 kennt noch keine eigene Website: nicht eingerichtet, keine Statistik (website.load ohne Daten)
  if (data?.version === 24) {
    data.website ??= null;
    data.version = 25;
  }
  // Version 25 hat 16 Bunker-Plätze je Kellerfeld im 1-m-Gitter: auf die neuen Reihen umziehen
  if (data?.version === 25) {
    migrateBunkerRows(data);
    data.version = 26;
  }
  if (data?.version !== VERSION) return false;

  const e = data.economy;
  economy.money = e.money;
  economy.unlimited = !!e.unlimited;
  economy.instantDelivery = !!e.instantDelivery;
  economy.carryAll = !!e.carryAll;
  // Spieluhr: eigener Eintrag (ab #5) oder früher in economy.time gespeichert
  clock.minutes = data.clock?.minutes ?? e.time ?? clock.minutes;
  economy.pendingCosts = e.pendingCosts ?? 0;
  economy.nextPrinterId = e.nextPrinterId;
  economy.nextLooseId = e.nextLooseId ?? 1;
  economy.printers = e.printers
    .map((p) => ({ clogged: false, nozzlePokes: 0, accentSlot: null, ledColor: null, ...p, model: PRINTERS.find((m) => m.id === p.modelId) }))
    .filter((p) => p.model); // Modelle, die es nicht mehr gibt, fallen weg
  for (const p of economy.printers) delete p.modelId;
  economy.shelf = e.shelf ?? [];
  economy.woodStock = { ...(e.woodStock ?? {}) };
  economy.finishedParts = new Map(e.finishedParts);
  economy.looseParts = e.looseParts ?? [];
  economy.accessories = new Set(e.accessories ?? []);
  // Ausbau: gespeichert (ab #5) oder – bei älteren Ständen – so viele Tische, dass alle aufgestellten Drucker
  // Platz haben, und alle Regalebenen (früher war das Lagerregal immer voll ausgebaut)
  if (data.upgrades) {
    upgrades.tables = data.upgrades.tables;
    upgrades.shelfLevels = data.upgrades.shelfLevels;
    upgrades.tablesOrdered = data.upgrades.tablesOrdered ?? upgrades.tables;
    upgrades.shelfOrdered = data.upgrades.shelfOrdered ?? upgrades.shelfLevels;
    upgrades.deliveries = data.upgrades.deliveries ?? [];
    upgrades.upperFloor = data.upgrades.upperFloor ?? false;
    upgrades.upperFloorOrdered = data.upgrades.upperFloorOrdered ?? upgrades.upperFloor;
    upgrades.elevator = data.upgrades.elevator ?? false;
    upgrades.elevatorOrdered = data.upgrades.elevatorOrdered ?? upgrades.elevator;
    upgrades.basement = data.upgrades.basement ?? false;
    upgrades.basementOrdered = data.upgrades.basementOrdered ?? upgrades.basement;
    upgrades.basementStage = data.upgrades.basementStage ?? upgrades.basementStage;
    upgrades.basementStageOrdered = Math.max(upgrades.basementStage, data.upgrades.basementStageOrdered ?? upgrades.basementStageOrdered);
    upgrades.basementElevator = data.upgrades.basementElevator ?? false;
    upgrades.basementElevatorOrdered = data.upgrades.basementElevatorOrdered ?? upgrades.basementElevator;
  } else {
    const highestSlot = Math.max(-1, ...economy.printers.filter((p) => p.location === 'table').map((p) => p.slot));
    upgrades.tables = Math.max(1, Math.ceil((highestSlot + 1) / SLOTS_PER_TABLE));
    upgrades.shelfLevels = upgrades.maxShelfLevels;
    upgrades.tablesOrdered = upgrades.tables;
    upgrades.shelfOrdered = upgrades.shelfLevels;
  }
  // Kellerfelder: Lager oder Daten-Bunker (Feld 0 bleibt immer Lager)
  upgrades.basementLayout.load(data.upgrades?.basementFields);

  economy.furniture = (e.furniture ?? [])
    .map(({ typeId, ...f }) => ({ ...f, type: furnitureById(typeId) }))
    .filter((f) => f.type);
  for (const f of economy.furniture) {
    if (f.type.id === 'display-shelf') f.parts ??= Array(f.type.capacity).fill(null);
  }
  economy.nextFurnitureId = e.nextFurnitureId ?? 1;
  // Regale ohne gültigen oder mit doppeltem Regalplatz (ältere Zwischenstände) zurück in den Abstellraum
  const usedRackSlots = new Set();
  for (const f of economy.furniture) {
    if (f.location !== 'table' && f.location !== 'wall') continue;
    const maxSlots = f.location === 'wall' ? DISPLAY_SPOTS : upgrades.rackSlots;
    const key = `${f.location}:${f.slot}`;
    if (f.slot >= maxSlots || usedRackSlots.has(key)) {
      f.location = 'storage';
      f.slot = null;
      f.storageSpot = economy.freeStorageSpot();
    } else {
      usedRackSlots.add(key);
    }
  }

  orders.open = data.orders.open;
  orders.nextId = data.orders.nextId;
  orders.untilNext = data.orders.untilNext;
  orders.completed = data.orders.completed;
  orders.stars = new Map(data.orders.stars ?? []);

  progress.xp = data.progress?.xp ?? 0;
  if (data.achievements) {
    Object.assign(achievements.stats, data.achievements.stats);
    achievements.unlocked = new Set(data.achievements.unlocked);
  }

  servers?.load(data.servers);
  climate?.load(data.climate);
  serverParts?.load(data.serverParts); // nach climate: defekte Server bekommen ein defektes Teil
  workbench?.load(); // höchstens ein Server auf der Werkbank (core/workbench.js)
  rentals?.load(data.rentals); // nach servers/economy: Verträge auf fehlenden Servern fallen weg
  storageRentals?.load(data.storageRentals); // nach serverParts und rentals: Verträge auf fehlenden NAS fallen weg
  rentalAutomation?.load(data.rentalAutomation);
  website?.load(data.website); // nach rentals und storageRentals (Online-Anfragen stehen dort)
  aiService?.load(data.aiService);
  economy.notify();
  orders.notify();
  progress.notify();
  upgrades.notify();
  if (staff && data.staff) {
    staff.workers = data.staff.workers;
    staff.nextId = data.staff.nextId;
    staff.receptionist = data.staff.receptionist ?? null; // ältere Stände haben noch keine Empfangskraft
    staff.syncWages();
  }
  clock.notify();
  staff?.notify();
  // Nach der Uhr: Tagesplan der Besucher gilt nur für heute, laufende Grüppchen gelten als gegangen
  visitors?.load(data.visitors);
  return true;
}

// Autospeichern + beim Verlassen der Seite. onSaved wird nach jedem Speichern aufgerufen (z. B. für ein Symbol).
// disable() braucht „Neues Spiel“, damit der gelöschte Stand beim Neuladen nicht gleich wieder geschrieben wird.
// getCarried: () => Spulen, die der Spieler gerade trägt
export function startAutosave(game, onSaved, getCarried = () => []) {
  let enabled = true;
  const save = () => {
    if (enabled && saveGame(game, getCarried())) onSaved?.();
  };
  setInterval(save, AUTOSAVE_SECONDS * 1000);
  window.addEventListener('beforeunload', save);
  return { save, disable: () => { enabled = false; } };
}

// Holzlager zum Speichern, mit den Platten, die gerade jemand in der Hand hat
function woodStockWith(stock, sheets) {
  const result = { ...stock };
  for (const sheet of sheets) result[sheet.woodId] = (result[sheet.woodId] ?? 0) + 1;
  return result;
}
