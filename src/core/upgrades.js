// Ausbau der Halle: weitere Drucktische und Regalebenen kauft man mit Spielgeld, dazu eine zweite Etage (mit Treppe)
// und danach einen Fahrstuhl, außerdem einen Keller in 70 m Tiefe (mit Treppenhaus) und danach einen eigenen
// Keller-Fahrstuhl und den Raum bei −10,5 m am Kellertreppenhaus (Leitstand und Technikraum). Alles wird geliefert (economy.deliverySeconds); Regalebenen, Etage, Keller und Fahrstühle baut
// der Lieferdienst gleich ein, Tische stellt man selbst auf. Den Keller kann man danach in Stufen bis 120 × 120 m
// ausbauen (basementStage; Felder, Größen und Preise in core/basement-layout.js).
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.
import { BasementLayout, MAX_BASEMENT_STAGE, stageInfo } from './basement-layout.js';

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
export const CONTROL_ROOM_PRICE = 10000;     // Raum bei −10,5 m am Kellertreppenhaus (Leitstand und Technikraum)
export const BASEMENT_STAGE_DELIVERY_FACTOR = 2; // Kellerausbau dauert doppelt so lange wie eine Lieferung

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
    // Keller: gebaute bzw. bestellte Ausbaustufe (0 = kein Keller, 1 = 20 × 20 m … 6 = 120 × 120 m). basement und
    // basementOrdered (Keller mit Treppenhaus = Stufe 1) leiten sich daraus ab.
    this.basementStage = 0;
    this.basementStageOrdered = 0;
    this.basementLayout = new BasementLayout(() => this.basementStage); // Felder: Lager oder Daten-Bunker
    this.basementElevator = false; // Keller-Fahrstuhl gebaut
    this.basementElevatorOrdered = false;
    this.controlRoom = false; // Raum bei −10,5 m gebaut
    this.controlRoomOrdered = false;
    // { kind: 'table' | 'shelf' | 'floor' | 'elevator' | 'basement' | 'basementElevator' | 'basementStage' |
    //   'controlRoom',
    //   arriveIn (Sekunden), bei 'basementStage' dazu stage }
    this.deliveries = [];
    this.listeners = new Set();
    this.onEvent = null;      // (type, data) => void – z. B. 'delivered'
    // Feldtyp umgestellt: Ausbau-App (und alle anderen Hörer) neu zeichnen
    this.basementLayout.subscribe((change) => { if (change.type === 'field') this.notify(); });
  }

  // Keller mit Treppenhaus gebaut bzw. bestellt (= Stufe 1 erreicht)
  get basement() { return this.basementStage >= 1; }
  set basement(v) { this.basementStage = v ? Math.max(1, this.basementStage) : 0; }
  get basementOrdered() { return this.basementStageOrdered >= 1; }
  set basementOrdered(v) { this.basementStageOrdered = v ? Math.max(1, this.basementStageOrdered) : 0; }

  // Kantenlänge des gebauten Kellers in m (0 ohne Keller)
  get basementSize() { return stageInfo(this.basementStage)?.size ?? 0; }
  get maxBasementStage() { return MAX_BASEMENT_STAGE; }
  // Nächste Ausbaustufe { stage, size, fields, price } oder null, wenn alles bestellt ist
  get nextBasementStage() {
    return this.basementStageOrdered >= 1 ? stageInfo(this.basementStageOrdered + 1) : null;
  }
  get basementStagePrice() { return this.nextBasementStage?.price ?? null; }
  // Wie lange ein Kellerausbau dauert (Sekunden)
  get basementStageSeconds() { return this.economy.deliverySeconds * BASEMENT_STAGE_DELIVERY_FACTOR; }

  // Grund, warum man die nächste Kellerstufe gerade nicht kaufen kann, oder null
  get basementStageProblem() {
    if (!this.basement) return 'Erst den Keller bauen';
    if (this.basementStageOrdered > this.basementStage) return 'Erst den laufenden Ausbau abwarten';
    if (this.basementStageOrdered >= MAX_BASEMENT_STAGE) return 'Alles ausgebaut';
    return this.buyProblem(this.basementStagePrice);
  }

  buyBasementStage() {
    if (this.basementStageProblem || !this.economy.spend(this.basementStagePrice)) return false;
    this.basementStageOrdered++;
    this.deliveries.push({ kind: 'basementStage', stage: this.basementStageOrdered, arriveIn: this.basementStageSeconds });
    this.notify();
    return true;
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
  get controlRoomPrice() { return this.controlRoomOrdered ? null : CONTROL_ROOM_PRICE; }

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

  // Grund, warum man den Raum bei −10,5 m gerade nicht kaufen kann, oder null (erst nach dem Keller)
  get controlRoomProblem() {
    if (this.controlRoomOrdered) return 'Alles ausgebaut';
    if (!this.basement) return 'Erst den Keller bauen';
    return this.buyProblem(this.controlRoomPrice);
  }

  buyControlRoom() {
    if (this.controlRoomProblem || !this.economy.spend(this.controlRoomPrice)) return false;
    this.controlRoomOrdered = true;
    this.deliveries.push({ kind: 'controlRoom', arriveIn: this.economy.deliverySeconds });
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
      if (d.kind === 'controlRoom') this.controlRoom = true;
      if (d.kind === 'basementStage') this.basementStage = Math.max(this.basementStage, d.stage);
      if (d.kind === 'basement' || d.kind === 'basementStage') {
        this.basementLayout.emit({ type: 'stage', stage: this.basementStage });
      }
      this.onEvent?.('delivered', d.kind === 'basementStage'
        ? { kind: d.kind, stage: d.stage, size: stageInfo(d.stage)?.size }
        : { kind: d.kind });
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
