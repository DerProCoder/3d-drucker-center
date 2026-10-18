// Spieluhr: zählt Spielminuten, liefert Tag und Uhrzeit und meldet jeden neuen Tag (z. B. für die Stromrechnung).
// Bewusst ohne Three.js und DOM.

export const START_MINUTE = 8 * 60; // Spielbeginn: Tag 1, 08:00
const MINUTES_PER_DAY = 24 * 60;
export const DAYS_PER_MONTH = 30;   // Stromkosten sind pro Monat angegeben, abgerechnet wird täglich

export class GameClock {
  constructor() {
    this.minutes = START_MINUTE;
    this.listeners = new Set();
    this.onNewDay = null; // (day) => void
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
    this.minutes += gameMinutes;
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
