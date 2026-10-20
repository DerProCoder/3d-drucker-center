// Gitterfüllung (Grid-Infill) für gedruckte Teile: Innen sind die Teile nicht massiv, sondern mit einem Gitter aus
// kleinen Quadraten gefüllt – Linien in x- und in z-Richtung. Hier steht beides, was dafür gebraucht wird:
//   infillLines: die Füllstrecken einer Schicht für die Düsenbahn (models/print-shapes.js)
//   capGeometry + infillTexture: die Schnittfläche oben am halbfertigen Teil, auf der man das Gitter sieht
// Alles in Metern im Koordinatensystem der Form (x, z), wie die Konturen aus sliceContours.
import * as THREE from 'three';

export const INFILL_SPACING = 0.0025; // Abstand der Gitterlinien (2,5 mm)
const INSET = 0.0004;                 // so weit bleibt die Füllung von den Wänden weg
const MIN_LENGTH = 0.002;             // kürzere Stücke (z. B. in dünnen Wänden) lässt die Düse weg

// Schnittpunkte der Geraden (axis = c) mit allen Konturen, sortiert – je zwei bilden eine Strecke im Inneren
// (gerade-ungerade-Regel, so werden auch Löcher richtig ausgespart). axis: 'x' (Linie x = c) oder 'z'.
function crossings(contours, axis, c) {
  const other = axis === 'x' ? 'z' : 'x';
  const hits = [];
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i];
      const q = contour[(i + 1) % contour.length];
      if ((p[axis] <= c) === (q[axis] <= c)) continue; // Kante kreuzt die Gerade nicht (halboffen, keine Doppelten)
      hits.push(p[other] + ((c - p[axis]) / (q[axis] - p[axis])) * (q[other] - p[other]));
    }
  }
  return hits.sort((a, b) => a - b);
}

// Füllstrecken einer Schicht: [{ a: { x, z }, b: { x, z } }]. Die Linien liegen auf festen Vielfachen von
// INFILL_SPACING, damit sie Schicht für Schicht übereinander liegen (und zum Muster der Schnittfläche passen).
export function infillLines(contours) {
  if (!contours.length) return [];
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
  }
  const segments = [];
  const scan = (axis, lo, hi) => {
    for (let k = Math.ceil(lo / INFILL_SPACING); k * INFILL_SPACING < hi; k++) {
      const c = k * INFILL_SPACING;
      const hits = crossings(contours, axis, c);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const from = hits[i] + INSET;
        const to = hits[i + 1] - INSET;
        if (to - from < MIN_LENGTH) continue;
        segments.push(axis === 'x'
          ? { a: { x: c, z: from }, b: { x: c, z: to } }
          : { a: { x: from, z: c }, b: { x: to, z: c } });
      }
    }
  };
  scan('x', minX, maxX);
  scan('z', minZ, maxZ);
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

// ---------- Schnittfläche ----------

function signedArea(contour) {
  let a = 0;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    const q = contour[(i + 1) % contour.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function inside(point, contour) {
  let hit = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const p = contour[i];
    const q = contour[j];
    if ((p.z > point.z) !== (q.z > point.z) && point.x < ((q.x - p.x) * (point.z - p.z)) / (q.z - p.z) + p.x) hit = !hit;
  }
  return hit;
}

// Fläche einer Schicht (Konturen einer Farbe) als waagrechte Geometrie bei y = 0, Löcher ausgespart.
// UV = Position in Metern, damit das Gittermuster (infillTexture) genau auf den Linien der Düse liegt.
export function capGeometry(contours) {
  const loops = contours.filter((c) => c.length > 2);
  // Verschachtelungstiefe: wie viele andere Konturen eine Kontur umschließen – gerade = Außenrand, ungerade = Loch
  const depth = loops.map((c, i) => loops.filter((o, j) => j !== i && inside(c[0], o)).length);
  const shapes = [];
  const owner = new Map(); // Index der Außenkontur → Shape
  loops.forEach((c, i) => {
    if (depth[i] % 2) return;
    const pts = c.map((p) => new THREE.Vector2(p.x, p.z));
    if (signedArea(c) < 0) pts.reverse();
    const shape = new THREE.Shape(pts);
    shapes.push(shape);
    owner.set(i, shape);
  });
  loops.forEach((c, i) => {
    if (depth[i] % 2 === 0) return;
    // Loch gehört zur kleinsten Außenkontur, die es umschließt
    let parent = null;
    let parentArea = Infinity;
    for (const [j, shape] of owner) {
      const area = Math.abs(signedArea(loops[j]));
      if (depth[j] === depth[i] - 1 && area < parentArea && inside(c[0], loops[j])) [parent, parentArea] = [shape, area];
    }
    if (!parent) return;
    const pts = c.map((p) => new THREE.Vector2(p.x, p.z));
    if (signedArea(c) > 0) pts.reverse();
    parent.holes.push(new THREE.Path(pts));
  });
  if (!shapes.length) return null;
  const geometry = new THREE.ShapeGeometry(shapes);
  geometry.rotateX(Math.PI / 2); // Form (x, y) → waagrecht (x, 0, z)
  return geometry;
}

let texture = null;
// Gittermuster: helle Linien (Filament) mit dunklen Zwischenräumen (Blick in die Tiefe), eine Kachel pro Quadrat
export function infillTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffffff';
  // Linie liegt auf dem Kachelrand (Vielfache von INFILL_SPACING), über den Rand verteilt
  for (const [x, y, w, h] of [[0, 0, 4, 32], [28, 0, 4, 32], [0, 0, 32, 4], [0, 28, 32, 4]]) ctx.fillRect(x, y, w, h);
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / INFILL_SPACING, 1 / INFILL_SPACING);
  texture.anisotropy = 4;
  return texture;
}
