// Stromnetz (#57): Tag-/Nachttarif und zufällige Stromausfälle. Bewusst ohne Three.js und DOM.
//
// Tarif: 22–6 Uhr kostet Strom × 0,6 (Nachtstrom), 6–22 Uhr × 1,1 (Tagstrom) – bei gleichmäßigem Verbrauch im
// Tagesschnitt (8 h × 0,6 + 16 h × 1,1) / 24 h ≈ 0,93, also etwa wie bisher und etwas günstiger.
// Die Abrechnung (core/economy.js) fragt costFactorOver(von, Minuten): Mittel des Tariffaktors über den Zeitraum,
// während eines Ausfalls 0 (kein Netzstrom, nichts zu bezahlen).
//
// Stromausfälle gibt es erst, sobald Notstrom gekauft ist (Rückruf hasBackup, liefert core/backup-power.js aus #59).
// Dann etwa alle 4–7 Spieltage (gezählt ab dem Ende des letzten Ausfalls bzw. ab dem Kauf des Notstroms), Dauer
// 20–90 Spielminuten. Während eines Ausfalls hat keine Verbraucher-Gruppe Netzstrom; isPowered(group) fragt dann den
// Versorger-Rückruf supplier(group), über den das Notstrom-Modul je Gruppe sagen kann „versorgt“.
//
// Zustand: outage = { minutesLeft, duration } oder null, nextOutageIn = Spielminuten bis zum nächsten Ausfall
// (null, solange kein Notstrom da ist). Ereignisse über onEvent(type, data) und subscribe(listener):
//   'outage-start' { minutes }                – Strom ist weg
//   'outage-end'   { duration, early }        – Strom ist wieder da (early: per endOutage() vorzeitig beendet)
//   'tariff-change' { tariff }                – Wechsel zwischen Tag- und Nachtstrom (nur mit clock in advance)

export const NIGHT_START_HOUR = 22;   // ab hier Nachtstrom
export const DAY_START_HOUR = 6;      // ab hier Tagstrom
export const NIGHT_FACTOR = 0.6;
export const DAY_FACTOR = 1.1;
export const OUTAGE_INTERVAL_DAYS = [4, 7];   // Abstand zwischen zwei Ausfällen (Spieltage)
export const OUTAGE_MINUTES = [20, 90];       // Dauer eines Ausfalls (Spielminuten)
// Verbraucher-Gruppen, die bei einem Ausfall einzeln vom Notstrom versorgt werden können (Priorität in #59)
export const POWER_GROUPS = ['servers', 'lights', 'printers'];

const MINUTES_PER_DAY = 24 * 60;
const NIGHT_START = NIGHT_START_HOUR * 60;
const DAY_START = DAY_START_HOUR * 60;

const TARIFFS = {
  day: { id: 'day', factor: DAY_FACTOR, icon: '☀️', label: 'Tagstrom' },
  night: { id: 'night', factor: NIGHT_FACTOR, icon: '🌙', label: 'Nachtstrom' },
};

const dayMinute = (minutes) => ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

// Tarif zur Spielzeit (Minuten seit Mitternacht von Tag 1, wie GameClock.minutes): { id, factor, icon, label, text }
export function tariffAt(minutes) {
  const m = dayMinute(minutes);
  const t = m >= DAY_START && m < NIGHT_START ? TARIFFS.day : TARIFFS.night;
  return { ...t, text: `${t.icon} ${t.label}` };
}

export function tariffFactorAt(minutes) {
  return tariffAt(minutes).factor;
}

// Mittlerer Tariffaktor über [from, from + minutes) – genau auch über die Grenzen 6 und 22 Uhr hinweg
export function averageTariff(from, minutes) {
  if (!(minutes > 0)) return tariffFactorAt(from);
  let sum = 0;
  let t = from;
  const end = from + minutes;
  while (t < end - 1e-9) {
    const m = dayMinute(t);
    // nächste Tarifgrenze nach t
    const next = m < DAY_START ? DAY_START : m < NIGHT_START ? NIGHT_START : MINUTES_PER_DAY + DAY_START;
    const step = Math.min(end - t, next - m);
    sum += tariffFactorAt(t) * step;
    t += step;
  }
  return sum / minutes;
}

const between = (random, [a, b]) => a + (b - a) * random();
const num = (v) => (Number.isFinite(v) ? v : null);

export class PowerGrid {
  // random: Zufallsquelle (für Tests austauschbar, auch später über this.random)
  // clock: Spieluhr (GameClock, optional) – liefert die aktuelle Spielzeit für Tarif und Status
  constructor({ random = Math.random, clock = null } = {}) {
    this.random = random;
    this.clock = clock;
    this.outage = null;        // { minutesLeft, duration } während eines Ausfalls
    this.nextOutageIn = null;  // Spielminuten bis zum nächsten Ausfall, null ohne Notstrom
    this.lastOutage = null;    // { start (Spielminute, wenn bekannt), duration } – für die Anzeige im Leitstand (#59)
    this.hasBackup = null;     // () => boolean – Notstrom gekauft? Ohne Rückruf bzw. false: keine Ausfälle
    this.supplier = null;      // (group) => boolean – versorgt der Notstrom die Gruppe gerade? (#59)
    this.onEvent = null;       // (type, data) => void – Meldungen, Sound
    this.listeners = new Set();
    this.lastTariffId = null;
    this.now = null;           // letzte bekannte Spielzeit (aus clock in advance)
  }

  // ---------- Tarif ----------

  // Aktuelle Spielzeit: aus der Spieluhr, sonst die zuletzt in advance gesehene
  get time() {
    return this.clock?.minutes ?? this.now ?? 0;
  }

  // Aktueller Tarif; minutes: Spielzeit oder ein Objekt mit .minutes (GameClock)
  tariff(minutes = this.time) {
    return tariffAt(typeof minutes === 'object' ? minutes.minutes : minutes);
  }

  // Faktor für die Stromkosten über [from, from + minutes): Tarif, während eines Ausfalls 0
  costFactorOver(from = this.time, minutes = 0) {
    return this.outage ? 0 : averageTariff(from, minutes);
  }

  // Faktor für die Stromkosten genau jetzt (Anzeige „laufende Kosten“)
  get costFactor() {
    return this.costFactorOver(this.time, 0);
  }

  // Text fürs HUD: „⚡ Stromausfall · noch 34 min“ während eines Ausfalls, sonst „🌙 Nachtstrom“ / „☀️ Tagstrom“
  statusText(minutes = this.time) {
    if (this.outage) return `⚡ Stromausfall · noch ${Math.max(1, Math.ceil(this.outage.minutesLeft))} min`;
    return this.tariff(minutes).text;
  }

  // Alles auf einen Blick, z. B. für den Leitstand (#58): Tarif, Ausfall, Notstrom und welche Gruppe Strom hat
  status(minutes = this.time) {
    const tariff = this.tariff(minutes);
    return {
      tariff,
      factor: this.costFactorOver(minutes, 0),
      text: this.statusText(minutes),
      outage: this.outage ? { ...this.outage } : null,
      nextOutageIn: this.nextOutageIn,
      lastOutage: this.lastOutage ? { ...this.lastOutage } : null,
      backup: this.backup,
      powered: Object.fromEntries(POWER_GROUPS.map((g) => [g, this.isPowered(g)])),
    };
  }

  // ---------- Ausfälle ----------

  get isOutage() {
    return !!this.outage;
  }

  get backup() {
    return !!this.hasBackup?.();
  }

  // Hat die Verbraucher-Gruppe Strom? Ohne Ausfall immer, während eines Ausfalls nur über den Notstrom-Versorger
  isPowered(group) {
    if (!POWER_GROUPS.includes(group)) throw new Error(`Unbekannte Strom-Gruppe: ${group}`);
    if (!this.outage) return true;
    return !!this.supplier?.(group);
  }

  // Spielminuten laufen lassen. clock (optional, GameClock): für Tarifwechsel-Meldungen und den Start im Leitstand
  advance(gameMinutes, clock = this.clock) {
    if (clock) this.now = clock.minutes;
    let rest = Math.max(0, gameMinutes);
    while (rest > 0) {
      if (this.outage) {
        const step = Math.min(rest, this.outage.minutesLeft);
        this.outage.minutesLeft -= step;
        rest -= step;
        if (this.outage.minutesLeft <= 1e-9) this.finishOutage(false);
        continue;
      }
      if (!this.backup) {
        this.nextOutageIn = null; // ohne Notstrom keine Ausfälle – nach dem Kauf beginnt die Zählung neu
        break;
      }
      if (this.nextOutageIn === null) this.scheduleNext();
      const step = Math.min(rest, this.nextOutageIn);
      this.nextOutageIn -= step;
      rest -= step;
      if (this.nextOutageIn <= 1e-9) {
        const start = this.now === null ? null : this.now + (gameMinutes - rest);
        this.startOutage(Math.round(between(this.random, OUTAGE_MINUTES)), start);
      }
    }
    if (clock) {
      const t = tariffAt(clock.minutes);
      if (this.lastTariffId !== null && t.id !== this.lastTariffId) this.emit('tariff-change', { tariff: t });
      this.lastTariffId = t.id;
    }
  }

  scheduleNext() {
    this.nextOutageIn = Math.round(between(this.random, OUTAGE_INTERVAL_DAYS) * MINUTES_PER_DAY);
  }

  startOutage(minutes, start = this.now) {
    this.outage = { minutesLeft: minutes, duration: minutes };
    this.nextOutageIn = null;
    this.lastOutage = { start, duration: minutes };
    this.emit('outage-start', { minutes });
  }

  finishOutage(early) {
    const o = this.outage;
    if (!o) return;
    this.outage = null;
    const duration = o.duration - Math.max(0, o.minutesLeft);
    if (this.lastOutage) this.lastOutage.duration = Math.round(duration);
    if (this.backup) this.scheduleNext();
    this.emit('outage-end', { duration, early });
  }

  // Test/Cheat: Ausfall sofort auslösen (auch ohne Notstrom) bzw. vorzeitig beenden
  triggerOutage(minutes = Math.round(between(this.random, OUTAGE_MINUTES))) {
    if (this.outage) this.outage = null;
    this.startOutage(minutes, this.clock?.minutes ?? this.now);
  }

  endOutage() {
    this.finishOutage(true);
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
      outage: this.outage ? { minutesLeft: this.outage.minutesLeft, duration: this.outage.duration } : null,
      nextOutageIn: this.nextOutageIn,
      lastOutage: this.lastOutage ? { ...this.lastOutage } : null,
    };
  }

  // Alter Spielstand ohne Stromnetz (data undefined): kein Ausfall, Zählung beginnt mit dem Notstrom
  load(data) {
    const o = data?.outage;
    const left = num(o?.minutesLeft);
    this.outage = left !== null && left > 0 ? { minutesLeft: left, duration: num(o.duration) ?? left } : null;
    const next = num(data?.nextOutageIn);
    this.nextOutageIn = next !== null && next >= 0 ? next : null;
    const last = data?.lastOutage;
    this.lastOutage = last && num(last.duration) !== null ? { start: num(last.start), duration: last.duration } : null;
    this.lastTariffId = null;
  }
}
