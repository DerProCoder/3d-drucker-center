// Wirtschaft und Besitz: Kontostand, Drucker (Standort, Spule, Druckauftrag), Filamentlager, fertige Teile.
// Bewusst ohne Three.js, damit die Logik unabhängig vom Rendering bleibt.
import { SPOOL_GRAMS, filamentById, speedById, templateById } from './catalog.js';

export const START_MONEY = 100; // € – dazu gibt es einen A1 mini (siehe main.js)
export const GAME_MINUTES_PER_SECOND = 1 / 3; // Spielzeit: 1 echte Sekunde = 20 Spielsekunden

// Drucker:
//   location: 'storage' (Karton im Abstellraum) | 'carried' (in der Hand) | 'table' (aufgestellt)
//   spools: Fächer für Spulen ({ filamentId, grams } oder null) – 1 Fach oder 4 beim AMS
//   activeSlot: Fach, aus dem gedruckt wird
//   speedId: gewählte Geschwindigkeitsstufe
//   job: { templateId, filamentId, slot, progress 0…1, status: 'printing' | 'paused' | 'done' } oder null
export class Economy {
  constructor() {
    this.money = START_MONEY;
    this.printers = [];
    this.filaments = new Map();    // Filament-ID → Restgewichte der Spulen im Regal (g)
    this.finishedParts = new Map(); // Vorlagen-ID → Anzahl fertiger Teile
    this.nextPrinterId = 1;
    this.listeners = new Set();
  }

  // Strom verbrauchen nur aufgestellte Drucker
  get powerCostPerMonth() {
    return this.printers
      .filter((p) => p.location === 'table')
      .reduce((sum, p) => sum + p.model.powerCostPerMonth, 0);
  }

  get spoolsInStorage() {
    let total = 0;
    for (const spools of this.filaments.values()) total += spools.length;
    return total;
  }

  canAfford(amount) {
    return this.money >= amount;
  }

  filamentStock(filamentId) {
    return this.filaments.get(filamentId)?.length ?? 0;
  }

  printersOfModel(modelId) {
    return this.printers.filter((p) => p.model.id === modelId).length;
  }

  printerById(id) {
    return this.printers.find((p) => p.id === id);
  }

  // Zieht den Betrag ab, falls genug Geld da ist. Gibt zurück, ob es geklappt hat.
  spend(amount) {
    if (!this.withdraw(amount)) return false;
    this.notify();
    return true;
  }

  earn(amount) {
    this.money += amount;
    this.notify();
  }

  // Rechnung abbuchen (z. B. Strom). Darf ins Minus gehen – dann kann man nichts mehr kaufen.
  charge(amount) {
    this.money = Math.round((this.money - amount) * 100) / 100;
    this.notify();
  }

  // ---------- Einkauf: alles wird in den Abstellraum geliefert ----------

  // Gibt den neuen Drucker zurück oder null, wenn das Geld nicht reicht
  buyPrinter(model) {
    if (!this.withdraw(model.price)) return null;
    return this.addPrinter(model);
  }

  // Drucker ohne Bezahlen dazubekommen (Startausstattung). Landet wie gekaufte im Abstellraum.
  addPrinter(model) {
    const printer = {
      id: this.nextPrinterId++, model, location: 'storage', slot: null,
      spools: Array(model.spoolSlots).fill(null), activeSlot: 0, speedId: 'standard', job: null,
    };
    this.printers.push(printer);
    this.notify();
    return printer;
  }

  buyFilament(filament) {
    if (!this.withdraw(filament.price)) return false;
    this.storeSpool(filament.id, SPOOL_GRAMS);
    this.notify();
    return true;
  }

  // ---------- Tragen, Aufstellen, Einlegen ----------

  takePrinterFromStorage(id) {
    const p = this.printerById(id);
    if (p?.location !== 'storage') return false;
    p.location = 'carried';
    this.notify();
    return true;
  }

  returnPrinterToStorage(id) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'storage';
    p.slot = null;
    this.notify();
  }

  placePrinter(id, slot) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'table';
    p.slot = slot;
    this.notify();
  }

  // Nimmt eine Spule aus dem Regal und gibt ihr Restgewicht zurück (null, wenn keine da ist)
  takeFilamentFromStorage(filamentId) {
    const spools = this.filaments.get(filamentId);
    if (!spools?.length) return null;
    const grams = spools.pop();
    if (!spools.length) this.filaments.delete(filamentId);
    this.notify();
    return grams;
  }

  returnFilamentToStorage(filamentId, grams) {
    this.storeSpool(filamentId, grams);
    this.notify();
  }

  activeSpool(printer) {
    return printer.spools[printer.activeSlot] ?? null;
  }

  // Fach, in das eine neue Spule käme: erstes freies, bei nur einem Fach immer dieses (Tausch). -1 = AMS voll.
  loadTarget(printer) {
    const free = printer.spools.indexOf(null);
    if (free !== -1) return free;
    return printer.spools.length === 1 ? 0 : -1;
  }

  // Fach, aus dem beim Herausnehmen die Spule kommt: das letzte belegte. -1 = alles leer.
  unloadTarget(printer) {
    return printer.spools.findLastIndex((s) => s !== null);
  }

  // Legt eine Spule ein und gibt die dadurch verdrängte zurück ({ filamentId, grams } oder null)
  loadFilament(printerId, filamentId, grams) {
    const p = this.printerById(printerId);
    const slot = this.loadTarget(p);
    if (slot === -1) return null;
    const previous = this.takeSpool(p, slot);
    p.spools[slot] = { filamentId, grams };
    if (!this.activeSpool(p)) p.activeSlot = slot; // leeres aktives Fach: neue Spule gleich auswählen
    this.notify();
    return previous;
  }

  unloadFilament(printerId) {
    const p = this.printerById(printerId);
    const slot = this.unloadTarget(p);
    const previous = slot === -1 ? null : this.takeSpool(p, slot);
    this.notify();
    return previous;
  }

  setActiveSlot(printerId, slot) {
    const p = this.printerById(printerId);
    if (this.isBusy(p)) return;
    p.activeSlot = slot;
    this.notify();
  }

  // ---------- Drucken ----------

  isBusy(printer) {
    return printer.job !== null && printer.job.status !== 'done';
  }

  // Grund, warum der Druck nicht starten kann, oder null
  printProblem(printer, template) {
    if (printer.location !== 'table') return 'Drucker ist nicht aufgestellt';
    if (this.isBusy(printer)) return 'Druckt gerade';
    if (printer.job?.status === 'done') return 'Erst das fertige Teil entnehmen';
    const spool = this.activeSpool(printer);
    if (!spool) return printer.spools.length > 1 ? 'Gewähltes AMS-Fach ist leer' : 'Kein Filament eingelegt';
    const material = filamentById(spool.filamentId).material;
    if (!template.materials.includes(material)) return `Braucht ${template.materials.join(' / ')}`;
    const { x, y, z } = template.size;
    const b = printer.model.build;
    const fitsFlat = (x <= b.x && y <= b.y) || (y <= b.x && x <= b.y);
    if (!fitsFlat || z > b.z) return 'Passt nicht in den Bauraum';
    if (spool.grams < template.grams) return 'Zu wenig Filament auf der Spule';
    return null;
  }

  startPrint(printerId, template) {
    const p = this.printerById(printerId);
    if (this.printProblem(p, template)) return false;
    const spool = this.activeSpool(p);
    spool.grams -= template.grams; // Material wird beim Start fest eingeplant
    p.job = { templateId: template.id, filamentId: spool.filamentId, slot: p.activeSlot, progress: 0, status: 'printing' };
    this.notify();
    return true;
  }

  setPrintSpeed(printerId, speedId) {
    this.printerById(printerId).speedId = speedId;
    this.notify();
  }

  pausePrint(printerId) {
    const job = this.printerById(printerId).job;
    if (job?.status === 'printing') job.status = 'paused';
    this.notify();
  }

  resumePrint(printerId) {
    const job = this.printerById(printerId).job;
    if (job?.status === 'paused') job.status = 'printing';
    this.notify();
  }

  // Abbrechen: das verbrauchte Filament ist verloren
  cancelPrint(printerId) {
    this.printerById(printerId).job = null;
    this.notify();
  }

  collectPart(printerId) {
    const p = this.printerById(printerId);
    if (p.job?.status !== 'done') return;
    this.finishedParts.set(p.job.templateId, (this.finishedParts.get(p.job.templateId) ?? 0) + 1);
    p.job = null;
    this.notify();
  }

  // Fertige Teile abgeben (für Kundenaufträge). Gibt zurück, ob genug da waren.
  takeFinishedParts(templateId, count) {
    const have = this.finishedParts.get(templateId) ?? 0;
    if (have < count) return false;
    if (have === count) this.finishedParts.delete(templateId);
    else this.finishedParts.set(templateId, have - count);
    this.notify();
    return true;
  }

  // Restliche Druckzeit in Spielminuten bei der aktuellen Geschwindigkeit
  remainingMinutes(printer) {
    const job = printer.job;
    if (!job) return 0;
    const template = templateById(job.templateId);
    return ((1 - job.progress) * template.minutes) / (speedById(printer.speedId).percent / 100);
  }

  // Lässt alle laufenden Drucke um gameMinutes weiterlaufen. Benachrichtigt nur, wenn ein Druck fertig wird,
  // damit das Druckermenü nicht in jedem Frame neu aufgebaut wird.
  advancePrints(gameMinutes) {
    let finished = false;
    for (const p of this.printers) {
      const job = p.job;
      if (job?.status !== 'printing') continue;
      const template = templateById(job.templateId);
      job.progress += (gameMinutes * speedById(p.speedId).percent / 100) / template.minutes;
      if (job.progress >= 1) {
        job.progress = 1;
        job.status = 'done';
        finished = true;
      }
    }
    if (finished) this.notify();
  }

  // ---------- Benachrichtigung ----------

  // Callback wird sofort und bei jeder Änderung aufgerufen. Rückgabe: Abmelde-Funktion.
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }

  // ---------- intern ----------

  withdraw(amount) {
    if (!this.canAfford(amount)) return false;
    this.money -= amount;
    return true;
  }

  storeSpool(filamentId, grams) {
    if (!this.filaments.has(filamentId)) this.filaments.set(filamentId, []);
    this.filaments.get(filamentId).push(grams);
  }

  // Nimmt die Spule aus einem Fach. Leere Spulen werden entsorgt (Rückgabe null).
  takeSpool(printer, slot) {
    const spool = printer.spools[slot];
    printer.spools[slot] = null;
    return spool && spool.grams > 0 ? spool : null;
  }
}
