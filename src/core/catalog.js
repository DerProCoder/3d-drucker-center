// Alles, was man im Shop kaufen kann. Reine Daten, damit Preise und Werte an einer Stelle stehen.
// Diese Datei bündelt nur die Teilkataloge, damit `import { … } from '../core/catalog.js'` überall gleich bleibt:
//   filament-catalog.js  – Filamentsorten und -farben, Holzplatten (WOODS, SHEET_MM), SPOOL_GRAMS
//   printer-catalog.js   – Drucker und Laser (PRINTERS), Geschwindigkeitsstufen, LED-Farben, technische Daten
//   print-templates.js   – Druck- und Laservorlagen, Lasermotive, Fehldrucke (FAILURES)
//   furniture-catalog.js – Einrichtung (FURNITURE), Zubehör (ACCESSORIES), Ersatzteile (SPARE_PARTS)
// Neue Einträge in den passenden Teilkatalog, nicht hierher.
export * from './filament-catalog.js';
export * from './printer-catalog.js';
export * from './print-templates.js';
export * from './furniture-catalog.js';
