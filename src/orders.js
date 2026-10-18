// Kundenaufträge: Kunden bestellen fertige Teile, die man bis zur Frist am PC abliefert und dafür bezahlt wird.
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.
import { PRINT_TEMPLATES } from './catalog.js';

export const MAX_OPEN_ORDERS = 4;
export const NEW_ORDER_EVERY = 30; // Spielminuten zwischen zwei neuen Aufträgen
const FIRST_ORDERS = 2;            // so viele Aufträge liegen beim Spielstart schon bereit

const CUSTOMERS = [
  'Bäckerei Schmidt', 'Familie Yılmaz', 'Modellbau Krause', 'Fahrradladen Becker', 'Café Sonnenschein',
  'Schülerfirma Gymnasium Nord', 'Tante Erika', 'Spieleladen Würfelglück', 'Autohaus Neumann', 'Jonas (12)',
  'Blumen Wagner', 'Werkstatt Hoffmann',
];

// Grundpreis pro Teil in €: Material + Druckzeit + Pauschale
export function unitPrice(template) {
  return 3 + template.grams * 0.08 + template.minutes * 0.12;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Auftrag: { id, customer, templateId, quantity, reward (€ gesamt), minutesLeft (Spielminuten bis zur Frist) }
export class Orders {
  constructor(economy) {
    this.economy = economy;
    this.open = [];
    this.nextId = 1;
    this.untilNext = NEW_ORDER_EVERY;
    this.completed = 0;
    this.listeners = new Set();
    for (let i = 0; i < FIRST_ORDERS; i++) this.open.push(this.createOrder(true));
  }

  // easy: nur kurze Drucke, damit man am Anfang schnell etwas verdient
  createOrder(easy = false) {
    const choices = easy ? PRINT_TEMPLATES.filter((t) => t.minutes <= 100) : PRINT_TEMPLATES;
    const template = pick(choices);
    // Lange Drucke werden in kleineren Mengen bestellt
    const maxQuantity = template.minutes <= 60 ? 5 : template.minutes <= 150 ? 3 : 2;
    const quantity = 1 + Math.floor(Math.random() * maxQuantity);
    const bonus = 0.9 + Math.random() * 0.4; // manche Kunden zahlen besser
    return {
      id: this.nextId++,
      customer: pick(CUSTOMERS),
      templateId: template.id,
      quantity,
      reward: Math.round(unitPrice(template) * quantity * bonus),
      // Frist: doppelte Druckzeit für alle Teile plus Zeit fürs Einkaufen und Aufstellen
      minutesLeft: Math.round(template.minutes * quantity * 2 + 180),
    };
  }

  orderById(id) {
    return this.open.find((o) => o.id === id);
  }

  // Grund, warum der Auftrag nicht geliefert werden kann, oder null
  deliveryProblem(order) {
    const have = this.economy.finishedParts.get(order.templateId) ?? 0;
    if (have < order.quantity) return `Noch ${order.quantity - have} × drucken`;
    return null;
  }

  deliver(id) {
    const order = this.orderById(id);
    if (!order || this.deliveryProblem(order)) return false;
    this.economy.takeFinishedParts(order.templateId, order.quantity);
    this.economy.earn(order.reward);
    this.open = this.open.filter((o) => o !== order);
    this.completed++;
    this.notify();
    return true;
  }

  decline(id) {
    this.open = this.open.filter((o) => o.id !== id);
    this.notify();
  }

  // Fristen laufen ab, neue Aufträge kommen rein. Benachrichtigt nur, wenn sich die Liste ändert,
  // damit das PC-Fenster nicht in jedem Frame neu aufgebaut wird.
  advance(gameMinutes) {
    let changed = false;
    for (const order of this.open) order.minutesLeft -= gameMinutes;
    const before = this.open.length;
    this.open = this.open.filter((o) => o.minutesLeft > 0);
    if (this.open.length !== before) changed = true;

    this.untilNext -= gameMinutes;
    if (this.untilNext <= 0) {
      this.untilNext += NEW_ORDER_EVERY;
      if (this.open.length < MAX_OPEN_ORDERS) {
        this.open.push(this.createOrder());
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  // Callback wird sofort und bei jeder Änderung aufgerufen. Rückgabe: Abmelde-Funktion.
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }
}
