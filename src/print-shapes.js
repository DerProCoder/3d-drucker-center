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

const BUILDERS = {
  keychain, 'cable-clips': cableClips, 'phone-stand': phoneStand, 'phone-case': phoneCase,
  gears, vase, dragon, 'tool-holder': toolHolder,
};

// ---------- Öffentlich ----------

const cache = new Map();

// Liefert { geometry, height, outline(hFrac) } für eine Vorlage, in Metern und auf die Vorlagengröße eingepasst.
// outline gibt den Umriss der Schicht auf relativer Höhe hFrac zurück: { type: 'circle', r } oder { type: 'rect', hx, hz }.
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

  const box = geometry.boundingBox;
  const height = box.max.y;
  const rect = { type: 'rect', hx: (box.max.x - box.min.x) / 2, hz: (box.max.z - box.min.z) / 2 };
  let outline = () => rect;
  if (template.id === 'vase') {
    outline = (hFrac) => {
      const y = hFrac * 220;
      const p = VASE_PROFILE.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
      return { type: 'circle', r: p.x * scale };
    };
  } else if (template.id === 'gears') {
    outline = () => ({ type: 'circle', r: rect.hz });
  }

  const shape = { geometry, height, outline };
  cache.set(template.id, shape);
  return shape;
}

// Punkt auf dem Umriss bei Parameter t ∈ [0, 1) – so fährt die Düse die Schicht ab
export function outlinePoint(outline, t) {
  if (outline.type === 'circle') {
    const a = t * Math.PI * 2;
    return { x: Math.cos(a) * outline.r, z: Math.sin(a) * outline.r };
  }
  const { hx, hz } = outline;
  const perimeter = 4 * (hx + hz);
  let d = t * perimeter;
  if (d < 2 * hx) return { x: -hx + d, z: -hz };
  d -= 2 * hx;
  if (d < 2 * hz) return { x: hx, z: -hz + d };
  d -= 2 * hz;
  if (d < 2 * hx) return { x: hx - d, z: hz };
  d -= 2 * hx;
  return { x: -hx, z: hz - d };
}

export function outlineLength(outline) {
  return outline.type === 'circle' ? Math.PI * 2 * outline.r : 4 * (outline.hx + outline.hz);
}
