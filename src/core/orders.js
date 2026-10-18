// Kundenaufträge: Kunden bestellen fertige Teile in einem Material (oft auch in einer bestimmten Farbe), die man
// bis zur Frist am PC abliefert und dafür bezahlt wird. Eilaufträge zahlen mehr, Stammkunden auch.
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.
import { FILAMENTS, PRINT_TEMPLATES, templateById } from './catalog.js';

export const NEW_ORDER_EVERY = 30; // Spielminuten zwischen zwei neuen Aufträgen
const FIRST_ORDERS = 2;            // so viele Aufträge liegen beim Spielstart schon bereit
const RUSH_CHANCE = 0.15;          // Anteil Eilaufträge
const RUSH_BONUS = 1.8;            // Eilaufträge zahlen so viel mehr
const SPECIAL_CHANCE = 0.12;       // Anteil absurder Sonderaufträge
const ANY_COLOR_CHANCE = 0.3;      // so oft ist dem Kunden die Farbe egal
export const REGULAR_STARS = 3;    // ab so vielen Sternen ist man Stammkunde
const MAX_STARS = 5;
const MIN_STARS = -3;

// Kunden mit typischen Sprüchen
const CUSTOMERS = {
  'Bäckerei Schmidt': ['Bezahlt wird in Euro, nicht in Brötchen. Leider.', 'Bitte lebensmittelecht. Glauben wir zumindest.'],
  'Familie Yılmaz': ['Die Kinder haben schon die Farben ausgesucht.', 'Oma will auch eins!'],
  'Modellbau Krause': ['Toleranz ± 0,05 mm. Mindestens.', 'Wehe, da ist ein Stringing-Faden dran.'],
  'Fahrradladen Becker': ['Muss Kopfsteinpflaster überleben.', 'Bitte nicht wieder so viele Supportreste.'],
  'Café Sonnenschein': ['Passend zu den Tischdecken, bitte.', 'Wir zahlen auch mit Kuchengutscheinen. Nein? Okay.'],
  'Schülerfirma Gymnasium Nord': ['Für unseren Schulbasar! Das Budget ist knapp.', 'Unser Lehrer sagt, das ist „Wirtschaft“.'],
  'Tante Erika': ['Hauptsache, es ist schön bunt.', 'Ich hab dir auch einen Kuchen mitgebracht, Schatz.'],
  'Spieleladen Würfelglück': ['Würfeln Sie lieber nicht um die Frist.', 'Kritischer Treffer, wenn es pünktlich ist!'],
  'Autohaus Neumann': ['Bitte mit Rechnung und Firmenstempel.', 'Unser Chef will es in Firmenfarbe.'],
  'Jonas (12)': ['Mama sagt, ich darf.', 'Ich zahl mit meinem Taschengeld!!'],
  'Blumen Wagner': ['Bitte wasserdicht. Das ist wichtig. Wirklich.', 'Für die Hochzeit am Samstag!'],
  'Werkstatt Hoffmann': ['Muss halten. Sonst kommen wir vorbei.', 'Hauptsache stabil, schön ist egal.'],
  'Opa Heinz': ['Für meine Kuckucksuhr von 1953.', 'Früher haben wir das noch geschnitzt.'],
  'Influencerin @PrintQueen': ['Für meinen Livestream! Muss MEGA aussehen ✨', 'Ich verlinke euch auch! (Reichweite statt Geld?)'],
};

// Absurde Sonderaufträge: feste Kunden mit Riesenmengen, Sonderwünschen und eigenem Lohnfaktor
const SPECIALS = [
  {
    customer: 'Jonas (12)', templateId: 'benchy', quantity: 12, material: 'PLA', filamentId: null, payFactor: 0.6,
    note: 'Ich brauch Benchys für meine GANZE Klasse!!! Bis morgen bitte. Ich zahl in Münzen.',
  },
  {
    customer: 'Influencerin @PrintQueen', templateId: 'vase', quantity: 3, material: 'PETG', filamentId: 'petg-transparent',
    payFactor: 2.5, rush: true, note: 'OMG, das wird mein Unboxing des Jahres. Alles transparent, sonst sieht man das Licht nicht! ✨',
  },
  {
    customer: 'Opa Heinz', templateId: 'gears', quantity: 1, material: 'ABS', filamentId: 'abs-schwarz', payFactor: 1.6,
    note: 'Für meine Kuckucksuhr von 1953. Bitte nicht wieder in Pink, die Uhr hat sich geschämt.',
  },
  {
    customer: 'Drachenclub e.V.', templateId: 'dragon', quantity: 4, material: 'PLA', filamentId: 'pla-grün', payFactor: 1.4,
    note: 'Für unser Jahrestreffen. Die Drachen MÜSSEN grün sein. Das steht in der Satzung.',
  },
  {
    customer: 'Hausmeister Krawuttke', templateId: 'cable-clips', quantity: 10, material: 'PETG', filamentId: null, payFactor: 1.3,
    note: 'Im Serverraum sieht es aus wie bei Hempels unterm Sofa. Bitte schnell.', rush: true,
  },
];

export function unitPrice(template) {
  // Grundpreis pro Teil in €: Material + Druckzeit + Pauschale (≈ 15 € pro Druckstunde, Miete 3 €/h)
  return 4 + template.grams * 0.1 + template.minutes * 0.16;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Auftrag: { id, customer, templateId, quantity, material, filamentId (null = Farbe egal), rush, note,
//            reward (€ gesamt), minutesLeft (Spielminuten bis zur Frist), special? }
// progress (progress.js) bestimmt Lohnaufschlag und wie viele Aufträge gleichzeitig offen sein dürfen
export class Orders {
  constructor(economy, progress) {
    this.economy = economy;
    this.progress = progress;
    this.open = [];
    this.nextId = 1;
    this.untilNext = NEW_ORDER_EVERY;
    this.completed = 0;
    this.stars = new Map(); // Kunde → Sterne (Ruf beim Kunden, MIN_STARS…MAX_STARS)
    this.listeners = new Set();
    this.onEvent = null;    // (type, data) => void – 'delivered', 'expired', 'new-order'
    for (let i = 0; i < FIRST_ORDERS; i++) this.open.push(this.createOrder(true));
  }

  starsOf(customer) {
    return this.stars.get(customer) ?? 0;
  }

  isRegular(customer) {
    return this.starsOf(customer) >= REGULAR_STARS;
  }

  // Zufriedene Kunden zahlen mehr, verärgerte weniger
  customerFactor(customer) {
    const s = this.starsOf(customer);
    return s >= 0 ? 1 + s * 0.06 : Math.max(0.7, 1 + s * 0.1);
  }

  // Kunden mit gutem Ruf melden sich öfter
  pickCustomer() {
    const names = Object.keys(CUSTOMERS).filter((n) => n !== 'Influencerin @PrintQueen' && n !== 'Opa Heinz');
    const weights = names.map((n) => Math.max(0.3, 1 + this.starsOf(n) * 0.3));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < names.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return names[i];
    }
    return names[0];
  }

  // easy: nur kurze Drucke in PLA, ohne Eile, damit man am Anfang schnell etwas verdient
  createOrder(easy = false) {
    if (!easy && Math.random() < SPECIAL_CHANCE) return this.createSpecial(pick(SPECIALS));

    const choices = easy
      ? PRINT_TEMPLATES.filter((t) => t.minutes <= 100 && t.materials.includes('PLA'))
      : PRINT_TEMPLATES;
    const template = pick(choices);
    // Lange Drucke werden in kleineren Mengen bestellt
    const maxQuantity = template.minutes <= 60 ? 5 : template.minutes <= 150 ? 3 : 2;
    const quantity = 1 + Math.floor(Math.random() * maxQuantity);
    const material = easy ? 'PLA' : pick(template.materials);
    const colors = FILAMENTS.filter((f) => f.material === material);
    const filamentId = !easy && Math.random() < ANY_COLOR_CHANCE ? null : pick(colors).id;
    const rush = !easy && Math.random() < RUSH_CHANCE;
    const customer = this.pickCustomer();
    const bonus = 0.9 + Math.random() * 0.4; // manche Kunden zahlen besser
    const pay = unitPrice(template) * quantity * bonus * (rush ? RUSH_BONUS : 1);
    return {
      id: this.nextId++,
      customer,
      templateId: template.id,
      quantity,
      material,
      filamentId,
      rush,
      note: pick(CUSTOMERS[customer]),
      reward: Math.round(pay * this.progress.rewardMultiplier * this.customerFactor(customer)),
      minutesLeft: this.deadline(template, quantity, rush),
    };
  }

  createSpecial(s) {
    const template = templateById(s.templateId);
    const pay = unitPrice(template) * s.quantity * s.payFactor;
    return {
      id: this.nextId++,
      customer: s.customer,
      templateId: s.templateId,
      quantity: s.quantity,
      material: s.material,
      filamentId: s.filamentId,
      rush: !!s.rush,
      note: s.note,
      special: true,
      reward: Math.round(pay * this.progress.rewardMultiplier * this.customerFactor(s.customer)),
      minutesLeft: this.deadline(template, s.quantity, s.rush),
    };
  }

  // Frist: doppelte Druckzeit für alle Teile plus Zeit fürs Einkaufen und Aufstellen – bei Eile deutlich knapper
  deadline(template, quantity, rush) {
    return rush
      ? Math.round(template.minutes * quantity * 1.2 + 60)
      : Math.round(template.minutes * quantity * 2 + 180);
  }

  orderById(id) {
    return this.open.find((o) => o.id === id);
  }

  // Was der Kunde haben will, für economy.countParts/takeParts
  static want(order) {
    return { material: order.material ?? null, filamentId: order.filamentId ?? null };
  }

  partsReady(order) {
    return this.economy.countParts(order.templateId, Orders.want(order));
  }

  // Grund, warum der Auftrag nicht geliefert werden kann, oder null
  deliveryProblem(order) {
    const have = this.partsReady(order);
    if (have < order.quantity) return `Noch ${order.quantity - have} × drucken`;
    return null;
  }

  deliver(id) {
    const order = this.orderById(id);
    if (!order || this.deliveryProblem(order)) return false;
    this.economy.takeParts(order.templateId, order.quantity, Orders.want(order));
    this.economy.earn(order.reward);
    this.progress.addXp(order.reward);
    this.open = this.open.filter((o) => o !== order);
    this.completed++;
    this.changeStars(order.customer, 1);
    this.onEvent?.('delivered', { order, stars: this.starsOf(order.customer) });
    this.notify();
    return true;
  }

  // Ablehnen ist ehrlicher als verfallen lassen: kostet keinen Stern
  decline(id) {
    this.open = this.open.filter((o) => o.id !== id);
    this.notify();
  }

  changeStars(customer, delta) {
    this.stars.set(customer, Math.max(MIN_STARS, Math.min(MAX_STARS, this.starsOf(customer) + delta)));
  }

  // Fristen laufen ab, neue Aufträge kommen rein. Benachrichtigt nur, wenn sich die Liste ändert,
  // damit das PC-Fenster nicht in jedem Frame neu aufgebaut wird.
  advance(gameMinutes) {
    let changed = false;
    for (const order of this.open) order.minutesLeft -= gameMinutes;
    for (const order of this.open.filter((o) => o.minutesLeft <= 0)) {
      this.changeStars(order.customer, -1);
      this.onEvent?.('expired', { order });
      changed = true;
    }
    this.open = this.open.filter((o) => o.minutesLeft > 0);

    this.untilNext -= gameMinutes;
    if (this.untilNext <= 0) {
      this.untilNext += NEW_ORDER_EVERY;
      if (this.open.length < this.progress.maxOpenOrders) {
        const order = this.createOrder();
        this.open.push(order);
        this.onEvent?.('new-order', { order });
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
