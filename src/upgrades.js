// Ausbau der Halle: weitere Drucktische und Regalebenen kauft man mit Spielgeld.
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.

export const SLOTS_PER_TABLE = 4;
export const SPOOLS_PER_SHELF_LEVEL = 20;

// Preis für den 1., 2., 3. … Tisch bzw. die Regalebene. Den ersten Tisch und die unterste Ebene hat man von Anfang an.
export const TABLE_PRICES = [0, 150, 400, 900];
export const SHELF_LEVEL_PRICES = [0, 60, 150, 300];

export class Upgrades {
  constructor(economy) {
    this.economy = economy;
    this.tables = 1;
    this.shelfLevels = 1;
    this.listeners = new Set();
  }

  get maxTables() { return TABLE_PRICES.length; }
  get maxShelfLevels() { return SHELF_LEVEL_PRICES.length; }

  get printerSlots() { return this.tables * SLOTS_PER_TABLE; }
  get shelfCapacity() { return this.shelfLevels * SPOOLS_PER_SHELF_LEVEL; }

  // Preis des nächsten Tisches bzw. der nächsten Regalebene, null wenn alles gekauft ist
  get nextTablePrice() { return TABLE_PRICES[this.tables] ?? null; }
  get nextShelfPrice() { return SHELF_LEVEL_PRICES[this.shelfLevels] ?? null; }

  // Grund, warum man gerade nicht kaufen kann, oder null
  buyProblem(price) {
    if (price === null) return 'Alles ausgebaut';
    if (!this.economy.canAfford(price)) return 'Zu wenig Geld';
    return null;
  }

  buyTable() {
    const price = this.nextTablePrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.tables++;
    this.notify();
    return true;
  }

  buyShelfLevel() {
    const price = this.nextShelfPrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.shelfLevels++;
    this.notify();
    return true;
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
