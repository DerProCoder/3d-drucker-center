// Ausstellungsregal: fertige Teile aus dem Inventar ins Regal stellen und wieder zurücknehmen – reine Deko.
// Die Regale stehen auf festen Plätzen an der Südwand der Halle (location 'wall', slot 0 … DISPLAY_SPOTS - 1).
// Fächer: shelf.parts[i] = { templateId, filamentIds } (alle Farben, [0] = Grundfarbe) oder null
import { partColors } from './two-color.js';

export const DISPLAY_SPOTS = 4; // so viele Ausstellungsregale passen an die Südwand

export const isDisplayShelf = (f) => f.type.id === 'display-shelf';

export function wallSlotUsed(economy, slot) {
  return economy.furniture.some((f) => f.location === 'wall' && f.slot === slot);
}

// Freie Wandplätze (für den Shop: ohne Platz kein Kauf). Gekaufte, noch nicht aufgestellte Regale zählen mit.
export function freeDisplaySpots(economy) {
  return DISPLAY_SPOTS - economy.furniture.filter(isDisplayShelf).length;
}

// Fertige Teile, die man ausstellen kann: [{ templateId, colors, count }]
export function displayableParts(economy) {
  return economy.partsList().map((p) => ({ templateId: p.templateId, colors: partColors(p), count: p.count }));
}

// Ein Teil (Eintrag aus displayableParts) ins Fach index stellen
export function putOnDisplay(economy, shelf, index, part) {
  if (shelf.parts?.[index] !== null || !economy.removePart(part.templateId, part.colors)) return false;
  shelf.parts[index] = { templateId: part.templateId, filamentIds: [...part.colors] };
  economy.notify();
  return true;
}

// Teil aus dem Fach zurück ins Inventar
export function takeFromDisplay(economy, shelf, index) {
  const part = shelf.parts?.[index];
  if (!part) return null;
  shelf.parts[index] = null;
  economy.addPart(part.templateId, part.filamentIds);
  economy.notify();
  return part;
}
