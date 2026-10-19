// Kundenaufträge: Kunden bestellen fertige Teile in einem Material (oft auch in einer bestimmten Farbe), die man
// bis zur Frist am PC abliefert und dafür bezahlt wird. Eilaufträge zahlen mehr, Stammkunden auch.
// Bewusst ohne Three.js und DOM, damit die Logik unabhängig vom Rendering bleibt.
import { FILAMENTS, LASER_TEMPLATES, PRINT_TEMPLATES, WOODS, templateById } from './catalog.js';
import { isMultiColor, isTwoColor } from './two-color.js';

export const NEW_ORDER_EVERY = 30; // Spielminuten zwischen zwei neuen Aufträgen
const FIRST_ORDERS = 2;            // so viele Aufträge liegen beim Spielstart schon bereit
const RUSH_CHANCE = 0.15;          // Anteil Eilaufträge
const RUSH_BONUS = 1.8;            // Eilaufträge zahlen so viel mehr
const SPECIAL_CHANCE = 0.12;       // Anteil absurder Sonderaufträge
const ANY_COLOR_CHANCE = 0.3;      // so oft ist dem Kunden die Farbe egal
const EFFECT_LINE_CHANCE = 0.2;    // so oft will der Kunde eine Effektsorte (Matte, Silk+, Glow, Translucent)
const TWO_COLOR_LEVEL = 3;         // ab diesem Level bestellen Kunden auch zweifarbige Teile
const TWO_COLOR_BONUS = 1.4;       // zweifarbige Teile sind aufwendiger und werden besser bezahlt
const MULTI_COLOR_LEVEL = 6;       // ab diesem Level bestellen Kunden auch mehrfarbige Teile (dafür braucht man den H2C)
const MULTI_COLOR_BONUS = 1.8;     // mehrfarbige Teile zahlen noch besser
const LASER_LEVEL = 4;             // ab diesem Level bestellen Kunden auch gelaserte Holzteile (dafür braucht man den R1)
const LASER_CHANCE = 0.25;         // so oft ist ein neuer Auftrag dann ein Laserauftrag
const LASER_BONUS = 1.3;           // Gravieren und Schneiden wird gut bezahlt
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
  {
    customer: 'Schachclub Springer e.V.', templateId: 'chess-set', quantity: 2, material: 'PLA', filamentId: 'pla-schwarz',
    filamentId2: 'pla-weiß', payFactor: 1.5, minLevel: TWO_COLOR_LEVEL,
    note: 'Schwarz UND Weiß, bitte. Letztes Mal waren beide Seiten weiß – das Turnier dauerte elf Stunden.',
  },
];

// Sprüche für zweifarbige Aufträge
const TWO_COLOR_NOTES = [
  'Zweifarbig, bitte – einfarbig hat ja jeder.',
  'Die Schrift muss sich richtig abheben!',
  'Zwei verschiedene Farben. Nicht zweimal dieselbe, das hatten wir schon.',
];

// Sprüche für mehrfarbige Aufträge
const MULTI_COLOR_NOTES = [
  'So bunt wie möglich, bitte!',
  'Jede Farbe, die Sie haben. Und dann noch eine.',
  'Für das Kinderzimmer – je bunter, desto besser.',
];

// Sprüche für Laseraufträge
const LASER_NOTES = [
  'Mit Gravur, bitte – das macht es persönlich.',
  'Holz ist das neue Plastik!',
  'Bitte sauber geschnitten, ohne Brandflecken am Rand.',
];

// Wie viele Platten bzw. Drucke ein Auftrag braucht (Laser: eine Platte gibt mehrere Teile)
const runsFor = (template, quantity) => (template.laser ? Math.ceil(quantity / template.pieces) : quantity);

export function unitPrice(template) {
  // Laser: Holz + Laserzeit + Pauschale, aufgeteilt auf die Teile einer Platte
  if (template.laser) return ((7 + template.minutes * 0.16) / template.pieces + 2) * LASER_BONUS;
  // Grundpreis pro Teil in €: Material + Druckzeit + Pauschale (≈ 15 € pro Druckstunde, Miete 3 €/h)
  const base = 4 + template.grams * 0.1 + template.minutes * 0.16;
  if (isMultiColor(template)) return base * MULTI_COLOR_BONUS;
  return isTwoColor(template) ? base * TWO_COLOR_BONUS : base;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Auftrag: { id, customer, templateId, quantity, material, filamentId (null = Farbe egal),
//            filamentId2 (zweite Farbe bei zweifarbigen Teilen, null = egal), rush, note,
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
    const level = this.progress.level;
    if (!easy && Math.random() < SPECIAL_CHANCE) {
      return this.createSpecial(pick(SPECIALS.filter((s) => (s.minLevel ?? 1) <= level)));
    }
    if (!easy && level >= LASER_LEVEL && Math.random() < LASER_CHANCE) return this.createLaserOrder();

    // Zweifarbige Teile gibt es erst ab TWO_COLOR_LEVEL (man braucht dafür mindestens ein AMS), und nur bei jedem
    // zweiten Auftrag als Möglichkeit, damit sie nicht überhandnehmen
    // Mehrfarbige ebenso, erst ab MULTI_COLOR_LEVEL
    const twoColorOk = !easy && level >= TWO_COLOR_LEVEL && Math.random() < 0.5;
    const multiColorOk = !easy && level >= MULTI_COLOR_LEVEL && Math.random() < 0.5;
    const choices = easy
      ? PRINT_TEMPLATES.filter((t) => t.minutes <= 100 && t.materials.includes('PLA') && !t.colors)
      : PRINT_TEMPLATES.filter((t) => (isTwoColor(t) ? twoColorOk : isMultiColor(t) ? multiColorOk : true));
    const template = pick(choices);
    // Lange Drucke werden in kleineren Mengen bestellt
    const maxQuantity = template.minutes <= 60 ? 5 : template.minutes <= 150 ? 3 : 2;
    const quantity = 1 + Math.floor(Math.random() * maxQuantity);
    const material = easy ? 'PLA' : pick(template.materials);
    const colors = FILAMENTS.filter((f) => f.material === material);
    // Meist Basic-Farben, ab und zu eine Effektsorte – dann sind beide Farben aus derselben Sorte und es gibt mehr Geld
    const effects = colors.filter((f) => f.line.special);
    const effectLine = !easy && effects.length && Math.random() < EFFECT_LINE_CHANCE ? pick(effects).lineId : null;
    const palette = colors.filter((f) => (effectLine ? f.lineId === effectLine : !f.line.special));
    // Mehrfarbig sucht man die Farben selbst aus, nur das Material steht fest
    const anyColor = isMultiColor(template) || (!easy && Math.random() < ANY_COLOR_CHANCE);
    const first = pick(palette);
    const filamentId = anyColor ? null : first.id;
    // Zweite Farbe: immer eine andere als die erste
    const filamentId2 = isTwoColor(template) && !anyColor ? pick(palette.filter((f) => f !== first)).id : null;
    const rush = !easy && Math.random() < RUSH_CHANCE;
    const customer = this.pickCustomer();
    const bonus = 0.9 + Math.random() * 0.4; // manche Kunden zahlen besser
    const effectBonus = anyColor ? 1 : first.line.payBonus ?? 1;
    const pay = unitPrice(template) * quantity * bonus * effectBonus * (rush ? RUSH_BONUS : 1);
    return {
      id: this.nextId++,
      customer,
      templateId: template.id,
      quantity,
      material,
      filamentId,
      filamentId2,
      rush,
      note: pick(isMultiColor(template) && Math.random() < 0.5 ? MULTI_COLOR_NOTES
        : isTwoColor(template) && Math.random() < 0.5 ? TWO_COLOR_NOTES : CUSTOMERS[customer]),
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
      filamentId2: s.filamentId2 ?? null,
      rush: !!s.rush,
      note: s.note,
      special: true,
      reward: Math.round(pay * this.progress.rewardMultiplier * this.customerFactor(s.customer)),
      minutesLeft: this.deadline(template, s.quantity, s.rush),
    };
  }

  // Frist: doppelte Druckzeit für alle Teile plus Zeit fürs Einkaufen und Aufstellen – bei Eile deutlich knapper.
  // Zweifarbig zählt die Dual-Nozzle-Druckzeit: Eilaufträge schafft man dann praktisch nur mit zwei Düsen.
  deadline(template, quantity, rush) {
    const runs = runsFor(template, quantity);
    return rush
      ? Math.round(template.minutes * runs * 1.2 + 60)
      : Math.round(template.minutes * runs * 2 + 180);
  }

  // Laserauftrag: Holzschild, Holzbild oder ausgeschnittene Figuren, in einer bestimmten Holzart oder egal welche
  createLaserOrder() {
    const template = pick(LASER_TEMPLATES);
    const quantity = template.pieces > 1
      ? template.pieces * (1 + Math.floor(Math.random() * 2)) - Math.floor(Math.random() * 3) // z. B. 4–12 Figuren
      : 1 + Math.floor(Math.random() * 3);
    const anyWood = Math.random() < ANY_COLOR_CHANCE;
    const rush = Math.random() < RUSH_CHANCE;
    const customer = this.pickCustomer();
    const bonus = 0.9 + Math.random() * 0.4;
    const pay = unitPrice(template) * quantity * bonus * (rush ? RUSH_BONUS : 1);
    return {
      id: this.nextId++,
      customer,
      templateId: template.id,
      quantity,
      material: 'Holz',
      filamentId: anyWood ? null : pick(WOODS).id,
      filamentId2: null,
      rush,
      note: pick(Math.random() < 0.5 ? LASER_NOTES : CUSTOMERS[customer]),
      reward: Math.round(pay * this.progress.rewardMultiplier * this.customerFactor(customer)),
      minutesLeft: this.deadline(template, quantity, rush),
    };
  }

  orderById(id) {
    return this.open.find((o) => o.id === id);
  }

  // Was der Kunde haben will, für economy.countParts/takeParts
  static want(order) {
    return { material: order.material ?? null, filamentId: order.filamentId ?? null, filamentId2: order.filamentId2 ?? null };
  }

  partsReady(order) {
    return this.economy.countParts(order.templateId, Orders.want(order));
  }

  // Grund, warum der Auftrag nicht geliefert werden kann, oder null
  deliveryProblem(order) {
    const have = this.partsReady(order);
    const verb = templateById(order.templateId)?.laser ? 'lasern' : 'drucken';
    if (have < order.quantity) return `Noch ${order.quantity - have} × ${verb}`;
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
