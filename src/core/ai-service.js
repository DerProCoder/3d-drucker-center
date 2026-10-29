// Eigene KI auf KI-GPU-Servern (core/server-catalog.js, id AI_SERVER_ID): Die Server werden nicht vermietet, sondern
// rechnen für die KI. Je mehr KI-GPU-Server online sind, desto schlauer ist die KI (Stufe 1–10, 0 = offline), und desto
// mehr bringt das KI-Abo der Kunden: zu jeder vollen Spielstunde online Server × AI_FEE_PER_SERVER × Stufenfaktor.
// Online heißt wie bei jedem Server: übers Netz am Internet (core/servers.js, reachable), nicht defekt oder eingefroren
// (core/server-climate.js) – und zusätzlich nicht überhitzt: Über TEMP_LIMITS.hot drosseln die GPUs und rechnen nicht
// mit. Wo der Server steht (Kunden-, private oder Automatik-Reihe), ist egal. Strom und Kühlung laufen wie bei allen
// Geräten über servers.js bzw. server-climate.js.
// Die Stufe wird nicht gespeichert, sie ergibt sich aus den Servern; gespeichert werden die Gesamteinnahmen und der
// Tagesverlauf (core/ai-day-log.js: Einnahmen, Aufträge, Strom … je Tag) für den Vergleich mit gestern und die
// Prognose über mehrere Tage.
// Stufenwechsel erkennt advance() spätestens nach CHECK_EVERY Spielminuten, nach Änderungen an der Einrichtung
// (economy.subscribe: Einbauen, Kabel, Reparatur …) schon im nächsten Aufruf. Ohne Three.js und DOM.
import { TEMP_LIMITS } from './server-climate.js';
import { DayLog } from './ai-day-log.js';

export const AI_SERVER_ID = 'server-ai';
export const AI_FEE_PER_SERVER = 180;                 // € je Online-Server und Spielstunde (bei Stufenfaktor 1)
// Stufenfaktor je Stufe (Index = Stufe, 0 = offline)
export const LEVEL_FACTORS = [0, 1, 1.1, 1.2, 1.35, 1.5, 1.65, 1.8, 2, 2.25, 2.5];
export const MAX_LEVEL = 10;
// Mindestanzahl Online-Server je Stufe (Index = Stufe): 1 → 1, 2–3 → 2, 4–5 → 3, 6–7 → 4, 8–9 → 5, 10–11 → 6,
// 12–13 → 7, 14–16 → 8, 17–19 → 9, 20+ → 10 (28 Schrank-Stellplätze im
// Serverraum, ein 42-HE-Schrank fasst 10 KI-GPU-Server)
export const LEVEL_THRESHOLDS = [0, 1, 2, 4, 6, 8, 10, 12, 14, 17, 20];
const CHECK_EVERY = 1;                                // Spielminuten zwischen zwei Prüfungen ohne Änderung

const cents = (n) => Math.round(n * 100) / 100;

// Stufe bei so vielen KI-GPU-Servern online (0 = KI offline)
export function levelFor(count) {
  let level = 0;
  while (level < MAX_LEVEL && count >= LEVEL_THRESHOLDS[level + 1]) level++;
  return level;
}

// KI-Abo pro Spielstunde bei so vielen Servern online
export function feeFor(count) {
  return cents(count * AI_FEE_PER_SERVER * LEVEL_FACTORS[levelFor(count)]);
}

// Ob ein Gerät (aus economy.furniture) bzw. ein Typ ein KI-GPU-Server ist
export const isAIServer = (device) => (device?.type ?? device)?.id === AI_SERVER_ID;

export class AIService {
  // orders, clock, progress: nur für den Tagesverlauf (log) – fehlen sie, reicht der KI-Berater sie nach (connect)
  constructor({ economy, servers, climate = null, orders = null, clock = null, progress = null }) {
    this.economy = economy;
    this.servers = servers;
    this.climate = climate;
    this.log = new DayLog(economy); // Tagesverlauf: Vergleich mit gestern (ab Stufe 6), Prognose über Tage (ab Stufe 7)
    this.log.connect({ orders, clock, progress });
    this.totalIncome = 0;     // KI-Abo seit Spielbeginn (wird gespeichert)
    this.count = 0;           // KI-Server online beim letzten Prüfen
    this.currentLevel = 0;
    this.dirty = true;        // Einrichtung hat sich geändert – beim nächsten Zugriff neu zählen
    this.started = false;     // erste Prüfung (nach Start oder Laden) meldet keinen Stufenwechsel
    this.initialPending = false; // Stufe der ersten Prüfung noch still als 'level-initial' melden
    this.sinceCheck = 0;
    this.listeners = new Set();
    // (type, data) => void – 'income' { amount, level, servers }, 'level-changed' { level, previous },
    // 'level-initial' { level } (leise: Stufe nach Start oder Laden, nur für Erfolge – keine HUD-Meldung)
    this.onEvent = null;
    economy.subscribe(() => { this.dirty = true; });
  }

  // Fehlende Spielsysteme für den Tagesverlauf nachreichen ({ orders, clock, progress })
  connect(game = {}) {
    this.log.connect(game);
  }

  // ---------- Abfragen ----------

  // Alle eingebauten KI-GPU-Server, ob online oder nicht
  get aiServers() {
    return this.servers.installed.filter(isAIServer);
  }

  // Warum ein KI-GPU-Server gerade nicht für die KI rechnet, oder null. reached: aus servers.reachable()
  problemOf(device, reached = this.servers.reachable()) {
    if (device?.location !== 'rack') return 'nicht eingebaut';
    if (!this.servers.isOnline(device, reached)) return `offline – ${this.servers.offlineReason(device, reached) ?? 'keine Verbindung'}`;
    const temp = this.climate?.devices.get(device.id)?.temp;
    if (temp > TEMP_LIMITS.hot) return 'überhitzt – GPUs drosseln';
    return null;
  }

  // KI-GPU-Server, die gerade für die KI rechnen
  workingServers(reached = this.servers.reachable()) {
    return this.aiServers.filter((d) => this.problemOf(d, reached) === null);
  }

  get onlineCount() {
    if (this.dirty) this.refresh();
    return this.count;
  }

  get level() {
    if (this.dirty) this.refresh();
    return this.currentLevel;
  }

  // Aktuelles KI-Abo pro Spielstunde
  get incomePerHour() {
    return feeFor(this.onlineCount);
  }

  get factor() {
    return LEVEL_FACTORS[this.level];
  }

  // ---------- Zeit ----------

  // Neu zählen und einen Stufenwechsel melden (nicht bei der ersten Prüfung nach Start oder Laden)
  refresh() {
    this.dirty = false;
    this.sinceCheck = 0;
    const count = this.workingServers().length;
    const level = levelFor(count);
    const previous = this.currentLevel;
    const changed = count !== this.count || level !== previous;
    this.count = count;
    this.currentLevel = level;
    if (!this.started) {
      this.started = true;
      this.initialPending = true; // advance() meldet die Stufe leise als 'level-initial' (Erfolge, keine HUD-Meldung)
      if (changed) this.notify();
      return;
    }
    if (level !== previous) this.onEvent?.('level-changed', { level, previous });
    if (changed) this.notify();
  }

  // Läuft in Spielminuten: höchstens einmal je CHECK_EVERY neu zählen, nach Änderungen sofort
  advance(gameMinutes) {
    this.sinceCheck += gameMinutes;
    if (this.dirty || this.sinceCheck >= CHECK_EVERY) this.refresh();
    // Erste Prüfung nach Start oder Laden: Stufe still melden – erst hier in der Spielschleife, damit onEvent sicher
    // verdrahtet ist, auch wenn beim Aufbau schon jemand die Stufe abgefragt hat
    if (this.initialPending && this.onEvent) {
      this.initialPending = false;
      this.onEvent('level-initial', { level: this.currentLevel });
    }
    this.log.advance(gameMinutes);
  }

  // Zu jeder vollen Spielstunde: KI-Abo gutschreiben. Gibt den Betrag zurück (0 ohne KI-Server online)
  payHour() {
    this.refresh();
    const amount = feeFor(this.count);
    if (amount <= 0) return 0;
    this.economy.earn(amount);
    this.totalIncome = cents(this.totalIncome + amount);
    this.log.addAIIncome(amount);
    this.onEvent?.('income', { amount, level: this.currentLevel, servers: this.count });
    this.notify();
    return amount;
  }

  // ---------- Speichern ----------

  toJSON() {
    return { totalIncome: this.totalIncome, log: this.log.toJSON() };
  }

  // Ohne Daten (alte Spielstände): noch nichts verdient, der Tagesverlauf beginnt jetzt
  load(data) {
    this.totalIncome = data?.totalIncome ?? 0;
    this.log.load(data?.log);
    this.count = 0;
    this.currentLevel = 0;
    this.dirty = true;
    this.started = false;
    this.initialPending = false;
    this.sinceCheck = 0;
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
