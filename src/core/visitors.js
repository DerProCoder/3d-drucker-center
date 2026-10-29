// Besucher: Über den Tag verteilt (9–18 Uhr) kommen kleine Grüppchen mit 1–7 Personen, zusammen etwa 40–50 Leute.
// Jedes Grüppchen zahlt am Empfang Eintritt, schaut sich ohne Führer Halle, Lager und – wenn die zweite Etage steht –
// den Serverraum an und bewertet beim Gehen mit 1–5 Sternen (4 ★ / 5 ★ bringen XP je Person, höchstens XP_PER_DAY
// am Tag). Hier steht nur, WAS passiert – die Figuren laufen in world/ und melden je Grüppchen-ID zurück:
//   arrived(id)           Grüppchen steht am Empfang → Eintritt, Rundgang beginnt bei Station 0
//   reachedStation(id, i) Grüppchen ist an Station i → Verweildauer läuft in advance(), danach nächste Station
//                         bzw. 'leaving'
//   finished(id)          Grüppchen hat das Gelände verlassen → Bewertung, XP
// Ein Grüppchen, das nicht mehr in parties steht (fertig oder nach PARTY_MAX_MINUTES verworfen), baut world/ ab.
// Robust gegen Hänger: Jedes Grüppchen hat eine Höchstdauer und blockiert nie die nächsten. Es wird niemand vom
// Personal gebraucht oder reserviert.
// Ohne Figuren (autoWalk = true) spielt advance() die Wege selbst mit festen Gehzeiten durch.
// Bewusst ohne Three.js und DOM.
import { WASTE_EMPTY_AT } from './economy.js';
import { TEMP_LIMITS } from './server-climate.js';

export const ENTRY_FEE = 15;                 // € Eintritt pro Person
export const OPEN_HOURS = [9, 18];           // Grüppchen kommen zwischen 9 und 18 Uhr an (Einlass bis 18 Uhr)
export const PLAN_UNTIL = 17;                // geplant wird bis 17 Uhr – die Stunde danach fängt Verzögerungen ab
export const PARTIES_PER_DAY = [12, 15];     // Grüppchen je Tag (beide einschließlich)
export const PEOPLE_PER_DAY = [40, 50];      // Personen je Tag zusammen (beide einschließlich)
export const PARTY_SIZE = [1, 7];            // Personen je Grüppchen
// Gewichte der Grüppchengrößen 1–7: kleine häufiger. Weil der Tagesplan zusammen 40–50 Personen braucht (Mittel
// gut 3 je Grüppchen), sind 1 und 2 etwas stärker gewichtet – heraus kommen etwa 1–2: 45–50 %, 3–4: 30 %, 5–7: 20–25 %.
export const SIZE_WEIGHTS = [26, 26, 15, 15, 6, 6, 6];
export const KIDS_CHANCE = 0.2;              // Anteil der Grüppchen mit Kindern (Familie, ab 2 Personen)
export const MAX_VISITORS = 15;              // höchstens so viele Besucher gleichzeitig unterwegs (Leistung)
// Höchstdauer je Grüppchen ab dem Auftauchen am Gehweg (Spielminuten). Ein ganzer Rundgang mit Serverraum dauert
// mit Figuren etwa 85–90 Spielminuten; wer länger braucht, hängt fest und wird ohne Bewertung entfernt.
export const PARTY_MAX_MINUTES = 150;
export const STATION_MINUTES = [2, 4];       // Spielminuten Verweildauer je Station (zufällig dazwischen)
export const XP_PER_PERSON = { 4: 1, 5: 2 }; // XP je Person bei 4 bzw. 5 Sternen
export const XP_PER_DAY = 15;                // höchstens so viel Besucher-XP am Tag
export const RECENT_RATINGS = 5;             // so viele letzte Bewertungen werden gemerkt
export const HISTORY_DAYS = 7;               // so viele Tagesbilanzen werden gemerkt
export const NEUTRAL_SCORE = 0.5;            // Station ohne Drucker bzw. Server: weder gut noch schlecht (= 3 ★)
// Gehzeiten in Spielminuten, wenn keine Figuren laufen (autoWalk): zum Empfang, zwischen Stationen, zum Ausgang
export const AUTO_WALK = { arrive: 5, station: 1.5, leave: 3 };
const MINUTES_PER_DAY = 24 * 60;
const MIN_GAP = 10;                          // Spielminuten mindestens zwischen zwei geplanten Ankünften

// Stationen in Reihenfolge – world/ kennt die Koordinaten
export const STATIONS = {
  reception: 'Empfang',
  hall: 'Druckhalle',
  storage: 'Lager',
  servers: 'Serverraum',
};

// „★★★★☆“
export const starsText = (stars) => '★'.repeat(stars) + '☆'.repeat(5 - stars);

// „1 Besucher“ / „3 Besucher“ (Besucher ist im Singular und Plural gleich)
export const partyText = (party) => `${party.size} Besucher`;

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

// XP für eine Bewertung, ohne Tagesdeckel: +1 je Person bei 4 ★, +2 je Person bei 5 ★
export const xpFor = (stars, size) => (XP_PER_PERSON[stars] ?? 0) * size;

// Leere Tagesbilanz
const emptyDay = (day) => ({ day, parties: 0, people: 0, fees: 0, rated: 0, starsSum: 0, xp: 0, expired: 0 });

export class Visitors {
  // clock: core/game-clock.js (Uhrzeit für Tagesplan und Ankunft); servers/climate optional (Serverraum-Bewertung)
  // staff wird nicht mehr gebraucht (kein Führer) und nur aus Gewohnheit angenommen
  constructor({ economy, upgrades, progress, clock, servers = null, climate = null }) {
    this.economy = economy;
    this.upgrades = upgrades;
    this.progress = progress;
    this.clock = clock;
    this.servers = servers;
    this.climate = climate;
    this.random = Math.random; // austauschbar für Tests
    // Aktive Grüppchen: { id, size, kids, state, stations, station, dwelling, arrivedAt, timer, fee, scores }
    // state: 'arriving' (world/ lässt es zum Empfang laufen) → 'touring' (nach arrived, Eintritt gezahlt)
    // → 'leaving' (nach der letzten Station) → nach finished bzw. PARTY_MAX_MINUTES aus der Liste entfernt.
    // station: Index in stations · dwelling: steht gerade an der Station und schaut sich um
    // arrivedAt: Spielminute, zu der das Grüppchen am Gehweg aufgetaucht ist (zählt für PARTY_MAX_MINUTES)
    // timer: Restzeit (Spielminuten) der Verweildauer bzw. – mit autoWalk – des Weges
    this.parties = [];
    this.schedule = [];       // noch ausstehende Ankünfte heute: { time (Spielminute), size, kids } – nach Zeit sortiert
    this.planDay = 0;         // Tag, für den der Tagesplan gilt
    this.autoWalk = false;    // true: keine Figuren in world/, Wege laufen mit festen Zeiten (AUTO_WALK)
    this.nextId = 1;
    this.today = emptyDay(0); // Tagesbilanz: Grüppchen, Personen, Eintritt, Bewertungen, Sternsumme, XP, verworfen
    this.history = [];        // frühere Tagesbilanzen mit average – neueste zuerst, höchstens HISTORY_DAYS
    this.recentRatings = [];  // { size, stars, day, time } – neueste zuerst, höchstens RECENT_RATINGS
    this.listeners = new Set();
    // (type, data) => void – 'first-today' { party } · 'party-arriving' { party } · 'paid' { party, fee, perPerson }
    // · 'station' { party, index, id, score } · 'leaving' { party } · 'rated' { party, stars, xp, scores }
    // · 'expired' { party } · 'day-summary' { summary } (Tagesbilanz des Vortags, nur wenn Besucher da waren)
    this.onEvent = null;
  }

  get day() {
    return Math.floor(this.clock.minutes / MINUTES_PER_DAY) + 1;
  }

  // Besucher, die gerade unterwegs sind
  get activePeople() {
    return this.parties.reduce((sum, p) => sum + p.size, 0);
  }

  // Tagesschnitt der Sterne heute (null, solange niemand bewertet hat)
  get todayAverage() {
    return this.today.rated ? this.today.starsSum / this.today.rated : null;
  }

  // Nächste geplante Ankunft heute oder null
  get nextArrival() {
    return this.schedule[0] ?? null;
  }

  // Stationen des Rundgangs (Serverraum nur mit zweiter Etage)
  stationList() {
    return ['reception', 'hall', 'storage', ...(this.upgrades?.upperFloor ? ['servers'] : [])];
  }

  partyById(id) {
    return this.parties.find((p) => p.id === id) ?? null;
  }

  // Tageswechsel (clock.onNewDay): Bilanz des Vortags abschließen, Tagesplan für den neuen Tag
  onNewDay(day = this.day) {
    this.startDay(day);
  }

  startDay(day = this.day) {
    if (this.planDay === day) return;
    this.closeDay();
    this.planDay = day;
    this.today = emptyDay(day);
    this.schedule = this.makeSchedule(day);
    this.notify();
  }

  // Tagesbilanz in die Geschichte übernehmen und melden (nur wenn heute jemand da war)
  closeDay() {
    const t = this.today;
    if (!t.day || !t.parties) return;
    const summary = { ...t, average: t.rated ? t.starsSum / t.rated : null };
    this.history.unshift(summary);
    this.history.length = Math.min(this.history.length, HISTORY_DAYS);
    this.emit('day-summary', { summary });
  }

  // Zufällige Grüppchengröße 1–7 nach SIZE_WEIGHTS
  randomSize() {
    const total = SIZE_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    for (let i = 0; i < SIZE_WEIGHTS.length; i++) {
      r -= SIZE_WEIGHTS[i];
      if (r < 0) return PARTY_SIZE[0] + i;
    }
    return PARTY_SIZE[1];
  }

  // Tagesplan: 12–15 Grüppchen, zusammen 40–50 Personen, Ankünfte über 9–17 Uhr verteilt (Einlass bis 18 Uhr, falls
  // gerade zu viele Besucher unterwegs sind). Der Tag wird in gleich
  // lange Abschnitte geteilt, in jedem kommt ein Grüppchen zu einer zufälligen Minute (Abstand mindestens MIN_GAP,
  // meist 15–75 Minuten). Wird erst im Laufe des Tages geplant (neues Spiel, alter Spielstand), entfallen die
  // Ankünfte, die schon vorbei sind.
  makeSchedule(day) {
    const rnd = (min, max) => min + Math.floor(this.random() * (max - min + 1));
    // Zufällige Größen ziehen, bis die Gesamtzahl passt (meist nach wenigen Versuchen) – so bleibt die Gewichtung
    // der Größen erhalten. Notfalls einzelne Grüppchen um eine Person größer bzw. kleiner machen.
    let sizes = [];
    let sum = 0;
    for (let tries = 0; tries < 100; tries++) {
      sizes = Array.from({ length: rnd(...PARTIES_PER_DAY) }, () => this.randomSize());
      sum = sizes.reduce((a, b) => a + b, 0);
      if (sum >= PEOPLE_PER_DAY[0] && sum <= PEOPLE_PER_DAY[1]) break;
    }
    const count = sizes.length;
    while (sum < PEOPLE_PER_DAY[0]) {
      const i = Math.floor(this.random() * count);
      if (sizes[i] < PARTY_SIZE[1]) { sizes[i]++; sum++; }
    }
    while (sum > PEOPLE_PER_DAY[1]) {
      const i = Math.floor(this.random() * count);
      if (sizes[i] > PARTY_SIZE[0]) { sizes[i]--; sum--; }
    }
    const dayStart = (day - 1) * MINUTES_PER_DAY;
    const open = OPEN_HOURS[0];
    const span = (PLAN_UNTIL - open) * 60;
    const slot = span / count;
    const schedule = sizes.map((size, i) => ({
      time: Math.floor(dayStart + open * 60 + i * slot + this.random() * Math.max(0, slot - MIN_GAP)),
      size,
      kids: size >= 2 && this.random() < KIDS_CHANCE,
    }));
    return schedule.filter((s) => s.time >= this.clock.minutes);
  }

  advance(gameMinutes) {
    if (this.planDay !== this.day) this.startDay(this.day);
    this.admit();
    const now = this.clock.minutes;
    for (const party of [...this.parties]) {
      // Höchstdauer: hängt das Grüppchen irgendwo fest, geht es ohne Bewertung und macht Platz für die nächsten
      if (now - party.arrivedAt > PARTY_MAX_MINUTES) {
        this.expire(party);
        continue;
      }
      party.timer -= gameMinutes;
      if (party.timer > 0) continue;
      if (party.dwelling) {
        party.dwelling = false;
        if (party.station + 1 < party.stations.length) {
          party.station++;
          party.timer = AUTO_WALK.station;
          this.notify();
        } else {
          this.leave(party);
        }
      } else if (this.autoWalk) {
        if (party.state === 'arriving') this.arrived(party.id);
        else if (party.state === 'touring') this.reachedStation(party.id, party.station);
        else if (party.state === 'leaving') this.finished(party.id);
      }
    }
  }

  // Fällige Ankünfte losschicken, solange höchstens MAX_VISITORS gleichzeitig unterwegs sind. Ist die Grenze erreicht,
  // kommt das Grüppchen später; wer bis Ladenschluss (18 Uhr) nicht hineinpasst, kommt heute nicht mehr.
  admit() {
    const now = this.clock.minutes;
    const closing = (this.day - 1) * MINUTES_PER_DAY + OPEN_HOURS[1] * 60;
    while (this.schedule.length && this.schedule[0].time <= now) {
      const next = this.schedule[0];
      if (now >= closing) {
        this.schedule.shift(); // zu spät geworden
        continue;
      }
      if (this.activePeople + next.size > MAX_VISITORS) break;
      this.schedule.shift();
      this.spawn(next);
    }
  }

  // Grüppchen taucht am Gehweg auf und läuft zum Empfang
  spawn({ size, kids = false }) {
    const party = {
      id: this.nextId++,
      size,
      kids: !!kids,
      state: 'arriving',
      stations: this.stationList(),
      station: 0,
      dwelling: false,
      arrivedAt: this.clock.minutes,
      timer: AUTO_WALK.arrive,
      fee: 0,
      scores: {},
    };
    this.parties.push(party);
    if (!this.today.parties) this.emit('first-today', { party });
    this.today.parties++;
    this.today.people += size;
    this.emit('party-arriving', { party });
    this.notify();
    return party;
  }

  // world: Grüppchen steht am Empfang → Eintritt zahlen, Rundgang beginnt bei Station 0
  arrived(id) {
    const party = this.partyById(id);
    if (party?.state !== 'arriving') return false;
    party.fee = party.size * ENTRY_FEE;
    this.economy.earn(party.fee);
    this.today.fees += party.fee;
    party.state = 'touring';
    party.station = 0;
    party.dwelling = false;
    party.timer = 0; // autoWalk: Station 0 (Empfang) ist schon erreicht
    this.emit('paid', { party, fee: party.fee, perPerson: ENTRY_FEE });
    this.notify();
    return true;
  }

  // world: Grüppchen ist an Station i angekommen → bewerten, Verweildauer läuft in advance()
  reachedStation(id, i) {
    const party = this.partyById(id);
    if (party?.state !== 'touring' || i !== party.station || party.dwelling) return false;
    const station = party.stations[i];
    const score = this.rate(station);
    party.scores[station] = score;
    party.dwelling = true;
    const [min, max] = STATION_MINUTES;
    party.timer = min + this.random() * (max - min);
    this.emit('station', { party, index: i, id: station, score });
    this.notify();
    return true;
  }

  // Nach der letzten Station: zum Ausgang
  leave(party) {
    party.state = 'leaving';
    party.dwelling = false;
    party.timer = AUTO_WALK.leave;
    this.emit('leaving', { party });
    this.notify();
  }

  // world: Grüppchen hat das Gelände verlassen → Bewertung, XP (höchstens XP_PER_DAY am Tag)
  finished(id) {
    const party = this.partyById(id);
    if (party?.state !== 'leaving') return false;
    this.remove(party);
    const stars = starsFor(party.scores);
    const xp = Math.min(xpFor(stars, party.size), Math.max(0, XP_PER_DAY - this.today.xp));
    if (xp) this.progress?.addXp(xp);
    this.today.xp += xp;
    this.today.rated++;
    this.today.starsSum += stars;
    this.recentRatings.unshift({ size: party.size, stars, day: this.day, time: this.clock.minutes });
    this.recentRatings.length = Math.min(this.recentRatings.length, RECENT_RATINGS);
    this.emit('rated', { party, stars, xp, scores: { ...party.scores } });
    this.notify();
    return true;
  }

  // Höchstdauer überschritten: ohne Bewertung entfernen (Eintritt bleibt, falls schon gezahlt)
  expire(party) {
    this.remove(party);
    this.today.expired++;
    this.emit('expired', { party });
    this.notify();
  }

  remove(party) {
    this.parties = this.parties.filter((p) => p !== party);
    party.dwelling = false;
  }

  // Zustand einer Station 0…1, null = neutral (nichts zu sehen bzw. nicht bewertet)
  rate(id) {
    if (id === 'hall') return rateHall(this.economy);
    if (id === 'servers') return rateServers(this.servers, this.climate);
    return null; // Empfang und Lager zählen nicht
  }

  // Alle Teilwerte so, als stünde ein Grüppchen jetzt an jeder Station (für Tests und Anzeigen)
  preview() {
    const scores = Object.fromEntries(this.stationList().map((id) => [id, this.rate(id)]));
    return { scores, stars: starsFor(scores) };
  }

  // Gespeichert werden Tagesplan, Tagesbilanz und Bewertungen. Grüppchen, die gerade unterwegs sind, gelten beim
  // Laden als gegangen (ohne Bewertung) – die übrigen Ankünfte des Tages kommen trotzdem.
  toJSON() {
    return {
      planDay: this.planDay,
      schedule: this.schedule.map((s) => ({ ...s })),
      nextId: this.nextId,
      today: { ...this.today },
      history: this.history.map((h) => ({ ...h })),
      recentRatings: this.recentRatings.map((r) => ({ ...r })),
    };
  }

  load(data) {
    this.parties = [];
    this.nextId = data?.nextId ?? 1;
    this.history = (data?.history ?? []).slice(0, HISTORY_DAYS);
    this.recentRatings = (data?.recentRatings ?? []).slice(0, RECENT_RATINGS);
    // Tagesplan nur übernehmen, wenn er zu heute gehört – sonst plant advance() neu
    const today = data?.today && data.planDay === this.day && data.today.day === this.day;
    this.planDay = today ? data.planDay : 0;
    this.today = today ? { ...emptyDay(this.day), ...data.today } : emptyDay(0);
    this.schedule = today
      ? (data.schedule ?? [])
        .filter((s) => Number.isFinite(s?.time) && s.size >= PARTY_SIZE[0] && s.size <= PARTY_SIZE[1])
        .map((s) => ({ time: s.time, size: s.size, kids: !!s.kids }))
        .sort((a, b) => a.time - b.time)
      : [];
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
