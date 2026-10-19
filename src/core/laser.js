// Laser R1: graviert und schneidet Holzplatten. Steht wie ein Drucker auf dem Drucktisch und läuft über dieselben
// Aufträge, dieselbe Stromrechnung und dasselbe Druckermenü – statt Spulen hat er aber ein Fach für eine Holzplatte
// (printer.sheet = { woodId } oder null) und statt Druckvorlagen die LASER_TEMPLATES aus catalog.js.
// Ein Laserauftrag (printer.job) hat zusätzlich laser: 'text' | 'logo' | 'cut', woodId, pieces und je nach Art
// text (eingravierter Text) oder motif (Logo bzw. ausgeschnittene Figur).
// Bewusst ohne Three.js und DOM.
import { LASER_MOTIFS, LASER_TEXT_MAX, SHEET_MM, woodById } from './catalog.js';

export const isLaser = (printer) => printer?.model.kind === 'laser';

// Text für die Gravur: Leerzeichen am Rand weg, höchstens LASER_TEXT_MAX Zeichen
export const cleanLaserText = (text) => String(text ?? '').trim().slice(0, LASER_TEXT_MAX);

// Grund, warum der Laser nicht starten kann, oder null. options: { text, motif }
export function laserProblem(printer, template, options = {}) {
  if (printer.location !== 'table') return 'Laser ist nicht aufgestellt';
  if (!template?.laser) return 'Keine Laservorlage';
  if (printer.job?.status === 'printing' || printer.job?.status === 'paused') return 'Lasert gerade';
  if (printer.job?.status === 'done') return 'Erst die fertigen Teile entnehmen';
  if (!printer.sheet) return 'Keine Holzplatte eingelegt';
  if (template.laser === 'text' && !cleanLaserText(options.text)) return 'Text für die Gravur eingeben';
  if (template.laser !== 'text' && !LASER_MOTIFS.some((m) => m.id === options.motif)) return 'Motiv wählen';
  return null;
}

// Neuer Laserauftrag aus der eingelegten Platte (die Platte liegt dann als Werkstück im Laser)
export function createLaserJob(printer, template, options) {
  return {
    templateId: template.id, laser: template.laser, count: 1, pieces: template.pieces,
    woodId: printer.sheet.woodId, filamentId: printer.sheet.woodId, // filamentId: wie bei Drucken das Material des Teils
    text: template.laser === 'text' ? cleanLaserText(options.text) : null,
    motif: template.laser === 'text' ? null : options.motif,
    progress: 0, gramsUsed: 0, status: 'printing', slot: 0,
  };
}

// Kurzbeschreibung eines Laserauftrags, z. B. „„Kater Düsentrieb“ auf Birke“ oder „6 × Stern aus Pappel“
export function laserJobLabel(job) {
  const wood = woodById(job.woodId)?.color ?? 'Holz';
  const motif = LASER_MOTIFS.find((m) => m.id === job.motif)?.name;
  if (job.laser === 'text') return `„${job.text}“ auf ${wood}`;
  if (job.laser === 'cut') return `${job.pieces} × ${motif} aus ${wood}`;
  return `${motif} auf ${wood}`;
}

// Alles, was die Zeichnung einer gelaserten Platte braucht (models/laser-art.js):
// { laser, text, motif, wood (aus WOODS), sheet (Plattengröße in mm) }. source: Laserauftrag oder Auswahl im Menü.
export function laserDesign({ laser, text, motif, woodId }) {
  return { laser, text: text ?? '', motif, wood: woodById(woodId) ?? woodById('holz-pappel'), sheet: SHEET_MM };
}
