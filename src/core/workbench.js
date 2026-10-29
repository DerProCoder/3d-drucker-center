// Werkbank im Serverraum (Issue #45): Dort legt man einen ausgebauten Server ab, öffnet ihn und tauscht Teile,
// rüstet auf oder ab (Logik der Teile: core/server-parts.js). Die Werkbank ist fest da, sobald die zweite Etage steht.
// Platz für genau einen Server.
//
// Zustand: Der Server auf der Werkbank ist ein Gerät aus economy.furniture mit location 'bench' (wie 'rack' für
// eingebaute Geräte, core/servers.js). So zählt er weder als eingebaut (kein Strom, keine Miete, offline) noch als
// Karton im Abstellraum, und der Spielstand braucht kein eigenes Feld – nur 'bench' als erlaubte Lage
// (core/save.js). Die Ausstattung bleibt wie immer in core/server-parts.js.
//
// Ablauf: Server im Schrankfenster ausbauen (Karton in den Abstellraum), Karton tragen und auf die Werkbank legen
// (place), Teile im Werkbank-Menü tauschen, Server wieder als Karton aufnehmen (pickUp) und in einen Schrank einbauen.
// Ohne Three.js und DOM.
import { isUpgradable, slotSetOf, standardCapacity } from './server-parts.js';

export const BENCH_LOCATION = 'bench';

export class Workbench {
  // economy, parts: core/server-parts.js, upgrades: ob die zweite Etage steht (dort steht die Werkbank)
  constructor(economy, parts, upgrades = null) {
    this.economy = economy;
    this.parts = parts;
    this.upgrades = upgrades;
    this.onEvent = null; // (type, data) => void – 'placed' { device }, 'picked-up' { device }
  }

  // Ob es die Werkbank gibt (fest da, sobald die zweite Etage steht)
  get available() {
    return !this.upgrades || !!this.upgrades.upperFloor;
  }

  // Server auf der Werkbank oder null
  get device() {
    return this.economy.furniture.find((f) => f.location === BENCH_LOCATION) ?? null;
  }

  get isEmpty() {
    return !this.device;
  }

  // Ob ein Gerät auf die Werkbank darf: nur Server (Geräte mit Bauteilen)
  static fits(item) {
    return !!slotSetOf(item);
  }

  // Grund, warum der getragene Karton item nicht auf die Werkbank kann, oder null
  placeProblem(item) {
    if (!this.available) return 'Erst die zweite Etage bauen (Ausbau)';
    if (!item) return 'Nichts in der Hand';
    if (!Workbench.fits(item)) return 'Nur Server lassen sich auf der Werkbank öffnen';
    if (item.location !== 'carried') return 'Erst den Karton tragen';
    if (this.device) return `Werkbank belegt – erst ${this.device.type.name} aufnehmen`;
    return null;
  }

  // Getragenen Server (Karton) auf die Werkbank legen; gibt true zurück, wenn es geklappt hat
  place(id) {
    const item = this.economy.furnitureById(id);
    if (this.placeProblem(item)) return false;
    item.location = BENCH_LOCATION;
    item.slot = null;
    item.storageSpot = null;
    this.onEvent?.('placed', { device: item });
    this.economy.notify();
    return true;
  }

  // Server von der Werkbank als Karton in die Hand nehmen: location 'carried' (world/carry.js hält ihn dann).
  // Gibt das Gerät zurück oder null.
  pickUp() {
    const device = this.device;
    if (!device) return null;
    device.location = 'carried';
    this.onEvent?.('picked-up', { device });
    this.economy.notify();
    return device;
  }

  // Übersicht für das Werkbank-Menü: Werte aus den Teilen, Standard und Höchstwerte, Warnungen
  //   { device, capacity { cores, ram }, standard, max, power, problem (Text oder null), broken [Steckplätze],
  //     upgradable, usage { cores, ram } (VMs, die noch auf dem Server liegen) }
  summary(device = this.device) {
    if (!device) return null;
    const set = slotSetOf(device);
    return {
      device,
      capacity: this.parts.capacity(device),
      standard: standardCapacity(device),
      max: { ...(set?.max ?? {}) },
      power: this.parts.power(device),
      problem: this.parts.problem(device),
      broken: this.parts.brokenParts(device),
      upgradable: isUpgradable(device),
      usage: this.parts.servers.usageOf(device),
    };
  }

  // Nach dem Laden (core/save.js): höchstens ein Server auf der Werkbank, nichts ohne Bauteile, nichts ohne Etage –
  // alles andere zurück in den Abstellraum
  load() {
    let seen = false;
    for (const f of this.economy.furniture) {
      if (f.location !== BENCH_LOCATION) continue;
      if (!seen && this.available && Workbench.fits(f)) {
        seen = true;
        continue;
      }
      this.economy.returnFurnitureToStorage(f.id);
    }
  }
}
