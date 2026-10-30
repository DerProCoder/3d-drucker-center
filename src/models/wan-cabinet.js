// Internet-Kästen im Daten-Bunker (#61): je Bunker-Feld 4 Kästen „INTERNET / WAN“ mit je 33 Glasfaser-Ports
// (3 Reihen à 11) an schmalen Glasfaser-Säulen, mit Nummernschild („WAN B2-3“, unter dem Kasten) und je einer Kabeltrasse an der Säule
// hoch und oben waagerecht bis in die Trasse über den Reihen. Reines Modell ohne Spiellogik: Lage, Maße und Ports
// kommen als Zahlen (aus core/cable-tray.js umgerechnet in world/bunker.js).
//
// Leistung: Alle Kästen eines Feldes kommen zusammen in ein Mesh je Material (etwa 10 Draw Calls je Feld statt
// einzelner Teile je Port). Die Vorderseite mit Port-Nummern ist eine geteilte Textur für alle Kästen (gleiches
// Raster), die Nummernschilder eines Feldes liegen auf einer gemeinsamen Textur. Einzelne Ports sind keine eigenen
// Objekte – angeklickt wird der Kasten, world/bunker.js sucht den Port nahe am Treffpunkt.
//
// Koordinaten: Bodenkoordinaten (y 0 = Boden, x/z wie übergeben). Kastenkoordinaten wie createWallBox in
// models/cable-tray.js: Ursprung Mitte der Rückseite unten, Vorderseite +z, x nach rechts (von vorn gesehen).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';
import { createWallRiser, drawFiberIcon } from './cable-tray.js';

const MATS = {
  housing: mat(0x8e949b, 0.55, 0.25),   // Kasten grau lackiert (wie der Wandkasten oben)
  adapter: mat(0x2f6fd6, 0.5, 0.1),     // Glasfaser-Kupplungen (SC, blau)
  port: mat(0x0b0c0e, 0.8, 0.1),
  screw: mat(0xc9ced4, 0.3, 0.9),
  column: mat(0x6d737b, 0.7, 0.3),      // Säule Beton/Stahl grau
  stripe: mat(0x2f8f5b, 0.6, 0.1),      // grüner Streifen unten an der Säule
};
const BOX_PX = 1000;      // Pixel je Meter der Front-Textur
const LABEL_H = 0.022;    // Platz für die Nummer über einem Port
const PLATE = { w: 0.44, h: 0.11, gap: 0.04 };   // Nummernschild unter dem Kasten (gap: Abstand zur Unterkante) – darüber laufen die Kabel hoch

// Port-Größe aus dem Raster (kleinster Abstand in einer Reihe), wie createWallBox
function portSize(ports) {
  let pitch = 0.042;
  const rows = [...new Set(ports.map((p) => Math.round(p.y * 1e4) / 1e4))];
  for (const y of rows) {
    const xs = ports.filter((p) => Math.abs(p.y - y) < 1e-4).map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) pitch = Math.min(pitch, xs[i] - xs[i - 1]);
  }
  const w = Math.min(0.026, pitch * 0.75);
  return { pitch, w, h: Math.min(0.02, w * 0.8), rows: rows.sort((a, b) => b - a) };
}

// Vorderseite: graues Blech, je Reihe ein dunkles Feld mit Nummern über den Ports, unten ein Schild mit
// Glasfaser-Symbol – geteilt für alle Kästen mit demselben Raster
const frontCache = new Map();
function frontMaterial(width, height, ports) {
  const key = JSON.stringify([width, height, ports.map((p) => [Math.round(p.x * 1e4), Math.round(p.y * 1e4)])]);
  if (frontCache.has(key)) return frontCache.get(key);
  const { pitch, w: portW, h: portH, rows } = portSize(ports);
  const px = (m) => Math.round(m * BOX_PX);
  const minX = Math.min(...ports.map((p) => p.x));
  const maxX = Math.max(...ports.map((p) => p.x));
  const texture = canvasTexture(px(width), px(height), (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a4aab1');
    grad.addColorStop(1, '#8d939a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    // Reihen: dunkles Feld, Nummern (Canvas-y läuft von oben nach unten)
    const left = px(minX - pitch / 2 + width / 2);
    const right = px(maxX + pitch / 2 + width / 2);
    for (const y of rows) {
      const top = height - (y + portH / 2 + LABEL_H);
      ctx.fillStyle = 'rgba(30, 34, 40, 0.18)';
      ctx.fillRect(left, px(top), right - left, px(LABEL_H + portH + 0.006));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${px(Math.min(0.016, portW * 0.7))}px sans-serif`;
    ctx.fillStyle = '#14171b';
    ports.forEach((p, i) => ctx.fillText(String(i + 1), px(p.x + width / 2), px(height - (p.y + portH / 2 + LABEL_H * 0.5))));
    // Schild unten (unter der untersten Reihe): Glasfaser-Symbol und Aufschrift
    const bottom = rows[rows.length - 1] - portH / 2 - 0.008;
    const pad = 0.014;
    const plateH = Math.max(0.03, bottom - 2 * pad);
    const plateY = height - bottom + pad;
    ctx.fillStyle = '#e9edf1';
    ctx.fillRect(px(pad), px(plateY), w - px(2 * pad), px(plateH));
    ctx.strokeStyle = '#1d2228';
    ctx.lineWidth = 2;
    ctx.strokeRect(px(pad), px(plateY), w - px(2 * pad), px(plateH));
    const icon = Math.min(plateH * 0.62, 0.06);
    drawFiberIcon(ctx, px(pad + 0.014 + icon / 2), px(plateY + plateH / 2), px(icon));
    const textX = px(pad + 0.034 + icon);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1d2228';
    ctx.font = `bold ${px(Math.min(0.034, plateH * 0.3))}px sans-serif`;
    ctx.fillText('INTERNET / WAN', textX, px(plateY + plateH * 0.36));
    ctx.font = `${px(Math.min(0.018, plateH * 0.17))}px sans-serif`;
    ctx.fillStyle = '#3a4048';
    ctx.fillText(`Glasfaser · ${ports.length} Ports`, textX, px(plateY + plateH * 0.72));
  }, 1, 1, { wrap: false });
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.2 });
  frontCache.set(key, material);
  return material;
}

// Nummernschilder eines Feldes auf einer Textur: je Kasten ein Streifen (grün, weiße Schrift)
function plateMaterial(names) {
  const rowPx = 128;
  const texture = canvasTexture(512, rowPx * Math.max(1, names.length), (ctx, w) => {
    names.forEach((name, k) => {
      const y = k * rowPx;
      ctx.fillStyle = '#1f6a46';
      ctx.fillRect(0, y, w, rowPx);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.strokeRect(6, y + 6, w - 12, rowPx - 12);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 58px "Segoe UI", Arial, sans-serif';
      ctx.fillText(name, w / 2, y + rowPx * 0.42);
      ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
      ctx.fillText('Internet · Glasfaser', w / 2, y + rowPx * 0.8);
    });
  }, 1, 1, { wrap: false });
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.5 });
}

// Sammelt Geometrien je Material (in Bodenkoordinaten) und macht daraus je Material ein Mesh
function buckets() {
  const byMat = new Map();
  return {
    add(material, geo) {
      if (!byMat.has(material)) byMat.set(material, []);
      byMat.get(material).push(geo.index ? geo.toNonIndexed() : geo);
      if (geo.index) geo.dispose();
    },
    meshes() {
      return [...byMat].map(([material, geos]) => {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material);
        geos.forEach((g) => g.dispose());
        mesh.matrixAutoUpdate = false;
        mesh.raycast = () => {}; // Klicks gehen an die Klickflächen der Kästen (world/bunker.js)
        mesh.receiveShadow = true;
        return mesh;
      });
    },
  };
}

// boxes: [{ name, x, backZ, facing (+1: Vorderseite nach +z, −1: nach −z), edgeZ (Feldkante, an der die Säule steht),
//   column: { w }, box: { y (Mitte), width, height, depth }, ports: [{ x, y }] (Kastenkoordinaten, y ab Unterkante),
//   riser: { y0, height, reach, depth } }] · ceiling: Raumhöhe (Säule bis zur Decke)
// Gibt eine Gruppe zurück; userData.dispose() gibt Geometrien und die eigene Schild-Textur frei (die Vorderseite ist
// geteilt und bleibt).
export function createWanCabinets(boxes, { ceiling }) {
  const g = new THREE.Group();
  g.name = 'bunker-wan-cabinets';
  const parts = buckets();
  const plates = boxes.length ? plateMaterial(boxes.map((b) => b.name)) : null;
  const turn = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  boxes.forEach((b, k) => {
    const { width, height, depth } = b.box;
    const bottom = b.box.y - height / 2;
    // Kastenkoordinaten → Boden: drehen (Vorderseite nach −z: halbe Drehung), an die Rückseite schieben
    turn.makeRotationY(b.facing < 0 ? Math.PI : 0);
    place.makeTranslation(b.x, bottom, b.backZ).multiply(turn);
    const local = (geo) => geo.applyMatrix4(place);
    // Gehäuse und Vorderseite
    parts.add(MATS.housing, local(new THREE.BoxGeometry(width, height, depth).translate(0, height / 2, depth / 2)));
    parts.add(frontMaterial(width, height, b.ports), local(new THREE.PlaneGeometry(width, height).translate(0, height / 2, depth + 0.0005)));
    // Ports: Kupplung und dunkle Öffnung
    const { w: portW, h: portH } = portSize(b.ports);
    for (const p of b.ports) {
      parts.add(MATS.adapter, local(new THREE.BoxGeometry(portW, portH, 0.008).translate(p.x, p.y, depth + 0.002)));
      parts.add(MATS.port, local(new THREE.BoxGeometry(portW * 0.55, portH * 0.6, 0.004).translate(p.x, p.y, depth + 0.0045)));
    }
    for (const sx of [-width / 2 + 0.014, width / 2 - 0.014]) {
      for (const sy of [0.014, height - 0.014]) {
        parts.add(MATS.screw, local(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 8).rotateX(Math.PI / 2).translate(sx, sy, depth + 0.0015)));
      }
    }
    // Säule von der Feldkante bis zur Rückseite des Kastens, Boden bis Decke, unten ein grüner Streifen
    const d = Math.abs(b.backZ - b.edgeZ);
    const cz = (b.backZ + b.edgeZ) / 2;
    parts.add(MATS.column, new THREE.BoxGeometry(b.column.w, ceiling, d).translate(b.x, ceiling / 2, cz));
    parts.add(MATS.stripe, new THREE.BoxGeometry(b.column.w + 0.01, 0.12, d + 0.01).translate(b.x, 0.06, cz));
    // Nummernschild unter dem Kasten an der Säule (Streifen k der gemeinsamen Textur)
    const plate = new THREE.PlaneGeometry(PLATE.w, PLATE.h);
    const uv = plate.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (k + 1 - uv.getY(i)) / boxes.length);
    parts.add(plates, local(plate.translate(0, -PLATE.gap - PLATE.h / 2, 0.004)));
    // Kabeltrasse an der Säule hoch und oben waagerecht bis an die Trasse über den Reihen
    const riser = createWallRiser({ height: b.riser.height, width: 0.26, reach: b.riser.reach, depth: b.riser.depth });
    riser.applyMatrix4(new THREE.Matrix4().makeTranslation(b.x, b.riser.y0, b.backZ).multiply(turn));
    riser.updateMatrixWorld(true);
    riser.traverse((o) => {
      if (!o.isMesh) return;
      parts.add(o.material, o.geometry.clone().applyMatrix4(o.matrixWorld));
      o.geometry.dispose();
    });
  });
  g.add(...parts.meshes());
  g.userData.dispose = () => {
    g.traverse((o) => o.geometry?.dispose());
    plates?.map.dispose();
    plates?.dispose();
  };
  return g;
}
