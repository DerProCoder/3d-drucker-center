// Klima im Serverraum: Temperatur je Schrank und Gerät mit einstellbaren Lüftern (0–100 %).
// Jeder Schrank hat unten Zuluft-Lüfter (saugen kalte Luft aus der Klimaanlage an – je schneller, desto kälter die
// Luft im Schrank) und oben Abluft-Lüfter (ziehen die Abwärme der Geräte ab). Warme Luft steigt: oben im Schrank ist
// es wärmer als unten. Jedes Gerät mit Stromverbrauch hat dazu einen eigenen Lüfter, der es gegenüber der Luft im
// Schrank kühlt; seine Abwärme richtet sich nach dem Stromverbrauch.
// Zu heiß (über TEMP_LIMITS.hot): das Gerät nimmt Schaden und ist irgendwann defekt – Reparatur kostet Geld.
// Zu kalt (unter TEMP_LIMITS.cold): es friert irgendwann ein (hängt) – Neustart nötig, sobald es wieder warm genug ist.
// Defekte und eingefrorene Geräte arbeiten nicht (Server offline, Switch/Firewall leiten nicht weiter, siehe
// Servers.deviceProblem). Lüfter kosten etwas Strom. Läuft in Spielminuten. Ohne Three.js und DOM.

export const ROOM_TEMP = 22;  // °C im Serverraum
const COLD_AIR = 4;           // °C der Klimaanlage, die die Zuluft-Lüfter ansaugen
// cold/hot: ab hier nimmt das Gerät Schaden · idealMin/idealMax: grüner Bereich in der Anzeige
export const TEMP_LIMITS = { cold: 10, idealMin: 20, idealMax: 60, hot: 75 };
const RACK_HEAT = 0.8;        // °C Erwärmung der Schrankluft je Strom-Euro/h aller Geräte (bei Abluft 0 % ×5)
const DEVICE_HEAT = 3;        // °C Erwärmung eines Geräts je Strom-Euro/h gegenüber der Schrankluft
const RACK_TAU = 20;          // Spielminuten, in denen sich die Schrankluft zu gut 60 % angleicht
const DEVICE_TAU = 8;         // dasselbe für ein Gerät
const FAIL_MINUTES = 60;      // so lange hält ein Gerät 10 °C über bzw. 5 °C unter der Grenze aus
const REPAIR_SHARE = 0.3;     // Reparatur kostet diesen Anteil vom Kaufpreis
const RESTART_MARGIN = 3;     // °C über der Kältegrenze, ab der ein eingefrorenes Gerät wieder startet
const FAN_POWER = { rack: 0.15, device: 0.04 }; // Strom-Euro pro Spielstunde je Lüfter bei 100 %
export const DEFAULT_FAN = 50;

const clampFan = (pct) => Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
const approach = (value, target, minutes, tau) => value + (target - value) * (1 - Math.exp(-minutes / tau));

export class ServerClimate {
  constructor(economy, servers) {
    this.economy = economy;
    this.servers = servers;
    this.racks = new Map();   // Schrank-ID → { top, bottom (Lüfter %), air (°C, Mittel im Schrank), inlet (°C Zuluft) }
    this.devices = new Map(); // Geräte-ID → { fan (%), temp (°C), heat, cold (Schaden 0…1), status, warned }
    this.onEvent = null;      // (type, { device }) => void – 'hot', 'cold' (Warnung), 'broken', 'frozen'
    servers.deviceProblem = (device) => this.problem(device);
    const basePower = economy.extraPowerPerHour;
    economy.extraPowerPerHour = () => (basePower?.() ?? 0) + this.fanPowerPerHour;
  }

  // Zustand eines Schranks bzw. Geräts (wird beim ersten Zugriff mit Standardwerten angelegt)
  rack(id) {
    if (!this.racks.has(id)) this.racks.set(id, { top: DEFAULT_FAN, bottom: DEFAULT_FAN, air: ROOM_TEMP, inlet: ROOM_TEMP });
    return this.racks.get(id);
  }

  device(id) {
    if (!this.devices.has(id)) this.devices.set(id, { fan: DEFAULT_FAN, temp: ROOM_TEMP, heat: 0, cold: 0, status: 'ok', warned: null });
    return this.devices.get(id);
  }

  // Nur Geräte mit Stromverbrauch werden warm und haben einen Lüfter (Patchpanels nicht)
  hasFan(device) {
    return device.type.kind !== 'rack' && device.type.power > 0;
  }

  // which: 'top' (Abluft oben) oder 'bottom' (Zuluft unten)
  setRackFan(rackId, which, pct) {
    if (which !== 'top' && which !== 'bottom') return;
    this.rack(rackId)[which] = clampFan(pct);
  }

  setDeviceFan(deviceId, pct) {
    this.device(deviceId).fan = clampFan(pct);
  }

  // Warum das Gerät nicht arbeitet, oder null
  problem(device) {
    const status = this.devices.get(device.id)?.status;
    if (status === 'broken') return 'überhitzt – defekt';
    if (status === 'frozen') return 'eingefroren – Neustart nötig';
    return null;
  }

  // Einordnung einer Temperatur für die Anzeige: 'cold', 'cool', 'ok', 'warm', 'hot'
  level(temp) {
    if (temp < TEMP_LIMITS.cold) return 'cold';
    if (temp < TEMP_LIMITS.idealMin) return 'cool';
    if (temp <= TEMP_LIMITS.idealMax) return 'ok';
    if (temp <= TEMP_LIMITS.hot) return 'warm';
    return 'hot';
  }

  // ---------- Reparieren und Neustarten ----------

  repairCost(device) {
    return Math.round(device.type.price * REPAIR_SHARE);
  }

  repairProblem(device) {
    if (this.devices.get(device.id)?.status !== 'broken') return 'Das Gerät ist nicht defekt';
    if (!this.economy.canAfford(this.repairCost(device))) return 'Zu wenig Geld für die Reparatur';
    return null;
  }

  repair(deviceId) {
    const device = this.economy.furnitureById(deviceId);
    if (!device || this.repairProblem(device)) return false;
    this.economy.spend(this.repairCost(device));
    Object.assign(this.device(device.id), { status: 'ok', heat: 0, cold: 0, warned: null });
    this.economy.notify();
    return true;
  }

  restartProblem(device) {
    const state = this.devices.get(device.id);
    if (state?.status !== 'frozen') return 'Das Gerät ist nicht eingefroren';
    if (state.temp < TEMP_LIMITS.cold + RESTART_MARGIN) return 'Noch zu kalt – Lüfter herunterdrehen und warten, bis es sich aufgewärmt hat';
    return null;
  }

  restart(deviceId) {
    const device = this.economy.furnitureById(deviceId);
    if (!device || this.restartProblem(device)) return false;
    Object.assign(this.device(device.id), { status: 'ok', heat: 0, cold: 0, warned: null });
    this.economy.notify();
    return true;
  }

  // ---------- Simulation ----------

  advance(minutes) {
    if (minutes <= 0) return;
    let changed = false;
    const installed = new Set();
    for (const rack of this.servers.racks) {
      const r = this.rack(rack.id);
      const devices = this.servers.devicesIn(rack.id);
      // Defekte Geräte laufen nicht und heizen nicht; eingefrorene hängen nur und werden weiter warm
      const load = devices.reduce((sum, d) => sum + (this.devices.get(d.id)?.status === 'broken' ? 0 : d.type.power), 0);
      r.inlet = ROOM_TEMP - (ROOM_TEMP - COLD_AIR) * (r.bottom / 100);
      const rise = load * RACK_HEAT / (0.2 + r.top / 100);
      r.air = approach(r.air, r.inlet + rise, minutes, RACK_TAU);
      for (const d of devices) {
        if (!this.hasFan(d)) continue;
        installed.add(d.id);
        const s = this.device(d.id);
        // Oben im Schrank wärmer als unten: height 0 = ganz unten, 1 = ganz oben
        const height = 1 - (d.unit + d.type.units / 2) / rack.type.units;
        const local = r.air + (r.air - r.inlet) * 0.5 * (height - 0.5);
        const own = s.status === 'broken' ? 0 : d.type.power * DEVICE_HEAT / (0.15 + s.fan / 100);
        s.temp = approach(s.temp, local + own, minutes, DEVICE_TAU);
        changed = this.stress(d, s, minutes) || changed;
      }
    }
    // Ausgebaute Geräte nehmen Raumtemperatur an, Schäden heilen (defekt bleibt defekt)
    for (const [id, s] of this.devices) {
      if (installed.has(id)) continue;
      s.temp = approach(s.temp, ROOM_TEMP, minutes, DEVICE_TAU);
      s.heat = s.cold = 0;
      s.warned = null;
    }
    if (changed) this.economy.notify();
  }

  // Schaden durch Hitze bzw. Kälte aufsummieren, warnen, Gerät ausfallen lassen. Gibt true zurück, wenn es ausfällt.
  stress(device, s, minutes) {
    const { cold, hot } = TEMP_LIMITS;
    const recover = minutes / (2 * FAIL_MINUTES);
    s.heat = s.temp > hot ? s.heat + ((s.temp - hot) / 10) * (minutes / FAIL_MINUTES) : Math.max(0, s.heat - recover);
    s.cold = s.temp < cold ? s.cold + ((cold - s.temp) / 5) * (minutes / FAIL_MINUTES) : Math.max(0, s.cold - recover);
    if (s.status !== 'ok') return false;
    if (s.temp > hot && s.warned !== 'hot') {
      s.warned = 'hot';
      this.onEvent?.('hot', { device });
    } else if (s.temp < cold && s.warned !== 'cold') {
      s.warned = 'cold';
      this.onEvent?.('cold', { device });
    } else if (s.temp > cold + 2 && s.temp < hot - 2) {
      s.warned = null;
    }
    if (s.heat >= 1) {
      s.status = 'broken';
      this.onEvent?.('broken', { device });
      return true;
    }
    if (s.cold >= 1) {
      s.status = 'frozen';
      this.onEvent?.('frozen', { device });
      return true;
    }
    return false;
  }

  // Strom der Lüfter pro Spielstunde (läuft mit der Stromrechnung)
  get fanPowerPerHour() {
    let sum = 0;
    for (const rack of this.servers.racks) {
      const r = this.rack(rack.id);
      sum += FAN_POWER.rack * (r.top + r.bottom) / 100;
    }
    for (const d of this.servers.installed) {
      if (this.hasFan(d)) sum += FAN_POWER.device * this.device(d.id).fan / 100;
    }
    return sum;
  }

  // Lüfterstrom eines Schranks samt seiner Geräte (für das Schrankfenster)
  rackFanPower(rackId) {
    const r = this.rack(rackId);
    const devices = this.servers.devicesIn(rackId).filter((d) => this.hasFan(d));
    return FAN_POWER.rack * (r.top + r.bottom) / 100 + devices.reduce((sum, d) => sum + FAN_POWER.device * this.device(d.id).fan / 100, 0);
  }

  // ---------- Speichern ----------

  toJSON() {
    const exists = (id) => !!this.economy.furnitureById(id);
    return {
      racks: [...this.racks].filter(([id]) => exists(id)).map(([id, r]) => ({ id, top: r.top, bottom: r.bottom, air: r.air })),
      devices: [...this.devices].filter(([id]) => exists(id)).map(([id, s]) => ({ id, fan: s.fan, temp: s.temp, heat: s.heat, cold: s.cold, status: s.status })),
    };
  }

  load(data) {
    this.racks.clear();
    this.devices.clear();
    for (const r of data?.racks ?? []) {
      Object.assign(this.rack(r.id), { top: clampFan(r.top ?? DEFAULT_FAN), bottom: clampFan(r.bottom ?? DEFAULT_FAN), air: r.air ?? ROOM_TEMP });
    }
    for (const s of data?.devices ?? []) {
      Object.assign(this.device(s.id), {
        fan: clampFan(s.fan ?? DEFAULT_FAN),
        temp: s.temp ?? ROOM_TEMP,
        heat: s.heat ?? 0,
        cold: s.cold ?? 0,
        status: ['ok', 'broken', 'frozen'].includes(s.status) ? s.status : 'ok',
      });
    }
  }
}
