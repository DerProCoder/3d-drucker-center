// Gitterfüllung (Grid-Infill, 45° gedreht) für gedruckte Teile: Innen sind die Teile nicht massiv, sondern mit einem
// schrägen Rautengitter gefüllt – dünne Wände, Schicht für Schicht genau übereinander. Wo die Form nach oben oder
// unten offen ist (unterste und oberste Schichten, aber auch Absätze wie der Sockel des Handyhalters), wird die Fläche
// wie bei einem echten Slicer geschlossen: dichte schräge Linien, Lage für Lage abwechselnd nach links und rechts.
// Hier steht:
//   infillSegments: Gitter- und Deckflächenlinien einer Schicht im Inneren der Form (für Düsenbahn und Wände)
//   shapeTest: liegt ein Punkt in einer Schicht? (für die Suche nach offenen Flächen)
//   orderSegments: kürzester Weg der Düse durch die Linien
//   infillWalls: die Gitterwände im Inneren als Geometrie (man sieht sie, solange das Teil oben offen ist)
// Alles in Metern im Koordinatensystem der Form (x, z), wie die Konturen aus sliceContours.
import * as THREE from 'three';

export const GRID_GAP = 0.01;      // Abstand der Gitterlinien (10 mm, gut sichtbare Rauten)
const SKIN_GAP = 0.002;            // Linienabstand der geschlossenen Ober- und Unterseiten (2 mm – Hin und Her bleibt sichtbar)
const SKIN_STEP = 0.0015;          // in diesen Schritten wird geprüft, ob eine Linie auf einer offenen Fläche liegt
const INSET = 0.0004;              // so weit bleibt die Füllung von den Wänden weg
const MIN_PIECE = 0.0005;          // kürzere Reststücke an der Wand lässt die Düse weg
const THIN_WALL = 0.002;           // Stücke, die von Wand zu Wand kürzer als das sind, liegen in dünnen Wänden – weg damit
const CELL = 0.004;                // Rastergröße für die schnelle Suche nach Konturkanten

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
  const dx = b.x - a.x; const dz = b.z - a.z;
  for (let xi = x0; xi <= x1; xi++) {
    // Nur die Zellen entlang der Strecke durchsuchen, nicht das ganze umschließende Rechteck (lange Schräglinien)
    let za = a.z; let zb = b.z;
    if (Math.abs(dx) > 1e-12) {
      za = a.z + dz * Math.min(1, Math.max(0, (xi * CELL - a.x) / dx));
      zb = a.z + dz * Math.min(1, Math.max(0, ((xi + 1) * CELL - a.x) / dx));
    }
    const z0 = Math.floor(Math.min(za, zb) / CELL); const z1 = Math.floor(Math.max(za, zb) / CELL);
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

// Schräge Linien im Bereich mit Abstand gap: Richtung +1 heißt x + z = konstant, -1 heißt x - z = konstant. Jede Linie
// ist eine Strecke über den ganzen Bereich. Das Raster ist fest, damit die Linien in jeder Schicht übereinander liegen.
function diagonalLines(box, gap, dirs) {
  const lines = [];
  const step = gap * Math.SQRT2; // senkrechter Abstand gap → Abstand entlang x + z bzw. x - z
  const x0 = box.minX - gap; const x1 = box.maxX + gap;
  if (dirs.includes(1)) {
    for (let k = Math.floor((box.minX + box.minZ) / step); k * step <= box.maxX + box.maxZ; k++) {
      const c = k * step; // x + z = c
      lines.push([{ x: x0, z: c - x0 }, { x: x1, z: c - x1 }]);
    }
  }
  if (dirs.includes(-1)) {
    for (let k = Math.floor((box.minX - box.maxZ) / step); k * step <= box.maxX - box.minZ; k++) {
      const c = k * step; // x - z = c
      lines.push([{ x: x0, z: x0 - c }, { x: x1, z: x1 - c }]);
    }
  }
  return lines;
}

// Linien auf das Innere der Konturen zuschneiden. Wo eine Linie die Wand schneidet, endet sie INSET davor;
// Krümel in dünnen Wänden fallen weg.
function clipLines(index, lines) {
  const segments = [];
  for (const [a, b] of lines) {
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

// Nur die Stücke der Strecken behalten, deren Punkte keep(x, z) erfüllen (in Schritten von SKIN_STEP geprüft)
function keepWhere(segments, keep) {
  const result = [];
  for (const { a, b } of segments) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SKIN_STEP));
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    let from = null;
    for (let i = 0; i <= n; i++) {
      const inside = i < n && keep(a.x + (b.x - a.x) * ((i + 0.5) / n), a.z + (b.z - a.z) * ((i + 0.5) / n));
      if (inside && from === null) from = i;
      if (!inside && from !== null) {
        const piece = { a: at(from / n), b: at(i / n) };
        if (Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z) >= MIN_PIECE) result.push(piece);
        from = null;
      }
    }
  }
  return result;
}

const length = (segments) => segments.reduce((sum, { a, b }) => sum + Math.hypot(b.x - a.x, b.z - a.z), 0);

// Liegt ein Punkt in diesen Konturen? Gibt eine Funktion (x, z) → true/false zurück.
export function shapeTest(contours) {
  if (!contours.length) return () => false;
  const index = edgeIndex(contours);
  return (x, z) => insideShape(index, x, z);
}

// Füllung einer Schicht im Inneren der Konturen: [{ a: { x, z }, b: { x, z } }].
// skin: wo die Fläche offen ist – true (ganze Schicht) oder Funktion (x, z) → true/false; dort dichte schräge Linien
// statt Gitter. layer: Schichtnummer, damit die Richtung der Deckflächenlinien alle zwei Schichten wechselt.
export function infillSegments(contours, skin = null, layer = 0) {
  if (!contours.length) return [];
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const c of contours) {
    for (const p of c) {
      box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
      box.minZ = Math.min(box.minZ, p.z); box.maxZ = Math.max(box.maxZ, p.z);
    }
  }
  const index = edgeIndex(contours);
  const skinLines = () => clipLines(index, diagonalLines(box, SKIN_GAP, [Math.floor(layer / 2) % 2 ? -1 : 1]));
  if (skin === true) return skinLines();
  const grid = clipLines(index, diagonalLines(box, GRID_GAP, [1, -1]));
  if (!skin) return grid;
  const inner = keepWhere(grid, (x, z) => !skin(x, z));
  // Hat das Gitter nirgends eine offene Fläche gestreift, die teuren dichten Linien gar nicht erst berechnen
  if (length(inner) > length(grid) - MIN_PIECE) return grid;
  return [...inner, ...keepWhere(skinLines(), skin)];
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

// ---------- Füllwände ----------

const MERGE_TOLERANCE = 0.0003; // so wenig dürfen Strecken benachbarter Schichten abweichen, um eine Wand zu bilden

// Gitterwände aus den Füllstrecken aller Schichten: layers[i] = Strecken der Schicht i, layerHeight in Metern.
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
