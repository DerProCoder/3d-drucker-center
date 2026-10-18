// Spielstand in localStorage: Geld, Spielzeit, Drucker, Lager, fertige Teile, Aufträge, Level und Erfolge.
// Speichert automatisch alle paar Sekunden und beim Schließen des Tabs.
import { PRINTERS, templateById } from './catalog.js';

const KEY = 'druckercenter-save';
const VERSION = 3; // 2: Drucker mit Spulenfächern (AMS) · 3: Spielzeit, Feuchte, Pannen, farbige Teile, Erfolge
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

// carried: Spulen in der Hand ({ filamentId, grams, moisture }) – werden als „im Regal“ gespeichert,
// damit beim Neuladen nichts verloren geht
export function saveGame(economy, orders, progress, achievements, carried = []) {
  const shelf = economy.shelf.map((s) => ({ ...s }));
  const used = new Set(shelf.map((s) => s.shelfSlot));
  let free = 0;
  for (const spool of carried) {
    while (used.has(free)) free++;
    used.add(free);
    shelf.push({ filamentId: spool.filamentId, grams: spool.grams, moisture: spool.moisture ?? 0, shelfSlot: free });
  }
  const data = {
    version: VERSION,
    savedAt: Date.now(),
    economy: {
      money: economy.money,
      time: economy.time,
      pendingCosts: economy.pendingCosts,
      nextPrinterId: economy.nextPrinterId,
      nextLooseId: economy.nextLooseId,
      // Getragene Drucker landen beim Laden wieder im Abstellraum
      printers: economy.printers.map((p) => ({
        id: p.id,
        modelId: p.model.id,
        location: p.location === 'table' ? 'table' : 'storage',
        slot: p.location === 'table' ? p.slot : null,
        storageSpot: p.location === 'table' ? null : p.storageSpot,
        spools: p.spools.map((spool) => (spool ? { ...spool } : null)),
        activeSlot: p.activeSlot,
        speedId: p.speedId,
        clogged: p.clogged,
        nozzlePokes: p.nozzlePokes,
        job: p.job ? { ...p.job } : null,
      })),
      shelf,
      finishedParts: [...economy.finishedParts],
      looseParts: economy.looseParts.map((l) => ({ ...l })),
      accessories: [...economy.accessories],
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
export function loadGame(economy, orders, progress, achievements) {
  let data;
  try {
    data = JSON.parse(storage()?.getItem(KEY) ?? 'null');
  } catch {
    return false;
  }
  if (data?.version === 2) data = migrateV2(data);
  if (data?.version !== VERSION) return false;

  const e = data.economy;
  economy.money = e.money;
  economy.time = e.time ?? economy.time;
  economy.pendingCosts = e.pendingCosts ?? 0;
  economy.nextPrinterId = e.nextPrinterId;
  economy.nextLooseId = e.nextLooseId ?? 1;
  economy.printers = e.printers
    .map((p) => ({ clogged: false, nozzlePokes: 0, ...p, model: PRINTERS.find((m) => m.id === p.modelId) }))
    .filter((p) => p.model); // Modelle, die es nicht mehr gibt, fallen weg
  for (const p of economy.printers) delete p.modelId;
  economy.shelf = e.shelf ?? [];
  economy.finishedParts = new Map(e.finishedParts);
  economy.looseParts = e.looseParts ?? [];
  economy.accessories = new Set(e.accessories ?? []);

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
  return true;
}

// Autospeichern + beim Verlassen der Seite. onSaved wird nach jedem Speichern aufgerufen (z. B. für ein Symbol).
// disable() braucht „Neues Spiel“, damit der gelöschte Stand beim Neuladen nicht gleich wieder geschrieben wird.
// getCarried: () => Spulen, die der Spieler gerade trägt
export function startAutosave(economy, orders, progress, achievements, onSaved, getCarried = () => []) {
  let enabled = true;
  const save = () => {
    if (enabled && saveGame(economy, orders, progress, achievements, getCarried())) onSaved?.();
  };
  setInterval(save, AUTOSAVE_SECONDS * 1000);
  window.addEventListener('beforeunload', save);
  return { save, disable: () => { enabled = false; } };
}
