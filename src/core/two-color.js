// Zweifarbige Drucke: Vorlagen mit Grund- und Akzentfarbe (colors: 2 in catalog.js).
// Ein Dual-Nozzle-Drucker hat für jede Farbe eine eigene Düse und druckt fast so schnell wie einfarbig.
// Ein Drucker mit nur einer Düse (AMS) muss in jeder Schicht die Farbe wechseln: Filament zurückziehen, die andere
// Spule laden, die alte Farbe ausspülen – das dauert deutlich länger und kostet Spülabfall.
// Ein Drucker mit Düsenwechsler (H2C) holt sich für jede Farbe ihre eigene Düse aus dem Wechsler: fast kein
// Spülabfall und noch etwas schneller als zwei feste Düsen. Verstopft eine, nimmt er eine Ersatzdüse.
// Ohne AMS (nur ein Spulenhalter) geht es gar nicht. Beide Farben müssen verschieden sein.
// Bewusst ohne Three.js und DOM.
import { filamentById } from './catalog.js';

export const DUAL_NOZZLE_TIME = 1.1;     // Düsenwechsel dauert nur ein paar Sekunden
export const SINGLE_NOZZLE_TIME = 1.8;   // Farbwechsel mit einer Düse in jeder Schicht
export const DUAL_NOZZLE_WASTE = 1.05;   // kleiner Spülturm
export const SINGLE_NOZZLE_WASTE = 1.5;  // viel Spülabfall beim Ausspülen der alten Farbe
export const CHANGER_TIME = 1.06;        // Düsenwechsler: Kopf tauscht die Düse in Sekunden
export const CHANGER_WASTE = 1.01;       // jede Farbe hat ihre Düse – kaum Spülen

export const isTwoColor = (template) => template?.colors === 2;

export const hasDualNozzle = (printer) => (printer.model.nozzles ?? 1) > 1;
export const hasNozzleChanger = (printer) => !!printer.model.nozzleChanger;

// Ist eine der beiden Düsen verstopft, muss der Drucker wie einer mit einer Düse die Farbe wechseln.
// Der Düsenwechsler hat genug Ersatz und bleibt dabei.
export const usesDualNozzle = (printer) => hasDualNozzle(printer) && (!printer.clogged || hasNozzleChanger(printer));

// Faktor auf die Druckzeit
export function colorTimeFactor(printer, template) {
  if (!isTwoColor(template)) return 1;
  if (hasNozzleChanger(printer)) return CHANGER_TIME;
  return usesDualNozzle(printer) ? DUAL_NOZZLE_TIME : SINGLE_NOZZLE_TIME;
}

// Filament pro Farbe für count Teile in Gramm: [Grundfarbe] bzw. [Grundfarbe, Akzentfarbe] inkl. Spülabfall
export function gramsPerColor(printer, template, count = 1) {
  const total = template.grams * count;
  if (!isTwoColor(template)) return [total];
  const waste = hasNozzleChanger(printer) ? CHANGER_WASTE : usesDualNozzle(printer) ? DUAL_NOZZLE_WASTE : SINGLE_NOZZLE_WASTE;
  return [total * (1 - template.accent) * waste, total * template.accent * waste];
}

// Fach mit der Akzentfarbe: das gewählte, sonst das erste andere Fach mit einer anderen Farbe im gleichen Material,
// sonst irgendein anderes belegtes Fach (dann meldet accentProblem, was nicht passt). -1 = keins.
export function accentSlot(printer) {
  const { spools, activeSlot } = printer;
  const chosen = printer.accentSlot;
  if (chosen != null && chosen !== activeSlot && spools[chosen]) return chosen;
  const base = spools[activeSlot];
  const others = spools.map((s, i) => (s && i !== activeSlot ? i : -1)).filter((i) => i !== -1);
  const fits = others.find((i) => base && spools[i].filamentId !== base.filamentId
    && filamentById(spools[i].filamentId).material === filamentById(base.filamentId).material);
  return fits ?? others[0] ?? -1;
}

// Grund, warum die zweite Farbe nicht passt, oder null. Die Grundfarbe prüft economy.printProblem.
export function accentProblem(printer) {
  if (printer.spools.length < 2) return 'Zweifarbig – braucht AMS oder Dual-Nozzle';
  const base = printer.spools[printer.activeSlot];
  const slot = accentSlot(printer);
  const accent = slot === -1 ? null : printer.spools[slot];
  if (!accent) return 'Zweite Farbe fehlt – zweite Spule ins AMS legen';
  if (accent.filamentId === base.filamentId) return 'Zweimal dieselbe Farbe – zweite Farbe wählen';
  if (filamentById(accent.filamentId).material !== filamentById(base.filamentId).material) {
    return 'Beide Farben müssen dasselbe Material sein';
  }
  if (accent.grams <= 0) return 'Spule der zweiten Farbe ist leer';
  return null;
}

// Auf welche Spule ein angehaltener Druck wartet (bei zweifarbigen Drucken kann es die Akzentfarbe sein)
export const waitingFilament = (job) => job.missingFilament ?? job.filamentId;
