// Halle: Drucktische, die man nach und nach kauft. Wo der nächste Tisch hinkommt, liegt eine Markierung auf dem
// Boden: erst zum Kaufen, dann „unterwegs“, und ist der Tisch geliefert, stellt ein Klick ihn dort auf.
import * as THREE from 'three';
import { TABLE_ROWS_Z } from './workshop.js';
import { enableShadows } from './util.js';

const TABLE_W = 5.6;
const TABLE_D = 0.8;
const RISE_SECONDS = 0.6; // so lange fährt ein frisch aufgestellter Tisch aus dem Boden hoch
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Farben der Markierung je nach Zustand
const MARKER = {
  buy: { line: 'rgba(255, 207, 74, 0.9)', fill: 'rgba(255, 207, 74, 0.12)', text: '#ffd96a' },
  shipping: { line: 'rgba(124, 196, 255, 0.9)', fill: 'rgba(124, 196, 255, 0.1)', text: '#9fd4ff' },
  ready: { line: 'rgba(75, 224, 138, 0.95)', fill: 'rgba(75, 224, 138, 0.18)', text: '#7ef0a8' },
};

// Bodenmarkierung: gestrichelter Rahmen mit Schrift, wo der nächste Tisch hinkommt
function createMarker(text, colors) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 8;
  ctx.setLineDash([28, 18]);
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = colors.fill;
  ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = colors.text;
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

// Durchsichtige grüne Vorschau, wo der gelieferte Tisch hinkommt
function createGhost(createTable) {
  const ghost = createTable(TABLE_W, TABLE_D);
  const material = new THREE.MeshBasicMaterial({ color: 0x3ad16b, transparent: true, opacity: 0.22, depthWrite: false });
  ghost.traverse((o) => {
    if (o.isMesh) o.material = material;
    o.raycast = () => {}; // Klicks gehen an die Markierung
  });
  return ghost;
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
  const rising = [];        // { table, t } – frisch aufgestellte Tische fahren hoch
  let marker = null;
  let ghost = null;
  let firstSync = true;

  function sync() {
    tables.forEach((table, i) => {
      if (i < upgrades.tables && !placed.has(i)) {
        group.add(table);
        table.updateMatrixWorld(true);
        collision.addObject(table);
        placed.add(i);
        if (!firstSync) rising.push({ table, t: 0 }); // beim Laden stehen sie schon
      }
    });
    firstSync = false;

    for (const old of [marker, ghost]) if (old) group.remove(old);
    marker = null;
    ghost = null;
    if (upgrades.tables >= tables.length) return;
    const number = upgrades.tables + 1;
    const z = TABLE_ROWS_Z[upgrades.tables];

    if (upgrades.tablesReady > 0) {
      // Geliefert: grüne Markierung und Vorschau, Klick stellt ihn auf
      marker = createMarker(`Drucktisch ${number} geliefert · hier klicken zum Aufstellen`, MARKER.ready);
      marker.userData.interaction = {
        hint: () => `Linksklick: Drucktisch ${number} hier aufstellen`,
        action: () => upgrades.placeTable(),
      };
      ghost = createGhost(createTable);
      ghost.position.z = z;
      group.add(ghost);
    } else if (upgrades.tablesOrdered > upgrades.tables) {
      marker = createMarker(`Drucktisch ${number} ist unterwegs`, MARKER.shipping);
      marker.userData.interaction = {
        hint: () => `Drucktisch ${number} ist unterwegs – kommt in ${Math.ceil(upgrades.nextTableArrival ?? 0)} s`,
      };
    } else {
      const price = upgrades.nextTablePrice;
      if (price === null) return;
      marker = createMarker(`Drucktisch ${number} · ${euro.format(price)} · hier klicken zum Kaufen`, MARKER.buy);
      marker.userData.interaction = {
        hint: () => {
          const problem = upgrades.buyProblem(upgrades.nextTablePrice);
          return problem
            ? `Drucktisch ${number} (${euro.format(price)}) – ${problem}`
            : `Linksklick: Drucktisch ${number} für ${euro.format(price)} kaufen (Lieferung dauert etwas)`;
        },
        action: () => upgrades.buyTable(),
      };
    }
    marker.position.z = z;
    group.add(marker);
  }

  // Frisch aufgestellte Tische fahren aus dem Boden hoch
  function update(dt) {
    for (let i = rising.length - 1; i >= 0; i--) {
      const r = rising[i];
      r.t = Math.min(1, r.t + dt / RISE_SECONDS);
      const ease = 1 - (1 - r.t) ** 3;
      r.table.position.y = -0.8 * (1 - ease);
      r.table.scale.setScalar(0.9 + 0.1 * ease);
      if (r.t >= 1) rising.splice(i, 1);
    }
  }

  upgrades.subscribe(sync);
  return { group, tables, update };
}
