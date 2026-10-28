// Klima-Automatik im Serverraum: Server in Schränken auf den grünen Automatik-Plätzen (core/server-zones.js) stellen
// Zuluft, Abluft und Gerätelüfter der Schränke selbst so ein, dass kein Gerät zu heiß oder zu kalt wird.
// Ein Automatik-Server ist ein Server auf einem Automatik-Platz, der online ist (also auch weder defekt noch
// eingefroren). Jeder steuert bis zu RACKS_PER_SERVER Schränke: zuerst den eigenen, dann die nächstgelegenen noch
// nicht gesteuerten. Schränke mit ausgeschalteter Automatik (Schalter im Schrankfenster, climate.rack(id).auto)
// zählen nicht mit. Fällt ein Automatik-Server aus, bleiben die Lüfter seiner Schränke stehen, wie sie sind.
//
// Regelung (jede Spielminute, bei Gefahr sofort):
//   Sollwert: die sparsamste Lüftereinstellung, bei der das wärmste Gerät eingeschwungen bei etwa TARGET_HOT liegt
//   und das kälteste nicht unter TARGET_COLD (gerechnet mit der Physik aus core/server-climate.js).
//   Normal fahren die Regler in kleinen Schritten dorthin (hoch STEP_UP, runter STEP_DOWN je Spielminute).
//   Würde es mit der jetzigen Einstellung auf Dauer über 60 °C warm, geht es gleich in großen Schritten hoch.
//   Ab WARM °C (jetzt oder in einer Spielminute): Gerätelüfter und Abluft kräftig hoch (STEP_FAST), dann Zuluft.
//   Ab TEMP_LIMITS.idealMax (60 °C): Notfall – Gerätelüfter und Abluft sofort 100 %, Zuluft hoch.
//   Heruntergeregelt wird erst wieder, wenn alles unter RELAX °C ist.
//   Spiegelbildlich bei Kälte: unter COOL °C Zuluft und Gerätelüfter kräftig runter, unter FREEZE °C sofort aus.
// Rechenzeit: Geräte je Schrank werden nur bei Änderungen (economy.notify) neu gesucht, Sollwerte nur, wenn sich im
// Schrank etwas ändert – und höchstens SETPOINTS_PER_FRAME je Aufruf (bis dahin greifen Notfall und kräftiges Hochregeln).
// Läuft in Spielminuten. Ohne Three.js und DOM.
import { FAN_POWER, TEMP_LIMITS, fanCost } from './server-climate.js';
import { isAutomationRack, spotDistance } from './server-zones.js';

export const RACKS_PER_SERVER = 8;
const TARGET_HOT = 40;   // °C, Ziel für das wärmste Gerät
const TARGET_COLD = 25;  // °C, das kälteste Gerät soll nicht darunter liegen
const WARM = 50;         // °C, ab hier kräftig hochregeln
const RELAX = 45;        // °C, erst darunter wieder Lüfter sparen
const COOL = 22;         // °C, darunter kräftig herunterregeln
const FREEZE = 15;       // °C, Notfall Kälte
const STEP_UP = 10;      // % je Spielminute im Normalbetrieb
const STEP_DOWN = 5;
const STEP_FAST = 25;    // % je Spielminute, wenn es warm bzw. kalt wird
const FAN_STEP = 5;      // Regler rasten in 5-%-Schritten ein (wie im Schrankfenster)
const COARSE_STEP = 10;  // Sollwertsuche: erst grob in 10-%-Schritten, dann um den besten Wert in 5-%-Schritten
const LOOK_AHEAD = 1;    // Spielminuten, die die Automatik vorausschaut
const SETPOINTS_PER_FRAME = 1;

const clamp = (pct) => Math.max(0, Math.min(100, Math.round(pct / FAN_STEP) * FAN_STEP));
// Einen Regler um höchstens step auf target zubewegen
const toward = (value, target, up, down) => (target > value ? Math.min(target, value + up) : Math.max(target, value - down));

export class ClimateAutomation {
  constructor(climate, servers) {
    this.climate = climate;
    this.servers = servers;
    this.economy = servers.economy;
    this.controller = new Map(); // Schrank-ID → Server-ID des Automatik-Servers, der ihn regelt
    this.served = new Map();     // Server-ID → { device, racks: [Schrank-IDs] } (zum Vergleichen bei Änderungen)
    // Schrank-ID → { rack, devices (alle Geräte, von oben), fans (Geräte mit Lüfter), key } – neu bei jeder Änderung
    this.layout = new Map();
    this.setpoints = new Map();  // Schrank-ID → { key, fans: { top, bottom, device: Map Geräte-ID → % } }
    this.pending = new Set();    // Schrank-IDs, deren Sollwert neu berechnet werden muss
    this.emergency = new Set();  // Schrank-IDs im Hitze-Notfall (bis alles unter RELAX ist)
    this.sinceRegulation = 0;    // Spielminuten seit der letzten Regelung
    this.dirty = true;           // Geräte und Zuteilung neu bestimmen (Gerät ein/aus, Kabel, Schrank aufgestellt …)
    this.started = false;        // erste Zuteilung (nach Start bzw. Laden) meldet nichts
    this.lost = new Set();       // Server-IDs, die gesteuert haben und ausgefallen sind (für „wieder online“)
    // (type, data) => void – 'active' { racks }, 'server-lost' { device, devices, racks (nun ungeregelt) },
    // 'server-back' { device, devices, racks } – gleichzeitige Ausfälle kommen als eine Meldung (devices)
    this.onEvent = null;
    this.economy.subscribe(() => { this.dirty = true; });
  }

  // ---------- Geräte je Schrank und Zuteilung ----------

  // Nach einer Änderung: Geräte je Schrank in einem Durchgang einsammeln, veraltete Sollwerte vormerken, neu zuteilen
  refresh() {
    if (!this.dirty) return false;
    this.dirty = false;
    this.layout = new Map();
    for (const f of this.economy.furniture) {
      if (f.type.kind === 'rack' && f.location === 'server') this.layout.set(f.id, { rack: f, devices: [], fans: [], key: '' });
    }
    for (const f of this.economy.furniture) {
      if (f.location === 'rack') this.layout.get(f.rackId)?.devices.push(f);
    }
    for (const [id, l] of this.layout) {
      l.devices.sort((a, b) => a.unit - b.unit);
      l.fans = l.devices.filter((d) => this.climate.hasFan(d));
      l.key = l.fans.map((d) => `${d.id}:${d.unit}:${this.climate.device(d.id).status}`).join(',');
      if (this.setpoints.get(id)?.key !== l.key) this.pending.add(id);
    }
    for (const id of this.setpoints.keys()) if (!this.layout.has(id)) this.setpoints.delete(id);
    for (const id of this.pending) if (!this.layout.has(id)) this.pending.delete(id);
    this.assign();
    return true;
  }

  // Automatik-Server: online (verkabelt, weder defekt noch eingefroren) in einem Schrank auf einem grünen Platz
  automationServers(reached = this.servers.reachable()) {
    this.refresh();
    const list = [];
    for (const { rack, devices } of this.layout.values()) {
      if (!isAutomationRack(rack)) continue;
      for (const d of devices) if (this.servers.isOnline(d, reached)) list.push(d);
    }
    return list.sort((a, b) => a.id - b.id);
  }

  // Zuteilung neu berechnen: jeder Server (nach ID, also stabil) nimmt seinen Schrank und die nächsten freien
  assign() {
    const racks = [...this.layout.values()].map((l) => l.rack).filter((r) => this.climate.rack(r.id).auto);
    const previous = this.served;
    this.controller = new Map();
    this.served = new Map();
    const nearest = new Map(); // eigener Schrank → alle Schränke, eigener zuerst, dann nach Abstand
    for (const server of this.automationServers()) {
      const own = this.layout.get(server.rackId).rack;
      const free = [];
      if (this.controller.size < racks.length) {
        if (!nearest.has(own.id)) {
          nearest.set(own.id, racks
            .map((r) => ({ r, own: r === own ? 0 : 1, dist: spotDistance(own.slot, r.slot) }))
            .sort((a, b) => a.own - b.own || a.dist - b.dist || a.r.slot - b.r.slot)
            .map((x) => x.r.id));
        }
        for (const id of nearest.get(own.id)) {
          if (free.length >= RACKS_PER_SERVER) break;
          if (!this.controller.has(id)) free.push(id);
        }
      }
      for (const id of free) this.controller.set(id, server.id);
      this.served.set(server.id, { device: server, racks: free });
    }
    this.report(previous);
  }

  // Meldungen: Automatik geht an, Automatik-Server fallen aus oder sind wieder da (gleichzeitige zusammengefasst)
  report(previous) {
    if (!this.started) {
      this.started = true; // Spielbeginn bzw. geladener Stand: kein „aktiv“, nur merken
      return;
    }
    const before = [...previous.values()].some((s) => s.racks.length);
    const gone = [];
    const orphaned = new Set();
    for (const [id, { device, racks }] of previous) {
      if (this.served.has(id)) continue;
      this.lost.add(id);
      if (!racks.length) continue;
      gone.push(device);
      for (const r of racks) if (!this.controller.has(r)) orphaned.add(r);
    }
    if (gone.length) this.onEvent?.('server-lost', { device: gone[0], devices: gone, racks: orphaned.size });
    const back = [];
    let backRacks = 0;
    for (const [id, served] of this.served) {
      if (previous.has(id) || !this.lost.delete(id)) continue;
      back.push(served.device);
      backRacks += served.racks.length;
    }
    if (back.length) this.onEvent?.('server-back', { device: back[0], devices: back, racks: backRacks });
    if (!before && this.controller.size && !back.length) this.onEvent?.('active', { racks: this.controller.size });
  }

  // Automatik-Server, der diesen Schrank regelt, oder null
  controllerOf(rackId) {
    this.refresh();
    const id = this.controller.get(rackId);
    return id === undefined ? null : this.economy.furnitureById(id) ?? null;
  }

  // Wie viele Automatik-Server gerade arbeiten
  get serverCount() {
    this.refresh();
    return this.served.size;
  }

  isControlled(rackId) {
    return this.controllerOf(rackId) !== null;
  }

  // Schalter „Automatik an/aus“ im Schrankfenster – aus: man regelt selbst, ein anderer Schrank rückt nach
  setAuto(rackId, on) {
    this.climate.rack(rackId).auto = !!on;
    this.emergency.delete(rackId);
    this.refresh();
    this.assign();
    this.economy.notify();
  }

  isAuto(rackId) {
    return this.climate.rack(rackId).auto;
  }

  // ---------- Regelung ----------

  advance(minutes) {
    if (minutes <= 0) return;
    const changed = this.refresh();
    this.sinceRegulation += minutes;
    if (this.sinceRegulation >= 1) {
      this.sinceRegulation %= 1;
      this.assign(); // online/offline, defekt, eingefroren ändert sich ohne economy.notify
      for (const rackId of this.controller.keys()) this.regulate(rackId, false);
    } else {
      // Zwischen den Spielminuten nur bei Gefahr eingreifen (z. B. wenn jemand alle Lüfter auf 0 % zieht)
      for (const rackId of this.controller.keys()) this.regulate(rackId, true);
    }
    // Fehlende Sollwerte nach und nach berechnen (nur geregelte Schränke, höchstens SETPOINTS_PER_FRAME je Aufruf,
    // nicht im selben Aufruf wie eine Neuberechnung nach einer Änderung)
    let budget = changed ? 0 : SETPOINTS_PER_FRAME;
    for (const rackId of this.pending) {
      if (!budget) break;
      if (!this.controller.has(rackId)) continue;
      this.pending.delete(rackId);
      const l = this.layout.get(rackId);
      this.setpoints.set(rackId, { key: l.key, fans: this.findSetpoint(rackId) });
      budget--;
    }
  }

  // Sollwert eines Schranks (null, solange er noch nicht berechnet ist)
  setpoint(rackId) {
    this.refresh();
    const sp = this.setpoints.get(rackId);
    return sp && sp.key === this.layout.get(rackId)?.key ? sp.fans : null;
  }

  // Sparsamste Einstellung, bei der alle Geräte eingeschwungen im Zielbereich liegen. Sucht erst grob in
  // COARSE_STEP-Schritten über Zu- und Abluft, dann in 5-%-Schritten um den besten Wert (exhaustive: alle 21 × 21
  // Kombinationen, nur zum Vergleich in Tests).
  findSetpoint(rackId, exhaustive = false) {
    this.refresh();
    const { rack, devices, fans: fanDevices } = this.layout.get(rackId);
    const climate = this.climate;
    const active = fanDevices.filter((d) => climate.device(d.id).status !== 'broken');
    const load = climate.rackLoad(rackId, devices);
    const tried = new Map();
    const evaluate = (top, bottom) => {
      const key = top * 1000 + bottom;
      if (tried.has(key)) return tried.get(key);
      const { air, inlet } = climate.steadyAir(load, top, bottom);
      const fans = new Map();
      let hottest = -Infinity;
      let coldest = Infinity;
      let power = FAN_POWER.rack * (fanCost(top) + fanCost(bottom));
      for (const d of active) {
        // Langsamster Gerätelüfter (5-%-Raster), bei dem das Gerät nicht über TARGET_HOT kommt – Temperatur fällt
        // mit der Drehzahl, also binär suchen
        const temp = (i) => climate.deviceTarget(rack, d, air, inlet, i * FAN_STEP);
        let lo = 0;
        let hi = 100 / FAN_STEP;
        if (temp(lo) <= TARGET_HOT) hi = lo;
        else if (temp(hi) > TARGET_HOT) lo = hi;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (temp(mid) <= TARGET_HOT) hi = mid;
          else lo = mid + 1;
        }
        const t = temp(lo);
        fans.set(d.id, lo * FAN_STEP);
        power += FAN_POWER.device * fanCost(lo * FAN_STEP);
        hottest = Math.max(hottest, t);
        coldest = Math.min(coldest, t);
      }
      // Zu heiß wiegt schwerer als zu kalt; erst danach zählt der Strom
      const miss = active.length ? Math.round((3 * Math.max(0, hottest - TARGET_HOT) + Math.max(0, TARGET_COLD - coldest)) * 10) : 0;
      const result = { miss, power, top, bottom, fans };
      tried.set(key, result);
      return result;
    };
    const better = (a, b) => !b || a.miss < b.miss || (a.miss === b.miss && a.power < b.power - 1e-9);
    let best = null;
    const step = exhaustive ? FAN_STEP : COARSE_STEP;
    for (let top = 0; top <= 100; top += step) {
      for (let bottom = 0; bottom <= 100; bottom += step) {
        const c = evaluate(top, bottom);
        if (better(c, best)) best = c;
      }
    }
    if (!exhaustive) {
      const center = best;
      for (const dt of [-FAN_STEP, 0, FAN_STEP]) {
        for (const db of [-FAN_STEP, 0, FAN_STEP]) {
          const top = center.top + dt;
          const bottom = center.bottom + db;
          if (top < 0 || top > 100 || bottom < 0 || bottom > 100) continue;
          const c = evaluate(top, bottom);
          if (better(c, best)) best = c;
        }
      }
    }
    return { top: best.top, bottom: best.bottom, device: best.fans };
  }

  // Einen Schrank regeln. urgentOnly: nur Notfälle (zwischen den Spielminuten)
  regulate(rackId, urgentOnly) {
    const l = this.layout.get(rackId);
    if (!l) return;
    const climate = this.climate;
    const r = climate.rack(rackId);
    const devices = l.fans;
    const active = devices.filter((d) => climate.device(d.id).status !== 'broken');
    // Kein Gerät, das Wärme macht: alle Lüfter aus
    if (!active.length || climate.rackLoad(rackId, l.devices) <= 0) {
      if (urgentOnly) return;
      climate.setRackFan(rackId, 'top', 0);
      climate.setRackFan(rackId, 'bottom', 0);
      for (const d of devices) climate.setDeviceFan(d.id, 0);
      this.emergency.delete(rackId);
      return;
    }
    // Je Gerät der ungünstigste Wert aus jetzt und gleich (in LOOK_AHEAD Spielminuten)
    const ahead = climate.forecast(rackId, LOOK_AHEAD, l);
    let hottest = -Infinity;
    let coldest = Infinity;
    for (const d of active) {
      const now = climate.device(d.id).temp;
      hottest = Math.max(hottest, now, ahead.get(d.id));
      coldest = Math.min(coldest, now, ahead.get(d.id));
    }
    const high = (d) => Math.max(climate.device(d.id).temp, ahead.get(d.id));
    const low = (d) => Math.min(climate.device(d.id).temp, ahead.get(d.id));
    // Sollwert – solange er noch nicht berechnet ist, bleiben die Regler im Normalbetrieb stehen
    const sp = this.setpoint(rackId);
    const fan = (d) => climate.device(d.id).fan;

    // Notfall Hitze: Gerätelüfter der warmen Geräte und Abluft sofort voll, Zuluft hoch
    if (hottest >= TEMP_LIMITS.idealMax) {
      const fresh = !this.emergency.has(rackId);
      this.emergency.add(rackId);
      climate.setRackFan(rackId, 'top', 100);
      for (const d of active) if (high(d) >= WARM) climate.setDeviceFan(d.id, 100);
      // Beim ersten Eingreifen bzw. jede Spielminute, solange es heiß bleibt, mehr Zuluft
      const more = fresh || !urgentOnly ? STEP_FAST : 0;
      climate.setRackFan(rackId, 'bottom', clamp(Math.max(r.bottom + more, sp?.bottom ?? 0)));
      return;
    }
    // Notfall Kälte: Zuluft aus, Gerätelüfter der kalten Geräte aus
    if (coldest < FREEZE && hottest < WARM) {
      climate.setRackFan(rackId, 'bottom', 0);
      for (const d of active) if (low(d) < COOL) climate.setDeviceFan(d.id, 0);
      return;
    }
    if (urgentOnly) return;
    if (hottest < RELAX) this.emergency.delete(rackId);
    const relax = hottest < RELAX && !this.emergency.has(rackId); // darf Lüfter sparen
    const warm = hottest >= WARM;
    const cool = coldest < COOL && !warm;
    // Würde es mit der jetzigen Einstellung auf Dauer zu heiß (z. B. alle Lüfter auf 0 % gezogen), gleich kräftig hoch
    const steady = climate.steadyTemps(rackId, {}, l).temps;
    const heading = Math.max(...active.map((d) => steady.get(d.id)));
    const up = warm || heading >= TEMP_LIMITS.idealMax ? STEP_FAST : STEP_UP;
    const targetTop = sp?.top ?? r.top;
    const targetBottom = sp?.bottom ?? r.bottom;

    // Gerätelüfter
    for (const d of devices) {
      const now = fan(d);
      const target = sp ? sp.device.get(d.id) ?? 0 : now;
      if (climate.device(d.id).status === 'broken') {
        climate.setDeviceFan(d.id, toward(now, 0, 0, STEP_DOWN)); // steht still, Lüfter langsam aus
      } else if (high(d) >= WARM) {
        climate.setDeviceFan(d.id, clamp(now + STEP_FAST));
      } else if (low(d) < COOL) {
        climate.setDeviceFan(d.id, clamp(now - STEP_FAST));
      } else if (low(d) < TARGET_COLD) {
        climate.setDeviceFan(d.id, toward(now, Math.min(now, target), 0, relax ? STEP_DOWN : 0)); // nicht hoch
      } else {
        climate.setDeviceFan(d.id, toward(now, target, up, relax ? STEP_DOWN : 0));
      }
    }
    // Abluft oben: bei Wärme kräftig hoch, sonst zum Sollwert
    if (warm) climate.setRackFan(rackId, 'top', clamp(r.top + STEP_FAST));
    else climate.setRackFan(rackId, 'top', toward(r.top, targetTop, up, relax ? STEP_DOWN : 0));
    // Zuluft unten: erst wenn Gerätelüfter und Abluft (fast) am Anschlag sind, bei Kälte zuerst herunter
    if (warm) {
      const maxed = r.top >= 100 && active.every((d) => high(d) < WARM || fan(d) >= 100);
      climate.setRackFan(rackId, 'bottom', clamp(maxed ? r.bottom + STEP_FAST : Math.max(r.bottom, toward(r.bottom, targetBottom, STEP_FAST, 0))));
    } else if (cool) {
      climate.setRackFan(rackId, 'bottom', clamp(r.bottom - STEP_FAST));
    } else if (coldest < TARGET_COLD) {
      climate.setRackFan(rackId, 'bottom', toward(r.bottom, Math.min(r.bottom, targetBottom), 0, STEP_DOWN)); // nicht hoch
    } else {
      climate.setRackFan(rackId, 'bottom', toward(r.bottom, targetBottom, up, relax ? STEP_DOWN : 0));
    }
  }
}
