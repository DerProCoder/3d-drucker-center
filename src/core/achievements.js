// Erfolge und Statistik: zählt Spielereignisse (Drucke, Fehldrucke, Lieferungen, Katzenstreicheln …) mit
// und schaltet Erfolge frei. Bewusst ohne Three.js und DOM.

// check(stats) → true, sobald der Erfolg erreicht ist
export const ACHIEVEMENTS = [
  { id: 'first-print', icon: '🖨️', name: 'Es lebt!', text: 'Den ersten Druck fertiggestellt', check: (s) => s.printsDone >= 1 },
  { id: 'benchy', icon: '🚤', name: 'Ahoi!', text: 'Das erste Benchy gedruckt', check: (s) => s.benchys >= 1 },
  { id: 'benchy-fleet', icon: '⚓', name: 'Benchy-Flotte', text: '25 Benchys gedruckt', check: (s) => s.benchys >= 25 },
  { id: 'kilo', icon: '🧵', name: 'Ein Kilo verdruckt', text: '1 kg Filament verdruckt', check: (s) => s.grams >= 1000 },
  { id: 'kilometer', icon: '📏', name: 'Ein Kilometer Filament', text: 'Rund 1 km Filament (3 kg) verdruckt', check: (s) => s.grams >= 3000 },
  { id: 'spaghetti', icon: '🍝', name: 'Spaghetti alla Stampa', text: 'Der erste Spaghetti-Fehldruck', check: (s) => s.spaghetti >= 1 },
  { id: 'chef', icon: '👨‍🍳', name: 'Chefkoch', text: '10 Fehldrucke erlebt', check: (s) => s.failures >= 10 },
  { id: 'nozzle', icon: '🪡', name: 'Freie Fahrt', text: 'Eine verstopfte Düse freigestochen', check: (s) => s.nozzlesCleared >= 1 },
  { id: 'nozzle-swap', icon: '🔩', name: 'Boxenstopp', text: 'Eine abgenutzte Düse gegen eine neue getauscht', check: (s) => s.nozzlesReplaced >= 1 },
  { id: 'ams-refill', icon: '🔁', name: 'Nahtloser Wechsel', text: 'Das AMS hat automatisch eine neue Spule nachgeladen', check: (s) => s.amsRefills >= 1 },
  { id: 'first-delivery', icon: '📦', name: 'Erster Kunde', text: 'Den ersten Auftrag geliefert', check: (s) => s.deliveries >= 1 },
  { id: 'deliveries-25', icon: '🚚', name: 'Lieferprofi', text: '25 Aufträge geliefert', check: (s) => s.deliveries >= 25 },
  { id: 'rush', icon: '⚡', name: 'Eilzustellung', text: 'Einen Eilauftrag geliefert', check: (s) => s.rushDeliveries >= 1 },
  { id: 'regular', icon: '⭐', name: 'Stammkundschaft', text: 'Ein Kunde ist Stammkunde geworden', check: (s) => s.regulars >= 1 },
  { id: 'jonas', icon: '🪙', name: 'Taschengeld-Geschäft', text: 'Jonas’ Benchy-Großauftrag geliefert', check: (s) => s.jonas >= 1 },
  { id: 'full-house', icon: '🏭', name: 'Volle Halle', text: '4 Drucker gleichzeitig am Drucken', check: (s) => s.maxPrinting >= 4 },
  { id: 'ludicrous', icon: '🚀', name: 'Ludicrous Speed', text: 'Einen Druck im Ludicrous-Modus heil fertig bekommen', check: (s) => s.ludicrousDone >= 1 },
  { id: 'cat', icon: '🐈', name: 'Katzenmensch', text: 'Kater Düsentrieb 10× gestreichelt', check: (s) => s.catPets >= 10 },
  { id: 'cat-chaos', icon: '😼', name: 'Gravitationstest', text: 'Der Kater hat ein Teil vom Tisch geworfen', check: (s) => s.knocked >= 1 },
  { id: 'cat-ko', icon: '😵', name: 'Volltreffer', text: 'Kater Düsentrieb mit einem Drucker abgeschossen', check: (s) => s.catHits >= 1 },
  { id: 'overdraft', icon: '📉', name: 'Im Dispo', text: 'Das Konto ist ins Minus gerutscht', check: (s) => s.overdraft >= 1 },
];

export function emptyStats() {
  return {
    printsDone: 0, benchys: 0, grams: 0, spaghetti: 0, failures: 0, nozzlesCleared: 0, nozzlesReplaced: 0, amsRefills: 0,
    deliveries: 0, rushDeliveries: 0, regulars: 0, jonas: 0, maxPrinting: 0, ludicrousDone: 0,
    catPets: 0, knocked: 0, catHits: 0, overdraft: 0,
  };
}

export class Achievements {
  constructor() {
    this.stats = emptyStats();
    this.unlocked = new Set();
    this.onUnlock = null; // (achievement) => void
  }

  // Zähler erhöhen und Erfolge prüfen
  add(stat, amount = 1) {
    this.stats[stat] = (this.stats[stat] ?? 0) + amount;
    this.check();
  }

  // Höchstwert merken (z. B. gleichzeitig druckende Drucker)
  max(stat, value) {
    if (value <= (this.stats[stat] ?? 0)) return;
    this.stats[stat] = value;
    this.check();
  }

  check() {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id) || !a.check(this.stats)) continue;
      this.unlocked.add(a.id);
      this.onUnlock?.(a);
    }
  }
}
