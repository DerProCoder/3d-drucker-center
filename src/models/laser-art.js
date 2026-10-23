// Was der Laser R1 auf eine Holzplatte bringt – als 2D-Zeichnung, gemeinsam genutzt von der Holzplatte in der Halle
// (Textur, world/laser.js) und der Vorschau im Druckermenü. Alles in Millimetern auf der Platte (design.sheet),
// Ursprung oben links, y nach unten wie auf dem Canvas.
//   Gravur (Text, Logo): Fläche wird Zeile für Zeile von oben nach unten eingebrannt (rasterRows)
//   Schneiden: der Laser fährt die Umrisse der Figuren ab (cutPath)

// ---------- Motive: Umrisse auf eine Größe von 1 × 1 normiert, Mitte (0, 0), y nach unten ----------

function starOutline() {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push([Math.cos(a) * r, Math.sin(a) * r + 0.04]);
  }
  return [points];
}

function heartOutline() {
  const points = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push([x / 34, -y / 34 + 0.03]);
  }
  return [points];
}

// Katzenkopf: runder Kopf mit zwei spitzen Ohren in einem Umriss
function catOutline() {
  const points = [];
  for (let deg = 90; deg < 450; deg += 6) {
    const a = (deg * Math.PI) / 180;
    const d = ((deg % 360) + 360) % 360;
    if (d > 225 && d < 255) continue; // Platz fürs linke Ohr
    if (d > 285 && d < 315) continue; // rechtes Ohr
    points.push([Math.cos(a) * 0.42, Math.sin(a) * 0.36 + 0.08]);
    if (d === 222) points.push([-0.36, -0.48]); // Ohrspitze links
    if (d === 282) points.push([0.36, -0.48]); // Ohrspitze rechts
  }
  return [points];
}

// Zahnrad mit 10 Zähnen und Loch in der Mitte
function gearOutline() {
  const teeth = 10;
  const outer = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 0.5 : 0.38;
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const hole = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    hole.push([Math.cos(a) * 0.14, Math.sin(a) * 0.14]);
  }
  return [outer, hole];
}

const OUTLINES = { stern: starOutline(), herz: heartOutline(), katze: catOutline(), zahnrad: gearOutline() };

// Umrisse eines Motivs in Millimetern: Mitte (cx, cy), Kantenlänge size
export function motifPolygons(motif, cx, cy, size) {
  return (OUTLINES[motif] ?? OUTLINES.stern).map((poly) => poly.map(([x, y]) => [cx + x * size, cy + y * size]));
}

function tracePolygons(ctx, polygons, scale) {
  ctx.beginPath();
  for (const poly of polygons) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
    ctx.closePath();
  }
}

// ---------- Aufteilung auf der Platte ----------

const CUT_GRID = { cols: 3, rows: 2, size: 78 }; // ausgeschnittene Figuren: 3 × 2 auf einer Platte

// Mittelpunkte der ausgeschnittenen Figuren
function cutCenters(sheet) {
  const { cols, rows } = CUT_GRID;
  const centers = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) centers.push([(sheet.x / cols) * (c + 0.5), (sheet.y / rows) * (r + 0.5)]);
  }
  return centers;
}

// Gravur als Bild zeichnen (nur die eingebrannten Stellen, durchsichtiger Hintergrund).
// design: { laser, text, motif, wood, sheet } aus core/laser.js (laserDesign), scale: Pixel pro mm
// part (nur beim Schild): 'text' oder 'frame' zeichnet nur die Buchstaben bzw. nur den Rahmen – so kann der Laser
// erst die Schrift und danach den Rahmen außen herum lasern
export function drawEngraving(ctx, design, scale, part = 'all') {
  const { sheet } = design;
  const burn = design.wood.burn;
  ctx.save();
  ctx.fillStyle = burn;
  ctx.strokeStyle = burn;
  if (design.laser === 'text') {
    // Schild: Rahmen mit abgerundeten Ecken, Text so groß wie möglich in der Mitte
    if (part !== 'text') drawFrame(ctx, sheet, scale);
    if (part !== 'frame') drawSignText(ctx, design, scale);
  } else {
    tracePolygons(ctx, motifPolygons(design.motif, sheet.x / 2, sheet.y / 2, 160), scale);
    ctx.fill('evenodd');
  }
  ctx.restore();
}

function drawFrame(ctx, sheet, scale) {
  ctx.lineWidth = 4 * scale;
  const r = 12 * scale;
  const x = 14 * scale;
  const y = 14 * scale;
  const w = (sheet.x - 28) * scale;
  const h = (sheet.y - 28) * scale;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawSignText(ctx, design, scale) {
  const { sheet } = design;
  const text = design.text || ' ';
  let size = 70;
  ctx.font = `700 ${size * scale}px Georgia, "Times New Roman", serif`;
  while (size > 14 && ctx.measureText(text).width > (sheet.x - 60) * scale) {
    size -= 2;
    ctx.font = `700 ${size * scale}px Georgia, "Times New Roman", serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, (sheet.x / 2) * scale, (sheet.y / 2 + 2) * scale);
}

// Schnittbahn der ausgeschnittenen Figuren: Liste von geschlossenen Umrissen in mm (für die Vorschau)
export function cutPath(design) {
  return cutCenters(design.sheet).flatMap(([cx, cy]) => motifPolygons(design.motif, cx, cy, CUT_GRID.size));
}

// ---------- Fahrplan des Lasers ----------
// Wie ein echter Laser: erst alle Außenkonturen, dann alle Innenkonturen (Löcher, Innenkante des Rahmens), beim
// Gravieren danach die Füllung – Zeile für Zeile, aber nur dort, wo wirklich eingebrannt wird.
// Ergebnis: { outer, inner, spans } – Konturen als geschlossene Punktlisten [[x, y], …] in mm, Füllzeilen als
// { y, x0, x1, h } in mm (h: Zeilenhöhe).

// Schneiden: Außenumrisse aller Figuren, dann ihre Löcher (z. B. beim Zahnrad)
export function cutPlan(design) {
  const shapes = cutCenters(design.sheet).map(([cx, cy]) => motifPolygons(design.motif, cx, cy, CUT_GRID.size));
  return { outer: shapes.map((s) => s[0]), inner: shapes.flatMap((s) => s.slice(1)), spans: [] };
}

// Gravieren: Konturen und Füllzeilen aus der Gravur selbst gewinnen. mask: 1 = wird eingebrannt, ein Wert pro mm
// (cols × rows), so funktioniert es für jeden Text und jedes Logo.
export function engravePlan(mask, cols, rows, rowStep = 1.2) {
  const loops = traceContours(mask, cols, rows);
  // Verschachtelung: liegt eine Kontur in einer geraden Zahl anderer, ist sie eine Außenkante, sonst eine Innenkante
  const outer = [];
  const inner = [];
  for (const loop of loops) {
    const depth = loops.filter((other) => other !== loop && pointInPolygon(loop[0], other)).length;
    (depth % 2 ? inner : outer).push(loop);
  }
  const spans = [];
  let row = 0;
  for (let y = rowStep / 2; y < rows; y += rowStep, row++) {
    const cy = Math.min(rows - 1, Math.floor(y));
    const runs = [];
    let start = -1;
    for (let x = 0; x <= cols; x++) {
      const on = x < cols && mask[cy * cols + x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        runs.push({ y, x0: start, x1: x, h: rowStep });
        start = -1;
      }
    }
    // Abwechselnd hin und zurück, damit der Kopf nicht jedes Mal an den Anfang der Zeile fährt
    if (row % 2) runs.reverse().forEach((r) => [r.x0, r.x1] = [r.x1, r.x0]);
    spans.push(...runs);
  }
  return { outer, inner, spans };
}

// Konturen einer Maske per Marching Squares: geschlossene Linienzüge entlang der Grenze zwischen 1 und 0,
// in Einheiten der Maske (Zellenmitten bei x + 0,5)
function traceContours(mask, cols, rows) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows ? mask[y * cols + x] : 0);
  // Kanten einer Zelle: Mitten der Seiten, doppelt gezählt, damit die Schlüssel ganzzahlig sind
  const mid = { t: [1, 0], r: [2, 1], b: [1, 2], l: [0, 1] };
  const CASES = {
    1: ['lb'], 2: ['br'], 3: ['lr'], 4: ['tr'], 5: ['lb', 'tr'], 6: ['tb'], 7: ['lt'],
    8: ['lt'], 9: ['tb'], 10: ['lt', 'br'], 11: ['tr'], 12: ['lr'], 13: ['br'], 14: ['lb'],
  };
  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    links.get(a).push(b);
  };
  for (let y = -1; y < rows; y++) {
    for (let x = -1; x < cols; x++) {
      const code = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
      for (const [e1, e2] of CASES[code] ?? []) {
        const [ax, ay] = mid[e1];
        const [bx, by] = mid[e2];
        const a = `${2 * x + ax},${2 * y + ay}`;
        const b = `${2 * x + bx},${2 * y + by}`;
        link(a, b);
        link(b, a);
      }
    }
  }
  // Kanten zu geschlossenen Linienzügen verbinden
  const loops = [];
  const used = new Set();
  for (const startKey of links.keys()) {
    if (used.has(startKey)) continue;
    const loop = [];
    let prev = null;
    let key = startKey;
    while (key && !used.has(key)) {
      used.add(key);
      const [kx, ky] = key.split(',').map(Number);
      loop.push([kx / 2 + 0.5, ky / 2 + 0.5]); // Zellenmitten: Wert x liegt bei x + 0,5 mm
      const next = links.get(key).find((n) => n !== prev && !used.has(n));
      prev = key;
      key = next;
    }
    if (loop.length > 2) loops.push(simplify(loop));
  }
  return loops;
}

// Punkte auf einer geraden Strecke weglassen (Marching Squares liefert sehr viele)
function simplify(loop) {
  return loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length];
    const b = loop[(i + 1) % loop.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
  });
}

function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Konturen so ordnen, dass der Kopf immer zur nächstgelegenen fährt; jede beginnt an ihrem nächsten Punkt
export function orderLoops(loops, from = [0, 0]) {
  const left = [...loops];
  const result = [];
  let at = from;
  while (left.length) {
    let best = 0;
    let bestPoint = 0;
    let bestDist = Infinity;
    left.forEach((loop, i) => loop.forEach(([x, y], j) => {
      const d = (x - at[0]) ** 2 + (y - at[1]) ** 2;
      if (d < bestDist) [best, bestPoint, bestDist] = [i, j, d];
    }));
    const loop = left.splice(best, 1)[0];
    const ordered = [...loop.slice(bestPoint), ...loop.slice(0, bestPoint)];
    result.push(ordered);
    at = ordered[0];
  }
  return result;
}

// Komplette Vorschau einer Platte: Holz, Gravur bzw. Schnittlinien. Für das Druckermenü.
export function drawSheetPreview(ctx, design, scale) {
  const { sheet } = design;
  const { wood } = design;
  ctx.fillStyle = wood?.hex ?? '#e3c99a';
  ctx.fillRect(0, 0, sheet.x * scale, sheet.y * scale);
  drawGrain(ctx, scale, wood, sheet);
  if (design.laser === 'cut') {
    ctx.strokeStyle = wood?.burn ?? '#4a2f18';
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    tracePolygons(ctx, cutPath(design), scale);
    ctx.stroke();
  } else {
    drawEngraving(ctx, design, scale);
  }
}

// Leichte Maserung, damit die Platte nach Holz aussieht
export function drawGrain(ctx, scale, wood, sheet) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90, 55, 25, 0.12)';
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  for (let i = 0; i < 14; i++) {
    const y = (sheet.y / 14) * (i + 0.5) * scale;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= sheet.x; x += 20) {
      ctx.lineTo(x * scale, y + Math.sin(x * 0.05 + i * 1.7) * 2.5 * scale);
    }
    ctx.stroke();
  }
  if (wood?.id === 'holz-walnuss') {
    ctx.fillStyle = 'rgba(40, 20, 8, 0.12)';
    ctx.fillRect(0, 0, sheet.x * scale, sheet.y * scale);
  }
  ctx.restore();
}
