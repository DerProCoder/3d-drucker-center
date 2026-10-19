// Personal: Azubis einstellen, die in der Halle mithelfen. Kostet eine Einstellungsgebühr und Lohn pro Spielstunde
// (läuft über economy.wagesPerHour in die stündliche Rechnung). Hier steht nur, WAS es zu tun gibt und was eine
// erledigte Aufgabe bewirkt – Laufen und Aussehen macht world/workers.js. Bewusst ohne Three.js und DOM.
import { waitingFilament } from './two-color.js';
import { WASTE_EMPTY_AT } from './economy.js';

export const MAX_WORKERS = 2;
export const HIRE_FEE = 50;       // € einmalig
export const WAGE_PER_HOUR = 2;   // € pro Spielstunde und Mitarbeiter
const NAMES = ['Kevin', 'Lea', 'Mehmet', 'Sophie', 'Finn', 'Aylin'];

// Aufgaben nach Wichtigkeit. Jede hat ein Ziel (Drucker, Boden oder Lagerregal) und eine Arbeitszeit in Sekunden.
//   clear  – Fehldruck vom Bett kratzen        poke   – verstopfte Düse freistechen (bis sie frei ist)
//   refill – passende Spule aus dem Lager holen und in den wartenden Drucker legen
//   collect – fertiges Teil entnehmen          pick   – heruntergefallenes Teil vom Boden aufheben
//   empty  – Mülleimer mit Spülabfall leeren (ab WASTE_EMPTY_AT; ist er voll und der Drucker wartet, ganz vorne)
export const WORK_SECONDS = { clear: 3, poke: 1, collect: 1.5, pick: 1, take: 1.5, load: 2, empty: 2.5 };

export class Staff {
  constructor(economy) {
    this.economy = economy;
    this.workers = []; // { id, name }
    this.nextId = 1;
    this.listeners = new Set();
    this.onEvent = null; // (type, data) => void – 'hired' | 'fired'
  }

  get wagesPerHour() {
    return this.workers.length * WAGE_PER_HOUR;
  }

  // Grund, warum man gerade niemanden einstellen kann, oder null
  hireProblem() {
    if (this.workers.length >= MAX_WORKERS) return 'Halle ist voll besetzt';
    if (!this.economy.canAfford(HIRE_FEE)) return 'Zu wenig Geld';
    return null;
  }

  hire() {
    if (this.hireProblem() || !this.economy.spend(HIRE_FEE)) return null;
    const used = new Set(this.workers.map((w) => w.name));
    const worker = { id: this.nextId++, name: NAMES.find((n) => !used.has(n)) ?? `Azubi ${this.nextId}` };
    this.workers.push(worker);
    this.syncWages();
    this.notify();
    this.onEvent?.('hired', { worker });
    return worker;
  }

  fire(id) {
    const worker = this.workers.find((w) => w.id === id);
    if (!worker) return;
    this.workers = this.workers.filter((w) => w !== worker);
    this.syncWages();
    this.notify();
    this.onEvent?.('fired', { worker });
  }

  syncWages() {
    this.economy.wagesPerHour = this.wagesPerHour;
  }

  // Nächste Aufgabe, die noch niemand übernommen hat (reserved: Set der Aufgaben-Schlüssel) oder null
  findTask(reserved) {
    const e = this.economy;
    const free = (task) => !reserved.has(taskKey(task));
    const onTable = e.printers.filter((p) => p.location === 'table');
    const candidates = [
      ...onTable.filter((p) => p.job?.pauseReason === 'waste').map((p) => ({ type: 'empty', printerId: p.id })),
      ...onTable.filter((p) => p.job?.status === 'failed').map((p) => ({ type: 'clear', printerId: p.id })),
      ...onTable.filter((p) => p.clogged && !e.isBusy(p)).map((p) => ({ type: 'poke', printerId: p.id })),
      ...onTable.filter((p) => p.job?.status === 'done').map((p) => ({ type: 'collect', printerId: p.id })),
      ...onTable
        .filter((p) => p.job?.pauseReason === 'filament' && e.loadTarget(p) !== -1)
        .filter((p) => e.shelf.some((s) => s.filamentId === waitingFilament(p.job)))
        .map((p) => ({ type: 'refill', printerId: p.id, filamentId: waitingFilament(p.job) })),
      ...e.looseParts.map((l) => ({ type: 'pick', looseId: l.id })),
      ...onTable.filter((p) => (p.waste ?? 0) >= WASTE_EMPTY_AT).map((p) => ({ type: 'empty', printerId: p.id })),
    ];
    return candidates.find(free) ?? null;
  }

  // Ist die Aufgabe noch nötig? (Der Spieler kann sie inzwischen selbst erledigt haben.)
  stillNeeded(task) {
    const e = this.economy;
    if (task.type === 'pick') return e.looseParts.some((l) => l.id === task.looseId);
    const p = e.printerById(task.printerId);
    if (p?.location !== 'table') return false;
    if (task.type === 'clear') return p.job?.status === 'failed';
    if (task.type === 'poke') return p.clogged;
    if (task.type === 'collect') return p.job?.status === 'done';
    if (task.type === 'refill') return p.job?.pauseReason === 'filament' && waitingFilament(p.job) === task.filamentId;
    if (task.type === 'empty') return (p.waste ?? 0) > 0;
    return false;
  }

  // Spule fürs Nachlegen aus dem Lagerregal nehmen (die trockenste passende) – oder null
  takeSpoolFor(task) {
    const spools = this.economy.shelf
      .filter((s) => s.filamentId === task.filamentId)
      .sort((a, b) => (a.moisture ?? 0) - (b.moisture ?? 0));
    return spools.length ? this.economy.takeSpoolFromShelf(spools[0].shelfSlot) : null;
  }

  // Aufgabe am Ziel ausführen. Gibt true zurück, wenn sie erledigt ist (poke braucht mehrere Stiche).
  // carried: Spule in der Hand (bei refill). Verdrängte oder nicht mehr gebrauchte Spulen gehen zurück ins Regal.
  perform(task, carried = null) {
    const e = this.economy;
    switch (task.type) {
      case 'clear': e.clearFailedPrint(task.printerId); return true;
      case 'collect': e.collectPart(task.printerId); return true;
      case 'pick': e.pickUpLoosePart(task.looseId); return true;
      case 'empty': e.emptyWasteBin(task.printerId); return true;
      case 'poke': return e.pokeNozzle(task.printerId);
      case 'refill': {
        if (!carried) return true;
        if (!this.stillNeeded(task)) {
          e.returnFilamentToStorage(carried);
          return true;
        }
        const previous = e.loadFilament(task.printerId, carried);
        if (previous) e.returnFilamentToStorage(previous);
        return true;
      }
      default: return true;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }
}

export const taskKey = (task) => `${task.type}|${task.printerId ?? task.looseId}`;

// Kurzer Text, was der Mitarbeiter gerade tut (für Hinweis und PC-App)
export function taskText(task, economy, phase) {
  if (!task) return 'wartet auf Arbeit';
  const printer = task.printerId && economy.printerById(task.printerId);
  const where = printer ? ` am ${printer.model.name}` : '';
  switch (task.type) {
    case 'clear': return `räumt einen Fehldruck weg${where}`;
    case 'poke': return `sticht die Düse frei${where}`;
    case 'collect': return `nimmt ein fertiges Teil ab${where}`;
    case 'pick': return 'hebt ein Teil vom Boden auf';
    case 'empty': return `leert den Mülleimer${where}`;
    case 'refill': return phase === 'to-shelf' ? 'holt Filament aus dem Lager' : `legt Filament ein${where}`;
    default: return '';
  }
}
