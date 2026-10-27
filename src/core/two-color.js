// Zweifarbige Drucke: Vorlagen mit Grund- und Akzentfarbe (colors: 2 in catalog.js).
// Ein Dual-Nozzle-Drucker hat für jede Farbe eine eigene Düse und druckt fast so schnell wie einfarbig.
// Ein Drucker mit nur einer Düse (AMS) muss in jeder Schicht die Farbe wechseln: Filament zurückziehen, die andere
// Spule laden, die alte Farbe ausspülen – das dauert deutlich länger und kostet Spülabfall.
// Ein Drucker mit Düsenwechsler (H2C) holt sich für jede Farbe ihre eigene Düse aus dem Wechsler: fast kein
// Spülabfall und noch etwas schneller als zwei feste Düsen. Verstopft eine, nimmt er eine Ersatzdüse.
// Ohne AMS (nur ein Spulenhalter) geht es gar nicht. Beide Farben müssen verschieden sein.
// Bewusst ohne Three.js und DOM.
import { filamentById, filamentColorName, filamentLabel } from './catalog.js';

export const DUAL_NOZZLE_TIME = 1.1;     // Düsenwechsel dauert nur ein paar Sekunden
export const SINGLE_NOZZLE_TIME = 1.8;   // Farbwechsel mit einer Düse in jeder Schicht
export const DUAL_NOZZLE_WASTE = 1.05;   // kleiner Spülturm
export const SINGLE_NOZZLE_WASTE = 1.5;  // viel Spülabfall beim Ausspülen der alten Farbe
export const CHANGER_TIME = 1.06;        // Düsenwechsler: Kopf tauscht die Düse in Sekunden
export const CHANGER_WASTE = 1.01;       // jede Farbe hat ihre Düse – kaum Spülen

export const isTwoColor = (template) => template?.colors === 2;

// Mehrfarbig (colors: 3 und mehr): jede Farbe kommt aus einem eigenen AMS-Fach. Gedruckt wird mit dem gewählten
// Fach und den nächsten Fächern mit anderen Farben im gleichen Material – die Reihenfolge im AMS bestimmt also,
// welches Teil der Form welche Farbe bekommt (template.parts).
export const colorCount = (template) => template?.colors ?? 1;
export const isMultiColor = (template) => colorCount(template) > 2;

// Alle Farben eines Drucks oder fertigen Teils: [Grundfarbe, …]
export const partColors = (x) => x.filamentIds ?? [x.filamentId, x.filamentId2].filter(Boolean);

// Filamente, aus denen die Materialien eines Teils entstehen (models/printed-part.js): eine Sorte für einfarbige
// Formen, sonst eine pro Farbe
export function partFilaments(template, colors) {
  if (colorCount(template) < 2 || colors.length < 2) return [filamentById(colors[0])];
  return colors.map((id) => filamentById(id));
}

// „PLA Schwarz“, zweifarbig „PLA Schwarz + Matte Weiß“, mehrfarbig „PLA in 8 Farben“
export function colorsLabel(colors) {
  const label = filamentLabel(filamentById(colors[0]));
  if (colors.length > 2) return `${filamentById(colors[0]).material} in ${colors.length} Farben`;
  return colors.length === 2 ? `${label} + ${filamentColorName(filamentById(colors[1]))}` : label;
}

// Eine Düse mit AMS (P1P, P1S, P2S, H2S): beim Farbwechsel wird die alte Farbe in einen Mülleimer hinten am
// Drucker ausgespült. Der Spülabfall (Anteil PURGE_SHARE vom Verbrauch zwei- und mehrfarbiger Drucke) sammelt sich
// dort, bis jemand den Eimer leert (economy.emptyWasteBin).
export const hasWasteBin = (model) => (model.nozzles ?? 1) === 1 && model.spoolSlots > 1;
export const PURGE_SHARE = 1 - 1 / SINGLE_NOZZLE_WASTE;

export const hasDualNozzle = (printer) => (printer.model.nozzles ?? 1) > 1;
export const hasNozzleChanger = (printer) => !!printer.model.nozzleChanger;

// Ist eine der beiden Düsen verstopft, muss der Drucker wie einer mit einer Düse die Farbe wechseln.
// Der Düsenwechsler hat genug Ersatz und bleibt dabei.
export const usesDualNozzle = (printer) => hasDualNozzle(printer) && (!printer.clogged || hasNozzleChanger(printer));

// Faktor auf die Druckzeit
export function colorTimeFactor(printer, template) {
  if (colorCount(template) < 2) return 1;
  if (hasNozzleChanger(printer)) return CHANGER_TIME;
  return usesDualNozzle(printer) ? DUAL_NOZZLE_TIME : SINGLE_NOZZLE_TIME;
}

// Filament pro Farbe für count Teile in Gramm: [Grundfarbe] bzw. [Grundfarbe, Akzentfarbe] inkl. Spülabfall,
// mehrfarbig eine Menge pro Farbe nach template.shares
export function gramsPerColor(printer, template, count = 1) {
  const total = template.grams * count;
  if (colorCount(template) < 2) return [total];
  const waste = hasNozzleChanger(printer) ? CHANGER_WASTE : usesDualNozzle(printer) ? DUAL_NOZZLE_WASTE : SINGLE_NOZZLE_WASTE;
  const shares = isMultiColor(template) ? template.shares : [1 - template.accent, template.accent];
  return shares.map((share) => total * share * waste);
}

// Fächer eines mehrfarbigen Drucks: Teil 0 aus dem gewählten Fach, die anderen Teile aus den im Druckermenü
// gewählten Fächern (printer.multiSlots). Teile ohne gültige Wahl bekommen die nächsten Fächer mit einer anderen
// Farbe im gleichen Material. Kann kürzer sein als template.colors (dann meldet multiColorProblem, was fehlt).
export function multiColorSlots(printer, template) {
  const { spools, activeSlot } = printer;
  const base = spools[activeSlot];
  if (!base) return [];
  const material = filamentById(base.filamentId).material;
  const used = new Set([base.filamentId]);
  const fits = (i) => {
    const s = spools[i];
    return !!s && s.grams > 0 && !used.has(s.filamentId) && filamentById(s.filamentId).material === material;
  };
  const slots = [activeSlot];
  const chosen = printer.multiSlots ?? [];
  for (let part = 1; part < template.colors; part++) {
    const i = chosen[part];
    if (i == null || !fits(i)) continue;
    slots[part] = i;
    used.add(spools[i].filamentId);
  }
  // Lücken der Reihe nach auffüllen, ab dem gewählten Fach
  const order = [...spools.keys()].map((i) => (activeSlot + i) % spools.length);
  for (let part = 1; part < template.colors; part++) {
    if (slots[part] != null) continue;
    const i = order.find(fits);
    if (i === undefined) break;
    slots[part] = i;
    used.add(spools[i].filamentId);
  }
  return slots.filter((i) => i != null);
}

// Grund, warum ein mehrfarbiger Druck nicht starten kann, oder null. Die Grundfarbe prüft economy.printProblem.
export function multiColorProblem(printer, template) {
  const n = template.colors;
  if (printer.spools.length < n) return `${n} Farben – braucht ${n} AMS-Fächer (H2C)`;
  const found = multiColorSlots(printer, template).length;
  if (found < n) {
    const material = filamentById(printer.spools[printer.activeSlot].filamentId).material;
    return `Braucht ${n} verschiedene Farben ${material} im AMS – ${found} eingelegt`;
  }
  return null;
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
