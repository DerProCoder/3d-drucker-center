// Notstrom und Akkus (#59): Batterieschränke und ein Dieselgenerator im Technikraum (Raum bei −10,5 m).
// Bewusst ohne Three.js und DOM.
//
// Umrechnung: Strom läuft im Spiel in €/h zum Grundpreis. Ein fester Preis von KWH_PRICE = 0,30 €/kWh (vor Tarif)
// macht daraus Leistung, z. B. 3 €/h Strom = 10 kW.
//
// Gekauft wird im Server-Shop (Kategorie „Technik“, core/server-catalog.js TECH_EQUIPMENT). Akkus und Generator sind
// Einrichtung aus economy.furniture (Karton, Lieferung, Abstellraum, Tragen wie Regale) und stehen aufgestellt mit
// location 'technik' auf einem festen Platz (slot): Akkus 0 … BATTERY.max − 1, der Generator auf Platz 0
// (world/control-room.js CONTROL_ANCHORS.batterySlots / generatorSlot). Ladung je Akku, Dieselstand, Priorität und
// Statistik führt dieses Modul (toJSON/load).
//
// Betrieb:
//   Normal, Nachtstrom (22–6 Uhr): Die Akkus laden mit bis zu BATTERY.maxKw je Schrank, bis sie voll sind – der
//     Ladestrom läuft mit über die Stromrechnung (zum Nachttarif).
//   Normal, Tagstrom: Die Akkus decken den Verbrauch zuerst (bis BATTERY.maxKw je Schrank), bis sie leer sind bzw.
//     die Reserve (reserve, Anteil 0 … 1, Standard 0) erreicht ist. Gespart wird der Unterschied Tag- zu Nachtpreis.
//   Stromausfall (core/power-grid.js): Akkus überbrücken, nach GENERATOR.startMinutes springt der Generator an und
//     trägt bis GENERATOR.kw, die Akkus legen den Rest drauf. Versorgt werden die Gruppen nach Priorität
//     (Standard: Server und Netzwerk → Licht → Drucker): Eine Gruppe läuft nur, wenn auch alle wichtigeren laufen,
//     die Leistung für alle zusammen reicht und – ab der zweiten Gruppe – die Energie (Akkus + Diesel) für alle bis
//     hierher bis zum Ende des Ausfalls reicht. So gehen bei knapper Energie zuerst die Drucker aus, dann das Licht,
//     zuletzt die Server.
//
// Einbau: attach(grid) setzt grid.hasBackup und grid.supplier. economy.backupPower = backupPower – die Abrechnung
// (economy.advanceTime) ruft advance(Minuten, von, { loadKw, groups }) und bucht das zurückgegebene cost.
//
// Ereignisse über onEvent(type, data) und subscribe(listener):
//   'placed'          { item, kind }            – Akku bzw. Generator aufgestellt
//   'generator-start' {}                        – Generator springt an
//   'generator-stop'  { reason }                – 'grid' (Strom wieder da) | 'diesel' (Tank leer)
//   'diesel-empty'    {}                        – Tank leer (zusätzlich zu generator-stop, auch ohne Lauf)
//   'diesel-bought'   { liters, price }
//   'batteries-empty' {}                        – alle Akkus leer (während eines Ausfalls)
//   'groups-off'      { groups } / 'groups-on' { groups } – Gruppen (in Prioritäts-Reihenfolge), die gleichzeitig Notstrom
//                     verlieren bzw. wieder bekommen (während eines Ausfalls, je Rechenschritt höchstens eine Meldung)
import { DAY_FACTOR, NIGHT_FACTOR, NIGHT_START_HOUR, DAY_START_HOUR, POWER_GROUPS, tariffAt } from './power-grid.js';

export const KWH_PRICE = 0.30; // €/kWh vor Tarif: Umrechnung von €/h in kW
export const euroPerHourToKw = (euroPerHour) => euroPerHour / KWH_PRICE;

// Batterieschrank: Kapazität, Lade-/Entladeleistung, Preis, Höchstzahl. Neu geliefert ist er halb voll.
export const BATTERY = { id: 'battery-cabinet', capacityKwh: 100, maxKw: 25, price: 3000, max: 6, startCharge: 0.5 };
// Dieselgenerator: Leistung, Preis, Höchstzahl, Tank, Verbrauch, Startverzögerung nach einem Ausfall, Erstbefüllung
export const GENERATOR = {
  id: 'diesel-generator', kw: 40, price: 8000, max: 1, tankLiters: 200, litersPerKwh: 0.3, startMinutes: 2, startDiesel: 50,
};
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
export const isGeneratorType = (type) => type?.id === GENERATOR.id;
export const isBackupType = (type) => isBatteryType(type) || isGeneratorType(type);

export class BackupPower {
  // economy: core/economy.js (Einrichtung, Geld) · grid: core/power-grid.js (optional, sonst attach)
  constructor({ economy = null, grid = null } = {}) {
    this.economy = economy;
    this.grid = null;
    this.charges = new Map();     // Furniture-ID → Ladung kWh
    this.diesel = 0;              // Liter im Tank
    this.priority = [...DEFAULT_PRIORITY];
    this.reserve = 0;             // Anteil, den die Akkus im Normalbetrieb nicht abgeben (für Ausfälle)
    this.generatorRunning = false;
    this.outageMinutes = 0;       // seit Beginn des laufenden Ausfalls
    this.groups = { servers: 0, lights: LIGHTS_KW, printers: 0 }; // Leistungsbedarf kW (aus advance)
    this.flowKw = 0;              // + laden, − entladen (Akkus gesamt, zuletzt)
    this.generatorKw = 0;         // zuletzt vom Generator geliefert
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

  get generator() {
    return this.items.find((f) => isGeneratorType(f.type) && f.location === 'technik') ?? null;
  }

  // Mindestens ein Akku oder ein Generator steht im Technikraum
  get installed() {
    return this.batteries.length > 0 || !!this.generator;
  }

  owned(type) {
    return this.items.filter((f) => f.type.id === type.id).length;
  }

  chargeOf(item) {
    return this.charges.get(item.id) ?? 0;
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

  // Energie im Tank in kWh (nur mit Generator nutzbar)
  get dieselKwh() {
    return this.generator ? this.diesel / GENERATOR.litersPerKwh : 0;
  }

  // Minuten bis der Generator anspringt (während eines Ausfalls, sonst null)
  get generatorStartsIn() {
    if (!this.grid?.isOutage || !this.generator || this.generatorRunning || this.diesel <= EPS) return null;
    return Math.max(0, GENERATOR.startMinutes - this.outageMinutes);
  }

  // ---------- Kaufen und Aufstellen ----------

  // Grund, warum der Kauf gerade nicht geht, oder null. roomBuilt: steht der Raum bei −10,5 m (upgrades.controlRoom)?
  buyProblem(type, roomBuilt = true) {
    if (!isBackupType(type)) return 'Unbekanntes Gerät';
    if (!roomBuilt) return 'Erst den Raum bei −10,5 m bauen (Ausbau)';
    const max = isBatteryType(type) ? BATTERY.max : GENERATOR.max;
    if (this.owned(type) >= max) return `Höchstens ${max}`;
    const economy = this.economy;
    if (!economy.roomForBox({ type })) return economy.overflow?.storageFields().length ? 'Abstellraum und Keller-Lager voll' : 'Abstellraum voll';
    if (!economy.canAfford(type.price)) return 'Zu wenig Geld';
    return null;
  }

  // Bestellen: kommt als Karton (economy.buyFurniture). Gibt das Einrichtungsstück oder null zurück.
  buy(type, roomBuilt = true) {
    if (this.buyProblem(type, roomBuilt)) return null;
    const item = this.economy.buyFurniture(type);
    // Der Generator kommt mit einer Erstbefüllung im Tank
    if (item && isGeneratorType(type)) this.diesel = Math.min(GENERATOR.tankLiters, this.diesel + GENERATOR.startDiesel);
    return item;
  }

  // Freie Plätze für einen Typ (Akkus 0 … 5, Generator 0)
  freeSlots(type) {
    const count = isBatteryType(type) ? BATTERY.max : isGeneratorType(type) ? GENERATOR.max : 0;
    const used = new Set(this.items.filter((f) => f.type.id === type.id && f.location === 'technik').map((f) => f.slot));
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
    this.emit('placed', { item, kind: isBatteryType(item.type) ? 'battery' : 'generator' });
    this.economy.notify?.();
    return true;
  }

  // Diesel nachkaufen: liters (Standard: ein Schritt bzw. was noch in den Tank passt). Kommt sofort in den Tank.
  dieselProblem(liters = this.dieselOffer()) {
    if (!this.owned({ id: GENERATOR.id })) return 'Erst einen Generator kaufen';
    if (liters <= EPS) return 'Tank voll';
    if (!this.economy.canAfford(this.dieselPrice(liters))) return 'Zu wenig Geld';
    return null;
  }

  dieselOffer(liters = DIESEL.stepLiters) {
    return Math.max(0, Math.min(liters, GENERATOR.tankLiters - this.diesel));
  }

  dieselPrice(liters) {
    return Math.round(liters * DIESEL.pricePerLiter * 100) / 100;
  }

  buyDiesel(liters = DIESEL.stepLiters) {
    const amount = this.dieselOffer(liters);
    if (this.dieselProblem(amount)) return 0;
    const price = this.dieselPrice(amount);
    if (!this.economy.spend(price)) return 0;
    this.diesel += amount;
    this.emit('diesel-bought', { liters: amount, price });
    this.economy.notify?.();
    return amount;
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
    const powerKw = charged.length * BATTERY.maxKw + (this.generatorRunning ? GENERATOR.kw : 0);
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
        const step = Math.min(rest, MAX_STEP, this.generatorStartsIn > EPS ? this.generatorStartsIn : Infinity);
        this.advanceOutage(step);
        t += step;
        rest -= step;
        continue;
      }
      if (this.generatorRunning) this.stopGenerator('grid');
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

  // Stromausfall über minutes: Generator starten, Gruppen versorgen, Akkus und Diesel verbrauchen
  advanceOutage(minutes) {
    const h = minutes / 60;
    // Ohne aufgestellten Notstrom gibt es nichts zu versorgen und nichts zu melden (Ausfall nur per Test/Cheat)
    if (!this.installed) {
      this.outageMinutes += minutes;
      this.mode = 'idle';
      this.flowKw = 0;
      this.generatorKw = 0;
      this.lastSupplied = null;
      return;
    }
    this.mode = 'backup';
    // Generator springt nach der Startzeit an, wenn Diesel da ist
    if (this.generator && !this.generatorRunning && this.diesel > EPS && this.outageMinutes + EPS >= GENERATOR.startMinutes) {
      this.generatorRunning = true;
      this.emit('generator-start', {});
    }
    const supplied = this.allocation();
    this.reportGroups(supplied);
    const load = POWER_GROUPS.filter((g) => supplied[g]).reduce((sum, g) => sum + Math.max(0, this.groups[g] ?? 0), 0);
    let need = load * h;
    // Zuerst der Generator (bis GENERATOR.kw), solange Diesel reicht
    let fromGen = 0;
    if (this.generatorRunning) {
      fromGen = Math.min(need, GENERATOR.kw * h, this.diesel / GENERATOR.litersPerKwh);
      this.diesel = Math.max(0, this.diesel - fromGen * GENERATOR.litersPerKwh);
      need -= fromGen;
      if (this.diesel <= EPS) {
        this.diesel = 0;
        this.stopGenerator('diesel');
        this.emit('diesel-empty', {});
      }
    }
    // Den Rest aus den Akkus
    const hadCharge = this.chargeKwh > EPS;
    const fromBat = need > EPS ? this.drainBatteries(this.batteries, need, h, 0) : 0;
    if (hadCharge && this.chargeKwh <= EPS) this.emit('batteries-empty', {});
    this.generatorKw = fromGen / h;
    this.flowKw = -fromBat / h;
    this.backupKwhTotal += fromGen + fromBat;
    this.outageMinutes += minutes;
    this.reportGroups(this.allocation());
  }

  stopGenerator(reason) {
    if (!this.generatorRunning) return;
    this.generatorRunning = false;
    this.generatorKw = 0;
    this.emit('generator-stop', { reason });
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

  // Kurzinfo fürs HUD während eines Ausfalls („🔋 Notstrom: 64 %“), sonst null
  hudText() {
    if (!this.grid?.isOutage || !this.installed) return null;
    const parts = [];
    if (this.batteries.length) parts.push(`🔋 Notstrom: ${Math.round(this.percent)} %`);
    else parts.push('🔋 Notstrom');
    if (this.generator) {
      if (this.generatorRunning) parts.push(`⛽ Generator ${Math.round(this.diesel)} L`);
      else if (this.generatorStartsIn !== null) parts.push(`⛽ Generator ${generatorStartText(this.generatorStartsIn)}`);
      else if (this.diesel <= EPS) parts.push('⛽ Diesel leer');
    }
    return parts.join(' · ');
  }

  // Alles auf einen Blick für den Leitstand (Reiter „Strom“)
  status() {
    const supplied = this.allocation();
    return {
      installed: this.installed,
      batteries: this.batteries.map((b) => ({ id: b.id, slot: b.slot, chargeKwh: this.chargeOf(b), percent: (this.chargeOf(b) / BATTERY.capacityKwh) * 100 })),
      capacityKwh: this.capacityKwh,
      chargeKwh: this.chargeKwh,
      percent: this.percent,
      flowKw: this.flowKw,           // + laden, − entladen
      mode: this.mode,
      generator: {
        installed: !!this.generator,
        running: this.generatorRunning,
        kw: this.generatorKw,
        startsIn: this.generatorStartsIn,
        diesel: this.diesel,
        tank: GENERATOR.tankLiters,
      },
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
    return {
      charges: [...this.charges].filter(([id]) => this.economy?.furnitureById(id)),
      diesel: this.diesel,
      priority: [...this.priority],
      reserve: this.reserve,
      generatorRunning: this.generatorRunning,
      outageMinutes: this.outageMinutes,
      savedToday: this.savedToday,
      savedYesterday: this.savedYesterday,
      savedTotal: this.savedTotal,
      backupKwhTotal: this.backupKwhTotal,
      day: this.day,
    };
  }

  // Alter Spielstand ohne Notstrom (data undefined/null): nichts gekauft, Standard-Priorität
  load(data) {
    this.charges = new Map(
      (Array.isArray(data?.charges) ? data.charges : [])
        .filter(([id, kwh]) => Number.isFinite(id) && Number.isFinite(kwh))
        .map(([id, kwh]) => [id, Math.min(BATTERY.capacityKwh, Math.max(0, kwh))]),
    );
    this.diesel = Math.min(GENERATOR.tankLiters, Math.max(0, num(data?.diesel, 0)));
    this.priority = [...DEFAULT_PRIORITY];
    if (data?.priority) this.setPriority(data.priority);
    this.reserve = Math.min(1, Math.max(0, num(data?.reserve, 0)));
    this.generatorRunning = !!data?.generatorRunning && !!this.grid?.isOutage && !!this.generator && this.diesel > EPS;
    this.outageMinutes = this.grid?.isOutage ? Math.max(0, num(data?.outageMinutes, 0)) : 0;
    this.savedToday = num(data?.savedToday, 0);
    this.savedYesterday = num(data?.savedYesterday, 0);
    this.savedTotal = num(data?.savedTotal, 0);
    this.backupKwhTotal = num(data?.backupKwhTotal, 0);
    this.day = Number.isFinite(data?.day) ? data.day : null;
    this.lastSupplied = null;
    this.flowKw = 0;
    this.generatorKw = 0;
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
