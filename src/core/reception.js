// Empfang: Kunden geben am Tresen ihre Aufträge ab und holen sie dort auch wieder ab. Fertige Teile werden verpackt
// und kommen mit dem Kundennamen ins Abholregal (feste Fächer). Kurz darauf kommt der Kunde, nimmt sein Paket und
// bezahlt. Hier steht nur, was passiert – die Kunden als Figuren laufen in world/customers.js.
// Bewusst ohne Three.js und DOM.
import { filamentById, filamentLabel, templateById } from './catalog.js';

export const SHELF_SLOTS = 8;            // Fächer im Abholregal
export const PICKUP_DELAY = [4, 12];     // nach so vielen Spielminuten kommt der Kunde zum Abholen (echt 12–36 s)

// Kurzbeschreibung für Hinweise und Etiketten, z. B. „3 × Benchy · PLA Rot“
export function orderSummary(order) {
  const t = templateById(order.templateId);
  const color = order.filamentId ? filamentById(order.filamentId) : null;
  const what = color ? filamentLabel(color) : order.material ? `${order.material}, Farbe egal` : '';
  return `${order.quantity} × ${t?.name ?? order.templateId}${what ? ` · ${what}` : ''}`;
}

export class Reception {
  constructor(orders) {
    this.orders = orders;
    this.random = Math.random; // austauschbar für Tests
  }

  // Kunden, die am Empfang auf die Annahme ihres Auftrags warten (älteste zuerst)
  get waiting() {
    return this.orders.open.filter((o) => o.stage === 'counter');
  }

  get packed() {
    return this.orders.open.filter((o) => o.stage === 'packed');
  }

  // Angenommene Aufträge, deren Teile komplett fertig sind – sie können ins Abholregal
  get readyToPack() {
    return this.orders.open.filter((o) => o.stage === 'open' && !this.orders.deliveryProblem(o));
  }

  // Verpackte Aufträge, deren Kunde jetzt zum Abholen kommen soll
  get duePickups() {
    return this.packed.filter((o) => (o.pickupIn ?? 0) <= 0);
  }

  freeSlot() {
    const used = new Set(this.packed.map((o) => o.shelfSlot));
    for (let i = 0; i < SHELF_SLOTS; i++) if (!used.has(i)) return i;
    return -1;
  }

  accept(id) {
    return this.orders.accept(id);
  }

  // Grund, warum der Auftrag gerade nicht ins Regal kann, oder null
  packProblem(order) {
    return this.orders.deliveryProblem(order) ?? (this.freeSlot() === -1 ? 'Abholregal voll' : null);
  }

  // Auftrag verpacken und ins nächste freie Fach legen (Spieler oder Azubi). Ohne id: der älteste fertige.
  pack(id = this.readyToPack[0]?.id) {
    const order = this.orders.orderById(id);
    if (!order || this.packProblem(order)) return null;
    const [min, max] = PICKUP_DELAY;
    return this.orders.pack(id, this.freeSlot(), min + this.random() * (max - min)) ? order : null;
  }

  // Der Kunde hat sein Paket aus dem Regal genommen und bezahlt am Tresen
  handOver(id) {
    return this.orders.deliver(id);
  }
}
