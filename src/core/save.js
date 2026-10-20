// Spielstand in localStorage: Geld, Spielzeit, Drucker, Lager, Regale, fertige Teile, Aufträge, Level, Erfolge
// und Hallen-Ausbau. Speichert automatisch alle paar Sekunden und beim Schließen des Tabs.
// game: { economy, orders, progress, achievements, upgrades, clock }
import { PRINTERS, furnitureById, templateById } from './catalog.js';
import { SLOTS_PER_TABLE } from './upgrades.js';
import { DISPLAY_SPOTS } from './display-shelf.js';

const KEY = 'druckercenter-save';
// 2: Drucker mit Spulenfächern (AMS) · 3: zwei Varianten – Pannen/Feuchte/Erfolge/Regale (#6) bzw.
// Ausbau + Spieluhr (#5) · 4: beides zusammen · 5: Aufträge mit Stufe am Empfang (counter/open/packed)
// 6: Ausstellungsregale an der Südwand (location 'wall') mit ausgestellten Teilen (parts)
const VERSION = 6;
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
export function saveGame({ economy, orders, progress, achievements, upgrades, clock, staff }, carried = {}) {
  const carriedSpools = Array.isArray(carried) ? carried : carried.spools ?? [];
  const shelf = economy.shelf.map((s) => ({ ...s }));
  const used = new Set(shelf.map((s) => s.shelfSlot));
  let free = 0;
  const furniture = economy.furniture.map((f) => ({
    id: f.id,
    typeId: f.type.id,
    // Getragene Regale landen beim Laden wieder im Abstellraum
    location: ['table', 'wall', 'shipping'].includes(f.location) ? f.location : 'storage',
    slot: f.location === 'table' || f.location === 'wall' ? f.slot : null,
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
      deliveries: upgrades.deliveries.map((d) => ({ ...d })),
    },
    clock: { minutes: clock.minutes },
    staff: staff
      ? { workers: staff.workers.map((w) => ({ ...w })), nextId: staff.nextId, receptionist: staff.receptionist ? { ...staff.receptionist } : null }
      : undefined,
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
export function loadGame({ economy, orders, progress, achievements, upgrades, clock, staff }) {
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
  if (data?.version !== VERSION) return false;

  const e = data.economy;
  economy.money = e.money;
  economy.unlimited = !!e.unlimited;
  economy.instantDelivery = !!e.instantDelivery;
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
  } else {
    const highestSlot = Math.max(-1, ...economy.printers.filter((p) => p.location === 'table').map((p) => p.slot));
    upgrades.tables = Math.max(1, Math.ceil((highestSlot + 1) / SLOTS_PER_TABLE));
    upgrades.shelfLevels = upgrades.maxShelfLevels;
    upgrades.tablesOrdered = upgrades.tables;
    upgrades.shelfOrdered = upgrades.shelfLevels;
  }

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
