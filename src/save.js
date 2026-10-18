// Spielstand in localStorage: Geld, Drucker, Lager, fertige Teile, Aufträge und Level.
// Speichert automatisch alle paar Sekunden und beim Schließen des Tabs.
import { PRINTERS } from './catalog.js';

const KEY = 'druckercenter-save';
const VERSION = 3; // 2: Drucker mit Spulenfächern (AMS) · 3: Ausbau und Spieluhr
const COMPATIBLE = [2, 3]; // ältere Stände laden mit Startwerten für das Neue
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

// carried: Spulen in der Hand ({ filamentId, grams }) – werden als „im Regal“ gespeichert, damit nichts verloren geht
export function saveGame(economy, orders, progress, carried = [], upgrades = null, clock = null) {
  const filaments = new Map([...economy.filaments].map(([id, spools]) => [id, [...spools]]));
  for (const { filamentId, grams } of carried) {
    if (!filaments.has(filamentId)) filaments.set(filamentId, []);
    filaments.get(filamentId).push(grams);
  }
  const data = {
    version: VERSION,
    savedAt: Date.now(),
    economy: {
      money: economy.money,
      nextPrinterId: economy.nextPrinterId,
      // Getragene Drucker landen beim Laden wieder im Abstellraum
      printers: economy.printers.map((p) => ({
        id: p.id,
        modelId: p.model.id,
        location: p.location === 'table' ? 'table' : 'storage',
        slot: p.location === 'table' ? p.slot : null,
        spools: p.spools.map((spool) => (spool ? { ...spool } : null)),
        activeSlot: p.activeSlot,
        speedId: p.speedId,
        job: p.job ? { ...p.job } : null,
      })),
      filaments: [...filaments],
      finishedParts: [...economy.finishedParts],
    },
    orders: {
      open: orders.open.map((o) => ({ ...o })),
      nextId: orders.nextId,
      untilNext: orders.untilNext,
      completed: orders.completed,
    },
    progress: { xp: progress.xp },
    upgrades: upgrades && { tables: upgrades.tables, shelfLevels: upgrades.shelfLevels },
    clock: clock && { minutes: clock.minutes },
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Überschreibt den Zustand der übergebenen Objekte. Gibt false zurück, wenn kein (gültiger) Spielstand da ist.
export function loadGame(economy, orders, progress, upgrades = null, clock = null) {
  let data;
  try {
    data = JSON.parse(storage()?.getItem(KEY) ?? 'null');
  } catch {
    return false;
  }
  if (!COMPATIBLE.includes(data?.version)) return false;

  const e = data.economy;
  economy.money = e.money;
  economy.nextPrinterId = e.nextPrinterId;
  economy.printers = e.printers
    .map((p) => ({ ...p, model: PRINTERS.find((m) => m.id === p.modelId) }))
    .filter((p) => p.model); // Modelle, die es nicht mehr gibt, fallen weg
  for (const p of economy.printers) delete p.modelId;
  economy.filaments = new Map(e.filaments);
  economy.finishedParts = new Map(e.finishedParts);

  orders.open = data.orders.open;
  orders.nextId = data.orders.nextId;
  orders.untilNext = data.orders.untilNext;
  orders.completed = data.orders.completed;

  progress.xp = data.progress?.xp ?? 0;
  if (upgrades && data.upgrades) {
    upgrades.tables = data.upgrades.tables;
    upgrades.shelfLevels = data.upgrades.shelfLevels;
  } else if (upgrades) {
    // Stand von vor dem Ausbau: so viele Tische, dass alle aufgestellten Drucker Platz haben
    const highestSlot = Math.max(-1, ...economy.printers.filter((p) => p.location === 'table').map((p) => p.slot));
    upgrades.tables = Math.max(1, Math.ceil((highestSlot + 1) / 4));
    upgrades.shelfLevels = upgrades.maxShelfLevels;
  }
  if (clock && data.clock) clock.minutes = data.clock.minutes;

  economy.notify();
  orders.notify();
  progress.notify();
  upgrades?.notify();
  clock?.notify();
  return true;
}

// Autospeichern + beim Verlassen der Seite. onSaved wird nach jedem Speichern aufgerufen (z. B. für ein Symbol).
// disable() braucht „Neues Spiel“, damit der gelöschte Stand beim Neuladen nicht gleich wieder geschrieben wird.
// getCarried: () => Spulen, die der Spieler gerade trägt
export function startAutosave({ economy, orders, progress, upgrades, clock, onSaved, getCarried = () => [] }) {
  let enabled = true;
  const save = () => {
    if (enabled && saveGame(economy, orders, progress, getCarried(), upgrades, clock)) onSaved?.();
  };
  setInterval(save, AUTOSAVE_SECONDS * 1000);
  window.addEventListener('beforeunload', save);
  return { save, disable: () => { enabled = false; } };
}
