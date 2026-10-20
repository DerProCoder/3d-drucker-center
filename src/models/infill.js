// Wabenfüllung (Honeycomb-Infill) für gedruckte Teile: Innen sind die Teile nicht massiv, sondern mit Sechseck-Waben
// gefüllt – dünne Wände, Schicht für Schicht genau übereinander, wie bei einem Bienenstock. Hier steht:
//   infillSegments: die Wabenkanten einer Schicht im Inneren der Form (für die Düsenbahn und für die Wände)
//   orderSegments: kürzester Weg der Düse durch die Kanten
//   infillWalls: die Wabenwände im Inneren als Geometrie (man sieht sie, solange das Teil oben offen ist)
// Alles in Metern im Koordinatensystem der Form (x, z), wie die Konturen aus sliceContours.
import * as THREE from 'three';

export const HEX_SIZE = 0.002;     // Kantenlänge einer Wabe (2 mm, Wabe etwa 3,5 mm breit)
const INSET = 0.0004;              // so weit bleibt die Füllung von den Wänden weg
const MIN_PIECE = 0.0005;          // kürzere Reststücke an der Wand lässt die Düse weg
const THIN_WALL = 0.002;           // Stücke, die von Wand zu Wand kürzer als das sind, liegen in dünnen Wänden – weg damit
const CELL = 0.004;                // Rastergröße für die schnelle Suche nach Konturkanten

const HEX_W = Math.sqrt(3) * HEX_SIZE; // Breite einer Wabe (Spitze oben)
const ROW = 1.5 * HEX_SIZE;            // Abstand der Wabenreihen

const cellKey = (xi, zi) => xi * 65536 + zi; // Zahl statt Text – deutlich schneller als Map-Schlüssel

// Konturkanten in ein Raster einsortieren: Zeilen (für den Innen-Test per Strahl nach +x) und Zellen (für Schnitte)
function edgeIndex(contours) {
  const rows = new Map();
  const cells = new Map();
  const add = (map, key, edge) => { if (!map.has(key)) map.set(key, []); map.get(key).push(edge); };
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i];
      const q = contour[(i + 1) % contour.length];
      const edge = [p, q];
      const z0 = Math.floor(Math.min(p.z, q.z) / CELL); const z1 = Math.floor(Math.max(p.z, q.z) / CELL);
      const x0 = Math.floor(Math.min(p.x, q.x) / CELL); const x1 = Math.floor(Math.max(p.x, q.x) / CELL);
      for (let zi = z0; zi <= z1; zi++) {
        add(rows, zi, edge);
        for (let xi = x0; xi <= x1; xi++) add(cells, cellKey(xi, zi), edge);
      }
    }
  }
  return { rows, cells };
}

// Liegt der Punkt in der Form? (gerade-ungerade-Regel, so werden auch Löcher richtig ausgespart)
function insideShape(index, x, z) {
  let hit = false;
  for (const [p, q] of index.rows.get(Math.floor(z / CELL)) ?? []) {
    if ((p.z > z) !== (q.z > z) && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) hit = !hit;
  }
  return hit;
}

// Parameter t (0…1) entlang a→b, an denen die Strecke eine Konturkante schneidet
function wallHits(index, a, b) {
  const ts = [];
  let seen = null; // erst anlegen, wenn die Strecke überhaupt in der Nähe einer Wand liegt
  const x0 = Math.floor(Math.min(a.x, b.x) / CELL); const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
  const z0 = Math.floor(Math.min(a.z, b.z) / CELL); const z1 = Math.floor(Math.max(a.z, b.z) / CELL);
  const dx = b.x - a.x; const dz = b.z - a.z;
  for (let xi = x0; xi <= x1; xi++) {
    for (let zi = z0; zi <= z1; zi++) {
      for (const edge of index.cells.get(cellKey(xi, zi)) ?? []) {
        seen ??= new Set();
        if (seen.has(edge)) continue;
        seen.add(edge);
        const [p, q] = edge;
        const ex = q.x - p.x; const ez = q.z - p.z;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-14) continue;
        const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den;
        const u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
      }
    }
  }
  return ts.sort((m, n) => m - n);
}

// Kanten des Wabenrasters (Spitze oben) im Bereich: je Wabe die beiden oberen Schrägen und die linke Senkrechte –
// zusammen ergibt das jede Kante genau einmal. Das Raster ist fest, damit die Waben in jeder Schicht übereinander liegen.
function hexEdges(minX, maxX, minZ, maxZ) {
  const edges = [];
  const h = HEX_SIZE; const w = HEX_W;
  for (let r = Math.floor(minZ / ROW) - 1; r * ROW <= maxZ + h; r++) {
    const shift = Math.abs(r % 2) ? w / 2 : 0;
    for (let c = Math.floor((minX - shift) / w) - 1; c * w + shift <= maxX + w; c++) {
      const cx = c * w + shift; const cz = r * ROW;
      const top = { x: cx, z: cz - h };
      const left = { x: cx - w / 2, z: cz - h / 2 };
      const right = { x: cx + w / 2, z: cz - h / 2 };
      edges.push([left, top], [top, right], [left, { x: cx - w / 2, z: cz + h / 2 }]);
    }
  }
  return edges;
}

// Wabenkanten einer Schicht im Inneren der Konturen: [{ a: { x, z }, b: { x, z } }]. Wo eine Kante die Wand schneidet,
// endet sie INSET davor; Krümel in dünnen Wänden fallen weg.
export function infillSegments(contours) {
  if (!contours.length) return [];
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
  }
  const index = edgeIndex(contours);
  const segments = [];
  for (const [a, b] of hexEdges(minX, maxX, minZ, maxZ)) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const cuts = [0, ...wallHits(index, a, b), 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      let t0 = cuts[i]; let t1 = cuts[i + 1];
      const tm = (t0 + t1) / 2;
      if (!insideShape(index, a.x + (b.x - a.x) * tm, a.z + (b.z - a.z) * tm)) continue;
      const atWall0 = i > 0; const atWall1 = i + 2 < cuts.length;
      if (atWall0 && atWall1 && (t1 - t0) * len < THIN_WALL) continue;
      if (atWall0) t0 += INSET / len;
      if (atWall1) t1 -= INSET / len;
      if ((t1 - t0) * len < MIN_PIECE) continue;
      segments.push({
        a: { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 },
        b: { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 },
      });
    }
  }
  return segments;
}

// Strecken so ordnen, dass die Düse immer zur nächstgelegenen fährt und sie vom näheren Ende aus druckt.
// Gibt Bahnpunkte zurück; der Anfang jeder Strecke ist eine Leerfahrt (travel). from: wo die Düse gerade steht.
export function orderSegments(segments, from = { x: 0, z: 0 }) {
  const points = [];
  const left = [...segments];
  let at = from;
  while (left.length) {
    let best = 0;
    let flip = false;
    let bestDist = Infinity;
    left.forEach((s, i) => {
      const da = (s.a.x - at.x) ** 2 + (s.a.z - at.z) ** 2;
      const db = (s.b.x - at.x) ** 2 + (s.b.z - at.z) ** 2;
      if (da < bestDist) [best, flip, bestDist] = [i, false, da];
      if (db < bestDist) [best, flip, bestDist] = [i, true, db];
    });
    const s = left.splice(best, 1)[0];
    const [start, end] = flip ? [s.b, s.a] : [s.a, s.b];
    points.push({ ...start, travel: true }, { ...end });
    at = end;
  }
  return points;
}

// ---------- Wabenwände ----------

const MERGE_TOLERANCE = 0.0003; // so wenig dürfen Strecken benachbarter Schichten abweichen, um eine Wand zu bilden

// Wabenwände aus den Füllstrecken aller Schichten: layers[i] = Strecken der Schicht i, layerHeight in Metern.
// Bleibt eine Strecke von Schicht zu Schicht gleich (z. B. im Würfel), wird daraus eine hohe Wand statt vieler
// flacher – so bleibt die Geometrie klein. Jede Wand ist ein senkrechtes Rechteck (beidseitig sichtbar).
// y0: Höhe der ersten Schicht (für Abschnitte, die weiter oben beginnen)
export function infillWalls(layers, layerHeight, y0 = 0) {
  const open = new Map(); // Schlüssel der Strecke → Wand, die in der letzten Schicht noch weiterlief
  const walls = [];
  const keyOf = ({ a, b }) => [a.x, a.z, b.x, b.z].map((v) => Math.round(v / MERGE_TOLERANCE)).join(',');
  layers.forEach((segments, i) => {
    const next = new Map();
    for (const segment of segments) {
      const key = keyOf(segment);
      const wall = open.get(key);
      if (wall) wall.y1 = y0 + (i + 1) * layerHeight;
      const current = wall ?? { segment, y0: y0 + i * layerHeight, y1: y0 + (i + 1) * layerHeight };
      if (!wall) walls.push(current);
      next.set(key, current);
    }
    open.clear();
    for (const [k, v] of next) open.set(k, v);
  });
  if (!walls.length) return null;
  const positions = [];
  for (const { segment: { a, b }, y0, y1 } of walls) {
    positions.push(
      a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z,
      a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
