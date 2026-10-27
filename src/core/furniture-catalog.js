// Einrichtung, Zubehör und Ersatzteile aus dem Shop. Reine Daten.
import { serverHardwareById } from './server-catalog.js';

// Einrichtung für den Druckertisch: kommt als Karton in den Abstellraum und belegt aufgestellt einen Stellplatz.
// capacity: Spulen (Filament-Regal), Ersatzteile (Ersatzteilregal) bzw. Holzplatten (Holzregal)
export const FURNITURE = [
  {
    id: 'filament-rack', name: 'Filament-Regal', price: 49, capacity: 8,
    hint: 'Hält 8 Spulen griffbereit direkt neben den Druckern',
  },
  {
    id: 'parts-rack', name: 'Ersatzteilregal', price: 39, capacity: 12,
    hint: 'Sortimentskasten für bis zu 12 Ersatzdüsen',
  },
  {
    id: 'wood-rack', name: 'Holzregal', price: 45, capacity: 10,
    hint: 'Hält 10 Holzplatten stehend griffbereit neben dem Laser',
  },
  {
    // placement 'wall': steht nicht zwischen den Druckern, sondern auf einem Platz an der Südwand (siehe display-shelf.js)
    id: 'display-shelf', name: 'Ausstellungsregal', price: 79, capacity: 12, placement: 'wall',
    hint: 'Zeigt bis zu 12 fertige Teile – mit Licht aus leuchten Glow-Drucke',
  },
];

// Auch Server-Hardware (Schränke, Server, Switches …) läuft als Einrichtung – siehe server-catalog.js
export const furnitureById = (id) => FURNITURE.find((f) => f.id === id) ?? serverHardwareById(id);
export const isWallFurniture = (type) => type.placement === 'wall';

// Ersatzteile: werden direkt ins Ersatzteilregal geliefert
export const SPARE_PARTS = [
  { id: 'nozzle', name: 'Ersatzdüse 0,4 mm', price: 12, hint: 'Verschlissene oder verstopfte Düse tauschen' },
];

// Zubehör aus dem Filament-Shop. Wird einmal gekauft und steht dann im Abstellraum.
export const ACCESSORIES = [
  {
    id: 'dryer', name: 'Filament-Trockenschrank', price: 129,
    hint: 'Hält die Spulen im Regal trocken und trocknet feuchte Spulen wieder',
  },
];

export const accessoryById = (id) => ACCESSORIES.find((a) => a.id === id);
