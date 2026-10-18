// Wirtschaft und Besitz: Kontostand, Spielzeit mit stündlicher Abrechnung (Miete + Strom), Drucker (Standort,
// Spulen, Druckauftrag, Pannen), Filamentlager mit Feuchte, fertige Teile, Zubehör.
// Bewusst ohne Three.js, damit die Logik unabhängig vom Rendering bleibt.
import { FAILURES, SPOOL_GRAMS, filamentById, filamentLabel, speedById, templateById } from './catalog.js';


export const START_MONEY = 5000; // €
export const GAME_MINUTES_PER_SECOND = 1 / 3; // Spielzeit: 1 echte Sekunde = 20 Spielsekunden
export const RENT_PER_HOUR = 3;    // € Hallenmiete pro Spielstunde
export const IDLE_POWER_SHARE = 0.15; // Stromverbrauch im Leerlauf, Anteil vom Verbrauch beim Drucken
export const BANKRUPT_AT = -500;   // so weit lässt die Bank das Konto überziehen, danach ist Schluss
export const WET = 0.5;            // ab dieser Feuchte gilt eine Spule als feucht
export const DAMP = 0.4;           // ab dieser Feuchte steigt das Fehldruckrisiko
export const NOZZLE_POKES = 5;     // so oft muss man eine verstopfte Düse freistechen
export const NOZZLE_LIFE_HOURS = 48; // so viele Druckstunden (bei 100 %) hält eine Düse
export const NOZZLE_WORN = 0.75;   // ab diesem Verschleiß steigt das Fehldruckrisiko
export const PLATE_GAP = 5;        // mm Abstand zwischen Teilen auf der Druckplatte
export const MAX_PER_PLATE = 16;   // mehr Teile auf einmal lässt das Spiel nicht zu
const BATCH_TIME_SHARE = 0.9;      // jedes weitere Teil braucht 90 % der Zeit (Aufheizen, Kalibrieren nur einmal)

// Teile auf der Druckplatte im Raster anordnen. Gibt { max, positions } zurück: wie viele höchstens passen und
// die Mittelpunkte (mm, relativ zur Plattenmitte, x = Breite, y = Tiefe) für count Teile.
// Teile dürfen gedreht werden, wenn dann mehr draufpassen.
export function plateLayout(template, build, count = 1) {
  const grid = (w, d) => {
    const cols = Math.floor((build.x + PLATE_GAP) / (w + PLATE_GAP));
    const rows = Math.floor((build.y + PLATE_GAP) / (d + PLATE_GAP));
    return { cols, rows, w, d, max: Math.min(MAX_PER_PLATE, cols * rows) };
  };
  const a = grid(template.size.x, template.size.y);
  const b = grid(template.size.y, template.size.x);
  const g = b.max > a.max ? { ...b, rotated: true } : { ...a, rotated: false };
  const n = Math.max(0, Math.min(count, g.max));
  // Möglichst quadratisch belegen: so viele Spalten wie nötig, Reihen danach
  const square = Math.ceil(Math.sqrt(n * (g.d + PLATE_GAP) / (g.w + PLATE_GAP))) || 1;
  const cols = Math.min(g.cols, Math.max(square, Math.ceil(n / g.rows)));
  const rows = Math.ceil(n / cols);
  const positions = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols); // letzte Reihe mittig
    positions.push({
      x: (c - (inRow - 1) / 2) * (g.w + PLATE_GAP),
      y: (r - (rows - 1) / 2) * (g.d + PLATE_GAP),
    });
  }
  return { max: g.max, rotated: g.rotated, positions };
}

// Druckzeit (Spielminuten bei 100 %) und Material für count Teile auf einer Platte
export const batchMinutes = (template, count = 1) => template.minutes * (1 + BATCH_TIME_SHARE * (count - 1));
export const batchGrams = (template, count = 1) => template.grams * count;

// Feuchte (0 = trocken, 1 = klatschnass) pro Spielminute, je nachdem, wo die Spule liegt.
// 1 Spieltag = 72 echte Minuten: Am offenen Halter ist eine Spule nach etwa einem Spieltag feucht.
const MOISTURE_PER_MINUTE = {
  shelf: 1 / 4320, // offen im Regal: nach drei Spieltagen durchnässt
  dryer: -1 / 240, // im Trockenschrank: nach 4 Spielstunden wieder trocken
  open: 1 / 2880,  // offener Spulenhalter am Drucker: nach zwei Spieltagen durchnässt
  ams: 1 / 8640,   // im AMS mit Trockenmittel
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Spule: { filamentId, grams, moisture }
// Drucker:
//   location: 'storage' (Karton im Abstellraum) | 'carried' (in der Hand) | 'table' (aufgestellt)
//   spools: Fächer für Spulen (Spule oder null) – 1 Fach oder 4 beim AMS
//   activeSlot: Fach, aus dem gedruckt wird
//   speedId: gewählte Geschwindigkeitsstufe
//   clogged / nozzlePokes: verstopfte Düse und wie oft schon gestochert wurde
//   nozzleWear: Verschleiß der Düse 0…1 – bei 1 ist sie hinüber und muss getauscht werden
//   job: { templateId, count (Teile auf der Platte), filamentId, slot, progress 0…1, gramsUsed,
//          status: 'printing' | 'paused' | 'done' | 'failed', pauseReason?: 'filament', failure?: Schlüssel aus FAILURES }
//        oder null
// Fertige Teile haben eine Farbe: Schlüssel `${templateId}|${filamentId}` → Anzahl
// Regal: Spulen mit festem Platz { filamentId, grams, moisture, shelfSlot }, damit beim Herausnehmen nichts nachrutscht
// Kartons im Abstellraum haben ebenso einen festen Platz (storageSpot)
// Einrichtung (Regale am Druckertisch): { id, type (aus FURNITURE), location, slot, storageSpot,
//   spools (Filament-Regal: Fächer mit Spule oder null), nozzles (Ersatzteilregal: Anzahl Ersatzdüsen) }
//   Regale stehen auf eigenen Plätzen in den Lücken zwischen den Druckern (3 pro Drucktisch, siehe upgrades.js).
// Lose Teile: hat der Kater vom Tisch geworfen, liegen auf dem Boden { id, templateId, filamentId, x, z, rotY }
export class Economy {
  constructor() {
    this.money = START_MONEY;
    this.pendingCosts = 0;           // aufgelaufene Kosten der laufenden Stunde (die Uhrzeit führt game-clock.js)
    this.printers = [];
    this.shelf = [];                 // Spulen im Regal
    this.finishedParts = new Map();
    this.looseParts = [];
    this.accessories = new Set();    // gekauftes Zubehör (IDs aus ACCESSORIES)
    this.furniture = [];             // Regale (siehe oben)
    this.nextFurnitureId = 1;
    this.nextPrinterId = 1;
    this.nextLooseId = 1;
    this.listeners = new Set();
    this.onEvent = null;             // (type, data) => void – für Sound, Meldungen und Erfolge
    this.random = Math.random;       // austauschbar, damit sich Pannen im Test erzwingen lassen
  }

  // ---------- Laufende Kosten ----------

  // Strom: aufgestellte Drucker verbrauchen beim Drucken voll, sonst nur ein wenig
  get powerPerHour() {
    return this.printers
      .filter((p) => p.location === 'table')
      .reduce((sum, p) => sum + p.model.powerPerHour * (p.job?.status === 'printing' ? 1 : IDLE_POWER_SHARE), 0);
  }

  get costPerHour() {
    return RENT_PER_HOUR + this.powerPerHour;
  }

  get bankrupt() {
    return this.money < BANKRUPT_AT;
  }

  get hasDryer() {
    return this.accessories.has('dryer');
  }

  // Lässt die Spielzeit laufen: Spulen ziehen Feuchte, Miete und Strom laufen auf
  advanceTime(gameMinutes) {
    this.pendingCosts += (this.costPerHour * gameMinutes) / 60;
    this.updateMoisture(gameMinutes);
  }

  // Zu jeder vollen Spielstunde (Meldung der Spieluhr): aufgelaufene Miete und Strom abbuchen
  payHourlyBill() {
    const amount = Math.round(this.pendingCosts * 100) / 100;
    this.pendingCosts = 0;
    if (amount <= 0) return;
    this.charge(amount);
    this.emit('bill', { amount });
  }

  // Rechnung abbuchen. Darf ins Minus gehen – dann kann man nichts mehr kaufen.
  charge(amount) {
    this.money = Math.round((this.money - amount) * 100) / 100;
    this.notify();
  }

  updateMoisture(gameMinutes) {
    const shelfRate = this.hasDryer ? MOISTURE_PER_MINUTE.dryer : MOISTURE_PER_MINUTE.shelf;
    for (const s of this.shelf) s.moisture = clamp01(s.moisture + shelfRate * gameMinutes);
    // Das Filament-Regal am Tisch ist offen wie das Lagerregal ohne Trockenschrank
    for (const f of this.furniture) {
      for (const s of f.spools ?? []) if (s) s.moisture = clamp01(s.moisture + MOISTURE_PER_MINUTE.shelf * gameMinutes);
    }
    for (const p of this.printers) {
      const rate = p.spools.length > 1 ? MOISTURE_PER_MINUTE.ams : MOISTURE_PER_MINUTE.open;
      for (const s of p.spools) if (s) s.moisture = clamp01(s.moisture + rate * gameMinutes);
    }
  }

  // ---------- Besitz ----------

  get spoolsInStorage() {
    return this.shelf.length;
  }

  canAfford(amount) {
    return this.money >= amount;
  }

  filamentStock(filamentId) {
    return this.shelf.filter((s) => s.filamentId === filamentId).length;
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
      clogged: false, nozzlePokes: 0, nozzleWear: 0, storageSpot: this.freeStorageSpot(),
    };
    this.printers.push(printer);
    this.notify();
    return printer;
  }

  buyFilament(filament) {
    if (!this.withdraw(filament.price)) return false;
    this.storeSpool({ filamentId: filament.id, grams: SPOOL_GRAMS, moisture: 0 });
    this.notify();
    return true;
  }

  buyAccessory(accessory) {
    if (this.accessories.has(accessory.id) || !this.withdraw(accessory.price)) return false;
    this.accessories.add(accessory.id);
    this.notify();
    return true;
  }

  // ---------- Tragen, Aufstellen, Einlegen ----------

  takePrinterFromStorage(id) {
    const p = this.printerById(id);
    if (p?.location !== 'storage') return false;
    p.location = 'carried';
    p.storageSpot = null;
    this.notify();
    return true;
  }

  returnPrinterToStorage(id) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'storage';
    p.slot = null;
    p.storageSpot = this.freeStorageSpot();
    this.notify();
  }

  placePrinter(id, slot) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'table';
    p.slot = slot;
    this.notify();
  }

  // Nimmt genau die Spule von diesem Regalplatz (null, wenn dort keine liegt)
  takeSpoolFromShelf(shelfSlot) {
    const spool = this.shelf.find((s) => s.shelfSlot === shelfSlot);
    if (!spool) return null;
    this.shelf = this.shelf.filter((s) => s !== spool);
    this.notify();
    const { shelfSlot: _, ...rest } = spool;
    return rest;
  }

  returnFilamentToStorage(spool) {
    this.storeSpool(spool);
    this.notify();
  }

  activeSpool(printer) {
    return printer.spools[printer.activeSlot] ?? null;
  }

  // Ob gerade Spulen gewechselt werden dürfen: nicht während des Drucks, außer er wartet auf neues Filament
  canChangeSpools(printer) {
    return !this.isBusy(printer) || printer.job.pauseReason === 'filament';
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

  // Legt eine Spule ein und gibt die dadurch verdrängte zurück (oder null). Wartet der Drucker auf genau
  // dieses Filament, druckt er gleich aus dem neuen Fach weiter.
  loadFilament(printerId, spool) {
    const p = this.printerById(printerId);
    const slot = this.loadTarget(p);
    if (slot === -1) return null;
    const previous = this.takeSpool(p, slot);
    p.spools[slot] = { ...spool };
    const job = p.job;
    if (job?.pauseReason === 'filament' && spool.filamentId === job.filamentId) {
      job.slot = slot;
      p.activeSlot = slot;
      job.status = 'printing';
      delete job.pauseReason;
      this.emit('print-resumed', { printer: p });
    } else if (!this.activeSpool(p) && !job) {
      p.activeSlot = slot; // leeres aktives Fach: neue Spule gleich auswählen
    }
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
    if (p.job) return;
    p.activeSlot = slot;
    this.notify();
  }

  // ---------- Drucken ----------

  isBusy(printer) {
    return printer.job?.status === 'printing' || printer.job?.status === 'paused';
  }

  // Grund, warum der Druck nicht starten kann, oder null
  printProblem(printer, template, count = 1) {
    if (printer.location !== 'table') return 'Drucker ist nicht aufgestellt';
    if (this.isBusy(printer)) return 'Druckt gerade';
    if (printer.job?.status === 'done') return 'Erst das fertige Teil entnehmen';
    if (printer.job?.status === 'failed') return 'Erst den Fehldruck am Drucker wegräumen';
    if (printer.clogged) return 'Düse verstopft – freistechen oder Ersatzdüse einbauen';
    if ((printer.nozzleWear ?? 0) >= 1) return 'Düse verschlissen – Ersatzdüse einbauen';
    const spool = this.activeSpool(printer);
    if (!spool) return printer.spools.length > 1 ? 'Gewähltes AMS-Fach ist leer' : 'Kein Filament eingelegt';
    const material = filamentById(spool.filamentId).material;
    if (!template.materials.includes(material)) return `Braucht ${template.materials.join(' / ')}`;
    const { x, y, z } = template.size;
    const b = printer.model.build;
    const fitsFlat = (x <= b.x && y <= b.y) || (y <= b.x && x <= b.y);
    if (!fitsFlat || z > b.z) return 'Passt nicht in den Bauraum';
    if (count > plateLayout(template, b).max) return `Nur ${plateLayout(template, b).max} passen auf die Platte`;
    if (spool.grams <= 0) return 'Spule ist leer';
    return null;
  }

  // Wie viel Filament für den Druck fehlt, wenn man nichts nachlegt (AMS füllt mit gleicher Sorte nach)
  filamentShortfall(printer, template, count = 1) {
    const spool = this.activeSpool(printer);
    if (!spool) return batchGrams(template, count);
    const available = printer.spools
      .filter((s) => s?.filamentId === spool.filamentId)
      .reduce((sum, s) => sum + s.grams, 0);
    return Math.max(0, batchGrams(template, count) - available);
  }

  // Wahrscheinlichkeit (0…1), dass ein ganzer Druck schiefgeht – bei der aktuellen Geschwindigkeit und Spule.
  // Mehr Teile auf der Platte erhöhen das Risiko etwas, und ein Fehler ruiniert die ganze Platte.
  failureRisk(printer, template, spool = this.activeSpool(printer), count = 1) {
    if (!spool) return 0;
    const speed = speedById(printer.speedId).percent;
    const material = filamentById(spool.filamentId).material;
    let risk = 0.02;
    if (speed > 100) risk += ((speed - 100) / 66) * 0.12;        // Sport: +4,5 %, Ludicrous: +12 %
    if (material === 'ABS' && !printer.model.enclosed) risk += 0.3;
    if (material === 'TPU' && speed > 100) risk += 0.2;           // Gummi mag es langsam
    if (template.size.z > 100 && speed > 100) risk += 0.04;       // hohe Teile wackeln
    if (spool.moisture > DAMP) risk += (spool.moisture - DAMP) * 0.4; // klatschnass: +24 %
    const wear = printer.nozzleWear ?? 0;
    if (wear > NOZZLE_WORN) risk += (wear - NOZZLE_WORN) * 0.6;     // abgenutzte Düse: bis +15 %
    if (speed < 100) risk *= 0.5;
    risk = 1 - (1 - risk) ** (1 + 0.25 * (count - 1));
    return Math.min(0.95, risk);
  }

  startPrint(printerId, template, count = 1) {
    const p = this.printerById(printerId);
    if (this.printProblem(p, template, count)) return false;
    const spool = this.activeSpool(p);
    p.job = {
      templateId: template.id, count, filamentId: spool.filamentId, slot: p.activeSlot,
      progress: 0, gramsUsed: 0, status: 'printing',
    };
    const printing = this.printers.filter((x) => x.job?.status === 'printing').length;
    this.emit('print-started', { printer: p, template, printing });
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

  // Wartet der Drucker auf Filament, geht es erst mit einer neuen Spule weiter
  resumePrint(printerId) {
    const job = this.printerById(printerId).job;
    if (job?.status === 'paused' && !job.pauseReason) job.status = 'printing';
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
    this.addPart(p.job.templateId, p.job.filamentId, p.job.count ?? 1);
    this.emit('part-collected', { printer: p, templateId: p.job.templateId, count: p.job.count ?? 1 });
    p.job = null;
    this.notify();
  }

  // Fehldruck vom Bett kratzen: das Filament ist verloren
  clearFailedPrint(printerId) {
    const p = this.printerById(printerId);
    if (p.job?.status !== 'failed') return;
    const failure = p.job.failure;
    p.job = null;
    this.emit('bed-cleared', { printer: p, failure });
    this.notify();
  }

  // Einmal mit der Nadel in die Düse stechen. Gibt zurück, ob sie danach frei ist.
  pokeNozzle(printerId) {
    const p = this.printerById(printerId);
    if (!p.clogged) return true;
    p.nozzlePokes++;
    if (p.nozzlePokes >= NOZZLE_POKES) {
      p.clogged = false;
      p.nozzlePokes = 0;
      this.emit('nozzle-cleared', { printer: p });
    } else {
      this.emit('nozzle-poke', { printer: p });
    }
    this.notify();
    return !p.clogged;
  }

  // Restliche Druckzeit in Spielminuten bei der aktuellen Geschwindigkeit
  remainingMinutes(printer) {
    const job = printer.job;
    if (!job) return 0;
    const template = templateById(job.templateId);
    return ((1 - job.progress) * batchMinutes(template, job.count ?? 1)) / (speedById(printer.speedId).percent / 100);
  }

  // Lässt alle laufenden Drucke um gameMinutes weiterlaufen: Filament wird verbraucht, Pannen können passieren.
  // Benachrichtigt nur, wenn sich ein Status ändert, damit das Druckermenü nicht in jedem Frame neu aufgebaut wird.
  advancePrints(gameMinutes) {
    let changed = false;
    for (const p of this.printers) {
      const job = p.job;
      if (job?.status !== 'printing') continue;
      const template = templateById(job.templateId);
      const count = job.count ?? 1;
      let step = Math.min((gameMinutes * speedById(p.speedId).percent / 100) / batchMinutes(template, count), 1 - job.progress);

      // Filament verbrauchen. Ist die Spule leer, füllt das AMS aus einem Fach mit gleicher Sorte nach,
      // sonst wartet der Drucker auf eine neue Spule.
      // Drucke aus alten Spielständen haben ihr Filament schon beim Start bezahlt (prepaid)
      const spool = p.spools[job.slot];
      const need = job.prepaid ? 0 : step * batchGrams(template, count);
      const used = Math.min(need, spool?.grams ?? 0);
      if (spool) spool.grams -= used;
      job.gramsUsed += used;
      if (!job.prepaid && (!spool || spool.grams <= 0.001)) {
        if (spool) p.spools[job.slot] = null; // leere Spule fliegt raus
        const refill = p.spools.findIndex((s) => s?.filamentId === job.filamentId && s.grams > 0);
        if (refill !== -1) {
          job.slot = refill;
          p.activeSlot = refill;
          this.emit('ams-refill', { printer: p, slot: refill });
        } else {
          step *= need > 0 ? used / need : 0;
          job.status = 'paused';
          job.pauseReason = 'filament';
          this.emit('out-of-filament', { printer: p, filament: filamentById(job.filamentId) });
        }
        changed = true;
      }

      this.wearNozzle(p, step * batchMinutes(template, count));

      // Pannen: das Risiko gilt für den ganzen Druck und wird auf die Fortschrittsschritte verteilt
      const risk = this.failureRisk(p, template, spool ?? p.spools[job.slot], count);
      if (step > 0 && this.random() < 1 - (1 - risk) ** step) {
        job.progress = Math.max(0.05, job.progress + step);
        this.failPrint(p, template, spool);
        changed = true;
        continue;
      }

      job.progress += step;
      if (job.progress >= 1 - 1e-9) {
        job.progress = 1;
        job.status = 'done';
        this.emit('print-done', { printer: p, template, count, speedId: p.speedId });
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  failPrint(printer, template, spool) {
    const material = filamentById(printer.job.filamentId).material;
    const moisture = spool?.moisture ?? 0;
    // Welche Panne es wird, hängt von der Ursache ab
    const weights = {
      spaghetti: 3,
      detached: template.size.z > 60 ? 2 : 0.5,
      warp: material === 'ABS' && !printer.model.enclosed ? 8 : 0.4,
      clog: 0.8 + moisture * 5 + (material === 'TPU' ? 2 : 0) + (printer.nozzleWear ?? 0) * 3,
    };
    let roll = this.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    let failure = 'spaghetti';
    for (const [kind, w] of Object.entries(weights)) {
      roll -= w;
      if (roll <= 0) {
        failure = kind;
        break;
      }
    }
    printer.job.status = 'failed';
    printer.job.failure = failure;
    if (failure === 'clog') {
      printer.clogged = true;
      printer.nozzlePokes = 0;
    }
    this.emit('print-failed', { printer, template, failure, info: FAILURES[failure] });
  }

  // ---------- Düsenverschleiß ----------

  // printedMinutes: gedruckte Zeit bei 100 %. Schnelle Stufen nutzen die Düse stärker ab.
  wearNozzle(printer, printedMinutes) {
    const before = printer.nozzleWear ?? 0;
    const speedFactor = speedById(printer.speedId).percent > 100 ? 1.3 : 1;
    printer.nozzleWear = Math.min(1, before + (printedMinutes * speedFactor) / (NOZZLE_LIFE_HOURS * 60));
    if (before < NOZZLE_WORN && printer.nozzleWear >= NOZZLE_WORN) this.emit('nozzle-worn', { printer });
    if (before < 1 && printer.nozzleWear >= 1) this.emit('nozzle-dead', { printer });
  }

  // Ersatzdüse einbauen: neu, frei, nicht verstopft. Nicht während eines Drucks.
  replaceNozzle(printerId) {
    const p = this.printerById(printerId);
    if (!p || this.isBusy(p)) return false;
    p.nozzleWear = 0;
    p.clogged = false;
    p.nozzlePokes = 0;
    this.emit('nozzle-replaced', { printer: p });
    this.notify();
    return true;
  }

  // ---------- Einrichtung: Regale am Druckertisch ----------

  furnitureById(id) {
    return this.furniture.find((f) => f.id === id);
  }

  // Steht auf diesem Druckerplatz schon ein Drucker?
  tableSlotUsed(slot) {
    return this.printers.some((p) => p.location === 'table' && p.slot === slot);
  }

  // Steht auf diesem Regalplatz (zwischen zwei Druckern) schon ein Regal?
  rackSlotUsed(slot) {
    return this.furniture.some((f) => f.location === 'table' && f.slot === slot);
  }



  buyFurniture(type) {
    if (!this.withdraw(type.price)) return null;
    const item = {
      id: this.nextFurnitureId++, type, location: 'storage', slot: null, storageSpot: this.freeStorageSpot(),
      spools: type.id === 'filament-rack' ? Array(type.capacity).fill(null) : null,
      nozzles: 0,
    };
    this.furniture.push(item);
    this.notify();
    return item;
  }

  takeFurnitureFromStorage(id) {
    const f = this.furnitureById(id);
    if (f?.location !== 'storage') return false;
    f.location = 'carried';
    f.storageSpot = null;
    this.notify();
    return true;
  }

  returnFurnitureToStorage(id) {
    const f = this.furnitureById(id);
    if (!f) return;
    f.location = 'storage';
    f.slot = null;
    f.storageSpot = this.freeStorageSpot();
    this.notify();
  }

  placeFurniture(id, slot) {
    const f = this.furnitureById(id);
    if (!f || slot < 0 || this.rackSlotUsed(slot)) return;
    f.location = 'table';
    f.slot = slot;
    this.notify();
  }

  isFurnitureEmpty(f) {
    return !f.nozzles && !(f.spools ?? []).some(Boolean);
  }

  // Leeres Regal wieder vom Tisch nehmen (z. B. um den Platz für einen Drucker frei zu machen)
  pickUpFurniture(id) {
    const f = this.furnitureById(id);
    if (f?.location !== 'table' || !this.isFurnitureEmpty(f)) return false;
    f.location = 'carried';
    f.slot = null;
    this.notify();
    return true;
  }

  // Spule ins erste freie Fach des Filament-Regals legen. Gibt zurück, ob Platz war.
  putSpoolInRack(rackId, spool) {
    const f = this.furnitureById(rackId);
    const free = f?.spools?.indexOf(null) ?? -1;
    if (free === -1) return false;
    f.spools[free] = { ...spool };
    this.notify();
    return true;
  }

  takeSpoolFromRack(rackId, index) {
    const f = this.furnitureById(rackId);
    const spool = f?.spools?.[index];
    if (!spool) return null;
    f.spools[index] = null;
    this.notify();
    return spool;
  }

  // Aufgestellte Ersatzteilregale und wie viele Düsen noch hineinpassen
  get partsRacks() {
    return this.furniture.filter((f) => f.type.id === 'parts-rack' && f.location === 'table');
  }

  get partsRackSpace() {
    return this.partsRacks.reduce((sum, f) => sum + f.type.capacity - f.nozzles, 0);
  }

  get spareNozzles() {
    return this.partsRacks.reduce((sum, f) => sum + f.nozzles, 0);
  }

  // Ersatzteile werden direkt ins Ersatzteilregal geliefert
  buySparePart(part) {
    const rack = this.partsRacks.find((f) => f.nozzles < f.type.capacity);
    if (!rack || !this.withdraw(part.price)) return false;
    rack.nozzles++;
    this.notify();
    return true;
  }

  takeNozzleFromRack(rackId) {
    const f = this.furnitureById(rackId);
    if (!f?.nozzles) return false;
    f.nozzles--;
    this.notify();
    return true;
  }

  putNozzleInRack(rackId) {
    const f = this.furnitureById(rackId);
    if (!f || f.nozzles >= f.type.capacity) return false;
    f.nozzles++;
    this.notify();
    return true;
  }

  // Düse aus der Hand zurück: ins erste Ersatzteilregal mit Platz (notfalls ins erste überhaupt)
  returnNozzle() {
    const racks = this.furniture.filter((f) => f.type.id === 'parts-rack');
    const rack = racks.find((f) => f.nozzles < f.type.capacity) ?? racks[0];
    if (!rack) return false;
    rack.nozzles++;
    this.notify();
    return true;
  }

  // ---------- Fertige Teile ----------

  addPart(templateId, filamentId, count = 1) {
    const key = `${templateId}|${filamentId}`;
    this.finishedParts.set(key, (this.finishedParts.get(key) ?? 0) + count);
  }

  // Alle fertigen Teile als Liste [{ templateId, filamentId, count }]
  partsList() {
    return [...this.finishedParts].map(([key, count]) => {
      const [templateId, filamentId] = key.split('|');
      return { templateId, filamentId, count };
    });
  }

  // Passt ein Teil zur Bestellung? want: { material, filamentId } – fehlende Angaben heißen „egal“
  static partMatches(filamentId, want) {
    if (want.filamentId && filamentId !== want.filamentId) return false;
    return !want.material || filamentById(filamentId)?.material === want.material;
  }

  countParts(templateId, want = {}) {
    return this.partsList()
      .filter((p) => p.templateId === templateId && Economy.partMatches(p.filamentId, want))
      .reduce((sum, p) => sum + p.count, 0);
  }

  // Fertige Teile abgeben (für Kundenaufträge). Gibt zurück, ob genug da waren.
  takeParts(templateId, count, want = {}) {
    if (this.countParts(templateId, want) < count) return false;
    let missing = count;
    for (const p of this.partsList()) {
      if (!missing || p.templateId !== templateId || !Economy.partMatches(p.filamentId, want)) continue;
      const take = Math.min(missing, p.count);
      missing -= take;
      const key = `${p.templateId}|${p.filamentId}`;
      if (take === p.count) this.finishedParts.delete(key);
      else this.finishedParts.set(key, p.count - take);
    }
    this.notify();
    return true;
  }

  // Der Kater wirft ein fertiges Teil vom Druckbett (bei mehreren nur eins). x/z: wo es auf dem Boden landet.
  knockPartOff(printerId, x, z) {
    const p = this.printerById(printerId);
    if (p?.job?.status !== 'done') return false;
    this.looseParts.push({
      id: this.nextLooseId++, templateId: p.job.templateId, filamentId: p.job.filamentId,
      x, z, rotY: this.random() * Math.PI * 2,
    });
    if ((p.job.count ?? 1) > 1) p.job.count--;
    else p.job = null;
    this.emit('part-knocked', { printer: p });
    this.notify();
    return true;
  }

  pickUpLoosePart(id) {
    const part = this.looseParts.find((l) => l.id === id);
    if (!part) return;
    this.looseParts = this.looseParts.filter((l) => l !== part);
    this.addPart(part.templateId, part.filamentId);
    this.emit('part-picked', { part });
    this.notify();
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

  emit(type, data = {}) {
    this.onEvent?.(type, data);
  }

  // ---------- intern ----------

  withdraw(amount) {
    if (!this.canAfford(amount)) return false;
    this.money -= amount;
    return true;
  }

  // Spule auf den ersten freien Regalplatz legen
  storeSpool({ filamentId, grams, moisture = 0 }) {
    const used = new Set(this.shelf.map((s) => s.shelfSlot));
    let shelfSlot = 0;
    while (used.has(shelfSlot)) shelfSlot++;
    this.shelf.push({ filamentId, grams, moisture, shelfSlot });
  }

  // Erster freier Kartonplatz in der Lieferzone
  freeStorageSpot() {
    const used = new Set([...this.printers, ...this.furniture]
      .filter((p) => p.location === 'storage').map((p) => p.storageSpot));
    let spot = 0;
    while (used.has(spot)) spot++;
    return spot;
  }

  // Nimmt die Spule aus einem Fach. Leere Spulen werden entsorgt (Rückgabe null).
  takeSpool(printer, slot) {
    const spool = printer.spools[slot];
    printer.spools[slot] = null;
    return spool && spool.grams > 0 ? spool : null;
  }
}

// Kurzbeschreibung einer Spule für Hinweise, z. B. „PLA Rot (740 g, feucht)“
export function spoolLabel(spool) {
  const wet = spool.moisture >= WET ? ', feucht' : '';
  return `${filamentLabel(filamentById(spool.filamentId))} (${Math.round(spool.grams)} g${wet})`;
}
