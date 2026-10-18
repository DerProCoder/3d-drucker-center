// Halle: Drucktische, die man nach und nach kauft. Gekaufte Tische stehen in der Halle,
// der nächste kaufbare ist als Markierung auf dem Boden zu sehen – ein Klick darauf kauft ihn.
import * as THREE from 'three';
import { TABLE_ROWS_Z } from './workshop.js';
import { enableShadows } from './util.js';

const TABLE_W = 5.6;
const TABLE_D = 0.8;
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Bodenmarkierung: gestrichelter Rahmen mit Schrift, wo der nächste Tisch hinkommt
function createMarker(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(255, 207, 74, 0.9)';
  ctx.lineWidth = 8;
  ctx.setLineDash([28, 18]);
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = 'rgba(255, 207, 74, 0.12)';
  ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#ffd96a';
  ctx.font = '700 54px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_W, TABLE_W * (canvas.height / canvas.width)),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.006;
  return marker;
}

// createTable(width, depth): baut einen Tisch (aus main.js) · upgrades: Ausbau-Stand (upgrades.js)
export function createHall({ createTable, collision, upgrades }) {
  const group = new THREE.Group();
  const tables = TABLE_ROWS_Z.map((z) => {
    const table = createTable(TABLE_W, TABLE_D);
    table.position.z = z;
    enableShadows(table);
    return table;
  });
  const placed = new Set(); // Tische, die schon in der Halle stehen (inkl. Kollision)
  let marker = null;

  function sync() {
    tables.forEach((table, i) => {
      if (i < upgrades.tables && !placed.has(i)) {
        group.add(table);
        table.updateMatrixWorld(true);
        collision.addObject(table);
        placed.add(i);
      }
    });

    if (marker) group.remove(marker);
    marker = null;
    const price = upgrades.nextTablePrice;
    if (price === null) return;
    const number = upgrades.tables + 1;
    marker = createMarker(`Drucktisch ${number} · ${euro.format(price)} · hier klicken zum Kaufen`);
    marker.position.z = TABLE_ROWS_Z[upgrades.tables];
    marker.userData.interaction = {
      hint: () => {
        const problem = upgrades.buyProblem(upgrades.nextTablePrice);
        return problem
          ? `Drucktisch ${number} (${euro.format(price)}) – ${problem}`
          : `Linksklick: Drucktisch ${number} für ${euro.format(price)} kaufen`;
      },
      action: () => upgrades.buyTable(),
    };
    group.add(marker);
  }

  upgrades.subscribe(sync);
  return { group, tables };
}
