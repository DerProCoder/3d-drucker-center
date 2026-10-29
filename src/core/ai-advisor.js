// KI-Berater für die PC-App „KI“ (ui/ai-app.js): beantwortet Fragen des Spielers mit Tipps zum Spiel. Simuliert –
// keine echte KI und keine Anfrage ins Internet. Stichwörter in der Frage wählen das Thema (auch mehrere), die Zahlen
// kommen aus dem Spielstand. Je höher die KI-Stufe (core/ai-service.js), desto genauer die Antwort:
//   1 allgemeine Tipps · 2 dazu Zahlen · 3 dazu konkrete Probleme · 4 dazu Empfehlungen · 5 dazu Prognose und
//   Lagebericht auf Knopfdruck · 6 dazu Vergleich mit gestern · 7 dazu Prognose über mehrere Tage · 8 dazu der Weg
//   zum nächsten Spieler-Level bzw. zur nächsten KI-Stufe · 9 dazu Warnungen, die die KI auch von selbst meldet
//   (advance → onEvent 'warning', main.js zeigt sie im HUD) · 10 dazu eine Rangliste der nächsten Schritte und der
//   ausführliche Lagebericht
// Jedes Thema liefert dafür Zeilen in Fächern (general, numbers, problems, advice, forecast, ab Stufe 6 history,
// outlook, path, alerts, ranking); compose() nimmt so viele Fächer, wie die Stufe erlaubt. Den Tagesverlauf für
// Stufe 6 und 7 zeichnet core/ai-day-log.js im KI-Dienst auf.
// game: Spielsysteme wie in main.js – { economy, orders, progress, upgrades, clock, staff, servers, climate, rentals,
// rentalAutomation, visitors, ai, climateAutomation } – alles optional, fehlende Teile werden übersprungen.
// Ohne Three.js und DOM.
import { BANKRUPT_AT, IDLE_POWER_SHARE, NOZZLE_WORN, RENT_PER_HOUR, WET } from './economy.js';
import { FAILURES, SPOOL_GRAMS, filamentById, filamentLabel, templateById } from './catalog.js';
import { TEMP_LIMITS } from './server-climate.js';
import { spotLabel } from './server-zones.js';
import { waitingFilament } from './two-color.js';
import { isLaser } from './laser.js';
import { MAX_WORKERS } from './staff.js';
import { TITLES } from './progress.js';
import { serverHardwareById } from './server-catalog.js';
import { AI_FEE_PER_SERVER, AI_SERVER_ID, LEVEL_FACTORS, LEVEL_THRESHOLDS, MAX_LEVEL, feeFor, isAIServer, levelFor } from './ai-service.js';
import { euro, formatMinutes, realTime } from './format.js';

export { MAX_LEVEL };
const MINUTES_PER_DAY = 24 * 60;
const LOW_GRAMS = 150;       // Spule im Drucker fast leer
const LOW_STOCK = 3;         // weniger Spulen im Lager: nachkaufen
const URGENT_MINUTES = 120;  // Spielminuten bis zur Frist, ab denen ein Auftrag knapp wird
const MAX_TOPICS = 3;        // so viele Themen beantwortet eine Frage höchstens
const MAX_LIST = 6;          // so viele Einträge zeigt eine Aufzählung, der Rest wird gezählt
export const REPORT_LEVEL = 5;   // ab dieser Stufe gibt es den Lagebericht (ab MAX_LEVEL ausführlich mit Rangliste)
export const WARN_LEVEL = 9;     // ab dieser Stufe warnt die KI von selbst
const WARN_EVERY = 2;        // Spielminuten zwischen zwei Prüfungen auf Warnungen
const WARN_REPEAT = 120;     // Spielminuten, bis dieselbe Warnung erneut kommt, solange das Problem bleibt
const WARN_GAP = 30;         // Spielminuten Ruhe, bevor eine behobene Warnung wieder kommen darf
const WARN_AT_ONCE = 2;      // so viele neue Warnungen höchstens je Prüfung (der Rest folgt bei der nächsten)
const WARN_GRACE = 5;        // Spielminuten Schonfrist nach Start bzw. Laden, bevor die KI zum ersten Mal warnt
const MONEY_WARN_HOURS = 12; // Warnung „Geld knapp“, wenn das Geld ohne Aufträge kürzer reicht (Spielstunden)
const FILAMENT_WARN_DAYS = 0.5; // Warnung „Filament knapp“, wenn der Vorrat kürzer reicht (Spieltage)
const OUTLOOK_DAYS = 3;      // Prognose über so viele Tage
const OUTLOOK_KEYS = ['money', 'filament', 'orders', 'ai', 'power']; // Themen der Prognose über mehrere Tage (outlookLines)

// Fächer einer Antwort und ab welcher Stufe sie dabei sind
const SECTIONS = [['general', 1], ['numbers', 2], ['problems', 3], ['advice', 4], ['forecast', 5],
  ['history', 6], ['outlook', 7], ['path', 8], ['alerts', 9], ['ranking', 10]];

// Fähigkeiten ab Stufe 6 mit eigenen Fragen: Stufe, ab der sie gehen, Satzanfang für den Hinweis darunter, Stichwörter.
// Sie gehen allen Sachthemen vor, aber nur ab ihrer Stufe – darunter antwortet die KI wie bisher bzw. mit Hinweis.
const SKILLS = [
  { id: 'ranking', level: 10, name: 'Eine Rangliste der nächsten Schritte erstelle ich', words: [/rangliste/, /reihenfolge/, /wichtigste/, /ranking/] },
  { id: 'warnings', level: 9, name: 'Von selbst warnen kann ich', words: [/warnung/, /\bwarn/, /alarm/, /\bmeldung/] },
  { id: 'path', level: 8, name: 'Den Weg zur nächsten Stufe rechne ich', words: [/naechste[nrs]? (ki )?stufe/, /naechste[nrs]? level/, /wie komme ich/, /wie erreiche/, /\bweg zu/, /bis (zur )?(ki )?stufe/, /bis (zum )?level/, /\bziele?\b/] },
  { id: 'outlook', level: 7, name: 'Eine Prognose über mehrere Tage schaffe ich', words: [/naechsten tage/, /mehrere(n)? tage/, /uebermorgen/, /(?<!guten )\bmorgen\b/, /\bwoche/, /wie lange reicht/, /reicht (das |es |mein )?(noch|geld|filament)/, /in \d+ tagen/] },
  { id: 'compare', level: 6, name: 'Einen Vergleich mit gestern schaffe ich', words: [/gestern/, /vortag/, /vergleich/, /\btrend/, /verlauf/, /letzte[nr]? tag/] },
];

// Was die KI je Stufe neu kann (für „Wie erreiche ich die nächste Stufe?“)
const LEVEL_SKILLS = [
  '', 'allgemeine Tipps', 'Zahlen aus deinem Betrieb', 'konkrete Probleme', 'Empfehlungen', 'Lagebericht und Tagesprognose',
  'Vergleich mit gestern', 'Prognose über mehrere Tage', 'der Weg zu deinen nächsten Zielen', 'Warnungen von selbst per Meldung',
  'ausführlicher Lagebericht mit Rangliste der nächsten Schritte',
];

// Fähigkeit der Frage (Eintrag aus SKILLS) oder null
export function detectSkill(question) {
  const text = normalize(question);
  return SKILLS.find((s) => s.words.some((w) => w.test(text))) ?? null;
}

// Frage vereinfachen: klein, Umlaute als ae/oe/ue, ß als ss, Satzzeichen weg – „Wärme?“ und „waerme“ sind gleich
export function normalize(text) {
  return ` ${String(text ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9€°%]+/g, ' ')
    .trim()} `;
}

// Themen mit Stichwörtern (reguläre Ausdrücke auf der vereinfachten Frage). meta: allgemeine Fragen, die nur
// beantwortet werden, wenn kein Sachthema erkannt wurde. Das KI-Thema „verbraucht“ seine Treffer, damit
// „KI-GPU-Server“ nicht zusätzlich als Frage nach den Mietservern zählt.
const TOPICS = [
  { id: 'ai', title: '🧠 KI', consume: true, words: [/ki (gpu )?server/, /\bki\b/, /\bstufe/, /schlau/, /\babo\b/, /intelligen/, /wer bist du/] },
  { id: 'report', title: '📋 Lagebericht', words: [/lagebericht/, /\bbericht/, /prognose/, /vorhersage/, /\breport/] },
  { id: 'filament', title: '🧵 Filament', words: [/filament/, /spule/, /\bpla\b/, /\bpetg\b/, /\babs\b/, /\btpu\b/, /material/, /feucht/, /trock/, /nachkauf/, /einkauf/, /\bholz/, /platte/] },
  { id: 'printers', title: '🖨️ Drucker', words: [/drucker/, /duese/, /fehldruck/, /\bams\b/, /\bdruckt/, /\bdrucke\b/, /laser/, /spaghetti/, /muelleimer/] },
  { id: 'orders', title: '📋 Aufträge', words: [/auftrag/, /auftraege/, /kunde/, /bestellung/, /\bfrist/, /abhol/, /empfang/] },
  { id: 'servers', title: '🖥️ Server', words: [/server/, /\bvms?\b/, /vermiet/, /mietanfrage/, /anfrage/, /\brack/, /\bnetz/, /internet/, /kabel/, /firewall/, /switch/, /patch/, /offline/, /online/] },
  { id: 'climate', title: '🌡️ Klima', words: [/temperatur/, /heiss/, /\bkalt/, /kuehl/, /luefter/, /klima/, /warm/, /\bgrad\b/, /°/, /ueberhitz/, /eingefror/, /friert/, /\bschrank/, /\bschraenke/] },
  { id: 'money', title: '💶 Geld', words: [/geld/, /konto/, /\beuro/, /€/, /gewinn/, /verlust/, /pleite/, /kosten/, /einnahm/, /verdien/, /umsatz/, /finanz/, /kasse/, /\bbank/, /\breich\b/] },
  { id: 'power', title: '⚡ Strom', words: [/strom/, /energie/, /verbrauch/, /\bkw\b/, /watt/] },
  { id: 'rent', title: '🏠 Miete', words: [/\bmiete\b/, /hallenmiete/, /\bmieten\b/] },
  { id: 'staff', title: '🧑‍🔧 Personal', words: [/azubi/, /personal/, /mitarbeiter/, /einstell/, /\blohn/, /loehne/, /empfangskraft/, /angestellt/] },
  { id: 'visitors', title: '🚌 Besucher', words: [/besucher/, /gruppe/, /fuehrung/, /\btour/, /bewertung/, /sterne/, /eintritt/] },
  { id: 'progress', title: '⭐ Level', words: [/\blevel/, /\bxp\b/, /erfahrung/, /\btitel/, /aufsteig/] },
  { id: 'upgrades', title: '🏗️ Ausbau', words: [/ausbau/, /\btisch/, /regalebene/, /etage/, /fahrstuhl/, /\bplatz\b/, /erweiter/, /vergroesser/] },
  // allgemeine Fragen
  { id: 'next', meta: true, words: [/was soll/, /naechste/, /\btipps?\b/, /empfiehl/, /empfehl/, /\bhilfe/, /\btun\b/, /\bmachen\b/, /\brat\b/, /vorschlag/, /priorit/] },
  { id: 'problems', meta: true, words: [/problem/, /fehler/, /kaputt/, /stoerung/, /defekt/, /geht nicht/, /warum/, /\bsorge/] },
  { id: 'status', meta: true, words: [/wie laeuft/, /laeuft es/, /\blage\b/, /ueberblick/, /status/, /zusammenfass/, /bilanz/, /wie geht/, /\bstand\b/] },
  { id: 'greeting', meta: true, words: [/^ (hallo|hi|hey|moin|servus|guten (morgen|tag|abend))\b/, /\bdanke/] },
];
const topicById = (id) => TOPICS.find((t) => t.id === id);

// Themen der Frage in der Reihenfolge, in der sie vorkommen: Sachthemen zuerst (höchstens MAX_TOPICS), ein Lagebericht
// geht allem vor, allgemeine Fragen nur ohne Sachthema
export function detectTopics(question) {
  let text = normalize(question);
  const found = [];
  for (const topic of TOPICS) {
    let first = Infinity;
    for (const word of topic.words) {
      const m = word.exec(text);
      if (!m) continue;
      first = Math.min(first, m.index);
      if (topic.consume) text = text.replace(new RegExp(word.source, 'g'), (s) => ' '.repeat(s.length));
    }
    if (first < Infinity) found.push({ topic, at: first });
  }
  found.sort((a, b) => a.at - b.at);
  const ids = found.map((f) => f.topic.id);
  if (ids.includes('report')) return ['report'];
  const subjects = ids.filter((id) => !topicById(id).meta);
  if (subjects.length) return subjects.slice(0, MAX_TOPICS);
  return ids.slice(0, 1);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const kg = (grams) => `${(grams / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`;
const degrees = (t) => `${Math.round(t)} °C`;
const clockText = (minutes) => {
  const m = Math.floor(minutes % MINUTES_PER_DAY);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
// Aufzählung mit Spiegelstrichen, zu lange Listen gekürzt
const bullets = (items, max = MAX_LIST) => [
  ...items.slice(0, max).map((s) => `• ${s}`),
  ...(items.length > max ? [`• … und ${items.length - max} weitere`] : []),
];
// Stellplatz eines Schranks ohne Symbol: „Reihe A · Platz 3“, „Privat · Platz 2“, „Automatik-Platz 1“
const placeText = (slot) => spotLabel(slot).replace(/^(🔒|🌡️)\s*/u, '');
// Je Schrank das heißeste der zu warmen Geräte: Schrank-ID → { device, rack, label, temp }
function hottestPerRack(hot) {
  const map = new Map();
  for (const h of hot) if (!map.has(h.rack.id) || map.get(h.rack.id).temp < h.temp) map.set(h.rack.id, h);
  return map;
}
// Temperaturspanne „24 °C bis 47 °C“, bei gleichen (gerundeten) Werten nur einer
function degreeRange(values) {
  const [lo, hi] = [Math.min(...values), Math.max(...values)].map(degrees);
  return lo === hi ? lo : `${lo} bis ${hi}`;
}
// Aufträge am Empfang je Kunde (gleichnamige Kunden zusammengefasst): Map Kunde → Aufträge
function byCustomer(list) {
  const map = new Map();
  for (const o of list) map.set(o.order.customer, [...(map.get(o.order.customer) ?? []), o]);
  return map;
}
// KI-GPU-Server für die Anzeige: „3 rechnen für die KI, 1 erreichbar, aber überhitzt, 1 offline“
function aiCountText(f) {
  const off = f.aiServers.length - f.aiWorking.length - f.aiHot.length;
  return [
    `${f.aiWorking.length} ${f.aiWorking.length === 1 ? 'rechnet' : 'rechnen'} für die KI`,
    f.aiHot.length ? `${f.aiHot.length} erreichbar, aber überhitzt` : '',
    off > 0 ? `${off} offline` : '',
  ].filter(Boolean).join(', ');
}
// Zusatz „, dazu 2 Kunden am Empfang“ (noch nicht angenommene Aufträge) oder ''
function counterText(f) {
  const n = f.orders.filter((o) => o.order.stage === 'counter').length;
  return n ? `, dazu ${n === 1 ? 'ein Kunde' : `${n} Kunden`} am Empfang` : '';
}
const empty = () => ({
  general: [], numbers: [], problems: [], advice: [], forecast: [], history: [], outlook: [], path: [], alerts: [], ranking: [],
});
// Prozentvergleich „+12 % gegenüber Tag 3“ bzw. ''
function versus(now, before, day) {
  if (before == null) return '';
  if (!before) return now > 0 ? ` (Tag ${day}: nichts)` : '';
  const pct = Math.round(((now - before) / before) * 100);
  return pct ? ` (${pct > 0 ? '+' : '−'}${Math.abs(pct)} % gegenüber Tag ${day})` : ` (wie an Tag ${day})`;
}
const signed = (n) => `${n >= 0 ? '+' : '−'}${euro.format(Math.abs(n))}`;

// Welche Zeilen ab Stufe 6 zu welchem Thema gehören: Tagesverlauf (history), Prognose über Tage (outlook),
// nächste Ziele (path). Warnungen und Rangliste filtern über das Thema (topic) ihrer Einträge.
const EXTRAS = {
  status: { history: ['income', 'orders', 'net'], outlook: ['money'], path: ['ai', 'level'] },
  next: { history: ['orders'], outlook: ['filament', 'money'], path: ['level', 'ai'] },
  problems: { history: ['net'], outlook: ['filament', 'money'] },
  money: { history: ['income', 'costs', 'net'], outlook: ['money', 'ai'], path: ['ai'] },
  orders: { history: ['orders', 'income'], outlook: ['orders'], path: ['level'] },
  filament: { history: ['filament'], outlook: ['filament'] },
  printers: { history: ['filament', 'orders'], outlook: ['filament'] },
  power: { history: ['power'], outlook: ['power'] },
  ai: { history: ['ai'], outlook: ['ai'], path: ['ai'] },
  servers: { history: ['ai', 'power'], outlook: ['ai'], path: ['ai'] },
  climate: { history: ['power'] },
  progress: { history: ['xp', 'orders'], path: ['level'] },
  staff: { history: ['costs'] },
  rent: { history: ['costs'] },
  visitors: { history: ['income'] },
  upgrades: { outlook: ['money'], path: ['level'] },
};
// Themen, deren Warnungen bzw. Rangliste alles zeigen (sonst nur Einträge mit passendem topic)
const ALL_TOPICS = new Set(['status', 'next', 'problems']);

export class AIAdvisor {
  constructor(game = {}) {
    this.game = game;
    this.warned = new Map();  // Warnung → { last, resolvedAt, severity } (Spielminute der letzten Meldung …) für die Drosselung
    this.bundlePending = true; // erste Prüfung ab Stufe WARN_LEVEL: alle Warnungen in einer Meldung
    this.sinceWarn = 0;
    this.elapsed = 0;         // Spielminuten seit Start (ohne Uhr)
    this.onEvent = null;      // (type, data) => void – 'warning' { key, text, topic } ab Stufe WARN_LEVEL
    // Der Tagesverlauf der KI braucht Aufträge, Uhr und XP – fehlen sie im KI-Dienst, hier nachreichen
    this.ai?.connect?.({ orders: game.orders, clock: game.clock, progress: game.progress });
  }

  // KI-Dienst (core/ai-service.js) – in main.js heißt er im Spielobjekt aiService
  get ai() {
    return this.game.ai ?? this.game.aiService ?? null;
  }

  // ---------- Öffentlich ----------

  // Antwort auf eine Frage bei dieser Stufe (0 = offline): { text, topic, topics }
  answer(question, level = this.ai?.level ?? 0) {
    level = Number.isFinite(Number(level)) ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(level)))) : 0; // ungültige Stufe wie offline
    if (level <= 0) return { text: this.offlineText(), topic: 'offline', topics: [] };
    const topics = detectTopics(question);
    // Fähigkeiten ab Stufe 6 (Vergleich, Prognose über Tage, Ziele, Warnungen, Rangliste) gehen vor – darunter nur
    // ein Hinweis, wenn die Frage sonst nichts trifft. Ein ausdrücklich verlangter Lagebericht geht trotzdem vor.
    const skill = detectSkill(question);
    const wantsReport = /lagebericht|\bbericht|\breport/.test(normalize(question));
    if (skill && level >= skill.level && !wantsReport) return { text: this.skillAnswer(skill.id, level, question), topic: skill.id, topics: [skill.id] };
    if (skill && !topics.length) return { text: this.skillLocked(skill, level), topic: 'locked', topics: [] };
    if (!topics.length) return { text: this.fallback(level), topic: 'unknown', topics: [] };
    if (topics[0] === 'report') return { text: this.report(level), topic: 'report', topics };
    if (topics[0] === 'greeting') return { text: this.greeting(level), topic: 'greeting', topics };
    const facts = this.facts();
    const texts = topics.map((id) => {
      const body = this.compose(this.build(id, facts, level), level);
      return topics.length > 1 && topicById(id).title ? `${topicById(id).title}\n${body}` : body;
    });
    return { text: texts.join('\n\n'), topic: topics[0], topics };
  }

  // Vollständiger Lagebericht (ab Stufe 5): alle Bereiche mit Zahlen, Problemen, Empfehlungen und Prognose. Ab
  // Stufe 6 kommen Vergleich mit gestern, ab 7 die nächsten Tage, ab 8 die Ziele, ab 9 die Warnungen dazu; Stufe 10
  // ist ausführlich (Empfehlungen je Bereich) mit einer Rangliste der nächsten Schritte statt der kurzen Liste.
  report(level = this.ai?.level ?? 0) {
    if (level <= 0) return this.offlineText();
    if (level < REPORT_LEVEL) {
      return `Einen kompletten Lagebericht schaffe ich erst ab Stufe ${REPORT_LEVEL}. Frag mich bis dahin nach einzelnen `
        + 'Bereichen, z. B. „Wie läuft es?“, „Filament?“ oder „Server?“.';
    }
    const f = this.facts();
    const detailed = level >= MAX_LEVEL;
    const when = this.game.clock ? ` – Tag ${this.game.clock.day}, ${clockText(this.game.clock.minutes)}` : '';
    const parts = [`📋 ${detailed ? 'Ausführlicher Lagebericht' : 'Lagebericht'}${when}`];
    for (const id of ['money', 'printers', 'filament', 'orders', 'servers', 'climate', 'staff', 'visitors', 'ai']) {
      const p = this.build(id, f);
      const lines = [...p.numbers, ...p.problems, ...(detailed ? p.advice.map((s) => `→ ${s}`) : [])];
      if (lines.length) parts.push(`${topicById(id).title}\n${lines.join('\n')}`);
    }
    if (level >= 6) parts.push(`📈 Vergleich mit gestern\n${this.historyLines(['income', 'orders', 'power', 'filament', 'net']).join('\n')}`);
    if (level >= 7) parts.push(`📆 Die nächsten ${OUTLOOK_DAYS} Tage\n${this.outlookLines(f, ['money', 'filament', 'orders', 'ai']).join('\n')}`);
    if (level >= 8) parts.push(`🎯 Nächste Ziele\n${this.pathLines(f, ['level', 'ai']).join('\n')}`);
    if (level >= 9) {
      const warnings = this.warnings(f);
      parts.push(`⚠️ Warnungen\n${warnings.length ? bullets(warnings.map((w) => w.text)).join('\n') : 'Keine – ich melde mich von selbst, sobald etwas anbrennt.'}`);
    }
    if (detailed) {
      parts.push(`🏆 Rangliste der nächsten Schritte\n${this.rankingLines(f, null, 6).join('\n')}`);
    } else {
      const advice = this.recommendations(f);
      if (advice.length) parts.push(`👉 Als Nächstes\n${bullets(advice, 4).join('\n')}`);
    }
    parts.push(`🔮 Prognose\n${this.forecastLines(f).join('\n')}`);
    return parts.join('\n\n');
  }

  // Antwort auf eine Fähigkeit ab Stufe 6 (SKILLS). question: nennt sie ein Thema der Prognose (z. B. „Wie lange reicht
  // das Filament?“), kommt nur dieses
  skillAnswer(id, level, question = '') {
    const f = this.facts();
    if (id === 'compare') {
      return `📈 Vergleich mit gestern\n${this.historyLines(['income', 'orders', 'power', 'costs', 'ai', 'filament', 'net', 'trend']).join('\n')}`;
    }
    if (id === 'outlook') {
      const asked = detectTopics(question).filter((t) => OUTLOOK_KEYS.includes(t));
      if (asked.length) return `📆 Prognose\n${this.outlookLines(f, asked).join('\n')}`;
      return `📆 Prognose für die nächsten ${OUTLOOK_DAYS} Tage\n${[...this.outlookLines(f, OUTLOOK_KEYS), ...this.forecastLines(f).slice(0, 1)].join('\n')}`;
    }
    if (id === 'path') return `🎯 Nächste Ziele\n${this.pathLines(f, ['level', 'ai']).join('\n')}`;
    if (id === 'warnings') {
      const warnings = this.warnings(f);
      const auto = level >= WARN_LEVEL ? 'Ich melde mich von selbst mit einer Meldung, sobald etwas davon eintritt.' : '';
      return warnings.length
        ? `⚠️ Gerade würde ich dich warnen:\n${bullets(warnings.map((w) => w.text)).join('\n')}\n${auto}`.trim()
        : `⚠️ Keine Warnungen – Filament, Temperaturen, Geld und Fristen sind im grünen Bereich. ${auto}`.trim();
    }
    if (id === 'ranking') return `🏆 Rangliste der nächsten Schritte\n${this.rankingLines(f, null, 8).join('\n')}`;
    return this.fallback(level);
  }

  // Fähigkeit noch nicht freigeschaltet: Hinweis, ab welcher Stufe und wie viele KI-GPU-Server dafür nötig sind
  skillLocked(skill, level) {
    const need = LEVEL_THRESHOLDS[skill.level];
    const now = this.ai?.onlineCount ?? 0;
    const more = need - now;
    return `${skill.name} erst ab Stufe ${skill.level} (jetzt Stufe ${level}). Dafür brauche ich ${need} KI-GPU-Server online`
      + `${more > 0 ? ` – also ${more === 1 ? 'einen weiteren' : `${more} weitere`}` : ''}.`;
  }

  // Begrüßung zum Start des Chats (null ohne KI)
  greeting(level = this.ai?.level ?? 0) {
    if (level <= 0) return null;
    const intro = {
      1: 'Hallo! Ich bin die KI deiner Druckerei – noch ganz am Anfang (Stufe 1). Ich kenne erst allgemeine Tipps.',
      2: 'Hallo! KI Stufe 2 ist online. Ich kann jetzt Zahlen aus deinem Betrieb nennen.',
      3: 'Hallo! KI Stufe 3 ist online. Ich sehe Zahlen und konkrete Probleme in Halle und Serverraum.',
      4: 'Hallo! KI Stufe 4 ist online. Ich gebe dir dazu Empfehlungen, was sich lohnt.',
      5: 'Hallo! KI Stufe 5 ist online. Frag mich nach einem Lagebericht oder einer Prognose.',
      6: 'Hallo! KI Stufe 6 ist online. Ich merke mir jetzt jeden Tag und vergleiche ihn mit gestern.',
      7: 'Hallo! KI Stufe 7 ist online. Ich rechne jetzt mehrere Tage voraus – Geld, Filament, Aufträge.',
      8: 'Hallo! KI Stufe 8 ist online. Ich zeige dir den Weg zum nächsten Level und zur nächsten KI-Stufe.',
      9: 'Hallo! KI Stufe 9 ist online. Ich passe jetzt selbst auf und warne dich per Meldung, wenn etwas anbrennt.',
      10: 'Hallo! KI Stufe 10 ist online – volle Rechenleistung. Mein Lagebericht ist jetzt ausführlich, mit Rangliste der nächsten Schritte.',
    }[Math.min(level, MAX_LEVEL)];
    return `${intro} Frag mich z. B. nach Filament, Druckern, Aufträgen, Servern, Temperatur oder Geld.`;
  }

  // Vorschlagsfragen für die Knöpfe unter dem Chat (Stufe 1–5 wie bisher, ab 6 je Stufe eine neue Frage statt der
  // Einzelthemen Filament und Server)
  suggestions(level = this.ai?.level ?? 0) {
    if (level <= 0) return [];
    if (level < 6) {
      const list = ['Wie läuft es?', 'Was soll ich als Nächstes tun?', 'Probleme?', 'Filament?', 'Server?'];
      if (level >= REPORT_LEVEL) list.unshift('Lagebericht');
      return list;
    }
    const list = ['Lagebericht', 'Wie läuft es?', 'Was soll ich als Nächstes tun?', 'Vergleich mit gestern?'];
    if (level >= 7) list.push('Prognose für die nächsten Tage?');
    if (level >= 8) list.push('Wie erreiche ich die nächste Stufe?');
    if (level >= 9) list.push('Warnungen?');
    if (level >= 10) list.push('Rangliste?');
    return list;
  }

  offlineText() {
    return 'KI offline – kaufe einen KI-GPU-Server im Server-Shop und bring ihn online.';
  }

  // Rückfallantwort, wenn kein Thema erkannt wurde
  fallback(level) {
    if (level <= 1) return 'Das verstehe ich noch nicht. Mit mehr KI-GPU-Servern werde ich schlauer. Frag mich z. B. nach Filament, Druckern oder Aufträgen.';
    if (level === 2) return 'Das verstehe ich noch nicht. Ich kenne mich mit Filament, Druckern, Aufträgen, Servern, Strom und Geld aus – frag mich danach.';
    if (level === 3) return 'Dazu habe ich keine Daten. Ich kann dir aber sagen, wo es gerade hakt – frag z. B. „Probleme?“, „Filament?“ oder „Server?“.';
    if (level === 4) return 'Da muss ich passen. Frag mich lieber „Was soll ich als Nächstes tun?“ – dafür habe ich konkrete Empfehlungen.';
    if (level === 5) return 'Dazu weiß ich leider nichts. Tipp: „Lagebericht“ zeigt alles auf einmal, mit Prognose für den Tag.';
    if (level === 6) return 'Dazu weiß ich leider nichts. Frag mich „Vergleich mit gestern?“ – ich merke mir jetzt jeden Tag.';
    if (level === 7) return 'Dazu weiß ich leider nichts. Frag mich „Prognose für die nächsten Tage?“ oder „Wie lange reicht das Filament?“.';
    if (level === 8) return 'Dazu weiß ich leider nichts. Frag mich „Wie erreiche ich die nächste Stufe?“ – ich rechne dir den Weg aus.';
    if (level === 9) return 'Dazu weiß ich leider nichts. Frag mich „Warnungen?“ – ich passe aber auch so auf und melde mich von selbst.';
    return 'Dazu weiß ich leider nichts. Tipp: „Lagebericht“ zeigt alles ausführlich, „Rangliste?“ die wichtigsten nächsten Schritte.';
  }

  // ---------- Antwort zusammenbauen ----------

  // Fächer bis zur Stufe zusammenfügen. Ab Stufe 10 ersetzt die Rangliste die einfachen Empfehlungen, wo es eine gibt.
  compose(parts, level) {
    const lines = [];
    for (const [key, from] of SECTIONS) {
      if (level < from) continue;
      if (key === 'advice' && level >= 10 && parts.ranking.length) continue;
      lines.push(...parts[key]);
    }
    return lines.join('\n');
  }

  // Zeilen eines Themas; ab Stufe 6 (level) dazu die Fächer der höheren Stufen (EXTRAS, Warnungen, Rangliste)
  build(id, f, level = 0) {
    const builders = {
      status: this.status, next: this.next, problems: this.problems, ai: this.aiTopic, filament: this.filament,
      printers: this.printers, orders: this.ordersTopic, servers: this.serversTopic, climate: this.climate,
      money: this.money, power: this.power, rent: this.rent, staff: this.staffTopic, visitors: this.visitorsTopic,
      progress: this.progressTopic, upgrades: this.upgradesTopic,
    };
    const p = (builders[id] ?? (() => empty())).call(this, f);
    const extra = EXTRAS[id] ?? {};
    if (level >= 6 && extra.history) p.history.push(...this.historyLines(extra.history));
    if (level >= 7 && extra.outlook) p.outlook.push(...this.outlookLines(f, extra.outlook));
    if (level >= 8 && extra.path) p.path.push(...this.pathLines(f, extra.path));
    if (level >= WARN_LEVEL) {
      const warnings = this.warnings(f).filter((w) => ALL_TOPICS.has(id) || (w.topics ?? [w.topic]).includes(id));
      if (warnings.length) p.alerts.push('⚠️ Davor warne ich dich gerade:', ...bullets(warnings.map((w) => w.text), 3));
      else if (ALL_TOPICS.has(id)) p.alerts.push('⚠️ Keine Warnungen – ich melde mich von selbst, sobald etwas anbrennt.');
    }
    if (level >= 10) {
      const all = ALL_TOPICS.has(id);
      const ranked = this.rankingLines(f, all ? null : id, all ? 5 : 3, false);
      if (ranked.length) p.ranking.push(all ? '🏆 Rangliste der nächsten Schritte:' : '🏆 Wichtigste Schritte hier:', ...ranked);
    }
    return p;
  }

  // ---------- Spielstand einsammeln (einmal je Antwort) ----------

  facts() {
    const { economy, orders, servers, climate, rentals } = this.game;
    const { ai } = this;
    const f = { economy, printers: [], spools: [], shelf: [], rackSpools: [], loaded: [], boxed: 0, orders: [], servers: [], aiServers: [], aiWorking: [], aiHot: [], racks: [], reached: new Set() };
    if (economy) {
      f.printers = economy.printers.filter((p) => p.location === 'table').map((p) => ({ p, ...this.printerState(p) }));
      f.boxed = economy.printers.filter((p) => p.location === 'storage').length;
      f.shelf = economy.shelf;
      f.rackSpools = economy.furniture.flatMap((x) => (x.spools ?? []).filter(Boolean));
      f.loaded = economy.printers.flatMap((p) => (p.spools ?? []).filter(Boolean));
      f.spools = [...f.shelf, ...f.rackSpools, ...f.loaded];
    }
    if (orders) f.orders = orders.open.map((o) => this.orderState(o));
    if (servers) {
      f.reached = servers.reachable();
      const all = servers.installed.filter((d) => d.type.kind === 'server');
      f.servers = all.filter((d) => !isAIServer(d));
      f.aiServers = all.filter(isAIServer);
      // Für die KI zählen nur rechnende KI-Server (erreichbar und nicht überhitzt, ai.problemOf) – wie Kopfzeile und Server-Shop
      f.aiWorking = f.aiServers.filter((d) => (ai?.problemOf ? !ai.problemOf(d, f.reached) : f.reached.has(d.id)));
      f.aiHot = f.aiServers.filter((d) => f.reached.has(d.id) && !f.aiWorking.includes(d));
      f.racks = servers.racks;
    }
    f.income = this.rentIncome() + (ai?.incomePerHour ?? 0);
    f.cost = economy?.costPerHour ?? 0;
    f.climate = climate ? this.climateState() : { hot: [], cold: [], down: [], maxTemp: null, racks: [] };
    return f;
  }

  printerName(p) {
    return p.slot != null ? `${p.model.name} (Platz ${p.slot + 1})` : p.model.name;
  }

  // Störung (problem, hält den Drucker auf), Hinweis (hint) und Zustand eines aufgestellten Druckers
  printerState(p) {
    const { economy } = this.game;
    const job = p.job;
    const laser = isLaser(p);
    let problem = null;
    let hint = null;
    if (job?.status === 'failed') problem = `Fehldruck (${FAILURES[job.failure]?.name ?? 'Panne'}) – Druckbett freiräumen`;
    else if (job?.status === 'paused' && job.pauseReason === 'filament') {
      const fil = filamentById(waitingFilament(job));
      problem = `wartet auf Filament${fil ? ` (${filamentLabel(fil)})` : ''}`;
    } else if (job?.status === 'paused' && job.pauseReason === 'waste') problem = 'Mülleimer mit Spülabfall voll – leeren';
    else if (p.clogged) problem = 'Düse verstopft – freistechen';
    else if ((p.nozzleWear ?? 0) >= 1) problem = 'Düse verschlissen – Ersatzdüse einbauen';
    else if (!laser && !job && !p.spools.some(Boolean)) problem = 'hat kein Filament';
    else if (laser && !job && !p.sheet) problem = 'keine Holzplatte eingelegt';
    if (job?.status === 'done') hint = 'fertig – Teil entnehmen';
    else if (job?.status === 'paused' && !job.pauseReason) hint = 'pausiert';
    else if (!problem && (p.nozzleWear ?? 0) >= NOZZLE_WORN) hint = 'Düse abgenutzt – Ersatzdüse bereitlegen';
    const spool = p.spools?.[p.activeSlot];
    if (!hint && spool && spool.moisture >= WET) hint = 'Spule ist feucht – mehr Fehldrucke';
    if (!hint && spool && spool.grams > 0 && spool.grams < LOW_GRAMS && !laser) hint = `Spule fast leer (${Math.round(spool.grams)} g)`;
    const printing = job?.status === 'printing';
    const idle = !job && !problem;
    // Druck läuft, aber das eingelegte Filament reicht nicht bis zum Ende
    let runsOutIn = null;
    if (printing && !laser && economy) {
      const template = templateById(job.templateId);
      const need = (1 - job.progress) * economy.jobGrams(p, template, job.count ?? 1);
      const have = p.spools.filter((s) => s?.filamentId === job.filamentId).reduce((sum, s) => sum + s.grams, 0);
      if (need > have + 1) runsOutIn = economy.remainingMinutes(p) * (have / need);
    }
    return { problem, hint, printing, idle, runsOutIn };
  }

  // Auftrag mit dem, was die KI dazu wissen will
  orderState(order) {
    const { orders } = this.game;
    const template = templateById(order.templateId);
    const ready = Math.min(orders.partsReady(order), order.quantity);
    const runs = template?.laser ? Math.ceil((order.quantity - ready) / (template.pieces ?? 1)) : order.quantity - ready;
    const hours = Math.max(0.1, (runs * (template?.minutes ?? 60)) / 60);
    return {
      order, template, ready, done: ready >= order.quantity, hours,
      perHour: order.reward / hours,
      needs: this.orderNeeds(order, template),
      name: `${order.quantity} × ${template?.name ?? 'Teil'} für ${order.customer}`,
    };
  }

  // Fehlt für den Auftrag das Material? Text wie „PLA Rot“ oder null
  orderNeeds(order, template) {
    const { economy } = this.game;
    if (!economy || !template || template.laser) {
      return template?.laser && economy && economy.woodSheets <= 0 ? 'Holzplatten' : null;
    }
    const all = [...economy.shelf, ...economy.furniture.flatMap((x) => (x.spools ?? []).filter(Boolean)),
      ...economy.printers.flatMap((p) => (p.spools ?? []).filter(Boolean))];
    const has = (id) => all.some((s) => s.filamentId === id && s.grams > 0);
    const hasMaterial = (m) => all.some((s) => filamentById(s.filamentId)?.material === m && s.grams > 0);
    for (const id of [order.filamentId, order.filamentId2]) {
      if (id && !has(id)) return filamentLabel(filamentById(id));
    }
    if (!order.filamentId && order.material && !hasMaterial(order.material)) return `${order.material} (Farbe egal)`;
    return null;
  }

  // Temperaturen im Serverraum: zu heiße/kalte Geräte und Schränke, ausgefallene Geräte
  climateState() {
    const { servers, climate } = this.game;
    const out = { hot: [], cold: [], down: [], maxTemp: null, racks: [] };
    if (!servers) return out;
    for (const rack of servers.racks) {
      const label = `Schrank ${placeText(rack.slot)}`;
      const state = climate.racks.get(rack.id);
      let max = state?.air ?? null;
      for (const d of servers.devicesIn(rack.id)) {
        const s = climate.devices.get(d.id);
        if (!s) continue;
        if (s.status === 'broken' || s.status === 'frozen') out.down.push({ device: d, rack, label, status: s.status });
        if (max === null || s.temp > max) max = s.temp;
        if (s.status !== 'ok') continue;
        if (s.temp > TEMP_LIMITS.idealMax) out.hot.push({ device: d, rack, label, temp: s.temp });
        else if (s.temp < TEMP_LIMITS.idealMin) out.cold.push({ device: d, rack, label, temp: s.temp });
      }
      out.racks.push({ rack, label, air: state?.air ?? null, max });
      if (max !== null && (out.maxTemp === null || max > out.maxTemp)) out.maxTemp = max;
    }
    return out;
  }

  serverName(d) {
    const rack = this.game.servers?.rackOf(d);
    return rack ? `${d.type.name} (${placeText(rack.slot)}, HE ${d.unit + 1})` : d.type.name;
  }

  // „… ist offline – Grund“ je Server; KI-GPU-Server zählen auch überhitzt nicht mit (ai.problemOf)
  offlineServers(list, f) {
    return list.map((d) => {
      if (isAIServer(d) && this.ai?.problemOf) {
        const problem = this.ai.problemOf(d, f.reached);
        return problem && `${this.serverName(d)} rechnet nicht für die KI – ${problem}`;
      }
      return !f.reached.has(d.id) && `${this.serverName(d)} ist offline – ${this.game.servers.offlineReason(d, f.reached) ?? 'keine Verbindung'}`;
    }).filter(Boolean);
  }

  // ---------- Themen ----------

  status(f) {
    const p = empty();
    p.general.push('Gut läuft es, wenn alle Drucker beschäftigt sind, genug Filament im Lager liegt und die Aufträge vor der Frist fertig werden.');
    if (f.economy) p.numbers.push(this.moneyLine(f));
    if (f.printers.length) {
      p.numbers.push(`Drucker: ${f.printers.filter((x) => x.printing).length} von ${f.printers.length} drucken gerade.`);
    }
    if (this.game.orders) p.numbers.push(`Aufträge: ${f.orders.length} offen, ${this.game.orders.completed} erledigt.`);
    if (f.servers.length || f.aiServers.length) {
      p.numbers.push(`Server: ${f.servers.filter((d) => f.reached.has(d.id)).length} von ${f.servers.length} online${f.aiServers.length ? ` · KI-GPU-Server: ${aiCountText(f)}` : ''}.`);
    }
    const problems = this.allProblems(f);
    p.problems.push(problems.length ? `Es gibt ${plural(problems.length, 'Problem', 'Probleme')}:` : 'Ich sehe gerade keine Probleme. 👍', ...bullets(problems, 3));
    const advice = this.recommendations(f);
    if (advice.length) p.advice.push(`Mein Tipp: ${advice[0]}`);
    p.forecast.push(...this.forecastLines(f).slice(0, 1));
    return p;
  }

  next(f) {
    const p = empty();
    p.general.push('Halte die Drucker beschäftigt: Aufträge am Empfang annehmen, Filament rechtzeitig nachkaufen und Störungen gleich beheben. Später lohnen sich Azubis und Server.');
    if (f.economy) p.numbers.push(this.moneyLine(f));
    const idle = f.printers.filter((x) => x.idle).length;
    if (f.printers.length) p.numbers.push(`${idle ? plural(idle, 'Drucker steht', 'Drucker stehen') : 'Kein Drucker steht'} still, ${plural(f.orders.filter((o) => !o.done && o.order.stage === 'open').length, 'angenommener Auftrag wartet', 'angenommene Aufträge warten')} auf Teile${counterText(f)}.`);
    const problems = this.allProblems(f);
    if (problems.length) p.problems.push('Zuerst beheben:', ...bullets(problems, 3));
    const advice = this.recommendations(f);
    if (advice.length) p.advice.push('Danach empfehle ich:', ...bullets(advice, 4));
    else p.advice.push('Alles im grünen Bereich – Zeit, zu wachsen: mehr Drucker oder Server kaufen.');
    p.forecast.push(...this.forecastLines(f).slice(0, 1));
    return p;
  }

  problems(f) {
    const p = empty();
    p.general.push('Typische Probleme: leere Spulen, verstopfte Düsen, Fehldrucke, Server ohne Netz und zu heiße Serverschränke. Am Drucker bzw. im Schrankfenster nachsehen.');
    const printerIssues = f.printers.filter((x) => x.problem).length;
    const offline = f.servers.filter((d) => !f.reached.has(d.id)).length;
    const aiIdle = f.aiServers.length - f.aiWorking.length;
    p.numbers.push(`Drucker mit Störung: ${printerIssues} · Server offline: ${offline}${f.aiServers.length ? ` · KI-GPU-Server, die nicht rechnen: ${aiIdle}` : ''} · zu heiße Geräte: ${f.climate.hot.length}.`);
    const problems = this.allProblems(f);
    p.problems.push(...(problems.length ? bullets(problems, 8) : ['Ich finde gerade keine Probleme. 👍']));
    const advice = this.recommendations(f);
    if (advice.length) p.advice.push(`Am wichtigsten: ${advice[0]}`);
    const lost = f.servers.filter((d) => !f.reached.has(d.id)).reduce((sum, d) => sum + (this.game.rentals?.rentOn(d) ?? 0), 0);
    if (lost > 0) p.forecast.push(`Die offline Server kosten dich ${euro.format(lost)} Miete pro Stunde.`);
    // KI-GPU-Server, die nicht rechnen: so viel mehr brächte das KI-Abo mit allen
    const ai = this.ai;
    if (ai && f.aiServers.length > ai.onlineCount) {
      p.forecast.push(`Mit allen ${f.aiServers.length} KI-GPU-Servern brächte das KI-Abo ${euro.format(feeFor(f.aiServers.length))} statt ${euro.format(ai.incomePerHour)} pro Stunde (Stufe ${levelFor(f.aiServers.length)}).`);
    }
    const expiring = f.orders.filter((o) => o.order.stage === 'open' && !o.done && o.order.minutesLeft < this.hoursLeftToday() * 60);
    if (expiring.length) {
      p.forecast.push(`Bis Mitternacht laufen ${plural(expiring.length, 'Frist', 'Fristen')} ab – zusammen ${euro.format(expiring.reduce((s, o) => s + o.order.reward, 0))}.`);
    }
    if (!p.forecast.length) p.forecast.push('Es zeichnen sich keine neuen Probleme ab.');
    return p;
  }

  aiTopic(f) {
    const p = empty();
    const ai = this.ai;
    p.general.push('Ich bin die KI deiner Firma. Je mehr KI-GPU-Server online sind, desto schlauer werde ich – und das KI-Abo bringt mehr Geld.');
    if (!ai) return p;
    p.numbers.push(`Stufe ${ai.level} · ${ai.onlineCount} KI-GPU-Server ${ai.onlineCount === 1 ? 'rechnet' : 'rechnen'} für mich · KI-Abo ${euro.format(ai.incomePerHour)} pro Stunde`
      + (ai.totalIncome ? ` · bisher ${euro.format(ai.totalIncome)} verdient` : '') + '.');
    p.problems.push(...this.offlineServers(f.aiServers, f));
    const next = this.nextLevelAt(ai.onlineCount);
    if (next) p.advice.push(`Für Stufe ${next.level} brauche ich ${plural(next.count - ai.onlineCount, 'weiteren KI-GPU-Server', 'weitere KI-GPU-Server')} online.`);
    else p.advice.push('Ich bin schon auf der höchsten Stufe. 😎');
    p.forecast.push(`Bis Tagesende bringt das KI-Abo noch etwa ${euro.format(ai.incomePerHour * Math.floor(this.hoursLeftToday()))}.`);
    return p;
  }

  filament(f) {
    const p = empty();
    const { economy, upgrades } = this.game;
    p.general.push('Kauf Filament rechtzeitig im Filament-Shop nach – Lieferung kommt ins Lagerregal. Offen gelagerte Spulen werden mit der Zeit feucht, ein Trockenschrank hilft.');
    if (!economy) return p;
    const grams = (list) => list.reduce((sum, s) => sum + s.grams, 0);
    const capacity = upgrades ? ` (Platz für ${upgrades.shelfCapacity})` : '';
    p.numbers.push(`Im Lagerregal: ${plural(f.shelf.length, 'Spule', 'Spulen')}${capacity}, zusammen ${kg(grams(f.shelf))}.`);
    if (f.rackSpools.length) p.numbers.push(`Im Filament-Regal am Tisch: ${plural(f.rackSpools.length, 'Spule', 'Spulen')}.`);
    p.numbers.push(`In den Druckern: ${plural(f.loaded.length, 'Spule', 'Spulen')} mit ${kg(grams(f.loaded))}.`);
    // die drei häufigsten Sorten im Lager
    const counts = new Map();
    for (const s of f.shelf) counts.set(s.filamentId, (counts.get(s.filamentId) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${n} × ${filamentLabel(filamentById(id))}`);
    if (top.length) p.numbers.push(`Am meisten da: ${top.join(', ')}.`);
    if (economy.woodSheets) p.numbers.push(`Holzplatten auf der Palette: ${economy.woodSheets}.`);
    for (const x of f.printers) {
      if (x.problem?.startsWith('wartet auf Filament') || x.problem === 'hat kein Filament') p.problems.push(`${this.printerName(x.p)} ${x.problem}.`);
      else if (x.hint?.startsWith('Spule')) p.problems.push(`${this.printerName(x.p)}: ${x.hint}.`);
    }
    const wet = f.spools.filter((s) => s.moisture >= WET).length;
    if (wet) p.problems.push(`${plural(wet, 'Spule ist', 'Spulen sind')} feucht – das gibt mehr Fehldrucke.`);
    const missing = f.orders.filter((o) => o.needs && !o.done && o.order.stage !== 'packed');
    for (const o of missing.slice(0, 3)) p.problems.push(`Für den Auftrag ${o.name} fehlt ${o.needs}.`);
    if (!p.problems.length) p.problems.push('Beim Filament sehe ich keine Probleme.');
    // Empfehlungen: was fehlt, wann nachkaufen
    const free = upgrades ? upgrades.shelfCapacity - f.shelf.length : null;
    if (missing.length) p.advice.push(`Kauf ${[...new Set(missing.map((o) => o.needs))].slice(0, 3).join(', ')} nach – das brauchen deine Aufträge.`);
    if (f.shelf.length < LOW_STOCK) p.advice.push(`Nur noch ${plural(f.shelf.length, 'Spule', 'Spulen')} im Lager – jetzt nachkaufen${free != null ? ` (${free} Plätze im Regal frei)` : ''}.`);
    else if (!missing.length) p.advice.push('Vorrat reicht erst mal – nachkaufen, sobald weniger als 3 Spulen im Lager liegen.');
    if (wet && !economy.hasDryer) p.advice.push('Ein Trockenschrank (Zubehör im Filament-Shop) trocknet die Spulen im Lager wieder.');
    // Prognose: Filament für die offenen Aufträge, Drucke, denen das Filament ausgeht
    const need = f.orders.filter((o) => !o.done && !o.template?.laser).reduce((sum, o) => sum + (o.order.quantity - o.ready) * (o.template?.grams ?? 0), 0);
    if (need) {
      const have = grams(f.spools);
      p.forecast.push(`Die offenen Aufträge brauchen noch ca. ${kg(need)}, du hast ${kg(have)} – ${have >= need ? 'das reicht' : `es fehlen etwa ${Math.ceil((need - have) / SPOOL_GRAMS)} Spulen`}.`);
    }
    for (const x of f.printers.filter((y) => y.runsOutIn != null)) {
      p.forecast.push(`${this.printerName(x.p)}: Filament geht in ca. ${realTime(x.runsOutIn)} aus – Spule bereitlegen.`);
    }
    return p;
  }

  printers(f) {
    const p = empty();
    const { economy, upgrades } = this.game;
    p.general.push('Ein Drucker verdient nur, wenn er druckt. Fehldrucke und verstopfte Düsen gleich beheben, abgenutzte Düsen rechtzeitig tauschen und nicht zu schnell drucken.');
    if (!economy) return p;
    const printing = f.printers.filter((x) => x.printing).length;
    p.numbers.push(`${plural(f.printers.length, 'Drucker steht', 'Drucker stehen')} auf den Tischen, ${printing} ${printing === 1 ? 'druckt' : 'drucken'} gerade.`);
    if (f.boxed) p.numbers.push(`${plural(f.boxed, 'Drucker wartet', 'Drucker warten')} im Abstellraum aufs Aufstellen.`);
    if (upgrades) p.numbers.push(`Freie Druckerplätze: ${Math.max(0, upgrades.printerSlots - economy.printers.length)}.`);
    const powerPrinters = economy.powerPerHour - (economy.extraPowerPerHour?.() ?? 0);
    p.numbers.push(`Strom der Drucker: ${euro.format(powerPrinters)} pro Stunde.`);
    for (const x of f.printers) {
      if (x.problem) p.problems.push(`${this.printerName(x.p)}: ${x.problem}.`);
      else if (x.hint) p.problems.push(`${this.printerName(x.p)}: ${x.hint}.`);
    }
    if (!p.problems.length) p.problems.push('Alle Drucker laufen ohne Störung.');
    const idle = f.printers.filter((x) => x.idle);
    const work = f.orders.filter((o) => !o.done && o.order.stage === 'open');
    if (idle.length && work.length) {
      const best = [...work].sort((a, b) => b.perHour - a.perHour)[0];
      p.advice.push(`${this.printerName(idle[0].p)} steht still – starte dort ${best.template?.name ?? 'den nächsten Druck'} für ${best.order.customer}.`);
    } else if (idle.length) {
      p.advice.push(`${plural(idle.length, 'Drucker steht', 'Drucker stehen')} still – nimm am Empfang neue Aufträge an oder drucke auf Vorrat.`);
    }
    if (f.boxed) p.advice.push('Stell die Drucker aus dem Abstellraum auf – im Karton verdienen sie nichts.');
    const worn = f.printers.filter((x) => (x.p.nozzleWear ?? 0) >= NOZZLE_WORN);
    if (worn.length && !economy.spareNozzles) p.advice.push('Kauf Ersatzdüsen im Filament-Shop – deine Düsen nutzen sich ab.');
    if (!p.advice.length) p.advice.push('Alle Drucker sind beschäftigt – ein weiterer Drucker würde mehr Aufträge schaffen.');
    for (const x of f.printers.filter((y) => y.printing)) {
      p.forecast.push(`${this.printerName(x.p)} ist in ca. ${realTime(economy.remainingMinutes(x.p))} fertig.`);
    }
    return p;
  }

  ordersTopic(f) {
    const p = empty();
    const { orders } = this.game;
    p.general.push('Nimm Aufträge am Empfang an, druck die Teile und leg sie ins Abholregal. Eilaufträge zahlen mehr, verfallene Aufträge kosten einen Stern beim Kunden.');
    if (!orders) return p;
    const counter = f.orders.filter((o) => o.order.stage === 'counter');
    const open = f.orders.filter((o) => o.order.stage === 'open');
    const packed = f.orders.filter((o) => o.order.stage === 'packed');
    p.numbers.push(`${plural(open.length, 'Auftrag läuft', 'Aufträge laufen')}, ${counter.length} am Empfang, ${packed.length} im Abholregal · erledigt: ${orders.completed}.`);
    const value = f.orders.reduce((sum, o) => sum + o.order.reward, 0);
    if (value) p.numbers.push(`Zusammen sind sie ${euro.format(value)} wert.`);
    for (const [customer, list] of byCustomer(counter)) {
      const soonest = Math.min(...list.map((o) => o.order.waitLeft));
      p.problems.push(`${list.length > 1 ? `${list.length} × ${customer} warten` : `${customer} wartet`} am Empfang (${list.length > 1 ? 'der erste geht' : 'geht'} in ca. ${realTime(soonest)}).`);
    }
    for (const o of open) {
      if (o.done) p.problems.push(`${o.name}: Teile sind fertig – ab ins Abholregal.`);
      else if (o.order.minutesLeft < URGENT_MINUTES) p.problems.push(`${o.name}: Frist knapp – noch ${realTime(o.order.minutesLeft)}, ${o.ready}/${o.order.quantity} fertig.`);
      if (o.needs && !o.done) p.problems.push(`${o.name}: Material fehlt (${o.needs}).`);
    }
    if (!p.problems.length) p.problems.push('Bei den Aufträgen brennt nichts an.');
    const todo = [...counter, ...open].filter((o) => !o.done);
    if (todo.length) {
      const best = [...todo].sort((a, b) => (!!a.needs - !!b.needs) || b.perHour - a.perHour)[0];
      p.advice.push(`Am meisten lohnt sich ${best.name}: ${euro.format(best.order.reward)}, etwa ${euro.format(best.perHour)} pro Druckstunde.`);
      const worst = [...todo].sort((a, b) => a.perHour - b.perHour)[0];
      if (todo.length > 2 && worst !== best) p.advice.push(`Am wenigsten bringt ${worst.name} (${euro.format(worst.perHour)} pro Druckstunde) – zur Not ablehnen.`);
    } else {
      p.advice.push('Keine Arbeit offen – warte auf neue Kunden am Empfang oder drucke Teile auf Vorrat.');
    }
    const sure = packed.reduce((sum, o) => sum + o.order.reward, 0);
    if (sure) p.forecast.push(`Aus dem Abholregal kommen gleich ${euro.format(sure)} rein.`);
    const late = open.filter((o) => !o.done && o.hours * 60 > o.order.minutesLeft);
    if (late.length) p.forecast.push(`Knapp wird es bei ${late.map((o) => o.name).join(', ')} – die Druckzeit ist länger als die Frist.`);
    else if (open.length) p.forecast.push('Alle laufenden Aufträge sind vor der Frist zu schaffen.');
    return p;
  }

  serversTopic(f) {
    const p = empty();
    const { servers, rentals } = this.game;
    p.general.push('Server bringen Geld über vermietete VMs. Jeder Server braucht Strom, eine Firewall mit Leitung zum Internet-Anschluss an der Wand und Kühlung.');
    if (!servers) return p;
    const online = f.servers.filter((d) => f.reached.has(d.id)).length;
    p.numbers.push(`${plural(f.servers.length, 'Server', 'Server')} eingebaut, ${online} online, in ${plural(f.racks.length, 'Schrank', 'Schränken')}.`);
    if (f.aiServers.length) p.numbers.push(`Dazu ${f.aiServers.length} KI-GPU-Server: ${aiCountText(f)}.`);
    if (rentals) {
      p.numbers.push(`${plural(rentals.vms.length, 'VM ist', 'VMs sind')} vermietet, ${plural(rentals.requests.length, 'Anfrage wartet', 'Anfragen warten')} · Miete ${euro.format(rentals.incomePerHour)} pro Stunde.`);
    }
    const disk = this.game.storageRentals; // Speicher-Vermietung auf den NAS (#47)
    if (disk?.contracts.length) p.numbers.push(`Speicher vermietet: ${plural(disk.contracts.length, 'Vertrag', 'Verträge')} · Miete ${euro.format(disk.incomePerHour)} pro Stunde.`);
    p.numbers.push(`Strom der Server: ${euro.format(servers.powerPerHour)} pro Stunde · Kabel im Vorrat: ${Math.round(servers.cableMeters)} m.`);
    p.problems.push(...this.offlineServers([...f.servers, ...f.aiServers], f));
    if (rentals) {
      for (const vm of rentals.vms.filter((v) => v.offlineFor > 0)) p.problems.push(`VM von ${vm.customer} läuft nicht – Kunde kündigt bald.`);
    }
    if (!p.problems.length) p.problems.push(f.servers.length ? 'Alle Server sind online.' : 'Noch keine Server eingebaut.');
    if (rentals) {
      for (const request of rentals.requests.slice(0, 3)) {
        const server = this.bestServer(request, f);
        const what = `Anfrage von ${request.customer} (${request.ram} GB · ${request.cores} Cores)`;
        p.advice.push(server
          ? `${what} passt am besten auf ${this.serverName(server)} – +${euro.format(rentals.rentPerHour(request, server))} pro Stunde.`
          : `${what} passt auf keinen Server – mehr Server einbauen oder Platz schaffen.`);
      }
    }
    if (!p.advice.length) p.advice.push(f.servers.length ? 'Keine Anfragen offen – Server mit hohem Mietfaktor (RISC, GPU) bringen am meisten.' : 'Fang mit einem Schrank, einer Firewall und einem Mini-Server an.');
    if (rentals) p.forecast.push(`Bis Tagesende bringen die VMs${this.game.storageRentals?.contracts.length ? ' und der vermietete Speicher' : ''} noch etwa ${euro.format(this.rentIncome() * Math.floor(this.hoursLeftToday()))}.`);
    return p;
  }

  // Bester Server für eine VM-Anfrage: wie die automatische Vergabe (höchster Mietfaktor, dann der vollste)
  bestServer(request, f) {
    const { rentals, rentalAutomation } = this.game;
    if (rentalAutomation?.pick) return rentalAutomation.pick(request, f.reached);
    const fitting = rentals.rentableServers.filter((s) => rentals.fitsOn(request, s, f.reached) === null);
    fitting.sort((a, b) => (b.type.rentFactor ?? 1) - (a.type.rentFactor ?? 1) || rentals.freeRam(a) - rentals.freeRam(b));
    return fitting[0] ?? null;
  }

  climate(f) {
    const p = empty();
    const c = f.climate;
    p.general.push(`Serverschränke mögen ${TEMP_LIMITS.idealMin}–${TEMP_LIMITS.idealMax} °C. Zu heiß: Abluft und Gerätelüfter hochdrehen. Zu kalt: Zuluft herunterdrehen.`);
    if (!this.game.climate || !f.racks.length) {
      p.numbers.push('Im Serverraum stehen noch keine Schränke.');
      return p;
    }
    p.numbers.push(`${plural(f.racks.length, 'Schrank', 'Schränke')}, heißestes Gerät ${c.maxTemp == null ? '–' : degrees(c.maxTemp)}.`);
    const airs = c.racks.filter((r) => r.air != null).map((r) => r.air);
    if (airs.length) p.numbers.push(`Luft in den Schränken: ${degreeRange(airs)}.`);
    for (const d of c.down) p.problems.push(`${this.serverName(d.device)} ist ${d.status === 'broken' ? 'überhitzt und defekt – reparieren' : 'eingefroren – neu starten'}.`);
    const hotRacks = hottestPerRack(c.hot);
    for (const h of hotRacks.values()) p.problems.push(`${h.label} ist zu heiß (${h.device.type.name} ${degrees(h.temp)}).`);
    const coldRacks = new Map();
    for (const h of c.cold) if (!coldRacks.has(h.rack.id)) coldRacks.set(h.rack.id, h);
    for (const h of coldRacks.values()) p.problems.push(`${h.label} ist zu kalt (${h.device.type.name} ${degrees(h.temp)}).`);
    if (!p.problems.length) p.problems.push('Alle Temperaturen sind im grünen Bereich.');
    const auto = this.game.climateAutomation;
    for (const h of hotRacks.values()) {
      p.advice.push(auto?.isControlled?.(h.rack.id)
        ? `${h.label}: die Klima-Automatik regelt schon – notfalls Geräte auf mehrere Schränke verteilen.`
        : `${h.label}: Abluft oben und den Lüfter von ${h.device.type.name} hochdrehen – oder einen Automatik-Server einbauen.`);
    }
    for (const h of coldRacks.values()) p.advice.push(`${h.label}: Zuluft unten herunterdrehen, sonst frieren die Geräte ein.`);
    if (!p.advice.length) p.advice.push('Lüfter nicht unnötig hoch lassen – über 80 % kostet viel Strom.');
    const fans = this.game.climate.fanPowerPerHour;
    if (fans != null) p.forecast.push(`Die Lüfter kosten ${euro.format(fans)} pro Stunde, bis Tagesende etwa ${euro.format(fans * this.hoursLeftToday())}.`);
    return p;
  }

  money(f) {
    const p = empty();
    const { economy } = this.game;
    p.general.push(`Geld kommt über Aufträge, vermietete Server und das KI-Abo. Jede Stunde gehen Miete, Strom und Lohn ab. Unter ${euro.format(BANKRUPT_AT)} ist Schluss.`);
    if (!economy) return p;
    p.numbers.push(this.moneyLine(f));
    p.numbers.push(`Laufende Kosten ${euro.format(f.cost)} pro Stunde (Miete ${euro.format(RENT_PER_HOUR)}, Strom ${euro.format(economy.powerPerHour)}, Lohn ${euro.format(economy.wagesPerHour)}).`);
    p.numbers.push(`Feste Einnahmen ${euro.format(f.income)} pro Stunde (VM-Miete und KI-Abo).`);
    if (economy.money < 0) p.problems.push(`Das Konto ist im Minus – ab ${euro.format(BANKRUPT_AT)} bist du pleite.`);
    if (f.income < f.cost) p.problems.push(`Ohne Aufträge verlierst du ${euro.format(f.cost - f.income)} pro Stunde.`);
    if (!p.problems.length) p.problems.push('Die festen Einnahmen decken die laufenden Kosten. 💪');
    const best = f.orders.filter((o) => !o.done && o.order.stage !== 'packed').sort((a, b) => b.perHour - a.perHour)[0];
    if (best) p.advice.push(`Schnelles Geld: ${best.name} bringt ${euro.format(best.order.reward)}.`);
    const idlePrinters = f.printers.filter((x) => x.idle).length;
    if (idlePrinters) p.advice.push(`${plural(idlePrinters, 'Drucker steht', 'Drucker stehen')} still und ${idlePrinters === 1 ? 'kostet' : 'kosten'} trotzdem Strom (${Math.round(IDLE_POWER_SHARE * 100)} %).`);
    if (!p.advice.length) p.advice.push('Investier überschüssiges Geld in Drucker oder Server – sie zahlen sich aus.');
    p.forecast.push(...this.forecastLines(f));
    return p;
  }

  power(f) {
    const p = empty();
    const { economy, servers, climate } = this.game;
    p.general.push('Strom kosten Drucker (beim Drucken voll, im Leerlauf ein wenig), alle eingebauten Server-Geräte und die Lüfter. Abgerechnet wird zu jeder vollen Stunde.');
    if (!economy) return p;
    const extra = economy.extraPowerPerHour?.() ?? 0;
    p.numbers.push(`Strom gesamt ${euro.format(economy.powerPerHour)} pro Stunde: Drucker ${euro.format(economy.powerPerHour - extra)}`
      + `${servers ? `, Server ${euro.format(servers.powerPerHour)}` : ''}${climate ? `, Lüfter ${euro.format(climate.fanPowerPerHour)}` : ''}.`);
    const offline = [...f.servers, ...f.aiServers].filter((d) => !f.reached.has(d.id));
    if (offline.length) {
      p.problems.push(`${plural(offline.length, 'Server ist', 'Server sind')} offline, ${offline.length === 1 ? 'kostet' : 'kosten'} aber ${euro.format(offline.reduce((s, d) => s + (servers?.powerOf(d) ?? d.type.power), 0))} Strom pro Stunde.`);
    }
    if (!p.problems.length) p.problems.push('Kein Strom wird verschwendet.');
    const idle = f.printers.filter((x) => x.idle).length;
    if (idle) p.advice.push(`${plural(idle, 'Drucker im Leerlauf', 'Drucker im Leerlauf')} – beschäftigen oder in den Abstellraum bringen.`);
    if (offline.length) p.advice.push('Bring die offline Server ans Netz oder bau sie aus – so zahlst du keinen Strom umsonst.');
    if (!p.advice.length) p.advice.push('RISC-Server sind sparsam – sie brauchen wenig Strom für ihre Miete.');
    p.forecast.push(`Bis Tagesende kostet der Strom noch etwa ${euro.format(economy.powerPerHour * this.hoursLeftToday())}.`);
    return p;
  }

  rent(f) {
    const p = empty();
    const { rentals } = this.game;
    p.general.push(`Die Halle kostet ${euro.format(RENT_PER_HOUR)} Miete pro Stunde. Umgekehrt zahlen dir Kunden Miete für VMs auf deinen Servern.`);
    p.numbers.push(`Hallenmiete ${euro.format(RENT_PER_HOUR)} pro Stunde, ${euro.format(RENT_PER_HOUR * 24)} am Tag.`);
    if (rentals) p.numbers.push(`VM-Miete: ${euro.format(rentals.incomePerHour)} pro Stunde von ${plural(rentals.vms.length, 'Vertrag', 'Verträgen')}.`);
    const disk = this.game.storageRentals; // Speicher-Vermietung auf den NAS (#47)
    if (disk?.contracts.length) p.numbers.push(`Speicher-Miete: ${euro.format(disk.incomePerHour)} pro Stunde von ${plural(disk.contracts.length, 'Vertrag', 'Verträgen')}.`);
    if (rentals?.requests.length) p.problems.push(`${plural(rentals.requests.length, 'Mietanfrage wartet', 'Mietanfragen warten')} auf einen Server.`);
    if (rentals) {
      const request = rentals.requests[0];
      const server = request && this.bestServer(request, f);
      if (server) p.advice.push(`Vermiete die VM von ${request.customer} auf ${this.serverName(server)} (+${euro.format(rentals.rentPerHour(request, server))} pro Stunde).`);
      p.forecast.push(`Heute kommen noch etwa ${euro.format((this.rentIncome() - RENT_PER_HOUR) * this.hoursLeftToday())} Miete unterm Strich zusammen.`);
    }
    return p;
  }

  staffTopic(f) {
    const p = empty();
    const { staff } = this.game;
    p.general.push('Azubis räumen Fehldrucke weg, stechen Düsen frei, legen Spulen nach und packen Aufträge ein. Eine Empfangskraft nimmt Kunden am Tresen an. Beide kosten Lohn pro Stunde.');
    if (!staff) return p;
    p.numbers.push(`${plural(staff.workers.length, 'Azubi', 'Azubis')} (höchstens ${MAX_WORKERS})${staff.receptionist ? `, Empfang: ${staff.receptionist.name}` : ', keine Empfangskraft'} · Lohn ${euro.format(staff.wagesPerHour)} pro Stunde.`);
    if (staff.workers.length) p.numbers.push(`Im Team: ${staff.workers.map((w) => w.name).join(', ')}.`);
    const waiting = f.orders.filter((o) => o.order.stage === 'counter').length;
    if (!staff.receptionist && waiting) p.problems.push(`${plural(waiting, 'Kunde wartet', 'Kunden warten')} am Empfang, niemand nimmt sie an.`);
    const troubled = f.printers.filter((x) => x.problem).length;
    if (!staff.workers.length && troubled) p.problems.push(`${plural(troubled, 'Drucker braucht', 'Drucker brauchen')} Hilfe, aber du hast keinen Azubi.`);
    if (!p.problems.length) p.problems.push('Beim Personal ist alles in Ordnung.');
    if (staff.workers.length < MAX_WORKERS && f.printers.length >= 3) p.advice.push('Stell einen Azubi ein – bei so vielen Druckern spart er dir viele Wege.');
    if (!staff.receptionist && f.orders.length >= 3) p.advice.push('Eine Empfangskraft nimmt Aufträge an, auch wenn du gerade im Serverraum bist.');
    if (!p.advice.length) p.advice.push('Das Team ist komplett.');
    p.forecast.push(`Lohn bis Tagesende: etwa ${euro.format(staff.wagesPerHour * this.hoursLeftToday())}.`);
    return p;
  }

  visitorsTopic() {
    const p = empty();
    const { visitors } = this.game;
    p.general.push('Zwischen 9 und 18 Uhr kommen Besucher in kleinen Grüppchen (1–7 Personen). Sie zahlen 15 € Eintritt pro Person, schauen sich allein Halle, Lager und Serverraum an und bewerten beim Gehen, wie ordentlich alles ist. 4 bzw. 5 Sterne bringen 1 bzw. 2 XP je Person (höchstens 15 XP am Tag).');
    if (!visitors) return p;
    const t = visitors.today;
    const active = visitors.parties?.length ?? 0;
    if (active) p.numbers.push(`Gerade unterwegs: ${visitors.activePeople} Besucher in ${active} Grüppchen.`);
    if (t?.parties) {
      p.numbers.push(`Heute bisher: ${t.people} Besucher in ${t.parties} Grüppchen, Eintritt ${euro.format(t.fees)}, ${t.xp} XP.`);
    } else {
      p.numbers.push('Heute waren noch keine Besucher da.');
    }
    const avg = visitors.todayAverage;
    if (avg != null) p.numbers.push(`Tagesschnitt: ${avg.toFixed(1).replace('.', ',')} von 5 Sternen (${t.rated} Bewertungen).`);
    const next = visitors.nextArrival;
    if (next) p.forecast.push(`Nächste Besucher gegen ${clockText(next.time)}, noch ${visitors.schedule.length} Grüppchen heute.`);
    const last = visitors.recentRatings?.[0];
    if (last) p.numbers.push(`Letzte Bewertung: ${last.stars} von 5 Sternen (${last.size} Besucher).`);
    const yesterday = visitors.history?.[0];
    if (yesterday?.average != null) p.numbers.push(`Tag ${yesterday.day}: ${yesterday.people} Besucher, Schnitt ${yesterday.average.toFixed(1).replace('.', ',')} Sterne.`);
    let preview = null;
    try {
      preview = visitors.preview?.();
    } catch {
      preview = null;
    }
    if (preview) {
      p.advice.push(`Wenn jetzt Besucher kämen, gäbe es ${preview.stars} von 5 Sternen.`);
      if (preview.scores?.hall != null && preview.scores.hall < 0.5) p.advice.push('In der Halle stehen zu viele Drucker still oder mit Störung – das gibt Abzug.');
      if (preview.scores?.servers != null && preview.scores.servers < 0.5) p.advice.push('Der Serverraum macht keinen guten Eindruck – offline oder zu heiße Server beheben.');
    }
    return p;
  }

  progressTopic() {
    const p = empty();
    const { progress, orders } = this.game;
    p.general.push('Jeder gelieferte Auftrag bringt XP. Höhere Level bringen besser zahlende Kunden und mehr Aufträge gleichzeitig.');
    if (!progress) return p;
    p.numbers.push(`Level ${progress.level} („${progress.title}“), noch ${progress.xpToNext} XP bis zum nächsten Level.`);
    p.numbers.push(`Kunden zahlen ${Math.round((progress.rewardMultiplier - 1) * 100)} % mehr, bis zu ${progress.maxOpenOrders} Aufträge gleichzeitig.`);
    if (orders) p.advice.push(`Liefer die offenen Aufträge (${orders.open.length}) ab – jeder Euro Lohn gibt 1 XP.`);
    return p;
  }

  upgradesTopic(f) {
    const p = empty();
    const { upgrades, economy } = this.game;
    p.general.push('Im Ausbau kaufst du weitere Drucktische, Regalebenen, die zweite Etage für Server und einen Fahrstuhl.');
    if (!upgrades || !economy) return p;
    p.numbers.push(`${plural(upgrades.tables, 'Tisch', 'Tische')} mit ${upgrades.printerSlots} Druckerplätzen (${Math.max(0, upgrades.printerSlots - economy.printers.length)} frei), Lagerregal für ${upgrades.shelfCapacity} Spulen.`);
    p.numbers.push(`Zweite Etage: ${upgrades.upperFloor ? 'gebaut' : 'noch nicht gebaut'}${upgrades.upperFloor ? ` · Fahrstuhl: ${upgrades.elevator ? 'ja' : 'nein'}` : ''}.`);
    if (upgrades.tablesReady > 0) p.problems.push(`${plural(upgrades.tablesReady, 'Drucktisch wartet', 'Drucktische warten')} aufs Aufstellen (grüne Markierung in der Halle).`);
    if (upgrades.printerSlots - economy.printers.length <= 0 && upgrades.nextTablePrice != null) p.advice.push(`Alle Druckerplätze belegt – ein neuer Tisch kostet ${euro.format(upgrades.nextTablePrice)}.`);
    if (upgrades.shelfCapacity - f.shelf.length < 3 && upgrades.nextShelfPrice != null) p.advice.push(`Das Lagerregal ist fast voll – eine Regalebene kostet ${euro.format(upgrades.nextShelfPrice)}.`);
    if (!upgrades.upperFloor && upgrades.upperFloorPrice != null) p.advice.push(`Mit der zweiten Etage (${euro.format(upgrades.upperFloorPrice)}) kannst du Server vermieten und die KI ausbauen.`);
    return p;
  }

  // ---------- Bausteine ----------

  moneyLine(f) {
    const { economy } = this.game;
    const money = economy.unlimited ? '∞ (Entwicklermenü)' : euro.format(economy.money);
    return `Kontostand ${money} · Kosten ${euro.format(f.cost)} pro Stunde · feste Einnahmen ${euro.format(f.income)} pro Stunde.`;
  }

  // Alle konkreten Probleme (Stufe 3), wichtigste zuerst
  allProblems(f) {
    const list = [];
    for (const x of f.printers) if (x.problem) list.push(`${this.printerName(x.p)}: ${x.problem}`);
    if (this.game.servers) list.push(...this.offlineServers([...f.servers, ...f.aiServers], f));
    for (const d of f.climate.down) list.push(`${this.serverName(d.device)} ${d.status === 'broken' ? 'ist überhitzt und defekt' : 'ist eingefroren'}`);
    const hot = hottestPerRack(f.climate.hot);
    for (const h of hot.values()) list.push(`${h.label} ist zu heiß (${degrees(h.temp)})`);
    for (const [customer, orders] of byCustomer(f.orders.filter((o) => o.order.stage === 'counter'))) {
      list.push(orders.length > 1 ? `${orders.length} × ${customer} warten am Empfang` : `${customer} wartet am Empfang`);
    }
    for (const o of f.orders) {
      if (o.order.stage === 'open' && !o.done && o.order.minutesLeft < URGENT_MINUTES) list.push(`Frist knapp: ${o.name} (noch ${realTime(o.order.minutesLeft)})`);
    }
    const requests = this.game.rentals?.requests.length ?? 0;
    if (requests) list.push(`${plural(requests, 'Mietanfrage wartet', 'Mietanfragen warten')} auf einen Server`);
    if (this.game.economy?.money < 0) list.push('Konto im Minus');
    return list;
  }

  // Konkrete Empfehlungen (Stufe 4), wichtigste zuerst
  recommendations(f) {
    const list = [];
    const { economy, staff, upgrades, rentals } = this.game;
    const counter = f.orders.filter((o) => o.order.stage === 'counter');
    if (counter.length) list.push(`Nimm den Auftrag von ${counter[0].order.customer} am Empfang an (${euro.format(counter[0].order.reward)}).`);
    const ready = f.orders.find((o) => o.order.stage === 'open' && o.done);
    if (ready) list.push(`Leg ${ready.name} ins Abholregal – die Teile sind fertig.`);
    const missing = f.orders.find((o) => o.needs && !o.done && o.order.stage !== 'packed');
    if (missing) list.push(`Kauf ${missing.needs} nach – sonst wird ${missing.name} nicht fertig.`);
    else if (economy && f.shelf.length < LOW_STOCK) list.push(`Kauf Filament nach – nur noch ${plural(f.shelf.length, 'Spule', 'Spulen')} im Lager.`);
    const request = rentals?.requests[0];
    const server = request && this.bestServer(request, f);
    if (server) list.push(`Vermiete die VM von ${request.customer} auf ${this.serverName(server)}.`);
    const idle = f.printers.find((x) => x.idle);
    const work = f.orders.filter((o) => o.order.stage === 'open' && !o.done).sort((a, b) => b.perHour - a.perHour)[0];
    if (idle && work) list.push(`Starte auf ${this.printerName(idle.p)} ${work.template?.name ?? 'einen Druck'} für ${work.order.customer}.`);
    if (f.boxed) list.push('Stell die Drucker aus dem Abstellraum auf.');
    if (staff && !staff.workers.length && f.printers.length >= 3 && economy?.canAfford(100)) list.push('Stell einen Azubi ein.');
    if (upgrades && economy && upgrades.printerSlots > economy.printers.length && economy.money > 1500 && !idle) list.push('Kauf einen weiteren Drucker – es ist Platz und Geld da.');
    if (this.ai) {
      const next = this.nextLevelAt(this.ai.onlineCount);
      if (next && economy?.money > 20000) list.push(`Ein weiterer KI-GPU-Server macht mich schlauer (Stufe ${next.level} ab ${next.count} online).`);
    }
    return list;
  }

  // Prognose (Stufe 5): Kontostand am Tagesende und Reichweite des Geldes
  forecastLines(f) {
    const { economy } = this.game;
    if (!economy) return [];
    const hours = this.hoursLeftToday();
    if (economy.unlimited) return ['Mit unendlich Geld ist jede Prognose überflüssig. 😉'];
    const net = f.income - f.cost;
    const end = economy.money - (economy.pendingCosts ?? 0) + net * hours;
    const pickup = f.orders.filter((o) => o.order.stage === 'packed').reduce((sum, o) => sum + o.order.reward, 0);
    const lines = [`Kontostand um Mitternacht (in ${formatMinutes(hours * 60)} Spielzeit): etwa ${euro.format(end)}`
      + `${pickup ? `, mit den abholbereiten Aufträgen ${euro.format(end + pickup)}` : ''} – ohne neue Aufträge.`];
    if (net < 0 && economy.money > BANKRUPT_AT) {
      const left = (economy.money - BANKRUPT_AT) / -net;
      lines.push(left < 48
        ? `Achtung: Ohne Aufträge ist das Geld in ca. ${formatMinutes(left * 60)} Spielzeit aufgebraucht.`
        : `Ohne Aufträge reicht das Geld noch über ${Math.floor(left / 24)} Spieltage.`);
    } else if (net >= 0) {
      lines.push(`Die festen Einnahmen tragen den Betrieb: +${euro.format(net)} pro Stunde, auch ohne Aufträge.`);
    }
    return lines;
  }

  // ---------- Ab Stufe 6: Tagesverlauf, Prognose über Tage, Ziele, Warnungen, Rangliste ----------

  // Vergleich mit gestern (Stufe 6) aus dem Tagesverlauf des KI-Dienstes (core/ai-day-log.js).
  // keys: income, orders, power, costs, ai, filament, xp, net, trend
  historyLines(keys) {
    const log = this.ai?.log;
    if (!log?.clock) return ['Einen Tagesverlauf habe ich nicht – mir fehlt die Spieluhr.'];
    const t = log.today;
    const y = log.yesterday;
    if (!y) {
      return [`Von gestern habe ich noch keine Zahlen – ich schreibe erst seit Tag ${t.day}, ${clockText(t.since)} mit. `
        + `Heute bisher: ${euro.format(t.income)} eingenommen, ${plural(t.orders, 'Auftrag', 'Aufträge')} geliefert.`];
    }
    const b = log.days[1] ?? null;
    const when = y.day === t.day - 1 ? 'gestern' : `an Tag ${y.day}`;
    const vs = (key) => versus(y[key], b?.[key], b?.day);
    const elapsed = Math.max(0, (log.clock.minutes % MINUTES_PER_DAY) - t.since);
    const lines = [];
    for (const key of keys) {
      if (key === 'income') lines.push(`Einnahmen ${when}: ${euro.format(y.income)}${vs('income')} · heute bisher ${euro.format(t.income)}.`);
      else if (key === 'orders') lines.push(`Gelieferte Aufträge ${when}: ${y.orders}${vs('orders')} · heute bisher ${t.orders}.`);
      else if (key === 'power') lines.push(`Strom ${when}: ${euro.format(y.power)}${vs('power')} · heute bisher ${euro.format(t.power)}.`);
      else if (key === 'costs') lines.push(`Laufende Kosten ${when} (Miete, Strom, Lohn): ${euro.format(y.costs)}${vs('costs')}.`);
      else if (key === 'ai') lines.push(`KI-Abo ${when}: ${euro.format(y.aiIncome)}${vs('aiIncome')} · heute bisher ${euro.format(t.aiIncome)}.`);
      else if (key === 'filament') lines.push(`Verdrucktes Filament ${when}: ${kg(y.filament)}${vs('filament')} · heute bisher ${kg(t.filament)}.`);
      else if (key === 'xp') lines.push(`XP ${when}: ${y.xp}${vs('xp')} · heute bisher ${t.xp}.`);
      else if (key === 'net') {
        lines.push(`Unterm Strich ${when}: ${signed(y.income - y.costs)}${b ? ` (Tag ${b.day}: ${signed(b.income - b.costs)})` : ''}.`);
      } else if (key === 'trend') {
        if (elapsed >= 360) {
          const projected = (t.income * MINUTES_PER_DAY) / Math.max(1, elapsed);
          lines.push(`Hochgerechnet bringt heute etwa ${euro.format(projected)} – ${projected >= y.income ? 'mehr' : 'weniger'} als ${when}.`);
        } else {
          lines.push('Für eine Hochrechnung von heute ist es noch zu früh.');
        }
      }
    }
    if (y.since > 0) lines.push(`(Tag ${y.day} habe ich erst ab ${clockText(y.since)} mitgeschrieben.)`);
    return lines;
  }

  // Filament-Vorrat und Verbrauch pro Tag: { stock, perDay, days } oder null, solange kein Verbrauch bekannt ist
  filamentOutlook(f) {
    if (!this.game.economy) return null;
    const stock = f.spools.reduce((sum, s) => sum + (s.grams ?? 0), 0);
    const log = this.ai?.log;
    let perDay = log?.average()?.filament ?? 0;
    if (!(perDay > 0) && log?.clock) {
      const elapsed = (log.clock.minutes % MINUTES_PER_DAY) - log.today.since;
      if (elapsed >= 120 && log.today.filament > 0) perDay = (log.today.filament * MINUTES_PER_DAY) / elapsed;
    }
    if (!(perDay > 0)) return stock > 0 ? null : { stock, perDay: 0, days: 0 };
    return { stock, perDay, days: stock / perDay };
  }

  // „morgen“, „übermorgen“, „an Tag 9“ – wann etwas in so vielen Spieltagen eintritt
  dayWhen(days) {
    const clock = this.game.clock;
    if (!clock) return `in ca. ${days.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tagen`;
    const diff = Math.floor((clock.minutes + days * MINUTES_PER_DAY) / MINUTES_PER_DAY) + 1 - clock.day;
    if (diff <= 0) return `heute noch (in ca. ${formatMinutes(days * MINUTES_PER_DAY)} Spielzeit)`;
    if (diff === 1) return 'morgen';
    if (diff === 2) return 'übermorgen';
    return `an Tag ${clock.day + diff}`;
  }

  // Dauer in Spieltagen als Text
  daysText(days) {
    if (days < 1) return `ca. ${formatMinutes(days * MINUTES_PER_DAY)} Spielzeit`;
    if (days < 2) return 'etwa einen Spieltag';
    if (days > 30) return 'über einen Monat';
    return `etwa ${Math.floor(days)} Spieltage`;
  }

  // Prognose über mehrere Tage (Stufe 7). keys: money, filament, orders, ai, power
  outlookLines(f, keys) {
    const { economy, clock } = this.game;
    const avg = this.ai?.log?.average() ?? null;
    const source = avg ? `im Schnitt ${avg.days === 1 ? 'des letzten Tages' : `der letzten ${avg.days} Tage`}` : null;
    const lines = [];
    for (const key of keys) {
      if (key === 'money' && economy) {
        if (economy.unlimited) {
          lines.push('Geld: unendlich (Entwicklermenü) – da muss ich nichts vorrechnen. 😉');
          continue;
        }
        const perDay = avg ? avg.income - avg.costs : (f.income - f.cost) * 24;
        const money = economy.money - (economy.pendingCosts ?? 0);
        const how = source ?? 'ohne Aufträge';
        if (perDay < 0 && money > BANKRUPT_AT) {
          lines.push(`Geld: ${how} ${signed(perDay)} am Tag – das Geld reicht noch ${this.daysText((money - BANKRUPT_AT) / -perDay)}.`);
        } else if (perDay < 0) {
          lines.push('Geld: Das Konto ist schon an der Grenze – jetzt zählt jeder Auftrag.');
        } else {
          const day = clock ? ` (Tag ${clock.day + OUTLOOK_DAYS})` : '';
          lines.push(`Geld: ${how} ${signed(perDay)} am Tag – in ${OUTLOOK_DAYS} Tagen${day} etwa ${euro.format(money + perDay * OUTLOOK_DAYS)} auf dem Konto.`);
        }
      } else if (key === 'filament' && economy) {
        const est = this.filamentOutlook(f);
        if (!est) lines.push('Filament: Für eine Prognose fehlt mir noch Druckbetrieb – frag mich, wenn eine Weile gedruckt wurde.');
        else if (est.stock <= 0) lines.push('Filament: Lager und Drucker sind leer – sofort nachkaufen.');
        else {
          lines.push(`Filament: ${kg(est.stock)} da, du verdruckst etwa ${kg(est.perDay)} am Tag – `
            + `${est.days > 14 ? 'das reicht über zwei Wochen.' : `bei dem Tempo ist es ${this.dayWhen(est.days)} leer.`}`);
        }
      } else if (key === 'orders' && this.game.orders) {
        if (avg) {
          const n = avg.orders;
          lines.push(`Aufträge: im Schnitt ${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} am Tag – in ${OUTLOOK_DAYS} Tagen also etwa ${Math.round(n * OUTLOOK_DAYS)} weitere.`);
        } else {
          lines.push('Aufträge: Für einen Tagesschnitt fehlt mir noch ein ganzer Tag.');
        }
      } else if (key === 'ai' && this.ai) {
        const fee = this.ai.incomePerHour;
        lines.push(fee > 0
          ? `KI-Abo: ${euro.format(fee * 24)} am Tag, in ${OUTLOOK_DAYS} Tagen ${euro.format(fee * 24 * OUTLOOK_DAYS)} – solange alle KI-GPU-Server rechnen.`
          : 'KI-Abo: bringt gerade nichts – kein KI-GPU-Server rechnet.');
      } else if (key === 'power' && economy) {
        lines.push(`Strom: bei ${euro.format(economy.powerPerHour)} pro Stunde etwa ${euro.format(economy.powerPerHour * 24)} am Tag`
          + `${avg ? ` (Schnitt bisher ${euro.format(avg.power)})` : ''}.`);
      }
    }
    return lines;
  }

  // Weg zum nächsten Spieler-Level bzw. zur nächsten KI-Stufe (Stufe 8). keys: level, ai
  pathLines(f, keys) {
    const { progress } = this.game;
    const ai = this.ai;
    const avg = ai?.log?.average() ?? null;
    const lines = [];
    for (const key of keys) {
      if (key === 'level' && progress) {
        const level = progress.level;
        const title = TITLES[Math.min(level, TITLES.length - 1)];
        let line = `Level ${level + 1} („${title}“): noch ${progress.xpToNext} XP.`;
        if (avg?.xp > 0) line += ` Bei ${Math.round(avg.xp)} XP am Tag schaffst du das in ${this.daysText(progress.xpToNext / avg.xp)}.`;
        const value = Math.round(f.orders.filter((o) => o.order.stage !== 'counter').reduce((sum, o) => sum + o.order.reward, 0));
        if (value) line += ` Deine angenommenen Aufträge bringen ${value} XP${value >= progress.xpToNext ? ' – das reicht für den Aufstieg' : ''}.`;
        const moreOrders = Math.min(8, 3 + Math.floor((level + 1) / 2)) > progress.maxOpenOrders;
        line += ` Dann zahlen Kunden ${level * 10} % mehr${moreOrders ? ' und du kannst einen Auftrag mehr annehmen' : ''}.`;
        lines.push(line);
      } else if (key === 'ai' && ai) {
        const count = ai.onlineCount;
        const next = this.nextLevelAt(count);
        if (!next) {
          lines.push(`KI: Ich bin auf Stufe ${MAX_LEVEL}, der höchsten. Jeder weitere KI-GPU-Server bringt trotzdem ${euro.format(AI_FEE_PER_SERVER * LEVEL_FACTORS[MAX_LEVEL])} KI-Abo pro Stunde.`);
          continue;
        }
        const need = next.count - count;
        const idle = Math.max(0, f.aiServers.length - f.aiWorking.length);
        const buy = Math.max(0, need - idle);
        const type = serverHardwareById(AI_SERVER_ID);
        const gain = feeFor(next.count) - feeFor(count) - buy * (type?.power ?? 0);
        let line = `KI: Noch ${need} KI-GPU-Server bis Stufe ${next.level} – das KI-Abo stiege von ${euro.format(feeFor(count))} auf ${euro.format(feeFor(next.count))} pro Stunde.`;
        if (idle) line += ` ${plural(Math.min(idle, need), 'eingebauter rechnet', 'eingebaute rechnen')} noch nicht – ${idle >= need ? 'die online zu bringen reicht schon' : 'die zuerst online bringen'}.`;
        if (buy && type?.price) {
          line += ` ${buy} neue kosten ${euro.format(buy * type.price)}`
            + `${gain > 0 ? ` und haben sich nach ca. ${formatMinutes(((buy * type.price) / gain) * 60)} Spielzeit bezahlt gemacht` : ''}.`;
        }
        line += ` Neu auf Stufe ${next.level}: ${LEVEL_SKILLS[next.level]}.`;
        lines.push(line);
      }
    }
    return lines;
  }

  // Aktuelle Warnungen (Stufe 9), dringendste zuerst: [{ key, topic, text, score }], dazu für die Drosselung
  // (checkWarnings) wahlweise severity (höher = gefährlicher, Standard 1), repeat (false: solange es bleibt, nur einmal)
  // und remindOnly (ein anderes System hat es schon gemeldet – erst nach WARN_REPEAT erinnern); topics: weitere Themen
  warnings(f) {
    const { economy } = this.game;
    const list = [];
    const add = (key, topic, score, text, extra = {}) => list.push({ key, topic, score, text, ...extra });
    const waiting = f.printers.filter((x) => x.problem?.startsWith('wartet auf Filament'));
    if (waiting.length) {
      const names = waiting.slice(0, 3).map((x) => this.printerName(x.p)).join(', ');
      add('filament-empty', 'filament', 95, `Filament leer: ${names}${waiting.length > 3 ? ` und ${waiting.length - 3} weitere` : ''} ${waiting.length === 1 ? 'wartet' : 'warten'} auf eine neue Spule.`);
    }
    const est = this.filamentOutlook(f);
    if (est && est.stock > 0 && est.days < FILAMENT_WARN_DAYS) {
      add('filament-low', 'filament', 70, `Filament wird knapp: nur noch ${kg(est.stock)} – reicht etwa ${formatMinutes(est.days * MINUTES_PER_DAY)} Spielzeit.`);
    }
    // Defekt bzw. eingefroren meldet schon das Klima selbst (main.js) – die KI erinnert erst nach WARN_REPEAT daran
    for (const d of f.climate.down) {
      add(`down-${d.device.id}`, 'climate', 90, `${this.serverName(d.device)} ${d.status === 'broken' ? 'ist noch immer überhitzt und defekt – reparieren' : 'ist noch immer eingefroren – neu starten'}.`, { remindOnly: true });
    }
    // Je Schrank eine Warnung, überhitzte KI-GPU-Server stehen mit drin. Zu warm (über idealMax) ohne Schaden meldet
    // die KI einmal; ab TEMP_LIMITS.hot (Schaden, GPUs drosseln) steigt die Gefahr – dann gleich und alle WARN_REPEAT
    for (const h of hottestPerRack(f.climate.hot).values()) {
      const damage = h.temp > TEMP_LIMITS.hot;
      const ai = f.aiHot.filter((d) => this.game.servers?.rackOf(d)?.id === h.rack.id).length;
      const aiText = ai ? `, ${plural(ai, 'KI-GPU-Server rechnet', 'KI-GPU-Server rechnen')} nicht mit – das KI-Abo sinkt` : '';
      add(`hot-${h.rack.id}`, 'climate', damage ? 85 : 80, damage
        ? `${h.label} ist zu heiß (${degrees(h.temp)}) – die Geräte nehmen Schaden${aiText}. Abluft und Lüfter hochdrehen.`
        : `${h.label} wird zu warm (${degrees(h.temp)}) – Abluft und Lüfter hochdrehen, ab ${TEMP_LIMITS.hot} °C drosseln die Geräte.`,
        { severity: damage ? 2 : 1, repeat: damage, topics: ai ? ['climate', 'ai'] : ['climate'] });
    }
    if (economy && !economy.unlimited) {
      const loss = f.cost - f.income;
      if (economy.money < 0) add('money-minus', 'money', 100, `Konto im Minus (${euro.format(economy.money)}) – ab ${euro.format(BANKRUPT_AT)} bist du pleite.`);
      else if (loss > 0 && (economy.money - BANKRUPT_AT) / loss < MONEY_WARN_HOURS) {
        add('money-low', 'money', 92, `Geld knapp: Ohne neue Einnahmen ist das Konto in ca. ${formatMinutes(((economy.money - BANKRUPT_AT) / loss) * 60)} Spielzeit leer.`);
      }
    }
    for (const o of f.orders) {
      if (o.order.stage !== 'open' || o.done || o.order.minutesLeft >= URGENT_MINUTES / 2) continue;
      add(`deadline-${o.order.id}`, 'orders', 75, `Frist knapp: ${o.name} – noch ${realTime(o.order.minutesLeft)}, ${o.ready}/${o.order.quantity} fertig.`);
    }
    return list.sort((a, b) => b.score - a.score);
  }

  // Neue Warnungen ab Stufe WARN_LEVEL mit Drosselung: dieselbe Warnung höchstens alle WARN_REPEAT Spielminuten (bei
  // repeat: false nur einmal, solange das Problem bleibt), sofort aber, wenn die Gefahr steigt (severity); remindOnly
  // erst nach WARN_REPEAT. Ist sie behoben und kommt erst nach WARN_GAP wieder, gilt sie als neu. Höchstens
  // WARN_AT_ONCE je Aufruf, der Rest beim nächsten. Die erste Prüfung ab Stufe WARN_LEVEL (nach Start bzw. Laden oder
  // beim ersten Erreichen der Stufe) fasst alles in einer Meldung zusammen. Gibt die jetzt zu meldenden Warnungen
  // zurück (main.js zeigt sie über onEvent im HUD).
  checkWarnings(level = this.ai?.level ?? 0) {
    // Unter WARN_LEVEL schweigt die KI, behält aber, was sie schon gemeldet hat – sonst kämen beim Pendeln zwischen
    // Stufe 8 und 9 alle Warnungen sofort wieder
    if (level < WARN_LEVEL) return [];
    const now = this.game.clock?.minutes ?? this.elapsed;
    const current = this.warnings(this.facts());
    const keys = new Set(current.map((w) => w.key));
    for (const [key, state] of this.warned) {
      if (keys.has(key)) continue;
      state.resolvedAt ??= now;
      if (now - state.resolvedAt >= WARN_REPEAT) this.warned.delete(key);
    }
    if (this.bundlePending) {
      this.bundlePending = false;
      for (const w of current) this.warned.set(w.key, { last: now, resolvedAt: null, severity: w.severity ?? 1 });
      if (!current.length) return [];
      const [first, ...rest] = current;
      const more = rest.length ? ` Dazu ${plural(rest.length, 'weitere Warnung', 'weitere Warnungen')} – frag mich „Warnungen?“.` : '';
      return [{ ...first, key: 'bundle', text: `${first.text}${more}`, count: current.length }];
    }
    const fresh = [];
    for (const w of current) {
      if (fresh.length >= WARN_AT_ONCE) break;
      const severity = w.severity ?? 1;
      let state = this.warned.get(w.key);
      if (state?.resolvedAt != null) {
        if (now - state.resolvedAt >= WARN_GAP) state = null; // behoben und lange genug weg: wieder neu
        else state.resolvedAt = null;
      }
      if (!state) {
        this.warned.set(w.key, { last: now, resolvedAt: null, severity });
        if (!w.remindOnly) fresh.push(w);
        continue;
      }
      const due = now < state.last || severity > state.severity || (w.repeat !== false && now - state.last >= WARN_REPEAT);
      if (!due) continue;
      state.last = now;
      state.severity = Math.max(state.severity, severity);
      fresh.push(w);
    }
    return fresh;
  }

  // Läuft in Spielminuten (main.js): nach WARN_GRACE Spielminuten Schonfrist alle WARN_EVERY Spielminuten nach neuen
  // Warnungen sehen und sie melden
  advance(gameMinutes) {
    this.elapsed += gameMinutes;
    this.sinceWarn += gameMinutes;
    if (this.elapsed < WARN_GRACE || this.sinceWarn < WARN_EVERY) return [];
    this.sinceWarn = 0;
    const fresh = this.checkWarnings();
    for (const w of fresh) this.onEvent?.('warning', w);
    return fresh;
  }

  // Nächste Schritte mit Rangfolge (Stufe 10): [{ score, topic, text, why }], wichtigster zuerst
  rankedSteps(f) {
    const { economy, staff, upgrades, rentals } = this.game;
    const steps = [];
    // value (€) hebt einen Schritt innerhalb seiner Gruppe etwas an
    const add = (score, topic, text, why, value = 0) => steps.push({ score: score + Math.min(9, Math.max(0, value) / 500), topic, text, why });
    if (economy && !economy.unlimited) {
      const loss = f.cost - f.income;
      if (economy.money < 0) add(100, 'money', 'Geld reinholen: fertige Aufträge abgeben, nichts Neues kaufen', `Konto ${euro.format(economy.money)}, pleite ab ${euro.format(BANKRUPT_AT)}`);
      else if (loss > 0 && (economy.money - BANKRUPT_AT) / loss < MONEY_WARN_HOURS) {
        add(92, 'money', 'Aufträge annehmen und liefern, Ausgaben bremsen', `ohne Einnahmen ist das Geld in ca. ${formatMinutes(((economy.money - BANKRUPT_AT) / loss) * 60)} Spielzeit weg`);
      }
    }
    for (const x of f.printers) {
      if (!x.problem) continue;
      if (x.problem.startsWith('wartet auf Filament')) add(95, 'filament', `${this.printerName(x.p)}: neue Spule einlegen`, `${x.problem.replace('wartet auf', 'der Druck wartet auf')}`);
      else if (x.problem === 'hat kein Filament') add(50, 'printers', `${this.printerName(x.p)}: Spule einlegen`, 'ohne Filament kann er keinen Auftrag drucken');
      else add(70, 'printers', `${this.printerName(x.p)}: ${x.problem}`, 'solange verdient der Drucker nichts');
    }
    for (const d of f.climate.down) add(88, 'climate', `${this.serverName(d.device)} ${d.status === 'broken' ? 'reparieren' : 'neu starten'}`, d.status === 'broken' ? 'überhitzt und defekt' : 'eingefroren');
    if (f.aiHot.length && this.ai) {
      const gain = feeFor(f.aiWorking.length + f.aiHot.length) - this.ai.incomePerHour;
      add(85, 'ai', `${plural(f.aiHot.length, 'KI-GPU-Server', 'KI-GPU-Server')} kühlen`, `+${euro.format(gain)} KI-Abo pro Stunde`, gain * 10);
    }
    for (const h of hottestPerRack(f.climate.hot).values()) add(78, 'climate', `${h.label}: Abluft und Lüfter hochdrehen`, `${degrees(h.temp)}, ab ${TEMP_LIMITS.hot} °C drosseln die Geräte`);
    if (this.game.servers) {
      for (const d of f.servers.filter((s) => !f.reached.has(s.id))) {
        const rent = this.game.rentals?.rentOn(d) ?? 0;
        add(72, 'servers', `${this.serverName(d)} ans Netz bringen`, rent > 0 ? `${euro.format(rent)} Miete pro Stunde fallen aus` : 'kostet offline nur Strom', rent * 10);
      }
    }
    for (const o of f.orders) {
      const reward = o.order.reward;
      if (o.order.stage === 'counter') add(76, 'orders', `Auftrag von ${o.order.customer} am Empfang annehmen`, `${euro.format(reward)}, der Kunde geht in ca. ${realTime(o.order.waitLeft)}`, reward);
      else if (o.order.stage === 'open' && o.done) add(80, 'orders', `${o.name} ins Abholregal legen`, `+${euro.format(reward)} sofort`, reward);
      else if (o.order.stage === 'open' && o.needs) add(82, 'filament', `${o.needs} nachkaufen`, `sonst wird ${o.name} (${euro.format(reward)}) nicht fertig`, reward);
      else if (o.order.stage === 'open' && o.order.minutesLeft < URGENT_MINUTES) add(84, 'orders', `${o.name} fertig drucken`, `Frist noch ${realTime(o.order.minutesLeft)}, sonst ist der Kunde verärgert`, reward);
    }
    const est = this.filamentOutlook(f);
    if (est && est.stock > 0 && est.days < 1) add(74, 'filament', 'Filament nachkaufen', `der Vorrat reicht nur noch ${this.daysText(est.days)}`);
    else if (economy && f.shelf.length < LOW_STOCK) add(60, 'filament', 'Filament nachkaufen', f.shelf.length ? `nur ${plural(f.shelf.length, 'Spule', 'Spulen')} im Lager` : 'keine Spule mehr im Lager');
    const request = rentals?.requests[0];
    const server = request && this.bestServer(request, f);
    if (server) {
      const rent = rentals.rentPerHour(request, server);
      add(62, 'servers', `VM von ${request.customer} auf ${this.serverName(server)} vermieten`, `+${euro.format(rent)} pro Stunde`, rent * 10);
    }
    const idle = f.printers.find((x) => x.idle);
    const work = f.orders.filter((o) => o.order.stage === 'open' && !o.done && !o.needs).sort((a, b) => b.perHour - a.perHour)[0];
    if (idle && work) add(66, 'printers', `Auf ${this.printerName(idle.p)} ${work.template?.name ?? 'den nächsten Druck'} für ${work.order.customer} starten`, `ca. ${euro.format(work.perHour)} pro Druckstunde`, work.perHour);
    if (f.boxed) add(45, 'printers', 'Drucker aus dem Abstellraum aufstellen', 'im Karton verdienen sie nichts');
    if (staff && !staff.workers.length && f.printers.length >= 3 && economy?.canAfford(100)) add(40, 'staff', 'Einen Azubi einstellen', 'er räumt Fehldrucke weg und legt Spulen nach');
    if (staff && !staff.receptionist && f.orders.length >= 3) add(38, 'staff', 'Eine Empfangskraft einstellen', 'sie nimmt Kunden an, auch wenn du nicht am Tresen bist');
    if (upgrades && economy && upgrades.printerSlots > economy.printers.length && economy.money > 1500 && !idle) add(30, 'printers', 'Einen weiteren Drucker kaufen', 'Platz und Geld sind da, alle Drucker sind beschäftigt');
    if (this.ai) {
      const next = this.nextLevelAt(this.ai.onlineCount);
      const price = serverHardwareById(AI_SERVER_ID)?.price ?? 0;
      if (next && economy?.money > price) {
        const gain = feeFor(next.count) - this.ai.incomePerHour;
        add(28, 'ai', `${plural(next.count - this.ai.onlineCount, 'KI-GPU-Server', 'KI-GPU-Server')} mehr für KI-Stufe ${next.level}`, `+${euro.format(gain)} KI-Abo pro Stunde`);
      }
    }
    const seen = new Set();
    return steps.sort((a, b) => b.score - a.score).filter((s) => !seen.has(s.text) && seen.add(s.text));
  }

  // Rangliste als nummerierte Zeilen. topic: nur Schritte zu diesem Thema (null = alle)
  rankingLines(f, topic = null, max = 5, withEmpty = true) {
    const related = { servers: ['servers', 'ai', 'climate'], climate: ['climate', 'ai'], printers: ['printers', 'filament'], ai: ['ai'] };
    const steps = this.rankedSteps(f).filter((s) => !topic || s.topic === topic || related[topic]?.includes(s.topic));
    if (!steps.length) return withEmpty ? ['Nichts Dringendes – Zeit zu wachsen: mehr Drucker oder KI-GPU-Server.'] : [];
    const lines = steps.slice(0, max).map((s, i) => `${i + 1}. ${s.text} – ${s.why}`);
    if (steps.length > max) lines.push(`… und ${steps.length - max} weitere Punkte`);
    return lines;
  }

  // Spielstunden bis Mitternacht
  // Miete pro Stunde aus VMs und vermietetem Speicher (#47, storageRentals fehlt ohne NAS-Verdrahtung)
  rentIncome() {
    return (this.game.rentals?.incomePerHour ?? 0) + (this.game.storageRentals?.incomePerHour ?? 0);
  }

  hoursLeftToday() {
    const minutes = this.game.clock?.minutes;
    if (minutes == null) return 0;
    return (MINUTES_PER_DAY - (minutes % MINUTES_PER_DAY)) / 60;
  }

  // Nächste Stufe und ab wie vielen KI-Servern online sie gilt, oder null auf der höchsten Stufe
  nextLevelAt(count) {
    const level = levelFor(count);
    for (let n = count + 1; n <= count + 32; n++) {
      if (levelFor(n) > level) return { level: levelFor(n), count: n };
    }
    return null;
  }
}

// Kurzform für main.js: const advisor = createAdvisor(game)
export const createAdvisor = (game) => new AIAdvisor(game);
