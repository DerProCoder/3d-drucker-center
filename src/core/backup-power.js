// Notstrom und Akkus (#59, #71): Batterieschränke und bis zu vier Dieselgeneratoren im Technikraum (Raum bei −10,5 m).
// Bewusst ohne Three.js und DOM.
//
// Umrechnung: Strom läuft im Spiel in €/h zum Grundpreis. Ein fester Preis von KWH_PRICE = 0,30 €/kWh (vor Tarif)
// macht daraus Leistung, z. B. 3 €/h Strom = 10 kW.
//
// Gekauft wird im Server-Shop (Kategorie „Technik“, core/server-catalog.js TECH_EQUIPMENT). Akkus und Generatoren sind
// Einrichtung aus economy.furniture (Karton, Lieferung, Abstellraum, Tragen wie Regale) und stehen aufgestellt mit
// location 'technik' auf einem festen Platz (slot): Akkus 0 … BATTERY.max − 1, Generatoren (alle Modelle zusammen)
// 0 … GENERATOR_MAX − 1 (world/control-room.js CONTROL_ANCHORS.batterySlots / generatorSlots). Ladung je Akku, Diesel
// je Generator (eigener Tank, #71), Priorität und Statistik führt dieses Modul (toJSON/load).
//
// Betrieb:
//   Normal, Nachtstrom (22–6 Uhr): Die Akkus laden mit bis zu BATTERY.maxKw je Schrank, bis sie voll sind – der
//     Ladestrom läuft mit über die Stromrechnung (zum Nachttarif).
//   Normal, Tagstrom: Die Akkus decken den Verbrauch zuerst (bis BATTERY.maxKw je Schrank), bis sie leer sind bzw.
//     die Reserve (reserve, Anteil 0 … 1, Standard 0) erreicht ist. Gespart wird der Unterschied Tag- zu Nachtpreis.
//   Stromausfall (core/power-grid.js): Akkus überbrücken, nach startMinutes springen alle aufgestellten Generatoren mit
//     Diesel an. Ihre Leistung addiert sich (z. B. 40 + 240 = 280 kW), die Last verteilen sie nach Leistungsanteil (so
//     werden die Tanks etwa gleich schnell leer). Ist ein Tank leer, fällt nur dieser Generator aus. Die Akkus legen
//     den Rest drauf. Versorgt werden die Gruppen nach Priorität (Standard: Server und Netzwerk → Licht → Drucker):
//     Eine Gruppe läuft nur, wenn auch alle wichtigeren laufen, die Leistung für alle zusammen reicht und – ab der
//     zweiten Gruppe – die Energie (Akkus + Diesel) für alle bis hierher bis zum Ende des Ausfalls reicht. So gehen
//     bei knapper Energie zuerst die Drucker aus, dann das Licht, zuletzt die Server.
//
// Einbau: attach(grid) setzt grid.hasBackup und grid.supplier. economy.backupPower = backupPower – die Abrechnung
// (economy.advanceTime) ruft advance(Minuten, von, { loadKw, groups }) und bucht das zurückgegebene cost.
//
// Ereignisse über onEvent(type, data) und subscribe(listener):
//   'placed'          { item, kind }            – Akku bzw. Generator aufgestellt
//   'generator-start' { items, kw }             – Generatoren springen an (alle, die im selben Schritt starten, in einer
//                                                 Meldung; kw: deren Leistung zusammen)
//   'generator-stop'  { reason, items, item }   – 'grid' (Strom wieder da, alle zusammen) | 'diesel' (Tank leer, item)
//   'diesel-empty'    { item }                  – Tank eines Generators leer (zusätzlich zu generator-stop)
//   'diesel-bought'   { liters, price, items }  – items: { item, liters } je betanktem Generator
//   'batteries-empty' {}                        – alle Akkus leer (während eines Ausfalls)
//   'groups-off'      { groups } / 'groups-on' { groups } – Gruppen (in Prioritäts-Reihenfolge), die gleichzeitig Notstrom
//                     verlieren bzw. wieder bekommen (während eines Ausfalls, je Rechenschritt höchstens eine Meldung)
import { DAY_FACTOR, NIGHT_FACTOR, NIGHT_START_HOUR, DAY_START_HOUR, POWER_GROUPS, tariffAt } from './power-grid.js';

export const KWH_PRICE = 0.30; // €/kWh vor Tarif: Umrechnung von €/h in kW
export const euroPerHourToKw = (euroPerHour) => euroPerHour / KWH_PRICE;

// Batterieschrank: Kapazität, Lade-/Entladeleistung, Preis, Höchstzahl. Neu geliefert ist er halb voll.
export const BATTERY = { id: 'battery-cabinet', capacityKwh: 100, maxKw: 25, price: 3000, max: 6, startCharge: 0.5 };

// Dieselgeneratoren (#71): vier Modelle, höchstens GENERATOR_MAX insgesamt (beliebig gemischt). Für alle gleich:
// Verbrauch litersPerKwh, Start startMinutes nach einem Ausfall, Erstbefüllung startDiesel beim Kauf.
// Die id des 40-kW-Modells bleibt 'diesel-generator' (alte Spielstände).
export const GENERATOR_MAX = 4;
const GENERATOR_COMMON = { litersPerKwh: 0.3, startMinutes: 2, startDiesel: 50 };
export const GENERATORS = [
  { id: 'diesel-generator', name: 'Dieselgenerator 40 kW', kw: 40, tankLiters: 200, price: 8000 },
  { id: 'diesel-generator-80', name: 'Dieselgenerator 80 kW', kw: 80, tankLiters: 250, price: 15000 },
  { id: 'diesel-generator-120', name: 'Dieselgenerator 120 kW', kw: 120, tankLiters: 300, price: 22000 },
  { id: 'diesel-generator-240', name: 'Dieselgenerator 240 kW', kw: 240, tankLiters: 400, price: 40000 },
].map((g) => ({ ...GENERATOR_COMMON, ...g, max: GENERATOR_MAX }));
export const generatorById = (id) => GENERATORS.find((g) => g.id === id) ?? null;
// Datenblatt zu einem Einrichtungs-Typ (TECH_EQUIPMENT-Eintrag) bzw. zu einem Einrichtungsstück
export const generatorSpec = (typeOrItem) => generatorById(typeOrItem?.type?.id ?? typeOrItem?.id);
// Laufzeit in Stunden mit vollem Tank unter Volllast (240 kW: 400 L / (240 kW × 0,3 L/kWh) ≈ 5,6 h)
export const fullLoadHours = (spec) => spec.tankLiters / (spec.kw * spec.litersPerKwh);
// Altes Einzelmodell (#59) – bleibt für bestehende Aufrufer (Startzeit, Verbrauch, 40-kW-Werte); max gilt für alle
// Generatoren zusammen
export const GENERATOR = GENERATORS[0];

// Diesel: Preis je Liter, Nachkauf in Schritten (kommt per Tankwagen direkt in den Tank)
export const DIESEL = { pricePerLiter: 1.8, stepLiters: 50 };
// Licht in der Halle verbraucht im Normalbetrieb nichts auf der Rechnung, braucht bei Notstrom aber Leistung
export const LIGHTS_KW = 2;
export const DEFAULT_PRIORITY = ['servers', 'lights', 'printers'];
export const GROUP_NAMES = { servers: 'Server und Netzwerk', lights: 'Licht', printers: 'Drucker' };
export const GROUP_ICONS = { servers: '🖥️', lights: '💡', printers: '🖨️' };

const MINUTES_PER_DAY = 24 * 60;
const MAX_STEP = 1;        // Spielminuten: so fein rechnet ein Ausfall (Generatorstart, Gruppen ab-/zuschalten)
const NORMAL_STEP = 15;    // Spielminuten: so fein rechnet der Normalbetrieb (Laden/Entladen innerhalb eines Tarifs)
const EPS = 1e-9;

const dayMinute = (m) => ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

// Minuten bis zur nächsten Tarifgrenze (6 bzw. 22 Uhr) ab Spielzeit t
function minutesToTariffChange(t) {
  const m = dayMinute(t);
  const day = DAY_START_HOUR * 60;
  const night = NIGHT_START_HOUR * 60;
  if (m < day) return day - m;
  if (m < night) return night - m;
  return MINUTES_PER_DAY - m + day;
}

export const isBatteryType = (type) => type?.id === BATTERY.id;
export const isGeneratorType = (type) => !!generatorById(type?.id);
export const isBackupType = (type) => isBatteryType(type) || isGeneratorType(type);

export class BackupPower {
  // economy: core/economy.js (Einrichtung, Geld) · grid: core/power-grid.js (optional, sonst attach)
  constructor({ economy = null, grid = null } = {}) {
    this.economy = economy;
    this.grid = null;
    this.charges = new Map();     // Furniture-ID → Ladung kWh (Akkus)
    this.tanks = new Map();       // Furniture-ID → Liter im Tank (Generatoren, auch noch im Karton)
    this.running = new Set();     // Furniture-IDs der laufenden Generatoren
    this.outputs = new Map();     // Furniture-ID → zuletzt gelieferte kW
    this.priority = [...DEFAULT_PRIORITY];
    this.reserve = 0;             // Anteil, den die Akkus im Normalbetrieb nicht abgeben (für Ausfälle)
    this.outageMinutes = 0;       // seit Beginn des laufenden Ausfalls
    this.groups = { servers: 0, lights: LIGHTS_KW, printers: 0 }; // Leistungsbedarf kW (aus advance)
    this.flowKw = 0;              // + laden, − entladen (Akkus gesamt, zuletzt)
    this.generatorKw = 0;         // zuletzt von allen Generatoren zusammen geliefert
    this.mode = 'idle';           // 'idle' | 'charging' | 'discharging' | 'backup'
    this.savedToday = 0;          // € gespart heute (Tag-/Nachtunterschied)
    this.savedYesterday = 0;
    this.savedTotal = 0;
    this.backupKwhTotal = 0;      // kWh, die bei Ausfällen aus Akku und Generator kamen
    this.day = null;              // Spieltag der Statistik „heute“
    this.lastSupplied = null;     // { servers, lights, printers } – für groups-on/off
    this.onEvent = null;
    this.listeners = new Set();
    if (grid) this.attach(grid);
  }

  // Ans Stromnetz hängen: Ausfälle gibt es ab dem ersten aufgestellten Gerät, der Notstrom versorgt die Gruppen
  attach(grid) {
    this.grid = grid;
    grid.hasBackup = () => this.installed;
    grid.supplier = (group) => this.supplies(group);
    grid.subscribe((type) => {
      if (type === 'outage-start') {
        this.outageMinutes = 0;
        this.lastSupplied = Object.fromEntries(POWER_GROUPS.map((g) => [g, true])); // bis eben hatten alle Netzstrom
      } else if (type === 'outage-end') {
        this.stopGenerator('grid');
        this.outageMinutes = 0;
        this.lastSupplied = null;
      }
    });
  }

  // ---------- Geräte ----------

  get items() {
    return (this.economy?.furniture ?? []).filter((f) => isBackupType(f.type));
  }

  // Aufgestellte Akkus (nach Platz sortiert)
  get batteries() {
    return this.items.filter((f) => isBatteryType(f.type) && f.location === 'technik').sort((a, b) => a.slot - b.slot);
  }

  // Aufgestellte Generatoren (alle Modelle, nach Platz sortiert)
  get generators() {
    return this.items.filter((f) => isGeneratorType(f.type) && f.location === 'technik').sort((a, b) => a.slot - b.slot);
  }

  // Erster aufgestellter Generator (für Aufrufer, die nur einen kennen) oder null
  get generator() {
    return this.generators[0] ?? null;
  }

  // Mindestens ein Akku oder ein Generator steht im Technikraum
  get installed() {
    return this.batteries.length > 0 || this.generators.length > 0;
  }

  owned(type) {
    return this.items.filter((f) => f.type.id === type.id).length;
  }

  // Generatoren im Besitz (alle Modelle, auch noch im Karton) – höchstens GENERATOR_MAX
  get ownedGenerators() {
    return this.items.filter((f) => isGeneratorType(f.type)).length;
  }

  chargeOf(item) {
    return this.charges.get(item.id) ?? 0;
  }

  // Diesel im Tank eines Generators (Liter) und seine Tankgröße
  dieselOf(item) {
    return this.tanks.get(item.id) ?? 0;
  }

  tankOf(item) {
    return generatorSpec(item)?.tankLiters ?? 0;
  }

  isRunning(item) {
    return this.running.has(item.id);
  }

  get capacityKwh() {
    return this.batteries.length * BATTERY.capacityKwh;
  }

  get chargeKwh() {
    return this.batteries.reduce((sum, b) => sum + this.chargeOf(b), 0);
  }

  // Ladestand aller Akkus in Prozent (0, wenn keiner steht)
  get percent() {
    const cap = this.capacityKwh;
    return cap ? (this.chargeKwh / cap) * 100 : 0;
  }

  // Diesel aller aufgestellten Generatoren zusammen (Liter). Setzen (nur für Tests/alte Aufrufer): füllt die Tanks
  // der aufgestellten Generatoren der Reihe nach auf.
  get diesel() {
    return this.generators.reduce((sum, g) => sum + this.dieselOf(g), 0);
  }

  set diesel(liters) {
    let rest = Math.max(0, num(liters, 0));
    for (const g of this.generators) {
      const put = Math.min(rest, this.tankOf(g));
      this.tanks.set(g.id, put);
      rest -= put;
    }
  }

  // Tankgröße aller aufgestellten Generatoren zusammen (Liter)
  get tankLiters() {
    return this.generators.reduce((sum, g) => sum + this.tankOf(g), 0);
  }

  // Nennleistung aller aufgestellten bzw. aller laufenden Generatoren (kW)
  get generatorCapacityKw() {
    return this.generators.reduce((sum, g) => sum + (generatorSpec(g)?.kw ?? 0), 0);
  }

  get runningKw() {
    return this.generators.filter((g) => this.isRunning(g)).reduce((sum, g) => sum + (generatorSpec(g)?.kw ?? 0), 0);
  }

  // Läuft mindestens ein Generator?
  get generatorRunning() {
    return this.generators.some((g) => this.isRunning(g));
  }

  // Energie in allen Tanks in kWh (nur aufgestellte Generatoren)
  get dieselKwh() {
    return this.generators.reduce((sum, g) => sum + this.dieselOf(g) / (generatorSpec(g)?.litersPerKwh ?? GENERATOR.litersPerKwh), 0);
  }

  // Minuten bis die wartenden Generatoren anspringen (während eines Ausfalls, sonst null)
  generatorStartsInFor(item) {
    if (!this.grid?.isOutage || item.location !== 'technik' || this.isRunning(item) || this.dieselOf(item) <= EPS) return null;
    return Math.max(0, (generatorSpec(item)?.startMinutes ?? GENERATOR.startMinutes) - this.outageMinutes);
  }

  get generatorStartsIn() {
    const waits = this.generators.map((g) => this.generatorStartsInFor(g)).filter((m) => m !== null);
    return waits.length ? Math.min(...waits) : null;
  }

  // ---------- Kaufen und Aufstellen ----------

  // Grund, warum der Kauf gerade nicht geht, oder null. roomBuilt: steht der Raum bei −10,5 m (upgrades.controlRoom)?
  buyProblem(type, roomBuilt = true) {
    if (!isBackupType(type)) return 'Unbekanntes Gerät';
    if (!roomBuilt) return 'Erst den Raum bei −10,5 m bauen (Ausbau)';
    if (isBatteryType(type) && this.owned(type) >= BATTERY.max) return `Höchstens ${BATTERY.max}`;
    if (isGeneratorType(type) && this.ownedGenerators >= GENERATOR_MAX) return `Höchstens ${GENERATOR_MAX}`;
    const economy = this.economy;
    if (!economy.roomForBox({ type })) return economy.overflow?.storageFields().length ? 'Abstellraum und Keller-Lager voll' : 'Abstellraum voll';
    if (!economy.canAfford(type.price)) return 'Zu wenig Geld';
    return null;
  }

  // Bestellen: kommt als Karton (economy.buyFurniture). Gibt das Einrichtungsstück oder null zurück.
  buy(type, roomBuilt = true) {
    if (this.buyProblem(type, roomBuilt)) return null;
    const item = this.economy.buyFurniture(type);
    // Ein Generator kommt mit einer Erstbefüllung im eigenen Tank
    const spec = generatorSpec(type);
    if (item && spec) this.tanks.set(item.id, Math.min(spec.tankLiters, spec.startDiesel));
    return item;
  }

  // Freie Plätze für einen Typ (Akkus 0 … 5, Generatoren – alle Modelle teilen sich die Plätze – 0 … 3)
  freeSlots(type) {
    const battery = isBatteryType(type);
    const count = battery ? BATTERY.max : isGeneratorType(type) ? GENERATOR_MAX : 0;
    const same = battery ? isBatteryType : isGeneratorType;
    const used = new Set(this.items.filter((f) => same(f.type) && f.location === 'technik').map((f) => f.slot));
    return Array.from({ length: count }, (_, i) => i).filter((i) => !used.has(i));
  }

  slotUsed(type, slot) {
    return !this.freeSlots(type).includes(slot);
  }

  // Getragenen Karton auf einen Platz im Technikraum stellen. Gibt zurück, ob es geklappt hat.
  place(id, slot) {
    const item = this.economy.furnitureById(id);
    if (!item || !isBackupType(item.type) || item.location !== 'carried') return false;
    if (!this.freeSlots(item.type).includes(slot)) return false;
    item.location = 'technik';
    item.slot = slot;
    item.storageSpot = null;
    if (isBatteryType(item.type) && !this.charges.has(item.id)) {
      this.charges.set(item.id, BATTERY.capacityKwh * BATTERY.startCharge);
    }
    if (isGeneratorType(item.type) && !this.tanks.has(item.id)) this.tanks.set(item.id, 0);
    this.emit('placed', { item, kind: isBatteryType(item.type) ? 'battery' : 'generator' });
    this.economy.notify?.();
    return true;
  }

  // ---------- Diesel ----------
  // Kommt per Tankwagen direkt in den Tank aufgestellter Generatoren. item: ein bestimmter Generator; ohne item werden
  // alle aufgestellten der Reihe nach (Platz 0 zuerst) aufgefüllt. liters: Wunschmenge (Standard ein Schritt).

  // Liter, die wirklich passen (höchstens bis zur Tankgröße)
  dieselOffer(liters = DIESEL.stepLiters, item = null) {
    const free = (item ? [item] : this.generators).reduce((sum, g) => sum + Math.max(0, this.tankOf(g) - this.dieselOf(g)), 0);
    return Math.max(0, Math.min(num(liters, Infinity), free));
  }

  // Alle aufgestellten Generatoren volltanken: so viele Liter fehlen insgesamt
  get fillAllLiters() {
    return this.dieselOffer(Infinity);
  }

  dieselProblem(liters = this.dieselOffer(), item = null) {
    if (!this.ownedGenerators) return 'Erst einen Generator kaufen';
    if (item ? item.location !== 'technik' : !this.generators.length) return 'Erst einen Generator aufstellen';
    if (liters <= EPS) return 'Tank voll';
    if (!this.economy.canAfford(this.dieselPrice(liters))) return 'Zu wenig Geld';
    return null;
  }

  dieselPrice(liters) {
    return Math.round(liters * DIESEL.pricePerLiter * 100) / 100;
  }

  // Gibt die getankten Liter zurück (0, wenn es nicht geht)
  buyDiesel(liters = DIESEL.stepLiters, item = null) {
    const amount = this.dieselOffer(liters, item);
    if (this.dieselProblem(amount, item)) return 0;
    const price = this.dieselPrice(amount);
    if (!this.economy.spend(price)) return 0;
    let rest = amount;
    const filled = [];
    for (const g of item ? [item] : this.generators) {
      const put = Math.min(rest, Math.max(0, this.tankOf(g) - this.dieselOf(g)));
      if (put <= EPS) continue;
      this.tanks.set(g.id, this.dieselOf(g) + put);
      filled.push({ item: g, liters: put });
      rest -= put;
    }
    this.emit('diesel-bought', { liters: amount, price, items: filled });
    this.economy.notify?.();
    return amount;
  }

  // Alle aufgestellten Generatoren volltanken
  fillAll() {
    return this.buyDiesel(Infinity);
  }

  // ---------- Priorität und Einstellungen ----------

  setPriority(list) {
    if (!Array.isArray(list) || list.length !== POWER_GROUPS.length || !POWER_GROUPS.every((g) => list.includes(g))) return false;
    this.priority = [...list];
    this.economy?.notify?.();
    return true;
  }

  // Gruppe in der Liste nach oben (dir −1) bzw. unten (+1) schieben
  movePriority(group, dir) {
    const i = this.priority.indexOf(group);
    const j = i + Math.sign(dir);
    if (i < 0 || j < 0 || j >= this.priority.length) return false;
    const list = [...this.priority];
    [list[i], list[j]] = [list[j], list[i]];
    return this.setPriority(list);
  }

  setReserve(share) {
    this.reserve = Math.min(1, Math.max(0, num(share, 0)));
    this.economy?.notify?.();
  }

  // ---------- Versorgung bei Stromausfall ----------

  // Wer bekäme gerade Notstrom? { servers, lights, printers } → boolean. Ohne Ausfall alle true.
  allocation() {
    const result = Object.fromEntries(POWER_GROUPS.map((g) => [g, true]));
    if (!this.grid?.isOutage) return result;
    const charged = this.batteries.filter((b) => this.chargeOf(b) > EPS);
    const powerKw = charged.length * BATTERY.maxKw + this.runningKw;
    const energy = this.chargeKwh + this.dieselKwh;
    const hoursLeft = Math.max(0, this.grid.outage?.minutesLeft ?? 0) / 60;
    let cumKw = 0;
    let on = powerKw > EPS;
    this.priority.forEach((g, i) => {
      const kw = Math.max(0, this.groups[g] ?? 0);
      if (on) {
        const fitsPower = cumKw + kw <= powerKw + EPS;
        const fitsEnergy = i === 0 ? energy > EPS : energy + EPS >= (cumKw + kw) * hoursLeft;
        on = fitsPower && fitsEnergy;
      }
      result[g] = on;
      if (on) cumKw += kw;
    });
    return result;
  }

  supplies(group) {
    return !!this.allocation()[group];
  }

  // Bedarf der gerade versorgten Gruppen (kW)
  suppliedLoadKw(supplied = this.allocation()) {
    return POWER_GROUPS.filter((g) => supplied[g]).reduce((sum, g) => sum + Math.max(0, this.groups[g] ?? 0), 0);
  }

  // ---------- Zeit ----------

  // Spielminuten laufen lassen. from: Spielzeit zu Beginn (GameClock.minutes). loadKw: Verbrauch auf der Rechnung
  // (economy.powerPerHour / KWH_PRICE), groups: Bedarf je Gruppe in kW für die Notstrom-Versorgung.
  // Gibt { cost (€ Netzstrom mit Tarif), gridKwh } zurück – die Abrechnung bucht cost statt Verbrauch × Tarif.
  advance(gameMinutes, from = 0, { loadKw = 0, groups = null } = {}) {
    if (groups) this.groups = { servers: 0, lights: LIGHTS_KW, printers: 0, ...groups };
    let cost = 0;
    let gridKwh = 0;
    let t = from;
    let rest = Math.max(0, gameMinutes);
    if (rest <= 0) return { cost, gridKwh };
    while (rest > EPS) {
      this.rollDay(t);
      if (this.grid?.isOutage) {
        const startsIn = this.generatorStartsIn;
        const step = Math.min(rest, MAX_STEP, startsIn > EPS ? startsIn : Infinity);
        this.advanceOutage(step);
        t += step;
        rest -= step;
        continue;
      }
      if (this.running.size) this.stopGenerator('grid');
      const step = Math.min(rest, NORMAL_STEP, minutesToTariffChange(t));
      const tariff = tariffAt(t);
      const kwh = this.advanceNormal(step, loadKw, tariff.id === 'night');
      gridKwh += kwh;
      cost += kwh * KWH_PRICE * tariff.factor;
      t += step;
      rest -= step;
    }
    return { cost, gridKwh };
  }

  rollDay(t) {
    const day = Math.floor(t / MINUTES_PER_DAY);
    if (this.day === null) this.day = day;
    if (day !== this.day) {
      this.savedYesterday = day === this.day + 1 ? this.savedToday : 0;
      this.savedToday = 0;
      this.day = day;
    }
  }

  // Normalbetrieb über minutes (ein Tarif): gibt die kWh aus dem Netz zurück
  advanceNormal(minutes, loadKw, night) {
    const h = minutes / 60;
    const load = Math.max(0, loadKw);
    const bats = this.batteries;
    this.generatorKw = 0;
    this.outputs.clear();
    if (!bats.length) {
      this.flowKw = 0;
      this.mode = 'idle';
      return load * h;
    }
    if (night) {
      const charged = this.fillBatteries(bats, h);
      this.flowKw = charged / h;
      this.mode = charged > EPS ? 'charging' : 'idle';
      return load * h + charged;
    }
    const floor = BATTERY.capacityKwh * this.reserve;
    const used = this.drainBatteries(bats, load * h, h, floor);
    this.flowKw = -used / h;
    this.mode = used > EPS ? 'discharging' : 'idle';
    const saved = used * KWH_PRICE * (DAY_FACTOR - NIGHT_FACTOR);
    this.savedToday += saved;
    this.savedTotal += saved;
    return load * h - used;
  }

  // Stromausfall über minutes: Generatoren starten, Gruppen versorgen, Akkus und Diesel verbrauchen
  advanceOutage(minutes) {
    const h = minutes / 60;
    // Ohne aufgestellten Notstrom gibt es nichts zu versorgen und nichts zu melden (Ausfall nur per Test/Cheat)
    if (!this.installed) {
      this.outageMinutes += minutes;
      this.mode = 'idle';
      this.flowKw = 0;
      this.generatorKw = 0;
      this.outputs.clear();
      this.lastSupplied = null;
      return;
    }
    this.mode = 'backup';
    // Generatoren springen nach der Startzeit an, wenn Diesel im eigenen Tank ist (alle zusammen in einer Meldung)
    const gens = this.generators;
    for (const id of [...this.running]) if (!gens.some((g) => g.id === id)) this.running.delete(id); // nicht mehr aufgestellt
    const started = gens.filter((g) => {
      const wait = this.generatorStartsInFor(g);
      return wait !== null && wait <= EPS;
    });
    for (const g of started) this.running.add(g.id);
    if (started.length) this.emit('generator-start', { items: started, kw: started.reduce((s, g) => s + generatorSpec(g).kw, 0) });
    const supplied = this.allocation();
    this.reportGroups(supplied);
    let need = this.suppliedLoadKw(supplied) * h;
    // Zuerst die Generatoren (je bis zur Nennleistung, solange ihr Tank reicht), dann die Akkus
    const fromGen = this.drainGenerators(gens.filter((g) => this.isRunning(g)), need, h);
    need -= fromGen;
    for (const g of gens) {
      if (!this.isRunning(g) || this.dieselOf(g) > EPS) continue;
      // Tank leer: nur dieser Generator fällt aus
      this.tanks.set(g.id, 0);
      this.running.delete(g.id);
      this.outputs.set(g.id, 0);
      this.emit('generator-stop', { reason: 'diesel', item: g, items: [g] });
      this.emit('diesel-empty', { item: g });
    }
    const hadCharge = this.chargeKwh > EPS;
    const fromBat = need > EPS ? this.drainBatteries(this.batteries, need, h, 0) : 0;
    if (hadCharge && this.chargeKwh <= EPS) this.emit('batteries-empty', {});
    this.generatorKw = fromGen / h;
    this.flowKw = -fromBat / h;
    this.backupKwhTotal += fromGen + fromBat;
    this.outageMinutes += minutes;
    this.reportGroups(this.allocation());
  }

  // Bis zu kwh aus den laufenden Generatoren holen, verteilt nach Leistungsanteil (je höchstens kw × h und was der
  // Tank hergibt). Kann einer nicht mehr, übernehmen die übrigen seinen Teil. Gibt die gelieferten kWh zurück und
  // merkt sich die Leistung je Generator (outputs).
  drainGenerators(gens, kwh, h) {
    this.outputs.clear();
    const room = new Map(gens.map((g) => {
      const spec = generatorSpec(g);
      return [g.id, Math.max(0, Math.min(spec.kw * h, this.dieselOf(g) / spec.litersPerKwh))];
    }));
    const given = new Map(gens.map((g) => [g.id, 0]));
    let need = Math.max(0, kwh);
    let open = gens.filter((g) => room.get(g.id) > EPS);
    while (need > EPS && open.length) {
      const total = open.reduce((s, g) => s + generatorSpec(g).kw, 0);
      const next = [];
      let took = 0;
      for (const g of open) {
        const take = Math.min((need * generatorSpec(g).kw) / total, room.get(g.id));
        room.set(g.id, room.get(g.id) - take);
        given.set(g.id, given.get(g.id) + take);
        took += take;
        if (room.get(g.id) > EPS) next.push(g);
      }
      need -= took;
      open = next;
      if (took <= EPS) break;
    }
    let sum = 0;
    for (const g of gens) {
      const e = given.get(g.id);
      this.tanks.set(g.id, Math.max(0, this.dieselOf(g) - e * generatorSpec(g).litersPerKwh));
      this.outputs.set(g.id, e / h);
      sum += e;
    }
    return sum;
  }

  // Generatoren abschalten: reason 'grid' (Strom wieder da) – alle zusammen in einer Meldung
  stopGenerator(reason) {
    const items = this.generators.filter((g) => this.isRunning(g));
    const had = this.running.size > 0;
    this.running.clear();
    this.outputs.clear();
    this.generatorKw = 0;
    if (had) this.emit('generator-stop', { reason, items, item: items[0] ?? null });
  }

  // Meldet, welche Gruppe Notstrom verliert bzw. bekommt (in Prioritäts-Reihenfolge)
  reportGroups(supplied) {
    const last = this.lastSupplied;
    this.lastSupplied = { ...supplied };
    if (!last || !this.installed) return;
    // Eine Meldung je Richtung, auch wenn mehrere Gruppen zugleich wechseln
    const off = this.priority.filter((g) => last[g] && !supplied[g]);
    const on = this.priority.filter((g) => !last[g] && supplied[g]);
    if (off.length) this.emit('groups-off', { groups: off });
    if (on.length) this.emit('groups-on', { groups: on });
  }

  // Bis zu kwh aus den Akkus holen (je Schrank höchstens maxKw × h, nicht unter floor kWh). Gleichmäßig verteilt.
  drainBatteries(bats, kwh, h, floor) {
    let need = kwh;
    // Was jeder Schrank in diesem Schritt noch abgeben kann (Leistung und Ladung über der Reserve)
    const room = new Map(bats.map((b) => [b.id, Math.max(0, Math.min(BATTERY.maxKw * h, this.chargeOf(b) - floor))]));
    let open = bats.filter((b) => room.get(b.id) > EPS);
    // Gleichmäßig aufteilen; ist ein Schrank erschöpft, übernehmen die übrigen seinen Teil
    while (need > EPS && open.length) {
      const share = need / open.length;
      const next = [];
      for (const b of open) {
        const take = Math.min(share, room.get(b.id));
        this.charges.set(b.id, this.chargeOf(b) - take);
        room.set(b.id, room.get(b.id) - take);
        need -= take;
        if (room.get(b.id) > EPS) next.push(b);
      }
      open = next;
    }
    return kwh - Math.max(0, need);
  }

  // Alle Akkus mit bis zu maxKw × h laden, bis sie voll sind. Gibt die geladenen kWh zurück.
  fillBatteries(bats, h) {
    let sum = 0;
    for (const b of bats) {
      const add = Math.min(BATTERY.maxKw * h, BATTERY.capacityKwh - this.chargeOf(b));
      if (add <= EPS) continue;
      this.charges.set(b.id, this.chargeOf(b) + add);
      sum += add;
    }
    return sum;
  }

  // ---------- Anzeige ----------

  // Geschätzte Laufzeit des Diesels in Stunden bei loadKw (Standard: Bedarf der versorgten Gruppen, höchstens die
  // Nennleistung) – null ohne Generator oder ohne Last
  dieselRuntimeHours(loadKw = null) {
    const cap = this.generatorCapacityKw;
    if (!cap) return null;
    const load = Math.min(cap, loadKw ?? this.suppliedLoadKw());
    return load > EPS ? this.dieselKwh / load : null;
  }

  // Zustand eines aufgestellten Generators: 'running' | 'starting' | 'empty' | 'ready'
  generatorState(item) {
    if (this.isRunning(item)) return 'running';
    if (this.generatorStartsInFor(item) !== null) return 'starting';
    return this.dieselOf(item) <= EPS ? 'empty' : 'ready';
  }

  // Kurzinfo fürs HUD während eines Ausfalls („🔋 Notstrom: 64 % · ⛽ 2 / 3 Generatoren 280 kW · 350 L“), sonst null
  hudText() {
    if (!this.grid?.isOutage || !this.installed) return null;
    const parts = [];
    if (this.batteries.length) parts.push(`🔋 Notstrom: ${Math.round(this.percent)} %`);
    else parts.push('🔋 Notstrom');
    const gens = this.generators;
    if (gens.length) {
      const liters = Math.round(this.diesel);
      const run = gens.filter((g) => this.isRunning(g)).length;
      const startsIn = this.generatorStartsIn;
      if (gens.length === 1) {
        if (run) parts.push(`⛽ Generator ${liters} L`);
        else if (startsIn !== null) parts.push(`⛽ Generator ${generatorStartText(startsIn)}`);
        else if (this.diesel <= EPS) parts.push('⛽ Diesel leer');
      } else if (run) {
        parts.push(`⛽ ${run} / ${gens.length} Generatoren ${Math.round(this.runningKw)} kW · ${liters} L`);
      } else if (startsIn !== null) {
        parts.push(`⛽ Generatoren ${generatorStartText(startsIn)}`);
      } else if (this.diesel <= EPS) {
        parts.push('⛽ Diesel leer');
      }
    }
    return parts.join(' · ');
  }

  // Alles auf einen Blick für den Leitstand (Reiter „Strom“)
  status() {
    const supplied = this.allocation();
    const gens = this.generators;
    const generators = gens.map((g) => {
      const spec = generatorSpec(g);
      const diesel = this.dieselOf(g);
      return {
        id: g.id,
        slot: g.slot,
        typeId: spec.id,
        name: spec.name,
        ratedKw: spec.kw,                      // Nennleistung
        kw: this.outputs.get(g.id) ?? 0,       // zuletzt geliefert
        running: this.isRunning(g),
        state: this.generatorState(g),         // 'running' | 'starting' | 'empty' | 'ready'
        startsIn: this.generatorStartsInFor(g),
        diesel,
        tank: spec.tankLiters,
        percent: (diesel / spec.tankLiters) * 100,
        fullLoadHours: diesel / (spec.kw * spec.litersPerKwh), // Laufzeit allein unter Volllast mit dem jetzigen Tank
      };
    });
    return {
      installed: this.installed,
      batteries: this.batteries.map((b) => ({ id: b.id, slot: b.slot, chargeKwh: this.chargeOf(b), percent: (this.chargeOf(b) / BATTERY.capacityKwh) * 100 })),
      capacityKwh: this.capacityKwh,
      chargeKwh: this.chargeKwh,
      percent: this.percent,
      flowKw: this.flowKw,           // + laden, − entladen
      mode: this.mode,
      // Alle Generatoren zusammen (Felder wie beim einzelnen Generator aus #59)
      generator: {
        installed: gens.length > 0,
        count: gens.length,
        running: this.generatorRunning,
        runningCount: generators.filter((g) => g.running).length,
        kw: this.generatorKw,                       // zuletzt geliefert, alle zusammen
        ratedKw: this.generatorCapacityKw,          // Nennleistung aller aufgestellten
        runningKw: this.runningKw,                  // Nennleistung der laufenden
        startsIn: this.generatorStartsIn,
        diesel: this.diesel,                        // Liter in allen Tanks
        tank: this.tankLiters,                      // Tankgröße aller zusammen
        dieselKwh: this.dieselKwh,
        runtimeHours: this.dieselRuntimeHours(),    // bei der jetzigen Last (null ohne Last)
        fullLoadHours: this.generatorCapacityKw ? this.dieselKwh / this.generatorCapacityKw : null, // alle unter Volllast
      },
      generators,                    // je Generator (nach Platz)
      priority: [...this.priority],
      groups: { ...this.groups },
      supplied,
      reserve: this.reserve,
      savedToday: this.savedToday,
      savedYesterday: this.savedYesterday,
      savedTotal: this.savedTotal,
      backupKwhTotal: this.backupKwhTotal,
      hudText: this.hudText(),
    };
  }

  // ---------- Ereignisse ----------

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, data) {
    this.onEvent?.(type, data);
    for (const listener of this.listeners) listener(type, data, this);
  }

  // ---------- Speichern ----------

  toJSON() {
    const exists = ([id]) => this.economy?.furnitureById(id);
    return {
      charges: [...this.charges].filter(exists),
      tanks: [...this.tanks].filter(exists),     // #71: Diesel je Generator [Furniture-ID, Liter]
      running: [...this.running].filter((id) => this.economy?.furnitureById(id)),
      priority: [...this.priority],
      reserve: this.reserve,
      outageMinutes: this.outageMinutes,
      savedToday: this.savedToday,
      savedYesterday: this.savedYesterday,
      savedTotal: this.savedTotal,
      backupKwhTotal: this.backupKwhTotal,
      day: this.day,
    };
  }

  // Alter Spielstand ohne Notstrom (data undefined/null): nichts gekauft, Standard-Priorität.
  // Format aus #59 (diesel als eine Zahl, generatorRunning): der Diesel kommt in den vorhandenen Generator
  // (den aufgestellten, sonst den ersten im Besitz – damals gab es nur den 40-kW-Generator).
  load(data) {
    this.charges = new Map(
      (Array.isArray(data?.charges) ? data.charges : [])
        .filter(([id, kwh]) => Number.isFinite(id) && Number.isFinite(kwh))
        .map(([id, kwh]) => [id, Math.min(BATTERY.capacityKwh, Math.max(0, kwh))]),
    );
    const owned = this.items.filter((f) => isGeneratorType(f.type));
    const byId = new Map(owned.map((g) => [g.id, g]));
    this.tanks = new Map();
    if (Array.isArray(data?.tanks)) {
      for (const entry of data.tanks) {
        const [id, liters] = Array.isArray(entry) ? entry : [];
        const g = byId.get(id);
        if (g && Number.isFinite(liters)) this.tanks.set(id, Math.min(this.tankOf(g), Math.max(0, liters)));
      }
    } else if (Number.isFinite(data?.diesel)) {
      const target = owned.find((g) => g.location === 'technik') ?? owned[0];
      if (target) this.tanks.set(target.id, Math.min(this.tankOf(target), Math.max(0, data.diesel)));
    }
    for (const g of owned) if (!this.tanks.has(g.id)) this.tanks.set(g.id, 0);
    this.priority = [...DEFAULT_PRIORITY];
    if (data?.priority) this.setPriority(data.priority);
    this.reserve = Math.min(1, Math.max(0, num(data?.reserve, 0)));
    this.outageMinutes = this.grid?.isOutage ? Math.max(0, num(data?.outageMinutes, 0)) : 0;
    // Laufende Generatoren nur während eines Ausfalls, aufgestellt und mit Diesel
    const canRun = (g) => !!g && g.location === 'technik' && this.dieselOf(g) > EPS && !!this.grid?.isOutage;
    this.running = new Set();
    if (Array.isArray(data?.running)) {
      for (const id of data.running) if (canRun(byId.get(id))) this.running.add(id);
    } else if (data?.generatorRunning) {
      for (const g of owned) if (canRun(g)) this.running.add(g.id);
    }
    this.savedToday = num(data?.savedToday, 0);
    this.savedYesterday = num(data?.savedYesterday, 0);
    this.savedTotal = num(data?.savedTotal, 0);
    this.backupKwhTotal = num(data?.backupKwhTotal, 0);
    this.day = Number.isFinite(data?.day) ? data.day : null;
    this.lastSupplied = null;
    this.flowKw = 0;
    this.generatorKw = 0;
    this.outputs = new Map();
    this.mode = 'idle';
    // Akkus ohne gespeicherte Ladung (z. B. erst nach dem Speichern aufgestellt) starten halb voll
    for (const b of this.batteries) if (!this.charges.has(b.id)) this.charges.set(b.id, BATTERY.capacityKwh * BATTERY.startCharge);
  }
}

// Namen mehrerer Gruppen für eine Meldung: „Drucker“, „Licht und Drucker“, „Server und Netzwerk, Licht und Drucker“
export function groupListText(groups) {
  const names = groups.map((g) => GROUP_NAMES[g] ?? g);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0] ?? '';
}

// Startzeit des Generators in Spielminuten wie „noch 60 min“ beim Ausfall: „startet in 1,7 min“, unter 1 min „startet gleich“
export function generatorStartText(minutes) {
  if (!(minutes >= 1)) return 'startet gleich';
  return `startet in ${(Math.ceil(minutes * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} min`;
}
