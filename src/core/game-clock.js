// Spieluhr: zählt Spielminuten, liefert Tag und Uhrzeit und meldet jede neue Stunde (Abrechnung von Miete
// und Strom) und jeden neuen Tag. Bewusst ohne Three.js und DOM.

export const START_MINUTE = 8 * 60; // Spielbeginn: Tag 1, 08:00
const MINUTES_PER_DAY = 24 * 60;

export class GameClock {
  constructor() {
    this.minutes = START_MINUTE;
    this.listeners = new Set();
    this.onNewDay = null;  // (day) => void
    this.onNewHour = null; // (hour) => void – Stunden seit Spielbeginn um Mitternacht von Tag 1
  }

  get day() {
    return Math.floor(this.minutes / MINUTES_PER_DAY) + 1;
  }

  get timeText() {
    const m = Math.floor(this.minutes % MINUTES_PER_DAY);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  advance(gameMinutes) {
    const before = Math.floor(this.minutes);
    const dayBefore = this.day;
    const hourBefore = Math.floor(this.minutes / 60);
    this.minutes += gameMinutes;
    for (let h = hourBefore + 1; h <= Math.floor(this.minutes / 60); h++) this.onNewHour?.(h);
    for (let d = dayBefore + 1; d <= this.day; d++) this.onNewDay?.(d);
    if (Math.floor(this.minutes) !== before) this.notify(); // nur einmal pro Spielminute
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
