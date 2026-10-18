// Level und Ruf: Jeder gelieferte Auftrag bringt XP (1 XP pro verdientem Euro).
// Höhere Level bringen einen neuen Titel, besser zahlende Kunden und mehr Aufträge gleichzeitig.
// Bewusst ohne Three.js und DOM.

export const TITLES = [
  'Bastler', 'Hobby-Drucker', 'Garagen-Werkstatt', 'Kleine Druckerei', 'Druckerei',
  'Druck-Manufaktur', 'Druckfabrik', 'Druck-Konzern', 'Druck-Imperium', 'Legende des Filaments',
];

// Gesamt-XP, die man für ein Level braucht (Level 1 = 0 XP)
export const xpForLevel = (level) => 30 * (level - 1) ** 2;

export class Progress {
  constructor() {
    this.xp = 0;
    this.listeners = new Set();
    this.onLevelUp = null; // (level, title) => void
  }

  get level() {
    let level = 1;
    while (this.xp >= xpForLevel(level + 1)) level++;
    return level;
  }

  get title() {
    return TITLES[Math.min(this.level - 1, TITLES.length - 1)];
  }

  // Anteil 0…1 bis zum nächsten Level
  get levelProgress() {
    const from = xpForLevel(this.level);
    const to = xpForLevel(this.level + 1);
    return (this.xp - from) / (to - from);
  }

  get xpToNext() {
    return xpForLevel(this.level + 1) - this.xp;
  }

  // +10 % Lohn pro Level
  get rewardMultiplier() {
    return 1 + (this.level - 1) * 0.1;
  }

  // Ab Level 2 jedes zweite Level ein Auftrag mehr, höchstens 8
  get maxOpenOrders() {
    return Math.min(8, 3 + Math.floor(this.level / 2));
  }

  addXp(amount) {
    const before = this.level;
    this.xp += Math.max(0, Math.round(amount));
    if (this.level > before) this.onLevelUp?.(this.level, this.title);
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
