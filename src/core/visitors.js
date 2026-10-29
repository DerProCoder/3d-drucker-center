// Besuchergruppen: Einmal pro Spieltag kommt eine Gruppe von 40–50 Leuten zu einer zufälligen Uhrzeit (9–16 Uhr),
// zahlt am Empfang Eintritt und lässt sich von einem Azubi durch Halle, Lager und – wenn die zweite Etage steht –
// den Serverraum führen. An jeder Station wird bewertet, wie es dort aussieht; am Ende gibt die Gruppe 1–5 Sterne
// und bringt Bonus-XP. Hier steht nur, WAS passiert – die Figuren laufen in world/ und melden per Aufruf zurück:
//   arrived()          Gruppe steht am Empfang → Eintritt, Rundgang beginnt bei Station 0
//   reachedStation(i)  Gruppe ist an Station i → Verweildauer läuft in advance(), danach nächste Station bzw. 'leaving'
//   finished()         Gruppe hat das Gelände verlassen → Bewertung, XP, Azubi frei
// Ohne Figuren (autoWalk = true) spielt advance() die Wege selbst mit festen Gehzeiten durch.
// Bewusst ohne Three.js und DOM.
import { WASTE_EMPTY_AT } from './economy.js';
import { TEMP_LIMITS } from './server-climate.js';

export const GROUP_SIZE = [40, 50];          // Personen je Gruppe (beide einschließlich)
export const ENTRY_FEE = 15;                 // € Eintritt pro Person
export const VISIT_HOURS = [9, 16];          // frühester und spätester Ankunftszeitpunkt (Uhr)
export const STATION_MINUTES = 3;            // Spielminuten Verweildauer je Station
export const XP_PER_STAR = 5;                // Bonus-XP je Stern über 2 (4 ★ = 10 XP, 5 ★ = 15 XP)
export const RECENT_RATINGS = 5;             // so viele letzte Bewertungen werden gemerkt
export const NEUTRAL_SCORE = 0.5;            // Station ohne Drucker bzw. Server: weder gut noch schlecht (= 3 ★)
// Gehzeiten in Spielminuten, wenn keine Figuren laufen (autoWalk): zum Empfang, zwischen Stationen, zum Ausgang
export const AUTO_WALK = { arrive: 5, station: 1.5, leave: 3 };
const MINUTES_PER_DAY = 24 * 60;
const PLAN_STEP = 5;                         // Uhrzeiten auf 5 Minuten gerundet
const MIN_NOTICE = 30;                       // Wird erst im Laufe des Tages geplant: frühestens in 30 Spielminuten

// Stationen in Reihenfolge – world/ kennt die Koordinaten
export const STATIONS = {
  reception: 'Empfang',
  hall: 'Druckhalle',
  storage: 'Lager',
  servers: 'Serverraum',
};

// Gruppennamen (name(random) → Text); kids: Kinder bzw. Jugendliche (world/ kann sie kleiner darstellen)
const GROUPS = [
  { name: (random) => `Schulklasse ${5 + Math.floor(random() * 6)}${'abcd'[Math.floor(random() * 4)]}`, kids: true },
  { name: () => 'Maker-Club Nord' },
  { name: () => 'Firmenausflug Autohaus Neumann' },
  { name: () => 'Seniorenverein Abendrot' },
  { name: () => 'Erstsemester Maschinenbau' },
  { name: () => 'Jugendfeuerwehr Ostviertel', kids: true },
  { name: () => 'Volkshochschule Kurs „3D-Druck für Einsteiger“' },
  { name: () => 'Stammtisch der Modellbahnfreunde' },
];

// „★★★★☆“
export const starsText = (stars) => '★'.repeat(stars) + '☆'.repeat(5 - stars);

// Spielminute → „14:05“
export function clockText(minute) {
  const m = Math.floor(((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Bewertung der Druckhalle (0…1) oder null, wenn dort keine Drucker stehen (neutral).
// Grundwert 0,3 + 0,7 × Anteil druckender Drucker, Abzüge (je als Anteil der Drucker): Fehldruck 0,6, verstopfte
// Düse 0,3, voller Mülleimer 0,2 – und 0,1 je Teil auf dem Boden (höchstens 0,3).
export function rateHall(economy) {
  const printers = economy.printers.filter((p) => p.location === 'table');
  if (!printers.length) return null;
  const share = (test) => printers.filter(test).length / printers.length;
  const printing = share((p) => p.job?.status === 'printing');
  const failed = share((p) => p.job?.status === 'failed');
  const clogged = share((p) => p.clogged);
  const fullBins = share((p) => (p.waste ?? 0) >= WASTE_EMPTY_AT);
  const loose = Math.min(0.3, economy.looseParts.length * 0.1);
  return clamp01(0.3 + 0.7 * printing - 0.6 * failed - 0.3 * clogged - 0.2 * fullBins - loose);
}

// Bewertung des Serverraums (0…1) oder null, wenn dort keine Server eingebaut sind (neutral).
// Anteil Server online, Abzüge (je als Anteil aller eingebauten Geräte): defekt oder eingefroren 0,5, heiß
// (über TEMP_LIMITS.idealMax = 60 °C) 0,3.
export function rateServers(servers, climate) {
  if (!servers) return null;
  const devices = servers.installed;
  const serverDevices = devices.filter((d) => d.type.kind === 'server');
  if (!serverDevices.length) return null;
  const state = (d) => climate?.devices.get(d.id);
  const online = servers.onlineServers.length / serverDevices.length;
  const down = devices.filter((d) => ['broken', 'frozen'].includes(state(d)?.status)).length / devices.length;
  const hot = devices.filter((d) => (state(d)?.temp ?? 0) > TEMP_LIMITS.idealMax).length / devices.length;
  return clamp01(online - 0.5 * down - 0.3 * hot);
}

// Mittel der bewerteten Stationen → 1–5 Sterne (ohne bewertete Station: neutral = 3 ★)
export function starsFor(scores) {
  const values = Object.values(scores).filter((v) => v !== null && v !== undefined);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : NEUTRAL_SCORE;
  return Math.max(1, Math.min(5, 1 + Math.round(avg * 4)));
}

export class Visitors {
  // clock: core/game-clock.js (Uhrzeit für Termin und Ankunft); servers/climate optional (Serverraum-Bewertung)
  constructor({ economy, staff, upgrades, progress, clock, servers = null, climate = null }) {
    this.economy = economy;
    this.staff = staff;
    this.upgrades = upgrades;
    this.progress = progress;
    this.clock = clock;
    this.servers = servers;
    this.climate = climate;
    this.random = Math.random; // austauschbar für Tests
    // { id, name, size, kids, day, time (Spielminute der Ankunft), state, stations, station, workerId, fee, scores }
    // state: 'announced' → 'arriving' → 'touring' → 'leaving' → (finished) null
    this.group = null;
    this.dwelling = false;    // steht die Gruppe gerade an einer Station und schaut sich um?
    this.timer = 0;           // Restzeit (Spielminuten) der Verweildauer bzw. – mit autoWalk – des Weges
    this.autoWalk = false;    // true: keine Figuren in world/, Wege laufen mit festen Zeiten (AUTO_WALK)
    this.plannedDay = 0;      // Tag, für den schon geplant wurde (eine Gruppe pro Tag)
    this.noGuideDay = 0;      // Tag, an dem der Hinweis „Azubi nötig“ schon kam
    this.nextId = 1;
    this.recentRatings = [];  // { name, size, stars, day } – neueste zuerst, höchstens RECENT_RATINGS
    this.listeners = new Set();
    // (type, data) => void – 'announced' { group } · 'no-guide' { day, group?, reason: 'none' | 'fired' }
    // · 'arriving' { group, worker } · 'paid' { group, fee, perPerson } · 'station' { group, index, id, score }
    // · 'leaving' { group } · 'rated' { group, stars, xp, scores }
    this.onEvent = null;
  }

  get day() {
    return Math.floor(this.clock.minutes / MINUTES_PER_DAY) + 1;
  }

  // Kennung der Station, an der die Gruppe gerade ist bzw. zu der sie unterwegs ist
  get stationId() {
    return this.group?.stations[this.group.station] ?? null;
  }

  // Stationen des Rundgangs (Serverraum nur mit zweiter Etage)
  stationList() {
    return ['reception', 'hall', 'storage', ...(this.upgrades?.upperFloor ? ['servers'] : [])];
  }

  // Azubi, der heute führen kann (die Empfangskraft führt nicht), oder null
  freeGuide() {
    return this.staff.workers.find((w) => !this.staff.isReserved(w.id)) ?? null;
  }

  // Tageswechsel (clock.onNewDay): Termin für den neuen Tag festlegen
  onNewDay(day = this.day) {
    this.plan(day);
  }

  // Termin für den Tag festlegen – ohne Azubi einmal am Tag der Hinweis. Wird ein Azubi erst im Laufe des Tages
  // eingestellt, kommt die Gruppe noch, wenn bis 16 Uhr Zeit ist.
  plan(day = this.day) {
    if (this.plannedDay >= day || this.group) return;
    if (!this.freeGuide()) {
      if (this.noGuideDay !== day) {
        this.noGuideDay = day;
        this.emit('no-guide', { day, reason: 'none' });
      }
      return;
    }
    const dayStart = (day - 1) * MINUTES_PER_DAY;
    const [fromHour, toHour] = VISIT_HOURS;
    const earliest = Math.max(dayStart + fromHour * 60, Math.ceil((this.clock.minutes + MIN_NOTICE) / PLAN_STEP) * PLAN_STEP);
    const latest = dayStart + toHour * 60;
    this.plannedDay = day;
    if (earliest > latest) return; // heute zu spät – morgen wieder
    const steps = Math.floor((latest - earliest) / PLAN_STEP);
    const time = earliest + Math.floor(this.random() * (steps + 1)) * PLAN_STEP;
    const [minSize, maxSize] = GROUP_SIZE;
    const kind = GROUPS[Math.floor(this.random() * GROUPS.length)];
    this.group = {
      id: this.nextId++,
      name: kind.name(this.random),
      size: minSize + Math.floor(this.random() * (maxSize - minSize + 1)),
      kids: !!kind.kids,
      day,
      time,
      state: 'announced',
      stations: this.stationList(),
      station: 0,
      workerId: null,
      fee: 0,
      scores: {},
    };
    this.dwelling = false;
    this.emit('announced', { group: this.group });
    this.notify();
  }

  advance(gameMinutes) {
    if (!this.group) {
      // Neues Spiel bzw. alter Spielstand: für heute noch planen, solange es vor 16 Uhr ist
      this.plan(this.day);
      return;
    }
    const g = this.group;
    if (g.state === 'announced') {
      if (this.clock.minutes >= g.time) this.start();
      return;
    }
    // Azubi wurde während der Führung entlassen: Gruppe geht ohne Bewertung
    if (g.state !== 'leaving' && g.workerId !== null && !this.staff.workers.some((w) => w.id === g.workerId)) {
      g.workerId = null;
      this.emit('no-guide', { day: g.day, group: g, reason: 'fired' });
      this.leave();
      g.scores = null; // keine Bewertung
    }
    this.timer -= gameMinutes;
    if (this.timer > 0) return;
    if (this.dwelling) {
      this.dwelling = false;
      if (g.station + 1 < g.stations.length) {
        g.station++;
        this.timer = AUTO_WALK.station;
        this.notify();
      } else {
        this.leave();
      }
    } else if (this.autoWalk) {
      if (g.state === 'arriving') this.arrived();
      else if (g.state === 'touring') this.reachedStation(g.station);
      else if (g.state === 'leaving') this.finished();
    }
  }

  // Uhrzeit erreicht: Azubi reservieren, Gruppe läuft zum Empfang
  start() {
    const g = this.group;
    const worker = this.freeGuide();
    if (!worker) {
      this.group = null;
      this.emit('no-guide', { day: g.day, group: g, reason: 'none' });
      this.notify();
      return;
    }
    this.staff.reserve(worker.id, 'tour');
    g.workerId = worker.id;
    g.state = 'arriving';
    g.stations = this.stationList(); // falls die zweite Etage seit der Ankündigung fertig wurde
    this.timer = AUTO_WALK.arrive;
    this.emit('arriving', { group: g, worker });
    this.notify();
  }

  // world: Gruppe steht am Empfang → Eintritt zahlen, Rundgang beginnt bei Station 0
  arrived() {
    const g = this.group;
    if (g?.state !== 'arriving') return false;
    g.fee = g.size * ENTRY_FEE;
    this.economy.earn(g.fee);
    g.state = 'touring';
    g.station = 0;
    this.dwelling = false;
    this.timer = 0; // autoWalk: Station 0 (Empfang) ist schon erreicht
    this.emit('paid', { group: g, fee: g.fee, perPerson: ENTRY_FEE });
    this.notify();
    return true;
  }

  // world: Gruppe ist an Station i angekommen → bewerten, Verweildauer läuft in advance()
  reachedStation(i) {
    const g = this.group;
    if (g?.state !== 'touring' || i !== g.station || this.dwelling) return false;
    const id = g.stations[i];
    const score = this.rate(id);
    if (g.scores) g.scores[id] = score;
    this.dwelling = true;
    this.timer = STATION_MINUTES;
    this.emit('station', { group: g, index: i, id, score });
    this.notify();
    return true;
  }

  // Nach der letzten Station (oder ohne Führer): zum Ausgang
  leave() {
    const g = this.group;
    g.state = 'leaving';
    this.dwelling = false;
    this.timer = AUTO_WALK.leave;
    this.emit('leaving', { group: g });
    this.notify();
  }

  // world: Gruppe hat das Gelände verlassen → Bewertung, XP, Azubi frei
  finished() {
    const g = this.group;
    if (g?.state !== 'leaving') return false;
    this.releaseGuide();
    this.group = null;
    this.dwelling = false;
    if (g.scores) {
      const stars = starsFor(g.scores);
      const xp = XP_PER_STAR * Math.max(0, stars - 2);
      if (xp) this.progress?.addXp(xp);
      this.recentRatings.unshift({ name: g.name, size: g.size, stars, day: g.day });
      this.recentRatings.length = Math.min(this.recentRatings.length, RECENT_RATINGS);
      this.emit('rated', { group: g, stars, xp, scores: { ...g.scores } });
    }
    this.notify();
    return true;
  }

  releaseGuide() {
    if (this.group?.workerId != null) this.staff.release(this.group.workerId);
  }

  // Zustand einer Station 0…1, null = neutral (nichts zu sehen bzw. nicht bewertet)
  rate(id) {
    if (id === 'hall') return rateHall(this.economy);
    if (id === 'servers') return rateServers(this.servers, this.climate);
    return null; // Empfang und Lager zählen nicht
  }

  // Alle Teilwerte so, als stünde die Gruppe jetzt an jeder Station (für Tests und Anzeigen)
  preview() {
    const scores = Object.fromEntries(this.stationList().map((id) => [id, this.rate(id)]));
    return { scores, stars: starsFor(scores) };
  }

  // Gespeichert wird nur ein angekündigter Termin – eine laufende Führung gilt beim Laden als beendet
  toJSON() {
    const g = this.group;
    return {
      plannedDay: this.plannedDay,
      noGuideDay: this.noGuideDay,
      nextId: this.nextId,
      group: g?.state === 'announced' ? { id: g.id, name: g.name, size: g.size, kids: g.kids, day: g.day, time: g.time } : null,
      recentRatings: this.recentRatings.map((r) => ({ ...r })),
    };
  }

  load(data) {
    this.releaseGuide(); // falls gerade eine Führung lief
    this.group = null;
    this.dwelling = false;
    this.timer = 0;
    this.plannedDay = data?.plannedDay ?? 0;
    this.noGuideDay = data?.noGuideDay ?? 0;
    this.nextId = data?.nextId ?? 1;
    this.recentRatings = (data?.recentRatings ?? []).slice(0, RECENT_RATINGS);
    const g = data?.group;
    if (g) {
      this.group = {
        id: g.id, name: g.name, size: g.size, kids: !!g.kids, day: g.day, time: g.time,
        state: 'announced', stations: this.stationList(), station: 0, workerId: null, fee: 0, scores: {},
      };
    }
    this.notify();
  }

  emit(type, data) {
    this.onEvent?.(type, data);
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
