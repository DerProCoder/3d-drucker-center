// Echte 3D-Formen der Druckvorlagen. Gebaut in Millimetern, dann auf die Vorlagengröße eingepasst
// und in Meter umgerechnet. Ursprung: Mitte der Unterseite, Höhe entlang +y.
// Zu jeder Form gehört ein Umriss pro Schichthöhe, den der Druckkopf abfährt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Hilfen ----------

function roundedRect(target, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r);
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
  return target;
}

function circle(target, cx, cy, r) {
  target.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return target;
}

// Grundriss (x, y) nach oben extrudieren: Grundriss-y wird zur Tiefe (-z), Extrusion zur Höhe (+y)
function extrudeUp(shape, height) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Mehrere Teile zu einer Geometrie zusammenfassen (alle ohne Index, damit sie zusammenpassen)
function merge(geos) {
  return mergeGeometries(geos.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute('uv');
    return flat;
  }));
}

// Zweifarbige Teile: eine Geometrie mit zwei Gruppen – Gruppe 0 in der Grundfarbe, Gruppe 1 in der Akzentfarbe.
// Das Mesh bekommt dafür zwei Materialien (siehe world/workshop.js).
function twoTone(base, accent) {
  return mergeGeometries([merge(base), merge(accent)], true);
}

// Mehrfarbige Teile: eine Geometrie-Gruppe pro Farbe, in der Reihenfolge von template.parts
function multiTone(...colorParts) {
  return mergeGeometries(colorParts.map(merge), true);
}

function starShape(cx, cy, outer, inner) {
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
  }
  return star;
}

// ---------- Formen (mm) ----------

const VASE_PROFILE = new THREE.SplineCurve([
  [40, 0], [47, 8], [61, 40], [68, 75], [62, 115], [45, 158], [33, 188], [34, 205], [42, 220],
].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(60);

function vase() {
  // Hohle Vase: außen hoch, 2 mm Wand innen wieder runter, geschlossener Boden
  const outer = VASE_PROFILE;
  const inner = [...outer].reverse().map((p) => new THREE.Vector2(p.x - 2.2, Math.max(p.y, 2.5)));
  const points = [new THREE.Vector2(0, 0), ...outer, ...inner, new THREE.Vector2(0, 2.5)];
  return new THREE.LatheGeometry(points, 72);
}

function keychain() {
  const tag = roundedRect(new THREE.Shape(), 50, 30, 8);
  tag.holes.push(circle(new THREE.Path(), -16, 0, 4));
  // Erhabener Stern als Motiv
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.5 : 10;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = 7 + Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
  }
  const starGeo = extrudeUp(star, 2);
  starGeo.translate(0, 4, 0);
  return merge([extrudeUp(tag, 4), starGeo]);
}

function cableClips() {
  const clips = [];
  for (const [cx, cz] of [[-20, -14], [20, -14], [-20, 14], [20, 14]]) {
    // C-förmige Klammer mit Fußplatte
    const c = new THREE.Shape();
    c.absarc(0, 2, 10, -Math.PI * 0.3, Math.PI * 1.3, false);
    c.absarc(0, 2, 6.5, Math.PI * 1.3, -Math.PI * 0.3, true);
    c.closePath();
    const foot = roundedRect(new THREE.Shape(), 26, 4, 1.5, 0, -9);
    for (const s of [c, foot]) {
      const geo = extrudeUp(s, 12);
      geo.translate(cx, 0, cz);
      clips.push(geo);
    }
  }
  return merge(clips);
}

function phoneStand() {
  // Seitenprofil (Tiefe u, Höhe v), über die Breite extrudiert
  const p = new THREE.Shape();
  [[-40, 0], [40, 0], [40, 26], [32, 26], [32, 8], [-12, 8], [-28, 108], [-38, 110], [-40, 100]]
    .forEach(([u, v], i) => (i ? p.lineTo(u, v) : p.moveTo(u, v)));
  p.closePath();
  const geo = new THREE.ExtrudeGeometry(p, { depth: 90, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); // Profil-u → Tiefe (Ablage vorne, Lehne hinten), Extrusion → Breite
  return geo;
}

function phoneCase() {
  const bottom = roundedRect(new THREE.Shape(), 80, 160, 11);
  bottom.holes.push(roundedRect(new THREE.Path(), 26, 30, 7, -18, 55)); // Kameraloch
  const wall = roundedRect(new THREE.Shape(), 80, 160, 11);
  wall.holes.push(roundedRect(new THREE.Path(), 75, 155, 9));
  return merge([extrudeUp(bottom, 1.6), extrudeUp(wall, 12)]);
}

function gear(teeth, rRoot, rTip, holeR, lightening) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[rRoot, a], [rTip, a + step * 0.2], [rTip, a + step * 0.45], [rRoot, a + step * 0.65]];
    pts.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  s.holes.push(circle(new THREE.Path(), 0, 0, holeR));
  for (let i = 0; i < lightening; i++) {
    const a = (i / lightening) * Math.PI * 2;
    s.holes.push(circle(new THREE.Path(), Math.cos(a) * rRoot * 0.6, Math.sin(a) * rRoot * 0.6, rRoot * 0.2));
  }
  return s;
}

function gears() {
  const big = extrudeUp(gear(24, 36, 42, 5, 5), 10);
  big.translate(-16, 0, 0);
  const hub = new THREE.Shape();
  circle(hub, 0, 0, 11);
  hub.holes.push(circle(new THREE.Path(), 0, 0, 5));
  const hubGeo = extrudeUp(hub, 16);
  hubGeo.translate(-16, 0, 0);
  const small = extrudeUp(gear(14, 18, 23, 4, 0), 14);
  small.translate(43.5, 0, 0);
  return merge([big, hubGeo, small]);
}

function dragon() {
  const parts = [];
  const add = (geo, fn) => { fn?.(geo); parts.push(geo); };
  // Körper
  add(new THREE.SphereGeometry(1, 24, 16), (g) => { g.scale(45, 30, 28); g.translate(0, 52, 0); });
  // Beine
  for (const [x, z] of [[24, 14], [24, -14], [-22, 15], [-22, -15]]) {
    add(new THREE.CylinderGeometry(7, 8, 36, 12), (g) => g.translate(x, 18, z));
  }
  // Hals und Kopf mit Schnauze, Hörnern, Augenwülsten
  add(new THREE.CylinderGeometry(8, 12, 60, 14), (g) => { g.rotateZ(-0.55); g.translate(48, 92, 0); });
  add(new THREE.SphereGeometry(1, 18, 12), (g) => { g.scale(20, 14, 14); g.translate(68, 124, 0); });
  add(new THREE.ConeGeometry(9, 26, 12), (g) => { g.rotateZ(-Math.PI / 2 - 0.15); g.translate(90, 119, 0); });
  for (const side of [-1, 1]) {
    add(new THREE.ConeGeometry(3.5, 20, 8), (g) => { g.rotateZ(0.7); g.translate(58, 141, side * 7); });
    add(new THREE.SphereGeometry(4, 8, 6), (g) => g.translate(76, 130, side * 9));
  }
  // Schwanz, nach hinten auslaufend
  add(new THREE.ConeGeometry(13, 80, 12), (g) => { g.rotateZ(Math.PI / 2 + 0.35); g.translate(-72, 36, 0); });
  // Rückenstacheln
  for (let i = 0; i < 5; i++) {
    add(new THREE.ConeGeometry(4, 12, 6), (g) => g.translate(-30 + i * 14, 84 - Math.abs(i - 2) * 3, 0));
  }
  // Flügel
  const wing = new THREE.Shape();
  [[-22, 0], [26, 0], [12, 68], [-2, 44], [-14, 60], [-24, 40]].forEach(([x, y], i) => (i ? wing.lineTo(x, y) : wing.moveTo(x, y)));
  wing.closePath();
  for (const side of [-1, 1]) {
    add(new THREE.ExtrudeGeometry(wing, { depth: 3, bevelEnabled: false }), (g) => {
      g.rotateX(side * 0.55);
      g.translate(-4, 66, side * 22);
    });
  }
  return merge(parts);
}

function toolHolder() {
  const block = roundedRect(new THREE.Shape(), 200, 120, 10);
  for (let i = 0; i < 6; i++) block.holes.push(circle(new THREE.Path(), -75 + i * 30, 32, 6));     // Schraubendreher
  for (let i = 0; i < 4; i++) block.holes.push(circle(new THREE.Path(), -66 + i * 44, -6, 12));    // Zangen
  for (const x of [-48, 48]) block.holes.push(roundedRect(new THREE.Path(), 64, 16, 6, x, -40));  // Fächer
  return extrudeUp(block, 80);
}

// Benchy, das berühmte Testboot: Rumpf mit spitzem Bug, Kajüte mit Fenstern, Schornstein
function benchy() {
  const parts = [];
  // Rumpf im Grundriss: hinten gerade, vorne spitz, nach oben ausgestellt (zwei Lagen)
  const hull = (w, len) => {
    const sh = new THREE.Shape();
    sh.moveTo(-len / 2, -w / 2);
    sh.lineTo(len * 0.15, -w / 2);
    sh.quadraticCurveTo(len * 0.45, -w / 2, len / 2, 0);
    sh.quadraticCurveTo(len * 0.45, w / 2, len * 0.15, w / 2);
    sh.lineTo(-len / 2, w / 2);
    sh.closePath();
    return sh;
  };
  parts.push(extrudeUp(hull(24, 50), 6));
  const upper = extrudeUp(hull(31, 60), 12);
  upper.translate(0, 6, 0);
  parts.push(upper);
  // Kajüte mit Fensteröffnungen (als Löcher im Grundriss wäre es zu, daher Rahmen aus vier Pfosten + Dach)
  for (const [x, z] of [[-14, -9], [-14, 9], [4, -9], [4, 9]]) {
    const post = new THREE.BoxGeometry(3, 16, 3);
    post.translate(x, 26, z);
    parts.push(post);
  }
  const cabinBase = new THREE.BoxGeometry(21, 4, 21);
  cabinBase.translate(-5, 20, 0);
  const roof = new THREE.BoxGeometry(25, 3, 25);
  roof.translate(-5, 35.5, 0);
  parts.push(cabinBase, roof);
  // Schornstein
  const chimney = new THREE.CylinderGeometry(3.5, 4, 11, 16);
  chimney.translate(-11, 42.5, 0);
  parts.push(chimney);
  return merge(parts);
}

// ---------- Zweifarbige Formen ----------

// Namensschild: Grundplatte, darauf Rahmen und erhabene „Buchstaben“ in der Akzentfarbe
function nameSign() {
  const plate = extrudeUp(roundedRect(new THREE.Shape(), 120, 35, 6), 3);
  const frame = roundedRect(new THREE.Shape(), 114, 29, 4);
  frame.holes.push(roundedRect(new THREE.Path(), 108, 23, 3));
  const accent = [extrudeUp(frame, 1.6)];
  [[-38, 9], [-25, 11], [-11, 9], [3, 12], [17, 9], [31, 10]].forEach(([x, w], i) => {
    const letter = extrudeUp(roundedRect(new THREE.Shape(), w, i % 2 ? 15 : 13, 2.5, x, 0), 2);
    accent.push(letter);
  });
  for (const g of accent) g.translate(0, 3, 0);
  return twoTone([plate], accent);
}

// Untersetzer: runde Scheibe, oben Ring und Stern als Logo in der Akzentfarbe
function coaster() {
  const disk = extrudeUp(circle(new THREE.Shape(), 0, 0, 45), 3.5);
  const ring = circle(new THREE.Shape(), 0, 0, 41);
  ring.holes.push(circle(new THREE.Path(), 0, 0, 37));
  const accent = [extrudeUp(ring, 1.5), extrudeUp(starShape(0, 0, 24, 10), 1.5)];
  for (const g of accent) g.translate(0, 3.5, 0);
  return twoTone([disk], accent);
}

// Zwei Spielwürfel, die Augen sind in der Akzentfarbe eingelegt (oben und vorne)
function dice() {
  const base = [];
  const accent = [];
  const pip = (x, y, z, front) => {
    const g = new THREE.CylinderGeometry(1.8, 1.8, 0.8, 14);
    if (front) g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    accent.push(g);
  };
  const faces = { 1: [[0, 0]], 2: [[-4, -4], [4, 4]], 3: [[-4, -4], [0, 0], [4, 4]], 4: [[-4, -4], [4, -4], [-4, 4], [4, 4]],
    5: [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]] };
  [[-11, 5, 2], [11, 3, 4]].forEach(([cx, top, front]) => {
    const cube = new THREE.BoxGeometry(16, 16, 16);
    cube.translate(cx, 8, 0);
    base.push(cube);
    for (const [u, v] of faces[top]) pip(cx + u, 16.2, v, false);
    for (const [u, v] of faces[front]) pip(cx + u, 8 + v, 8.2, true);
  });
  return twoTone(base, accent);
}

// Schachfiguren: auf jeder Seite ein König und vier Bauern, eine Seite pro Farbe
function chessPiece(king) {
  const profile = king
    ? [[0, 0], [10, 0], [10, 3], [8, 4.5], [6, 7], [4, 22], [3.6, 30], [6.5, 31], [6.5, 33], [4.5, 34], [5, 38], [0, 38.5]]
    : [[0, 0], [9, 0], [9, 3], [7, 4.5], [5, 7], [3.5, 15], [3, 18], [5.5, 19], [5.5, 20.5], [0, 21]];
  const parts = [new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24)];
  if (king) {
    const upright = new THREE.BoxGeometry(2.4, 7, 2.4);
    upright.translate(0, 41.5, 0);
    const bar = new THREE.BoxGeometry(6, 2.4, 2.4);
    bar.translate(0, 42.5, 0);
    parts.push(upright, bar);
  } else {
    const head = new THREE.SphereGeometry(5, 16, 12);
    head.translate(0, 24.5, 0);
    parts.push(head);
  }
  return parts;
}

function chessSet() {
  const side = (z) => [-60, -30, 0, 30, 60].flatMap((x) => chessPiece(x === 0).map((g) => g.translate(x, 0, z)));
  return twoTone(side(20), side(-20));
}

// ---------- Mehrfarbige Formen ----------

// Regenbogen: acht flach liegende Halbringe, jeder in seiner eigenen Farbe (außen beginnend)
function rainbow() {
  const bands = [];
  for (let i = 0; i < 8; i++) {
    const outer = 62 - i * 5;
    const inner = outer - 5;
    const band = new THREE.Shape();
    band.absarc(0, 0, outer, 0, Math.PI, false);
    band.absarc(0, 0, inner, Math.PI, 0, true);
    band.closePath();
    bands.push([extrudeUp(band, 8)]);
  }
  return multiTone(...bands);
}

// Papagei auf einer Sitzstange: Sockel, Körper, Kopf, Schnabel, Flügel mit Schwanz, Augen – je eine Farbe.
// Der Schnabel zeigt nach +x.
function parrot() {
  const ellipsoid = (sx, sy, sz, x, y, z) => {
    const g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  const base = new THREE.CylinderGeometry(30, 32, 6, 32);
  base.translate(0, 3, 0);
  const post = new THREE.CylinderGeometry(4, 4, 10, 12);
  post.translate(0, 10, 0);
  const perch = new THREE.CylinderGeometry(4, 4, 56, 12);
  perch.rotateZ(Math.PI / 2);
  perch.translate(0, 15, 0);
  const feet = [-1, 1].map((side) => ellipsoid(5, 3, 3.5, 3, 19, side * 6));

  const body = ellipsoid(18, 30, 16, 0, 48, 0);
  const head = ellipsoid(14, 14, 13, 5, 84, 0);
  const beak = new THREE.ConeGeometry(6, 15, 12);
  beak.rotateZ(-Math.PI / 2 - 0.5);
  beak.translate(20, 79, 0);

  const wings = [-1, 1].map((side) => {
    const g = ellipsoid(14, 26, 5, 0, 0, 0);
    g.rotateX(side * 0.12); // unten etwas abgespreizt
    g.translate(-4, 50, side * 15);
    return g;
  });
  const tail = new THREE.ConeGeometry(8, 42, 12);
  tail.scale(1, 1, 0.5);
  tail.rotateZ(Math.PI - 0.35);
  tail.translate(-16, 28, 0);

  const eyes = [-1, 1].map((side) => ellipsoid(2.6, 2.6, 2.6, 13, 88, side * 9.5));

  return multiTone([base, post, perch, ...feet], [body], [head], [beak], [...wings, tail], eyes);
}

const BUILDERS = {
  benchy,
  keychain, 'cable-clips': cableClips, 'phone-stand': phoneStand, 'phone-case': phoneCase,
  gears, vase, dragon, 'tool-holder': toolHolder,
  'name-sign': nameSign, coaster, dice, 'chess-set': chessSet,
  rainbow, parrot,
};

// ---------- Schichten schneiden (wie ein Slicer) ----------

const LAYERS = 120;      // so viele Schichtbahnen pro Teil werden berechnet (bei Bedarf, dann zwischengespeichert)
const KEY = 1e5;         // Schnittpunkte auf 0,01 mm runden, damit Nachbardreiecke zusammenfinden

// Schnitt durch die Geometrie auf Höhe y: Liste von Konturen, jede eine Punktliste [{ x, z }] in Metern.
// group: nur diese Geometrie-Gruppe schneiden (bei zweifarbigen Formen eine Farbe)
function sliceContours(geometry, y, group = null) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const first = group ? group.start / 3 : 0;
  const triCount = group ? first + group.count / 3 : (index ? index.count : pos.count) / 3;
  const vy = [0, 0, 0];
  const ends = new Map(); // Punkt-Schlüssel → Segmente, die dort enden
  const segments = [];
  const keyOf = (p) => `${Math.round(p.x * KEY)},${Math.round(p.z * KEY)}`;
  for (let t = first; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
    for (let k = 0; k < 3; k++) vy[k] = pos.getY(ids[k]);
    const cut = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k];
      const b = ids[(k + 1) % 3];
      const ya = vy[k];
      const yb = vy[(k + 1) % 3];
      if ((ya < y) === (yb < y)) continue;
      const f = (y - ya) / (yb - ya);
      cut.push({ x: pos.getX(a) + (pos.getX(b) - pos.getX(a)) * f, z: pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * f });
    }
    if (cut.length !== 2) continue;
    const seg = { a: cut[0], b: cut[1], ka: keyOf(cut[0]), kb: keyOf(cut[1]), used: false };
    if (seg.ka === seg.kb) continue;
    segments.push(seg);
    for (const key of [seg.ka, seg.kb]) {
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push(seg);
    }
  }
  // Segmente zu Linienzügen verketten
  const contours = [];
  for (const start of segments) {
    if (start.used) continue;
    start.used = true;
    const points = [start.a, start.b];
    let key = start.kb;
    for (;;) {
      const next = ends.get(key)?.find((s) => !s.used);
      if (!next) break;
      next.used = true;
      const forward = next.ka === key;
      points.push(forward ? next.b : next.a);
      key = forward ? next.kb : next.ka;
    }
    if (points.length > 2) contours.push(points);
  }
  return contours;
}

// Konturen einer Schicht für die Vorlage, Schicht wird aus der relativen Höhe hFrac bestimmt.
// Jede Kontur hat eine Farbe (color: 0 = Grundfarbe, 1 = Akzentfarbe bei zweifarbigen Formen).
function layerContours(shape, hFrac) {
  const layer = Math.min(LAYERS - 1, Math.max(0, Math.floor(hFrac * LAYERS)));
  if (!shape.layers[layer]) {
    const y = ((layer + 0.5) / LAYERS) * shape.height;
    const groups = shape.geometry.groups.length > 1 ? shape.geometry.groups : [null];
    shape.layers[layer] = groups.flatMap((group, color) => sliceContours(shape.geometry, y, group)
      .map((c) => Object.assign(c, { color })));
  }
  return { layer, contours: shape.layers[layer] };
}

const cache = new Map();

// Liefert { geometry, height, layers } für eine Vorlage, in Metern und auf die Vorlagengröße eingepasst.
export function getPrintShape(template) {
  if (cache.has(template.id)) return cache.get(template.id);

  const geometry = BUILDERS[template.id]();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const target = new THREE.Vector3(template.size.x, template.size.z, template.size.y); // Breite, Höhe, Tiefe
  const scale = Math.min(target.x / size.x, target.y / size.y, target.z / size.z) * 0.001;
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z);
  geometry.scale(scale, scale, scale); // gleichmäßig, Normalen bleiben gültig
  geometry.computeBoundingBox();

  const shape = { geometry, height: geometry.boundingBox.max.y, layers: [] };
  cache.set(template.id, shape);
  return shape;
}

// Bahn der Düse für eine ganze Druckplatte: Funktion hFrac → Bahn. Die Düse fährt in jeder Schicht die echten
// Umrisse aller Teile nacheinander ab (Teil für Teil, jeweils zur nächstgelegenen Kontur) statt eines Rechtecks.
// offsets: Mittelpunkte der Teile [{ x, z }] in Metern · rotated: Teile um 90° gedreht (wie die Meshes)
// Zweifarbig wie ein echter Slicer: erst alle Umrisse der einen Farbe, dann die der anderen – so wird pro
// Schicht möglichst selten gewechselt. Jeder Bahnpunkt trägt seine Farbe (color).
export function plateOutline(shape, offsets, rotated = false) {
  const paths = new Map();
  return (hFrac) => {
    const { layer, contours } = layerContours(shape, hFrac);
    if (!paths.has(layer)) {
      const loops = Array.from({ length: Math.max(2, shape.geometry.groups.length) }, () => []);
      for (const o of offsets) {
        for (const c of contours) {
          const color = c.color;
          // Drehung um +90° um die Hochachse wie mesh.rotation.y: (x, z) → (z, -x)
          loops[color].push(c.map((p) => (rotated
            ? { x: o.x + p.z, z: o.z - p.x, color }
            : { x: o.x + p.x, z: o.z + p.z, color })));
        }
      }
      const points = [];
      for (const group of loops) points.push(...orderLoops(group, points.at(-1)));
      paths.set(layer, buildPath(points));
    }
    return paths.get(layer);
  };
}

// Konturen so ordnen, dass die Düse immer zur nächstgelegenen fährt; jede Kontur beginnt am nächsten Punkt.
// from: wo die Düse gerade steht
function orderLoops(loops, from = { x: 0, z: 0 }) {
  const result = [];
  let at = from;
  const left = [...loops];
  while (left.length) {
    let best = 0;
    let bestPoint = 0;
    let bestDist = Infinity;
    left.forEach((loop, i) => {
      loop.forEach((p, j) => {
        const dist = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
        if (dist < bestDist) [best, bestPoint, bestDist] = [i, j, dist];
      });
    });
    const loop = left.splice(best, 1)[0];
    const closed = loop.length > 2 && Math.hypot(loop[0].x - loop.at(-1).x, loop[0].z - loop.at(-1).z) < 0.0005;
    const ring = closed ? loop.slice(0, -1) : loop;
    const start = Math.min(bestPoint, ring.length - 1);
    const ordered = closed ? [...ring.slice(start), ...ring.slice(0, start + 1)] : ring;
    // Der Weg zum Anfang der Kontur ist eine Leerfahrt (travel): dort druckt die Düse nicht und fährt schneller.
    // Kopie, weil bei geschlossenen Konturen Anfangs- und Endpunkt dasselbe Objekt sind.
    ordered[0] = { ...ordered[0], travel: true };
    result.push(...ordered);
    at = ordered.at(-1);
  }
  return result;
}

// Linienzug mit aufsummierten Längen, damit sich Punkte entlang der Bahn schnell finden lassen
function buildPath(points) {
  if (points.length < 2) points = [{ x: 0, z: 0 }, { x: 0.001, z: 0 }];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  return { points, lengths, total: lengths.at(-1) };
}

// Punkt auf der Bahn bei Parameter t ∈ [0, 1) – so fährt die Düse die Schicht ab.
// color: welche Farbe dort gedruckt wird (0 = Grundfarbe, 1 = Akzentfarbe)
// travel: die Düse ist gerade auf einer Leerfahrt zur nächsten Kontur
export function outlinePoint(path, t) {
  const d = t * path.total;
  const { points, lengths } = path;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi] - lengths[lo] || 1;
  const f = Math.min(1, Math.max(0, (d - lengths[lo]) / span));
  return {
    x: points[lo].x + (points[hi].x - points[lo].x) * f,
    z: points[lo].z + (points[hi].z - points[lo].z) * f,
    color: points[lo].color ?? 0,
    travel: !!points[hi].travel,
  };
}

export function outlineLength(path) {
  return path.total;
}

// Parameter t des Bahnpunkts, der (x, z) am nächsten liegt – für einen nahtlosen Übergang zur nächsten Schicht.
// color: am liebsten mit derselben Farbe weitermachen, damit nicht unnötig die Düse gewechselt wird
export function nearestPathT(path, x, z, color = null) {
  let best = 0;
  let bestDist = Infinity;
  const sameColor = color !== null && path.points.some((p) => (p.color ?? 0) === color);
  path.points.forEach((p, i) => {
    if (sameColor && (p.color ?? 0) !== color) return;
    const dist = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dist < bestDist) [best, bestDist] = [i, dist];
  });
  return path.total > 0 ? (path.lengths[best] / path.total) % 1 : 0;
}
