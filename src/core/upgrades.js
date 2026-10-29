// Ausbau der Halle: weitere Drucktische und Regalebenen kauft man mit Spielgeld, dazu eine zweite Etage (mit Treppe)
// und danach einen Fahrstuhl, außerdem einen Keller in 70 m Tiefe (mit Treppenhaus) und danach einen eigenen
// Keller-Fahrstuhl. Alles wird geliefert (economy.deliverySeconds); Regalebenen, Etage, Keller und Fahrstühle baut
// der Lieferdienst gleich ein, Tische stellt man selbst auf.
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.

export const SLOTS_PER_TABLE = 4;
export const RACKS_PER_TABLE = 3; // Regalplätze in den Lücken zwischen den 4 Druckerplätzen
export const SPOOLS_PER_SHELF_LEVEL = 20;

// Preis für den 1., 2., 3. … Tisch bzw. die Regalebene. Den ersten Tisch und die unterste Ebene hat man von Anfang an.
export const TABLE_PRICES = [0, 150, 400, 900];
export const SHELF_LEVEL_PRICES = [0, 60, 150, 300];
export const UPPER_FLOOR_PRICE = 2000; // zweite Etage, so groß wie die Halle, mit Treppe
export const ELEVATOR_PRICE = 3000;    // Fahrstuhl zwischen Halle und zweiter Etage
export const BASEMENT_PRICE = 5000;    // Keller 70 m unter der Halle, mit Treppenhaus
export const BASEMENT_ELEVATOR_PRICE = 4000; // Fahrstuhl zwischen Halle und Keller

export class Upgrades {
  constructor(economy) {
    this.economy = economy;
    this.tables = 1;          // aufgestellte Tische
    this.tablesOrdered = 1;   // gekaufte Tische (aufgestellt, unterwegs oder bereit zum Aufstellen)
    this.shelfLevels = 1;     // eingebaute Regalebenen
    this.shelfOrdered = 1;
    this.upperFloor = false;  // zweite Etage gebaut
    this.upperFloorOrdered = false;
    this.elevator = false;    // Fahrstuhl gebaut
    this.elevatorOrdered = false;
    this.basement = false;    // Keller mit Treppenhaus gebaut
    this.basementOrdered = false;
    this.basementElevator = false; // Keller-Fahrstuhl gebaut
    this.basementElevatorOrdered = false;
    // { kind: 'table' | 'shelf' | 'floor' | 'elevator' | 'basement' | 'basementElevator', arriveIn (Sekunden) }
    this.deliveries = [];
    this.listeners = new Set();
    this.onEvent = null;      // (type, data) => void – z. B. 'delivered'
  }

  // Gelieferte Tische, die noch aufgestellt werden müssen
  get tablesReady() {
    return this.tablesOrdered - this.tables - this.deliveries.filter((d) => d.kind === 'table').length;
  }

  // Restzeit des nächsten Tisches, der noch unterwegs ist (Sekunden) oder null
  get nextTableArrival() {
    const times = this.deliveries.filter((d) => d.kind === 'table').map((d) => d.arriveIn);
    return times.length ? Math.max(0, Math.min(...times)) : null;
  }

  get maxTables() { return TABLE_PRICES.length; }
  get maxShelfLevels() { return SHELF_LEVEL_PRICES.length; }

  get printerSlots() { return this.tables * SLOTS_PER_TABLE; }
  get rackSlots() { return this.tables * RACKS_PER_TABLE; }
  get shelfCapacity() { return this.shelfLevels * SPOOLS_PER_SHELF_LEVEL; }

  // Preis des nächsten Tisches bzw. der nächsten Regalebene, null wenn alles gekauft ist
  get nextTablePrice() { return TABLE_PRICES[this.tablesOrdered] ?? null; }
  get nextShelfPrice() { return SHELF_LEVEL_PRICES[this.shelfOrdered] ?? null; }
  get upperFloorPrice() { return this.upperFloorOrdered ? null : UPPER_FLOOR_PRICE; }
  get elevatorPrice() { return this.elevatorOrdered ? null : ELEVATOR_PRICE; }
  get basementPrice() { return this.basementOrdered ? null : BASEMENT_PRICE; }
  get basementElevatorPrice() { return this.basementElevatorOrdered ? null : BASEMENT_ELEVATOR_PRICE; }

  // Restzeit einer Lieferung dieser Art (Sekunden) oder null
  arrivalOf(kind) {
    const times = this.deliveries.filter((d) => d.kind === kind).map((d) => d.arriveIn);
    return times.length ? Math.max(0, Math.min(...times)) : null;
  }

  // Grund, warum man gerade nicht kaufen kann, oder null
  buyProblem(price) {
    if (price === null) return 'Alles ausgebaut';
    if (!this.economy.canAfford(price)) return 'Zu wenig Geld';
    return null;
  }

  buyTable() {
    const price = this.nextTablePrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.tablesOrdered++;
    this.deliveries.push({ kind: 'table', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  // Gelieferten Tisch an der nächsten freien Stelle aufstellen
  placeTable() {
    if (this.tablesReady <= 0) return false;
    this.tables++;
    this.notify();
    return true;
  }

  buyUpperFloor() {
    const price = this.upperFloorPrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.upperFloorOrdered = true;
    this.deliveries.push({ kind: 'floor', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  // Grund, warum man den Fahrstuhl gerade nicht kaufen kann, oder null
  get elevatorProblem() {
    if (this.elevatorOrdered) return 'Alles ausgebaut';
    if (!this.upperFloor) return 'Erst die zweite Etage bauen';
    return this.buyProblem(this.elevatorPrice);
  }

  buyElevator() {
    if (this.elevatorProblem || !this.economy.spend(this.elevatorPrice)) return false;
    this.elevatorOrdered = true;
    this.deliveries.push({ kind: 'elevator', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  buyBasement() {
    const price = this.basementPrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.basementOrdered = true;
    this.deliveries.push({ kind: 'basement', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  // Grund, warum man den Keller-Fahrstuhl gerade nicht kaufen kann, oder null
  get basementElevatorProblem() {
    if (this.basementElevatorOrdered) return 'Alles ausgebaut';
    if (!this.basement) return 'Erst den Keller bauen';
    return this.buyProblem(this.basementElevatorPrice);
  }

  buyBasementElevator() {
    if (this.basementElevatorProblem || !this.economy.spend(this.basementElevatorPrice)) return false;
    this.basementElevatorOrdered = true;
    this.deliveries.push({ kind: 'basementElevator', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  buyShelfLevel() {
    const price = this.nextShelfPrice;
    if (this.buyProblem(price) || !this.economy.spend(price)) return false;
    this.shelfOrdered++;
    this.deliveries.push({ kind: 'shelf', arriveIn: this.economy.deliverySeconds });
    this.notify();
    return true;
  }

  // Läuft in echter Zeit: angekommene Regalebenen, Etage, Keller und Fahrstühle werden eingebaut, Tische warten aufs
  // Aufstellen
  advance(seconds) {
    if (!this.deliveries.length) return;
    let changed = false;
    for (const d of this.deliveries) d.arriveIn -= seconds;
    for (const d of this.deliveries.filter((x) => x.arriveIn <= 0)) {
      if (d.kind === 'shelf') this.shelfLevels++;
      if (d.kind === 'floor') this.upperFloor = true;
      if (d.kind === 'elevator') this.elevator = true;
      if (d.kind === 'basement') this.basement = true;
      if (d.kind === 'basementElevator') this.basementElevator = true;
      this.onEvent?.('delivered', { kind: d.kind });
      changed = true;
    }
    this.deliveries = this.deliveries.filter((d) => d.arriveIn > 0);
    if (changed) this.notify();
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
