// Tagesverlauf für die KI (ab Stufe 6 „Vergleich mit gestern“, ab Stufe 7 Prognose über mehrere Tage): zählt je
// Spieltag Einnahmen, KI-Abo, gelieferte Aufträge, Strom, laufende Kosten, verdrucktes Filament und XP. Gehört zum
// KI-Dienst (core/ai-service.js) und wird mit ihm gespeichert. Ohne Three.js und DOM.
// Einnahmen: jede Erhöhung des Kontostands zwischen zwei economy.notify() – alle Einnahmen laufen über
// economy.earn(), das sofort meldet. Strom und Kosten sind die tatsächlich angefallenen Beträge (mit Tag-/Nachttarif,
// bei Stromausfall kein Strom, #57): Zuwachs von economy.powerCostTotal bzw. costTotal zwischen zwei Messungen,
// ohne diese Zähler aus powerCostPerHour bzw. costPerHour aufsummiert, Filament über job.gramsUsed der laufenden Drucke, Aufträge und XP als Zuwachs von orders.completed
// bzw. progress.xp. Ohne Uhr (clock) gibt es keine Tage und damit keinen Verlauf.

export const LOG_DAYS = 7;          // so viele abgeschlossene Tage werden gemerkt
const SAMPLE_EVERY = 1;             // Spielminuten zwischen zwei Messungen von Strom, Filament, Aufträgen
const MINUTES_PER_DAY = 24 * 60;

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Leerer Tag. since: Spielminute des Tages, ab der aufgezeichnet wurde (0 = ganzer Tag)
export const emptyDay = (day = 0, since = 0) => ({
  day, since, income: 0, aiIncome: 0, orders: 0, power: 0, costs: 0, filament: 0, xp: 0,
});

// Tag aus dem Spielstand: fehlende oder kaputte Werte werden 0
function cleanDay(d) {
  const day = emptyDay(Math.max(0, Math.floor(num(d?.day))), Math.max(0, Math.min(MINUTES_PER_DAY, num(d?.since))));
  for (const key of ['income', 'aiIncome', 'orders', 'power', 'costs', 'filament', 'xp']) day[key] = Math.max(0, num(d?.[key]));
  return day;
}

export class DayLog {
  constructor(economy) {
    this.economy = economy;
    this.orders = null;      // core/orders.js (completed) – über connect()
    this.clock = null;       // core/game-clock.js (day, minutes)
    this.progress = null;    // core/progress.js (xp)
    this.today = emptyDay();
    this.days = [];          // abgeschlossene Tage, neuester zuerst, höchstens LOG_DAYS
    this.lastMoney = economy?.money ?? 0;
    this.lastCompleted = null;  // Zählerstände der letzten Messung (null = noch nicht gemessen)
    this.lastXp = null;
    this.lastPowerTotal = num(economy?.powerCostTotal); // Zählerstände der Kosten (core/economy.js)
    this.lastCostTotal = num(economy?.costTotal);
    this.jobGrams = new WeakMap(); // Druckauftrag → bei der letzten Messung verbrauchte Gramm
    this.primed = false;     // erste Messung nach Start/Laden merkt nur die Zählerstände
    this.sinceSample = 0;
    economy?.subscribe?.(() => this.onMoney());
  }

  // Fehlende Spielsysteme nachreichen (main.js über AIService oder der KI-Berater)
  connect({ orders, clock, progress } = {}) {
    this.orders ??= orders ?? null;
    this.clock ??= clock ?? null;
    this.progress ??= progress ?? null;
    this.rollDay();
  }

  // ---------- Aufzeichnen ----------

  // Neuer Spieltag: den alten in den Verlauf schieben. Der erste Tag einer Aufzeichnung beginnt mitten am Tag (since)
  rollDay() {
    const clock = this.clock;
    if (!clock) return;
    const day = clock.day;
    if (this.today.day === day) return;
    if (this.today.day > day) this.days = []; // Uhr zurückgestellt (neues Spiel): alter Verlauf passt nicht mehr
    if (this.today.day > 0 && this.today.day < day) {
      this.days.unshift(this.today);
      this.days.length = Math.min(this.days.length, LOG_DAYS);
    }
    const startsNow = this.today.day > 0 && this.today.day < day;
    this.today = emptyDay(day, startsNow ? 0 : Math.floor(clock.minutes % MINUTES_PER_DAY));
  }

  // Kontostand gestiegen: Einnahme (Aufträge, VM-Miete, KI-Abo, Eintritt)
  onMoney() {
    const money = this.economy?.money ?? 0;
    const delta = money - this.lastMoney;
    this.lastMoney = money;
    if (!(delta > 0) || !this.clock) return;
    this.rollDay();
    this.today.income = round2(this.today.income + delta);
  }

  // Anteil des KI-Abos (ai-service.js payHour) – steckt zusätzlich schon in income
  addAIIncome(amount) {
    if (!this.clock || !(amount > 0)) return;
    this.rollDay();
    this.today.aiIncome = round2(this.today.aiIncome + amount);
  }

  // Läuft in Spielminuten (AIService.advance): höchstens einmal je SAMPLE_EVERY messen
  advance(gameMinutes) {
    if (!this.clock) return;
    this.sinceSample += gameMinutes;
    if (this.sinceSample < SAMPLE_EVERY) return;
    const minutes = this.sinceSample;
    this.sinceSample = 0;
    this.sample(minutes);
  }

  sample(minutes) {
    this.rollDay();
    const t = this.today;
    const { economy, orders, progress } = this;
    if (economy) {
      if (Number.isFinite(economy.powerCostTotal) && Number.isFinite(economy.costTotal)) {
        // tatsächlich abgerechnet seit der letzten Messung (Zähler können nach einem Neustart kleiner sein)
        const power = economy.powerCostTotal - this.lastPowerTotal;
        const costs = economy.costTotal - this.lastCostTotal;
        this.lastPowerTotal = economy.powerCostTotal;
        this.lastCostTotal = economy.costTotal;
        if (power > 0) t.power += power; // ungerundet, sonst gingen Bruchteile von Cent je Minute verloren
        if (costs > 0) t.costs += costs;
      } else {
        t.power = round2(t.power + (num(economy.powerCostPerHour ?? economy.powerPerHour) * minutes) / 60);
        t.costs = round2(t.costs + (num(economy.costPerHour) * minutes) / 60);
      }
      for (const p of economy.printers ?? []) {
        const job = p.job;
        if (!job || typeof job !== 'object') continue;
        const used = num(job.gramsUsed);
        const before = this.jobGrams.get(job);
        if (this.primed && used > (before ?? 0)) t.filament = round2(t.filament + used - (before ?? 0));
        this.jobGrams.set(job, used);
      }
    }
    if (orders) {
      const done = num(orders.completed);
      if (this.primed && this.lastCompleted != null && done > this.lastCompleted) t.orders += done - this.lastCompleted;
      this.lastCompleted = done;
    }
    if (progress) {
      const xp = num(progress.xp);
      if (this.primed && this.lastXp != null && xp > this.lastXp) t.xp += xp - this.lastXp;
      this.lastXp = xp;
    }
    this.primed = true;
  }

  // ---------- Abfragen ----------

  // Gestern (bzw. der letzte aufgezeichnete Tag) oder null
  get yesterday() {
    return this.days[0] ?? null;
  }

  // Durchschnitt je Tag über die letzten n abgeschlossenen Tage (nur ganze Tage, sonst alle): { days, income, … } oder null
  average(n = LOG_DAYS) {
    const full = this.days.filter((d) => d.since === 0).slice(0, n);
    const list = full.length ? full : this.days.slice(0, n);
    if (!list.length) return null;
    const out = { days: list.length, partial: !full.length };
    for (const key of ['income', 'aiIncome', 'orders', 'power', 'costs', 'filament', 'xp']) {
      // angebrochene Tage auf einen ganzen Tag hochrechnen
      out[key] = list.reduce((sum, d) => sum + d[key] * (MINUTES_PER_DAY / Math.max(60, MINUTES_PER_DAY - d.since)), 0) / list.length;
    }
    return out;
  }

  // ---------- Speichern ----------

  toJSON() {
    return { today: { ...this.today }, days: this.days.map((d) => ({ ...d })) };
  }

  // Ohne Daten (alte Spielstände): Aufzeichnung beginnt jetzt
  load(data) {
    this.today = data?.today ? cleanDay(data.today) : emptyDay();
    this.days = Array.isArray(data?.days) ? data.days.slice(0, LOG_DAYS).map(cleanDay).filter((d) => d.day > 0) : [];
    this.lastMoney = this.economy?.money ?? 0;
    this.lastCompleted = null;
    this.lastXp = null;
    this.jobGrams = new WeakMap();
    this.primed = false;
    this.sinceSample = 0;
    this.rollDay();
  }
}
