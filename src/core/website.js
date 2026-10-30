// Eigene Firmen-Website (#54) auf den Website-Servern (core/server-catalog.js, Serie „Web“, id WEBSITE_SERVER_ID).
// Website-Server kauft, baut und verkabelt man wie jeden Server (core/servers.js). Sie sind nicht an Kunden vermietbar
// (rentable: false), sondern betreiben die Website. Eingerichtet und gestaltet wird sie in der PC-App „Website“ (#55,
// ui/website-app.js) – die App speichert nichts selbst, alles steht hier.
//
// Status (state):
//   'off'     – kein Website-Server läuft (keiner eingebaut, alle offline, defekt, eingefroren oder in privaten Schränken)
//   'booting' – ein Website-Server ist gerade online gegangen: die Website fährt BOOT_MINUTES Spielminuten hoch
//               (bootProgress 0…1). Geht der letzte Website-Server offline, fährt sie beim nächsten Mal neu hoch.
//   'setup'   – hochgefahren, aber noch nicht eingerichtet (Assistent der App, publish())
//   'live'    – veröffentlicht und mindestens ein Website-Server online, nicht defekt, nicht privat
//
// Online-Anfragen: Solange die Website live ist, kommen zusätzlich zu den Kunden am Empfang Anfragen über die Website –
// REQUESTS_PER_DAY je Website-Server und Spieltag, höchstens MAX_COUNTED_SERVERS Server zählen, dazu bis DESIGN_BONUS
// für eine gut gestaltete Website (designReport). Es sind VM-Anfragen (core/server-rentals.js) und Speicher-Anfragen
// (core/storage-rentals.js, nur mit NAS und wenn die Website Speicher anbietet; Anteil wie am Empfang STORAGE_SHARE).
// Sie tragen source: 'website' (bleibt am Vertrag), stehen direkt in der App „Server-Vermietung“ (🌐 Website), es
// läuft keine Figur zum Empfang, und sie warten ONLINE_PATIENCE Spielminuten auf eine Antwort.
// Empfangsplätze: Online-Anfragen zählen NICHT bei maxWaiting mit (rentals.counterRequests) – die Grenze gibt es,
// weil am Empfang nur so viele Kunden Platz haben (Tresen und Stühle). Online-Kunden stehen nirgends; damit sie
// sich nicht unbegrenzt stapeln, gibt es eine eigene Grenze MAX_ONLINE_WAITING (mehr Besucher fragen dann nicht an).
// Die private Automatik (core/rental-automation.js) vergibt Online-Anfragen sofort (sie müssen nicht ankommen).
// Website offline: keine neuen Online-Anfragen; laufende Verträge hängen an ihren eigenen Servern und laufen weiter.
//
// Statistik je Spieltag (today, history der letzten Tage): Besucher, Online-Anfragen, davon angenommen, Einnahmen über
// die Website (Miete der Verträge mit source 'website', über rentals/storage.payHour), Auslastung.
// Zeiten in Spielminuten (Delta-Zeit). Ohne Three.js und DOM.
import { STORAGE_SHARE } from './storage-rentals.js';
import { RENT_PER_CORE, RENT_PER_GB } from './server-rentals.js';
import { RENT_PER_GB_STORAGE } from './storage-rentals.js';

export const WEBSITE_SERVER_ID = 'server-web';
export const BOOT_MINUTES = 3;            // Spielminuten Hochfahren (echt ca. 9 s)
export const REQUESTS_PER_DAY = 6;        // Online-Anfragen je Website-Server und Spieltag
export const MAX_COUNTED_SERVERS = 4;     // mehr Website-Server bringen keine weiteren Anfragen
export const DESIGN_BONUS = 0.2;          // bis +20 % Anfragen für eine gut gestaltete Website
export const MIN_CONTRAST = 4.5;          // WCAG-Kontrast Text/Hintergrund, ab dem der Text gut lesbar ist
export const ONLINE_PATIENCE = 240;       // so lange wartet eine Online-Anfrage in der App (Spielminuten)
export const MAX_ONLINE_WAITING = 6;      // höchstens so viele Online-Anfragen warten gleichzeitig
export const VISITORS_PER_REQUEST = 14;   // so viele Besucher je Anfrage (im Mittel, für die Statistik)
const REQUEST_JITTER = 0.3;               // ± 30 % Zufall beim Abstand der Anfragen
const CHECK_EVERY = 1;                    // Spielminuten zwischen zwei Prüfungen der Website-Server ohne Änderung
const HISTORY_DAYS = 7;                   // so viele vergangene Tage behält die Statistik
const MINUTES_PER_DAY = 24 * 60;

export const WEBSITE_STATES = { off: 'Offline', booting: 'Fährt hoch …', setup: 'Nicht eingerichtet', live: 'Live' };

// Ob ein Gerät (aus economy.furniture) bzw. ein Typ ein Website-Server ist
export const isWebsiteServer = (device) => (device?.type ?? device)?.id === WEBSITE_SERVER_ID;

// ---------- Einstellungen ----------

// Höchstlängen der Texte (Zeichen; das Logo zählt Unicode-Zeichen, damit zusammengesetzte Emojis passen)
export const TEXT_LIMITS = { name: 40, logo: 8, slogan: 60, welcome: 80, about: 300 };
// Schriften: css ist ein fertiger font-family-Wert für die Vorschau
export const FONTS = [
  { id: 'modern', name: 'Modern', css: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { id: 'classic', name: 'Klassisch', css: 'Georgia, "Times New Roman", serif' },
  { id: 'playful', name: 'Verspielt', css: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive' },
  { id: 'mono', name: 'Maschinenschrift', css: '"Courier New", Courier, ui-monospace, monospace' },
  { id: 'round', name: 'Rund', css: '"Trebuchet MS", Verdana, sans-serif' },
  { id: 'bold', name: 'Kräftig', css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif' },
];
export const LAYOUTS = [
  { id: 'centered', name: 'Zentriert' },
  { id: 'left', name: 'Links' },
  { id: 'cards', name: 'Karten' },
];
export const PATTERNS = [
  { id: 'none', name: 'Kein Muster' },
  { id: 'dots', name: 'Punkte' },
  { id: 'stripes', name: 'Streifen' },
  { id: 'grid', name: 'Raster' },
  { id: 'waves', name: 'Wellen' },
  { id: 'circuit', name: 'Platine' },
];
export const CORNERS = [
  { id: 'square', name: 'Eckig' },
  { id: 'round', name: 'Rund' },
];
export const BUTTON_STYLES = [
  { id: 'filled', name: 'Gefüllt' },
  { id: 'outline', name: 'Umrandet' },
  { id: 'pill', name: 'Pille' },
  { id: 'shadow', name: 'Mit Schatten' },
];
// Fertige Farbschemata für den Assistenten (Hauptfarbe, Hintergrund, Text)
export const COLOR_SCHEMES = [
  { id: 'sky', name: 'Himmelblau', primary: '#1f8fd6', background: '#ffffff', text: '#1b2733' },
  { id: 'night', name: 'Nacht', primary: '#7cc4ff', background: '#10161f', text: '#e6edf5' },
  { id: 'forest', name: 'Wald', primary: '#2e8b57', background: '#f3f8f1', text: '#1d2b20' },
  { id: 'sunset', name: 'Sonnenuntergang', primary: '#e8590c', background: '#fff7ef', text: '#3b1f12' },
  { id: 'candy', name: 'Bonbon', primary: '#d6336c', background: '#fff0f6', text: '#3d1426' },
  { id: 'terminal', name: 'Terminal', primary: '#39d353', background: '#0b0f0b', text: '#c8f7c5' },
];
// Vorschläge für das Logo (frei wählbar)
export const LOGO_SUGGESTIONS = ['🌐', '☁️', '🖥️', '💾', '🚀', '⚡', '🖨️', '🛰️', '🦊', '🐙', '🌈', '🔒'];

// Felder, die für den Gestaltungs-Bonus ausgefüllt sein müssen (Name für die Anzeige)
const DESIGN_FIELDS = [
  ['name', 'Firmenname'], ['logo', 'Logo'], ['welcome', 'Willkommensnachricht'], ['about', 'Über uns'], ['slogan', 'Slogan'],
];

export function defaultSettings() {
  return {
    name: '',
    logo: '🌐',
    primary: '#1f8fd6',
    background: '#ffffff',
    text: '#1b2733',
    font: 'modern',
    welcome: '',
    about: '',
    slogan: '',
    offerVms: true,
    offerStorage: true,  // greift nur, wenn eine NAS da ist (storageAvailable)
    layout: 'centered',
    pattern: 'none',
    corners: 'round',
    buttons: 'filled',
    dark: false,
  };
}

// '#abc', '#AABBCC', 'aabbcc' → '#aabbcc'; sonst null
export function normalizeColor(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

// Text auf die Höchstlänge kürzen und Steuerzeichen entfernen (Zeilenumbrüche nur, wo multiline). Gespeichert wird
// reiner Text – die Anzeige (#55) muss ihn als Text einsetzen (textContent bzw. escapen), nie als HTML.
export function cleanText(value, limit, multiline = false) {
  const text = String(value ?? '').replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '');
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit).join('') : text;
}

const ENUMS = { font: FONTS, layout: LAYOUTS, pattern: PATTERNS, corners: CORNERS, buttons: BUTTON_STYLES };

// Einstellungen prüfen: patch (auch unvollständig) auf base anwenden. Ungültige Werte (falsche Farbe, unbekannte
// Schrift …) behalten den alten Wert. Gibt { settings, errors } zurück – errors: { feld: Grund }.
export function validateSettings(patch = {}, base = defaultSettings()) {
  const settings = { ...defaultSettings(), ...base };
  const errors = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key in TEXT_LIMITS) {
      const text = cleanText(value, TEXT_LIMITS[key], key === 'about');
      if (Array.from(String(value ?? '')).length > TEXT_LIMITS[key]) errors[key] = `höchstens ${TEXT_LIMITS[key]} Zeichen`;
      settings[key] = text;
    } else if (key === 'primary' || key === 'background' || key === 'text') {
      const color = normalizeColor(value);
      if (color) settings[key] = color;
      else errors[key] = 'keine gültige Farbe (#rrggbb)';
    } else if (key in ENUMS) {
      if (ENUMS[key].some((o) => o.id === value)) settings[key] = value;
      else errors[key] = 'unbekannte Auswahl';
    } else if (key === 'offerVms' || key === 'offerStorage' || key === 'dark') {
      settings[key] = !!value;
    } // unbekannte Felder werden ignoriert
  }
  return { settings, errors };
}

// Einstellungen aus einem Spielstand bereinigen (fehlende Felder → Standard)
export function sanitizeSettings(data) {
  return validateSettings(data ?? {}, defaultSettings()).settings;
}

// ---------- Farben und Lesbarkeit ----------

// Relative Leuchtdichte nach WCAG 2 (0 = schwarz … 1 = weiß)
export function luminance(color) {
  const hex = normalizeColor(color) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Kontrastverhältnis nach WCAG (1 … 21)
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Farben, wie die Website sie zeigt: Im Dunkelmodus tauschen Hintergrund und Text (der Kontrast bleibt gleich).
// buttonText: Schrift auf Knöpfen in der Hauptfarbe (weiß oder fast schwarz, was besser lesbar ist)
export function themeColors(settings) {
  const s = { ...defaultSettings(), ...settings };
  const [background, text] = s.dark ? [s.text, s.background] : [s.background, s.text];
  const buttonText = contrastRatio(s.primary, '#ffffff') >= contrastRatio(s.primary, '#111111') ? '#ffffff' : '#111111';
  return { primary: s.primary, background, text, buttonText };
}

export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];

// Adresse für die Adresszeile der Vorschau, z. B. „www.druckercenter.de“
export function domainFor(name) {
  const slug = String(name ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `www.${slug || 'druckercenter'}.de`;
}

// Bewertung der Gestaltung: { filled, total, missing (Namen der leeren Felder), offers (mindestens ein Angebot),
// contrast (Text/Hintergrund, 2 Nachkommastellen), readable (contrast ≥ MIN_CONTRAST), complete, bonus (0 … DESIGN_BONUS),
// hints (Texte für die App, z. B. „Text schlecht lesbar – weniger Kunden“) }
// Bonus: die Hälfte für ausgefüllte Felder (anteilig, ein Angebot zählt als Feld), die andere Hälfte für gut lesbaren
// Text. storageAvailable: ob Speicher-Angebote zählen (nur mit NAS)
export function designReport(settings, { storageAvailable = true } = {}) {
  const s = { ...defaultSettings(), ...settings };
  const missing = DESIGN_FIELDS.filter(([key]) => !String(s[key] ?? '').trim()).map(([, label]) => label);
  const offers = s.offerVms || (s.offerStorage && storageAvailable);
  if (!offers) missing.push('Angebot (VMs oder Speicher)');
  const total = DESIGN_FIELDS.length + 1;
  const filled = total - missing.length;
  const contrast = Math.round(contrastRatio(s.background, s.text) * 100) / 100;
  const readable = contrast >= MIN_CONTRAST;
  const bonus = Math.round((DESIGN_BONUS / 2) * (filled / total + (readable ? 1 : 0)) * 1000) / 1000;
  const hints = [];
  if (!readable) hints.push(`Text schlecht lesbar – weniger Kunden (Kontrast ${contrast.toLocaleString('de-DE')} : 1, gut ab ${MIN_CONTRAST.toLocaleString('de-DE')} : 1)`);
  if (missing.length) hints.push(`Noch leer: ${missing.join(', ')} – volle Seiten bringen mehr Kunden`);
  if (contrastRatio(s.primary, s.dark ? s.text : s.background) < 1.5) hints.push('Hauptfarbe hebt sich kaum vom Hintergrund ab');
  return { filled, total, missing, offers, contrast, readable, complete: !missing.length, bonus, hints };
}

// Beispielpreise für die Angebotskarten der Vorschau (Mietfaktor 1): kleinste VM (2 GB · 2 Cores) und 1 TB Speicher
export function offerPrices() {
  return {
    vmFrom: Math.round((RENT_PER_GB * 2 + RENT_PER_CORE * 2) * 100) / 100,
    storagePerTb: Math.round(RENT_PER_GB_STORAGE * 1024 * 100) / 100,
  };
}

// ---------- Website ----------

const emptyDay = (day) => ({ day, visitors: 0, requests: 0, accepted: 0, income: 0, missed: 0, liveMinutes: 0, loadMinutes: 0 });
const cents = (n) => Math.round(n * 100) / 100;

export class Website {
  // rentals: core/server-rentals.js · storage: core/storage-rentals.js (optional) · clock: core/game-clock.js (für die
  // Tagesstatistik, optional – ohne Uhr zählt alles auf Tag 1)
  constructor({ economy, servers, rentals, storage = null, clock = null }) {
    this.economy = economy;
    this.servers = servers;
    this.rentals = rentals;
    this.storage = storage;
    this.clock = clock;
    this.settings = defaultSettings();
    this.published = false;   // Einrichtung abgeschlossen (publish)
    this.running = false;     // mindestens ein Website-Server läuft (beim letzten Prüfen)
    this.bootLeft = 0;        // Spielminuten bis hochgefahren
    this.activeCount = 0;     // laufende Website-Server beim letzten Prüfen
    this.progress = 0;        // angesammelte Anfragen (Bruchteile) bis zur nächsten
    this.threshold = 1;       // ab so viel kommt die nächste Anfrage (1 ± Zufall)
    this.visitorAcc = 0;      // Bruchteile von Besuchern
    this.today = emptyDay(this.day);
    this.history = [];        // vergangene Tage, neuester zuerst
    this.totalIncome = 0;     // Einnahmen über die Website seit Spielbeginn
    this.random = Math.random; // austauschbar für Tests
    this.dirty = true;
    this.sinceCheck = 0;
    this.lastState = null;    // null: erste Prüfung nach Start bzw. Laden meldet nichts
    this.lastPercent = -1;
    this.listeners = new Set();
    // (type, data) => void – 'state-changed' { state, previous } (nicht nach Start/Laden), 'online-request'
    // { request, kind: 'vm' | 'storage' }
    this.onEvent = null;
    // Rückrufe aus der Vermietung: angenommene Online-Anfragen und Miete über die Website (Statistik)
    rentals.website = this;
    if (storage) storage.website = this;
    economy.subscribe(() => { this.dirty = true; });
  }

  // ---------- Abfragen ----------

  get day() {
    return this.clock?.day ?? 1;
  }

  // Alle eingebauten Website-Server, ob online oder nicht
  get websiteServers() {
    return this.servers.installed.filter(isWebsiteServer);
  }

  // Website-Server, die die Website gerade tragen: online (also auch nicht defekt oder eingefroren) und nicht privat
  activeServers(reached = this.servers.reachable()) {
    return this.websiteServers.filter((d) => this.servers.isOnline(d, reached) && !this.servers.isPrivateDevice(d));
  }

  get state() {
    if (this.dirty) this.refresh();
    if (!this.running) return 'off';
    if (this.bootLeft > 0) return 'booting';
    return this.published ? 'live' : 'setup';
  }

  get stateText() {
    return WEBSITE_STATES[this.state];
  }

  get isLive() {
    return this.state === 'live';
  }

  // Fortschritt beim Hochfahren 0 … 1 (1 = hochgefahren bzw. nicht am Hochfahren)
  get bootProgress() {
    return this.running ? Math.min(1, Math.max(0, 1 - this.bootLeft / BOOT_MINUTES)) : 0;
  }

  // Warum die Website gerade offline ist (für die App), oder null
  offlineReason(reached = this.servers.reachable()) {
    if (this.state !== 'off') return null;
    const list = this.websiteServers;
    if (!list.length) return 'Kein Website-Server eingebaut – im Server-Shop (Serie „Web“) kaufen';
    const pub = list.filter((d) => !this.servers.isPrivateDevice(d));
    if (!pub.length) return 'Website-Server stehen in privaten Schränken – dort läuft keine Website';
    const why = this.servers.offlineReason(pub[0], reached);
    return `Kein Website-Server online${why ? ` – ${pub[0].type.name}: ${why}` : ''}`;
  }

  // Website-Server, die für Anfragen zählen (höchstens MAX_COUNTED_SERVERS)
  get countedServers() {
    if (this.dirty) this.refresh();
    return Math.min(MAX_COUNTED_SERVERS, this.activeCount);
  }

  // Auslastung der Website-Server 0 … 1: Anteil, der Anfragen bearbeitet – ab dem fünften Server langweilen sich die
  // übrigen (4 von 5 = 80 %). Ohne laufenden Server 0
  get utilization() {
    if (this.dirty) this.refresh();
    return this.activeCount ? this.countedServers / this.activeCount : 0;
  }

  // Ob die Website Speicher anbieten kann (eine NAS außerhalb des privaten Bereichs)
  get storageAvailable() {
    return !!this.storage?.requestsPossible;
  }

  design() {
    return designReport(this.settings, { storageAvailable: this.storageAvailable });
  }

  // Online-Anfragen pro Spieltag bei so vielen laufenden Website-Servern (ohne Status-Prüfung)
  requestsPerDayFor(count, bonus = this.design().bonus) {
    return Math.min(MAX_COUNTED_SERVERS, Math.max(0, count)) * REQUESTS_PER_DAY * (1 + bonus);
  }

  // Online-Anfragen pro Spieltag gerade (0, wenn die Website nicht live ist)
  get requestsPerDay() {
    return this.isLive ? this.requestsPerDayFor(this.activeCount) : 0;
  }

  // Wartende Online-Anfragen (VM und Speicher), älteste zuerst
  get onlineRequests() {
    const all = [...this.rentals.requests, ...(this.storage?.requests ?? [])];
    return all.filter((r) => r.source === 'website').sort((a, b) => a.waitLeft - b.waitLeft);
  }

  // Laufende Verträge, die über die Website kamen
  get onlineContracts() {
    return [...this.rentals.vms, ...(this.storage?.contracts ?? [])].filter((c) => c.source === 'website');
  }

  // Statistik für den Reiter der App: heute (mit Auslastung 0 … 1 als Mittel über die Live-Zeit) und die letzten Tage
  stats() {
    const withLoad = (d) => ({ ...d, income: cents(d.income), visitors: Math.floor(d.visitors), load: d.liveMinutes ? d.loadMinutes / d.liveMinutes : 0 });
    return {
      today: withLoad(this.today),
      history: this.history.map(withLoad),
      totalIncome: cents(this.totalIncome),
      utilization: this.utilization,
      servers: this.activeCount,
      counted: this.countedServers,
      requestsPerDay: this.requestsPerDay,
      waiting: this.onlineRequests.length,
      contracts: this.onlineContracts.length,
    };
  }

  // Was vor dem Veröffentlichen noch fehlt (leer = bereit)
  publishProblems() {
    const out = [];
    const state = this.state;
    if (state === 'off') out.push(this.offlineReason() ?? 'Kein Website-Server online');
    else if (state === 'booting') out.push('Website fährt noch hoch');
    if (!this.settings.name.trim()) out.push('Firmenname fehlt');
    if (!this.settings.offerVms && !(this.settings.offerStorage && this.storageAvailable)) out.push('Mindestens ein Angebot wählen (VMs oder Speicher)');
    return out;
  }

  // ---------- Ändern ----------

  // Einstellungen ändern (auch einzelne Felder): { ok, settings, errors } – ungültige Felder bleiben unverändert
  setSettings(patch) {
    const { settings, errors } = validateSettings(patch, this.settings);
    this.settings = settings;
    this.notify();
    return { ok: !Object.keys(errors).length, settings, errors };
  }

  // Fertiges Farbschema übernehmen (COLOR_SCHEMES)
  applyScheme(id) {
    const scheme = COLOR_SCHEMES.find((s) => s.id === id);
    if (!scheme) return false;
    this.setSettings({ primary: scheme.primary, background: scheme.background, text: scheme.text });
    return true;
  }

  // Einrichtung abschließen („Website veröffentlichen“): { ok: true } oder { ok: false, reason }. Danach ist die
  // Website live, solange ein Website-Server läuft – auch nach einem Ausfall, ohne neu einzurichten.
  publish() {
    const problems = this.publishProblems();
    if (problems.length) return { ok: false, reason: problems[0], problems };
    this.published = true;
    this.checkState();
    this.notify();
    return { ok: true };
  }

  // Für die Vermietung: Online-Anfrage angenommen (Spieler oder Automatik)
  recordAccepted(request) {
    if (request?.source !== 'website') return;
    this.rollDay();
    this.today.accepted++;
    this.notify();
  }

  // Für die Vermietung: Miete der Verträge, die über die Website kamen (zu jeder vollen Spielstunde)
  recordIncome(amount) {
    if (!(amount > 0)) return;
    this.rollDay();
    this.today.income += amount;
    this.totalIncome += amount;
    this.notify();
  }

  // ---------- Zeit ----------

  // Website-Server neu zählen; Hochfahren beginnt, sobald der erste wieder läuft
  refresh(reached = this.servers.reachable()) {
    this.dirty = false;
    this.sinceCheck = 0;
    const count = this.activeServers(reached).length;
    const changed = count !== this.activeCount;
    this.activeCount = count;
    if (count > 0 && !this.running) {
      this.running = true;
      this.bootLeft = BOOT_MINUTES;
    } else if (count === 0 && this.running) {
      this.running = false;
      this.bootLeft = 0;
    }
    if (changed) this.notify();
  }

  advance(gameMinutes) {
    if (!(gameMinutes > 0)) return;
    this.sinceCheck += gameMinutes;
    if (this.dirty || this.sinceCheck >= CHECK_EVERY) this.refresh();
    this.rollDay();
    if (this.running && this.bootLeft > 0) {
      this.bootLeft = Math.max(0, this.bootLeft - gameMinutes);
      const percent = Math.floor(this.bootProgress * 100);
      if (percent !== this.lastPercent) {
        this.lastPercent = percent;
        this.notify();
      }
    }
    this.checkState();
    if (this.state !== 'live') return;
    const t = this.today;
    t.liveMinutes += gameMinutes;
    t.loadMinutes += gameMinutes * this.utilization;
    const perDay = this.requestsPerDay;
    if (perDay <= 0) return;
    const share = perDay * gameMinutes / MINUTES_PER_DAY;
    // Besucher laufen gleichmäßig mit (± Zufall), Anfragen in Abständen mit ± REQUEST_JITTER
    this.visitorAcc += share * VISITORS_PER_REQUEST * (0.6 + this.random() * 0.8);
    if (this.visitorAcc >= 1) {
      const whole = Math.floor(this.visitorAcc);
      this.visitorAcc -= whole;
      t.visitors += whole;
    }
    this.progress += share;
    while (this.progress >= this.threshold) {
      this.progress -= this.threshold;
      this.threshold = 1 - REQUEST_JITTER + this.random() * 2 * REQUEST_JITTER;
      this.spawnOnline();
    }
  }

  // Eine Online-Anfrage erzeugen und direkt in die Vermietung legen (ohne Figur am Empfang). Gibt sie zurück oder null
  // (kein Angebot möglich bzw. schon MAX_ONLINE_WAITING Online-Anfragen offen – zählt als „verpasst“)
  spawnOnline() {
    const s = this.settings;
    const vm = s.offerVms && this.rentals.requestsPossible;
    const disk = s.offerStorage && !!this.storage?.requestsPossible;
    if ((!vm && !disk) || this.onlineRequests.length >= MAX_ONLINE_WAITING) {
      this.today.missed++;
      return null;
    }
    const kind = vm && disk ? (this.random() < STORAGE_SHARE ? 'storage' : 'vm') : vm ? 'vm' : 'storage';
    const market = kind === 'storage' ? this.storage : this.rentals;
    const request = { ...market.createRequest(), source: 'website', waitLeft: ONLINE_PATIENCE };
    market.addRequest(request);
    this.today.requests++;
    this.onEvent?.('online-request', { request, kind });
    this.notify();
    return request;
  }

  // Statuswechsel melden (nicht bei der ersten Prüfung nach Start oder Laden)
  checkState() {
    const state = this.state;
    if (state === this.lastState) return;
    const previous = this.lastState;
    this.lastState = state;
    if (previous !== null) this.onEvent?.('state-changed', { state, previous });
    this.notify();
  }

  // Neuer Spieltag: heutige Statistik in die Liste der letzten Tage
  rollDay() {
    const day = this.day;
    if (this.today.day === day) return;
    if (this.today.day < day) {
      this.history.unshift(this.today);
      this.history.length = Math.min(this.history.length, HISTORY_DAYS);
    }
    this.today = emptyDay(day);
  }

  // ---------- Speichern ----------

  toJSON() {
    return {
      settings: { ...this.settings },
      published: this.published,
      running: this.running,
      bootLeft: this.bootLeft,
      progress: this.progress,
      threshold: this.threshold,
      visitorAcc: this.visitorAcc,
      today: { ...this.today },
      history: this.history.map((d) => ({ ...d })),
      totalIncome: this.totalIncome,
    };
  }

  // Ohne Daten (alte Spielstände): Website nicht eingerichtet, keine Statistik. Lief die Website beim Speichern und
  // läuft ihr Server noch, ist sie gleich wieder da (ohne neu hochzufahren)
  load(data) {
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    const day = (d) => ({ ...emptyDay(num(d?.day, 1)), ...Object.fromEntries(Object.keys(emptyDay(0)).filter((k) => k !== 'day').map((k) => [k, Math.max(0, num(d?.[k]))])) });
    this.settings = sanitizeSettings(data?.settings);
    this.published = !!data?.published;
    this.running = !!data?.running;
    this.bootLeft = Math.min(BOOT_MINUTES, Math.max(0, num(data?.bootLeft)));
    this.progress = Math.max(0, num(data?.progress));
    this.threshold = Math.min(1 + REQUEST_JITTER, Math.max(1 - REQUEST_JITTER, num(data?.threshold, 1)));
    this.visitorAcc = Math.max(0, num(data?.visitorAcc));
    this.today = data?.today ? day(data.today) : emptyDay(this.day);
    this.history = Array.isArray(data?.history) ? data.history.slice(0, HISTORY_DAYS).map(day) : [];
    this.totalIncome = Math.max(0, num(data?.totalIncome));
    this.activeCount = 0;
    this.dirty = true;
    this.lastState = null;
    this.lastPercent = -1;
    this.rollDay();
    this.notify();
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
