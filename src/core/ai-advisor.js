// KI-Berater für die PC-App „KI“ (ui/ai-app.js): beantwortet Fragen des Spielers mit Tipps zum Spiel. Simuliert –
// keine echte KI und keine Anfrage ins Internet. Stichwörter in der Frage wählen das Thema (auch mehrere), die Zahlen
// kommen aus dem Spielstand. Je höher die KI-Stufe (core/ai-service.js), desto genauer die Antwort:
//   1 allgemeine Tipps · 2 dazu Zahlen · 3 dazu konkrete Probleme · 4 dazu Empfehlungen · 5 dazu Prognose und
//   Lagebericht auf Knopfdruck
// Jedes Thema liefert dafür Zeilen in fünf Fächern (general, numbers, problems, advice, forecast); compose() nimmt
// so viele Fächer, wie die Stufe erlaubt.
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
import { MAX_LEVEL, feeFor, isAIServer, levelFor } from './ai-service.js';
import { euro, formatMinutes, realTime } from './format.js';

export { MAX_LEVEL };
const MINUTES_PER_DAY = 24 * 60;
const LOW_GRAMS = 150;       // Spule im Drucker fast leer
const LOW_STOCK = 3;         // weniger Spulen im Lager: nachkaufen
const URGENT_MINUTES = 120;  // Spielminuten bis zur Frist, ab denen ein Auftrag knapp wird
const MAX_TOPICS = 3;        // so viele Themen beantwortet eine Frage höchstens
const MAX_LIST = 6;          // so viele Einträge zeigt eine Aufzählung, der Rest wird gezählt

// Fächer einer Antwort und ab welcher Stufe sie dabei sind
const SECTIONS = [['general', 1], ['numbers', 2], ['problems', 3], ['advice', 4], ['forecast', 5]];

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
const empty = () => ({ general: [], numbers: [], problems: [], advice: [], forecast: [] });

export class AIAdvisor {
  constructor(game = {}) {
    this.game = game;
  }

  // KI-Dienst (core/ai-service.js) – in main.js heißt er im Spielobjekt aiService
  get ai() {
    return this.game.ai ?? this.game.aiService ?? null;
  }

  // ---------- Öffentlich ----------

  // Antwort auf eine Frage bei dieser Stufe (0 = offline): { text, topic, topics }
  answer(question, level = this.ai?.level ?? 0) {
    level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    if (level <= 0) return { text: this.offlineText(), topic: 'offline', topics: [] };
    const topics = detectTopics(question);
    if (!topics.length) return { text: this.fallback(level), topic: 'unknown', topics: [] };
    if (topics[0] === 'report') return { text: this.report(level), topic: 'report', topics };
    if (topics[0] === 'greeting') return { text: this.greeting(level), topic: 'greeting', topics };
    const facts = this.facts();
    const texts = topics.map((id) => {
      const body = this.compose(this.build(id, facts), level);
      return topics.length > 1 && topicById(id).title ? `${topicById(id).title}\n${body}` : body;
    });
    return { text: texts.join('\n\n'), topic: topics[0], topics };
  }

  // Vollständiger Lagebericht (Stufe 5): alle Bereiche mit Zahlen, Problemen, Empfehlungen und Prognose
  report(level = this.ai?.level ?? 0) {
    if (level <= 0) return this.offlineText();
    if (level < MAX_LEVEL) {
      return `Einen kompletten Lagebericht schaffe ich erst ab Stufe ${MAX_LEVEL}. Frag mich bis dahin nach einzelnen `
        + 'Bereichen, z. B. „Wie läuft es?“, „Filament?“ oder „Server?“.';
    }
    const f = this.facts();
    const when = this.game.clock ? ` – Tag ${this.game.clock.day}, ${clockText(this.game.clock.minutes)}` : '';
    const parts = [`📋 Lagebericht${when}`];
    for (const id of ['money', 'printers', 'filament', 'orders', 'servers', 'climate', 'staff', 'visitors', 'ai']) {
      const p = this.build(id, f);
      const lines = [...p.numbers, ...p.problems];
      if (lines.length) parts.push(`${topicById(id).title}\n${lines.join('\n')}`);
    }
    const advice = this.recommendations(f);
    if (advice.length) parts.push(`👉 Als Nächstes\n${bullets(advice, 4).join('\n')}`);
    parts.push(`🔮 Prognose\n${this.forecastLines(f).join('\n')}`);
    return parts.join('\n\n');
  }

  // Begrüßung zum Start des Chats (null ohne KI)
  greeting(level = this.ai?.level ?? 0) {
    if (level <= 0) return null;
    const intro = {
      1: 'Hallo! Ich bin die KI deiner Druckerei – noch ganz am Anfang (Stufe 1). Ich kenne erst allgemeine Tipps.',
      2: 'Hallo! KI Stufe 2 ist online. Ich kann jetzt Zahlen aus deinem Betrieb nennen.',
      3: 'Hallo! KI Stufe 3 ist online. Ich sehe Zahlen und konkrete Probleme in Halle und Serverraum.',
      4: 'Hallo! KI Stufe 4 ist online. Ich gebe dir dazu Empfehlungen, was sich lohnt.',
      5: 'Hallo! KI Stufe 5 ist online – volle Rechenleistung. Frag mich nach einem Lagebericht oder einer Prognose.',
    }[level];
    return `${intro} Frag mich z. B. nach Filament, Druckern, Aufträgen, Servern, Temperatur oder Geld.`;
  }

  // Vorschlagsfragen für die Knöpfe unter dem Chat
  suggestions(level = this.ai?.level ?? 0) {
    if (level <= 0) return [];
    const list = ['Wie läuft es?', 'Was soll ich als Nächstes tun?', 'Probleme?', 'Filament?', 'Server?'];
    if (level >= MAX_LEVEL) list.unshift('Lagebericht');
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
    return 'Dazu weiß ich leider nichts. Tipp: „Lagebericht“ zeigt alles auf einmal, mit Prognose für den Tag.';
  }

  // ---------- Antwort zusammenbauen ----------

  // Fächer bis zur Stufe zusammenfügen
  compose(parts, level) {
    const lines = [];
    for (const [key, from] of SECTIONS) if (level >= from) lines.push(...parts[key]);
    return lines.join('\n');
  }

  build(id, f) {
    const builders = {
      status: this.status, next: this.next, problems: this.problems, ai: this.aiTopic, filament: this.filament,
      printers: this.printers, orders: this.ordersTopic, servers: this.serversTopic, climate: this.climate,
      money: this.money, power: this.power, rent: this.rent, staff: this.staffTopic, visitors: this.visitorsTopic,
      progress: this.progressTopic, upgrades: this.upgradesTopic,
    };
    return (builders[id] ?? (() => empty())).call(this, f);
  }

  // ---------- Spielstand einsammeln (einmal je Antwort) ----------

  facts() {
    const { economy, orders, servers, climate, rentals } = this.game;
    const { ai } = this;
    const f = { economy, printers: [], spools: [], shelf: [], rackSpools: [], loaded: [], boxed: 0, orders: [], servers: [], aiServers: [], racks: [], reached: new Set() };
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
      f.racks = servers.racks;
    }
    f.income = (rentals?.incomePerHour ?? 0) + (ai?.incomePerHour ?? 0);
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
      p.numbers.push(`Server: ${[...f.servers, ...f.aiServers].filter((d) => f.reached.has(d.id)).length} von ${f.servers.length + f.aiServers.length} online.`);
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
    if (f.printers.length) p.numbers.push(`${idle ? plural(idle, 'Drucker steht', 'Drucker stehen') : 'Kein Drucker steht'} still, ${plural(f.orders.filter((o) => !o.done && o.order.stage !== 'packed').length, 'Auftrag wartet', 'Aufträge warten')} auf Teile.`);
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
    const offline = [...f.servers, ...f.aiServers].filter((d) => !f.reached.has(d.id)).length;
    p.numbers.push(`Drucker mit Störung: ${printerIssues} · Server offline: ${offline} · zu heiße Geräte: ${f.climate.hot.length}.`);
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
    p.numbers.push(`Stufe ${ai.level} · ${plural(ai.onlineCount, 'KI-GPU-Server', 'KI-GPU-Server')} online · KI-Abo ${euro.format(ai.incomePerHour)} pro Stunde`
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
    for (const o of counter) p.problems.push(`${o.order.customer} wartet am Empfang (geht in ca. ${realTime(o.order.waitLeft)}).`);
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
    if (f.aiServers.length) p.numbers.push(`Dazu ${f.aiServers.length} KI-GPU-Server (${f.aiServers.filter((d) => f.reached.has(d.id)).length} online).`);
    if (rentals) {
      p.numbers.push(`${plural(rentals.vms.length, 'VM ist', 'VMs sind')} vermietet, ${plural(rentals.requests.length, 'Anfrage wartet', 'Anfragen warten')} · Miete ${euro.format(rentals.incomePerHour)} pro Stunde.`);
    }
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
    if (rentals) p.forecast.push(`Bis Tagesende bringen die VMs noch etwa ${euro.format(rentals.incomePerHour * Math.floor(this.hoursLeftToday()))}.`);
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
    if (airs.length) p.numbers.push(`Luft in den Schränken: ${degrees(Math.min(...airs))} bis ${degrees(Math.max(...airs))}.`);
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
    if (idlePrinters) p.advice.push(`${plural(idlePrinters, 'Drucker steht', 'Drucker stehen')} still und kostet trotzdem Strom (${Math.round(IDLE_POWER_SHARE * 100)} %).`);
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
      p.problems.push(`${plural(offline.length, 'Server ist', 'Server sind')} offline, ${offline.length === 1 ? 'kostet' : 'kosten'} aber ${euro.format(offline.reduce((s, d) => s + d.type.power, 0))} Strom pro Stunde.`);
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
    if (rentals?.requests.length) p.problems.push(`${plural(rentals.requests.length, 'Mietanfrage wartet', 'Mietanfragen warten')} auf einen Server.`);
    if (rentals) {
      const request = rentals.requests[0];
      const server = request && this.bestServer(request, f);
      if (server) p.advice.push(`Vermiete die VM von ${request.customer} auf ${this.serverName(server)} (+${euro.format(rentals.rentPerHour(request, server))} pro Stunde).`);
      p.forecast.push(`Heute kommen noch etwa ${euro.format((rentals.incomePerHour - RENT_PER_HOUR) * this.hoursLeftToday())} Miete unterm Strich zusammen.`);
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
    if (!staff.workers.length) p.advice.push('Ohne Azubi sagen Besuchergruppen ab – sie brauchen jemanden, der sie führt.');
    if (!p.advice.length) p.advice.push('Das Team ist komplett.');
    p.forecast.push(`Lohn bis Tagesende: etwa ${euro.format(staff.wagesPerHour * this.hoursLeftToday())}.`);
    return p;
  }

  visitorsTopic() {
    const p = empty();
    const { visitors, staff } = this.game;
    p.general.push('Einmal am Tag kann eine Besuchergruppe kommen. Ein Azubi führt sie durch Halle, Lager und Serverraum; sie zahlt Eintritt und bewertet, wie ordentlich alles ist.');
    if (!visitors) return p;
    const g = visitors.group;
    if (g) p.numbers.push(`Heute: ${g.name} mit ${g.size} Personen${g.state === 'announced' ? ` um ${clockText(g.time)}` : ' – gerade da'}.`);
    else p.numbers.push('Heute ist keine Besuchergruppe angemeldet.');
    const last = visitors.recentRatings?.[0];
    if (last) p.numbers.push(`Letzte Bewertung: ${last.stars} von 5 Sternen (${last.name}).`);
    if (g && !staff?.workers.length) p.problems.push('Für die Führung fehlt ein Azubi – ohne ihn sagt die Gruppe ab.');
    let preview = null;
    try {
      preview = visitors.preview?.();
    } catch {
      preview = null;
    }
    if (preview) {
      p.advice.push(`Wenn sie jetzt kämen, gäbe es ${preview.stars} von 5 Sternen.`);
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
    for (const o of f.orders) {
      if (o.order.stage === 'counter') list.push(`${o.order.customer} wartet am Empfang`);
      else if (o.order.stage === 'open' && !o.done && o.order.minutesLeft < URGENT_MINUTES) list.push(`Frist knapp: ${o.name} (noch ${realTime(o.order.minutesLeft)})`);
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

  // Spielstunden bis Mitternacht
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
