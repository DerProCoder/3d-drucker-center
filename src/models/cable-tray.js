// 3D-Modelle für die Verkabelung zwischen den Serverschränken: durchgehendes Kabelgitter unter der Decke,
// Internet-Anschluss (WAN) als Wandkasten und die Kabeltrasse vom Kasten an der Wand hoch ins Gitter.
// Reines Modell ohne Spiellogik: Raster, Höhen und Portzahl kommen als Parameter (Zahlen aus core/cable-tray.js),
// Einbau, Klicks und Kabel macht world/.
//
// Kabelgitter (createCableTray): Ursprung = Bezugspunkt des Raums auf dem Fußboden (y = 0 ist der Boden), x/z wie
// die Raumkoordinaten. Feld (x, z) – Indizes ab 0 – reicht von x0 + x·cell bis x0 + (x+1)·cell, entsprechend in z.
// Wandkasten (createWallBox): Ursprung Mitte der Rückseite unten (liegt an der Wand), Vorderseite +z, oben +y.
// Kabeltrasse (createWallRiser): Ursprung Mitte unten an der Wand, läuft nach +y hoch, Vorderseite +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';

const WIRE = 0.004;          // Drahtstärke des Gitters
const MESH = 0.1;            // Maschenweite (m) – sehr licht, damit die Deckenspots durchscheinen
const BAR_W = 0.025;         // Flachstahl an den Feldgrenzen (macht die 1-m-Felder von unten erkennbar)
const BAR_H = 0.006;
const RIM_H = 0.06;          // Randwand rings um das Gitter
const STRUT_W = 0.041;       // Querträger (C-Profil 41 × 21 mm) unter dem Gitter
const STRUT_H = 0.021;
const ROD_R = 0.005;         // Gewindestange M10

const MATS = {
  zinc: mat(0xa8adb4, 0.35, 0.8),       // verzinkter Stahl wie MATS.steel in models/server-hardware.js
  rod: mat(0x7c8189, 0.45, 0.75),       // Gewindestangen etwas dunkler
  housing: mat(0x8e949b, 0.55, 0.25),   // Wandkasten grau lackiert
  portRim: mat(0x9aa0a8, 0.4, 0.7),
  port: mat(0x0b0c0e, 0.8, 0.1),
  adapter: mat(0x2f6fd6, 0.5, 0.1),     // Glasfaser-Kupplungen (SC, blau)
  screw: mat(0xc9ced4, 0.3, 0.9),
};
// Gewählte Felder leuchten gelb wie die Clips in world/server-room.js (0xffd84a, doppelt hell für den Bloom).
// Die Farbe je Feld kommt über instanceColor, das Material selbst ist weiß ×2.
const MARK_PICK = new THREE.Color(0xffd84a);
const MARK_PATH = new THREE.Color(0xffd84a).multiplyScalar(0.45);

function boxGeo(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// Sammelt Geometrien je Material und macht daraus je Material ein Mesh (ein Draw Call pro Material)
function mergedParts() {
  const byMat = new Map();
  return {
    add(material, ...geos) {
      if (!byMat.has(material)) byMat.set(material, []);
      byMat.get(material).push(...geos);
    },
    meshes() {
      return [...byMat].map(([material, geos]) => {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material);
        geos.forEach((g) => g.dispose());
        mesh.matrixAutoUpdate = false;
        mesh.raycast = () => {}; // Klicks gehen an die Klickflächen (hitArea, Port-Klickflächen in world/)
        return mesh;
      });
    },
  };
}

// Ebene Drahtfläche w × d (Mitte x, y, z): Längs- und Querdrähte im Abstand MESH, je ein durchgehender Stab
function wireMesh(w, d, x, y, z) {
  const geos = [];
  const nx = Math.round(w / MESH);
  const nz = Math.round(d / MESH);
  for (let i = 0; i <= nx; i++) geos.push(boxGeo(WIRE, WIRE, d, x - w / 2 + (i * w) / nx, y, z));
  for (let j = 0; j <= nz; j++) geos.push(boxGeo(w, WIRE, WIRE, x, y - WIRE, z - d / 2 + (j * d) / nz));
  return geos;
}

// Zusammenhängende Abschnitte [von, bis) der Indizes 0…n−1, für die on(i) gilt
function runs(n, on) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && on(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

// Quadratischer Rahmen (Kantenlänge size, Breite band) in der x/z-Ebene für die Feldmarkierung
function frameGeometry(size, band) {
  const o = size / 2;
  const i = o - band;
  const shape = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

// ---------- Kabelgitter unter der Decke ----------

// Durchgehendes Drahtgitter über cols × rows Feldern (je cell × cell Meter) mit der linken hinteren Ecke bei
// (x0, z0); Oberseite des Gitterbodens auf Höhe height über dem Boden. Abgehängt an Gewindestangen bis zur Decke
// (ceiling) an jeder hangerEvery-ten Feldgrenze; avoid: Rechtecke [{ x, z, w, d }] (z. B. Deckenleuchten), in denen
// keine Stange sitzen soll; skip: Felder [{ x, z }] ohne Gitter (z. B. über dem Fahrstuhlschacht) – dort enden
// Drähte, Träger und Randwand. Das Gitter wirft keinen Schatten.
//
// userData:
//   grid           { x0, z0, cols, rows, cell, height } – die übergebenen Maße
//   surfaceY       Höhe, auf der Kabel im Gitter liegen (Oberseite der Drähte)
//   hitArea        unsichtbare Klickfläche über das ganze Raster (eine Fläche statt cols × rows einzelner)
//   fieldAt(p)     Feld { x, z } unter dem Punkt p (Modellkoordinaten, z. B. group.worldToLocal(hit.point)) oder null
//   fieldCenter(x, z)  Mitte des Feldes als Vector3 auf surfaceY (Modellkoordinaten)
//   markFields(picked, path)  Felder gelb markieren: picked hell (angeklickt), path gedämpft (Weg dazwischen);
//                  beides Listen [{ x, z }], leere Listen löschen die Markierung
export function createCableTray({ x0, z0, cols, rows, cell = 1, height, ceiling, hangerEvery = 2, avoid = [], skip = [] }) {
  const g = new THREE.Group();
  g.name = 'cable-tray';
  const W = cols * cell;
  const D = rows * cell;
  const cx = x0 + W / 2;
  const cz = z0 + D / 2;
  const top = height;                    // Oberkante der Querdrähte
  const wireY = top - WIRE / 2;          // Mitte der oberen Drahtlage (Längsdrähte darunter, siehe wireMesh)
  const barY = top - 2 * WIRE - BAR_H / 2;
  const strutY = barY - BAR_H / 2 - STRUT_H / 2;
  const parts = mergedParts();

  // Welche Felder es gibt (skip ausgenommen) und welche Felder an einer Linie liegen: Drähte, Flachstahl und Träger
  // laufen nur dort, wo daneben ein Feld ist
  const skipped = new Set(skip.map((f) => `${f.x},${f.z}`));
  const has = (x, z) => x >= 0 && z >= 0 && x < cols && z < rows && !skipped.has(`${x},${z}`);
  // Felder (Spalten bzw. Reihen) neben einer Linie bei Abstand t (in Feldern) vom Rand
  const beside = (t) => {
    const k = Math.floor(t + 1e-6);
    return Math.abs(t - Math.round(t)) < 1e-6 ? [Math.round(t) - 1, Math.round(t)] : [k];
  };
  // Linie in z-Richtung bei x = x0 + t·cell als Abschnitte über die Reihen, ebenso in x-Richtung
  const alongZ = (t) => runs(rows, (j) => beside(t).some((i) => has(i, j)));
  const alongX = (t) => runs(cols, (i) => beside(t).some((j) => has(i, j)));

  // Gitterboden aus Draht und Flachstahl an jeder Feldgrenze
  const nx = Math.round(W / MESH);
  const nz = Math.round(D / MESH);
  for (let k = 0; k <= nx; k++) {
    const t = (k * W) / nx / cell;
    for (const [a, b] of alongZ(t)) parts.add(MATS.zinc, boxGeo(WIRE, WIRE, (b - a) * cell, x0 + t * cell, wireY, z0 + ((a + b) / 2) * cell));
  }
  for (let k = 0; k <= nz; k++) {
    const t = (k * D) / nz / cell;
    for (const [a, b] of alongX(t)) parts.add(MATS.zinc, boxGeo((b - a) * cell, WIRE, WIRE, x0 + ((a + b) / 2) * cell, wireY - WIRE, z0 + t * cell));
  }
  for (let i = 0; i <= cols; i++) {
    for (const [a, b] of alongZ(i)) parts.add(MATS.zinc, boxGeo(BAR_W, BAR_H, (b - a) * cell, x0 + i * cell, barY, z0 + ((a + b) / 2) * cell));
  }
  for (let j = 0; j <= rows; j++) {
    for (const [a, b] of alongX(j)) parts.add(MATS.zinc, boxGeo((b - a) * cell, BAR_H, BAR_W, x0 + ((a + b) / 2) * cell, barY - 0.0005, z0 + j * cell));
  }

  // Randwand an jeder Feldkante ohne Nachbarfeld: zwei Drähte und senkrechte Drähte im Maschenabstand
  const perCell = Math.max(1, Math.round(cell / MESH));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (!has(i, j)) continue;
      const edges = [
        [!has(i, j - 1), 'x', z0 + j * cell], [!has(i, j + 1), 'x', z0 + (j + 1) * cell],
        [!has(i - 1, j), 'z', x0 + i * cell], [!has(i + 1, j), 'z', x0 + (i + 1) * cell],
      ];
      for (const [open, dir, at] of edges) {
        if (!open) continue;
        const mx = dir === 'x' ? x0 + (i + 0.5) * cell : at;
        const mz = dir === 'x' ? at : z0 + (j + 0.5) * cell;
        for (const h of [RIM_H / 2, RIM_H]) {
          parts.add(MATS.zinc, dir === 'x' ? boxGeo(cell, WIRE, WIRE, mx, top + h, mz) : boxGeo(WIRE, WIRE, cell, mx, top + h, mz));
        }
        for (let k = 0; k < perCell; k++) {
          const s = -cell / 2 + (k * cell) / perCell;
          parts.add(MATS.zinc, boxGeo(WIRE, RIM_H, WIRE, dir === 'x' ? mx + s : mx, top + RIM_H / 2, dir === 'x' ? mz : mz + s));
        }
      }
    }
  }

  // Abhängung: Querträger in x-Richtung an jeder hangerEvery-ten Feldgrenze, darauf Gewindestangen bis zur Decke
  const blocked = (x, z) => avoid.some((a) => Math.abs(x - a.x) < a.w / 2 + 0.1 && Math.abs(z - a.z) < a.d / 2 + 0.1);
  const lines = (n) => {
    const list = [];
    for (let i = 0; i <= n; i += hangerEvery) list.push(i);
    if (list[list.length - 1] !== n) list.push(n);
    return list;
  };
  const rodLen = ceiling - strutY;
  let hangers = 0;
  for (const j of lines(rows)) {
    const z = z0 + j * cell;
    const struts = alongX(j);
    for (const [a, b] of struts) parts.add(MATS.zinc, boxGeo((b - a) * cell, STRUT_H, STRUT_W, x0 + ((a + b) / 2) * cell, strutY, z));
    for (const i of lines(cols)) {
      const x = x0 + i * cell;
      // nur auf einem Träger und nicht dort, wo eine Leuchte sitzt
      if (!struts.some(([a, b]) => i >= a && i <= b) || blocked(x, z)) continue;
      hangers++;
      parts.add(
        MATS.rod,
        new THREE.CylinderGeometry(ROD_R, ROD_R, rodLen + 0.03, 6, 1, true).translate(x, strutY - 0.03 + (rodLen + 0.03) / 2, z),
        boxGeo(0.017, 0.009, 0.017, x, strutY - STRUT_H / 2 - 0.0045, z), // Mutter unter dem Träger
        boxGeo(0.06, 0.008, 0.06, x, ceiling - 0.004, z),                  // Deckenanker
      );
    }
  }
  const meshes = parts.meshes();
  g.add(...meshes);

  // Eine gemeinsame unsichtbare Klickfläche statt einer je Feld: ein Objekt im Klickstrahl statt cols × rows,
  // das Feld ergibt sich aus dem Trefferpunkt (fieldAt). Beidseitig, damit sie von unten getroffen wird.
  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  hitArea.position.set(cx, top, cz);
  hitArea.name = 'cable-tray-hit';
  g.add(hitArea);

  // Markierung gewählter Felder: ein Rahmen je Feld als InstancedMesh (ein Draw Call), knapp unter dem Gitter
  const markers = new THREE.InstancedMesh(
    frameGeometry(cell * 0.94, Math.min(0.05, cell * 0.06)),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), side: THREE.DoubleSide, depthWrite: false }),
    cols * rows
  );
  // Farbspeicher gleich anlegen – kommt er erst beim ersten Markieren, übersetzt three.js den Shader neu (Ruckler)
  markers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
  markers.count = 0;
  markers.frustumCulled = false;
  markers.raycast = () => {};
  markers.renderOrder = 1;
  g.add(markers);

  const inside = (x, z) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < cols && z < rows;
  const fieldCenter = (x, z) => new THREE.Vector3(x0 + (x + 0.5) * cell, top, z0 + (z + 0.5) * cell);
  const fieldAt = (p) => {
    const x = Math.floor((p.x - x0) / cell);
    const z = Math.floor((p.z - z0) / cell);
    return inside(x, z) ? { x, z } : null;
  };
  const matrix = new THREE.Matrix4();
  function markFields(picked = [], path = []) {
    let n = 0;
    const put = (f, color) => {
      if (!inside(f.x, f.z) || n >= cols * rows) return;
      matrix.makeTranslation(fieldCenter(f.x, f.z).setY(barY - BAR_H / 2 - 0.004));
      markers.setMatrixAt(n, matrix);
      markers.setColorAt(n, color);
      n++;
    };
    const key = (f) => `${f.x},${f.z}`;
    const pickedKeys = new Set(picked.map(key));
    path.filter((f) => !pickedKeys.has(key(f))).forEach((f) => put(f, MARK_PATH));
    picked.forEach((f) => put(f, MARK_PICK));
    markers.count = n;
    markers.instanceMatrix.needsUpdate = true;
    markers.instanceColor.needsUpdate = true;
  }

  Object.assign(g.userData, {
    grid: { x0, z0, cols, rows, cell, height },
    surfaceY: top,
    hangers,
    hitArea,
    markers,
    fieldAt,
    fieldCenter,
    markFields,
  });
  return g;
}

// ---------- Internet-Anschluss an der Wand ----------

const PORT_PITCH = 0.042;    // Abstand der Ports (m), wenn keine Lage vorgegeben ist
const BOX_DEPTH = 0.09;
const BOX_MARGIN = 0.05;
const HEADER_H = 0.11;       // Streifen oben mit Aufschrift und Glasfaser-Symbol (ohne vorgegebene Lage)
const ROW_H = 0.07;          // je Port-Reihe: Nummer darüber und Port
const LABEL_H = 0.022;       // Platz für die Nummer über einem Port
const BOX_PX = 1000;         // Pixel je Meter der Front-Textur

// Lage der Ports auf der Vorderseite (Kastenkoordinaten: x nach rechts, y nach oben ab Unterkante, z nach vorn).
// Vorgegeben (positions [{ x, y }], z. B. aus core/cable-tray.js wanPortPosition umgerechnet) oder selbst verteilt:
// bis 16 Ports in einer Reihe, darüber in zwei Reihen, gezählt von links oben. Außenmaße ebenso vorgegeben oder
// passend zu den Ports.
function wallBoxLayout({ ports, width, height, depth = BOX_DEPTH, positions, headerBelow = false }) {
  let list = positions?.map((p) => ({ x: p.x, y: p.y }));
  if (!list) {
    const rows = ports > 16 ? 2 : 1;
    const cols = Math.ceil(ports / rows);
    width ??= cols * PORT_PITCH + 2 * BOX_MARGIN;
    height ??= HEADER_H + rows * ROW_H + 0.03;
    list = Array.from({ length: ports }, (_, i) => ({
      x: -width / 2 + BOX_MARGIN + ((i % cols) + 0.5) * PORT_PITCH,
      y: height - HEADER_H - Math.floor(i / cols) * ROW_H - ROW_H * 0.62,
    }));
  }
  // Reihen (von oben) und kleinster Abstand zweier Ports in einer Reihe – danach richtet sich die Kupplungsgröße
  const rowYs = [...new Set(list.map((p) => Math.round(p.y * 1e4) / 1e4))].sort((a, b) => b - a);
  let pitch = PORT_PITCH;
  for (const y of rowYs) {
    const xs = list.filter((p) => Math.abs(p.y - y) < 1e-4).map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) pitch = Math.min(pitch, xs[i] - xs[i - 1]);
  }
  const portW = Math.min(0.026, pitch * 0.75);
  const portH = Math.min(0.02, portW * 0.8);
  const minX = Math.min(...list.map((p) => p.x));
  const maxX = Math.max(...list.map((p) => p.x));
  width ??= maxX - minX + pitch + 2 * BOX_MARGIN;
  height ??= rowYs[0] + portH / 2 + LABEL_H + HEADER_H;
  // Kopfzeile über der obersten Reihe bzw. (headerBelow) unter der untersten
  const header = Math.max(0.05, headerBelow ? rowYs[rowYs.length - 1] - portH / 2 - 0.006 : height - (rowYs[0] + portH / 2 + LABEL_H));
  return {
    width, height, depth, header, headerBelow, portW, portH, rowYs, minX, maxX, pitch,
    list: list.map((p) => ({ x: p.x, y: p.y, z: depth + 0.006 })),
  };
}

// Glasfaser-Symbol: drei geschwungene Fasern, die aus einem Bündel kommen, mit leuchtenden Enden
function drawFiberIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1d2228';
  ctx.lineWidth = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.45);
  ctx.lineTo(-s * 0.15, s * 0.45);
  ctx.stroke();
  const ends = [[s * 0.5, -s * 0.42], [s * 0.55, 0], [s * 0.5, s * 0.42]];
  ctx.lineWidth = s * 0.07;
  for (const [ex, ey] of ends) {
    ctx.strokeStyle = '#1d2228';
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, s * 0.45);
    ctx.bezierCurveTo(s * 0.15, s * 0.45, s * 0.1, ey, ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#ffb21e';
    ctx.beginPath();
    ctx.arc(ex, ey, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function wallBoxFront(layout) {
  const { width, height, list, header, headerBelow, portW, portH, rowYs, minX, maxX, pitch } = layout;
  const px = (m) => Math.round(m * BOX_PX);
  return canvasTexture(px(width), px(height), (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a4aab1');
    grad.addColorStop(1, '#8d939a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    // Kopfzeile: helles Schild mit Glasfaser-Symbol und Aufschrift (oben bzw. unten, plateY: Oberkante in m von oben)
    const pad = Math.min(0.02, header * 0.18);
    const plateH = header - 1.6 * pad;
    const plateY = headerBelow ? height - header + 0.6 * pad : pad;
    ctx.fillStyle = '#e9edf1';
    ctx.fillRect(px(pad), px(plateY), w - px(2 * pad), px(plateH));
    ctx.strokeStyle = '#1d2228';
    ctx.lineWidth = 2;
    ctx.strokeRect(px(pad), px(plateY), w - px(2 * pad), px(plateH));
    const icon = plateH * 0.62;
    drawFiberIcon(ctx, px(pad + 0.012 + icon / 2), px(plateY + plateH / 2), px(icon));
    const textX = px(pad + 0.03 + icon);
    ctx.fillStyle = '#1d2228';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `bold ${px(plateH * 0.4)}px sans-serif`;
    ctx.fillText('INTERNET / WAN', textX, px(plateY + plateH * 0.36));
    ctx.font = `${px(plateH * 0.2)}px sans-serif`;
    ctx.fillStyle = '#3a4048';
    ctx.fillText(`Glasfaser-Hausanschluss · ${list.length} Ports`, textX, px(plateY + plateH * 0.76));
    // Dunkles Feld hinter jeder Port-Reihe und Nummern über den Ports (Canvas-y läuft von oben nach unten)
    const left = px(minX - pitch / 2 + width / 2);
    const right = px(maxX + pitch / 2 + width / 2);
    for (const y of rowYs) {
      const top = height - (y + portH / 2 + LABEL_H);
      ctx.fillStyle = 'rgba(30, 34, 40, 0.18)';
      ctx.fillRect(left, px(top), right - left, px(LABEL_H + portH + 0.006));
    }
    ctx.textAlign = 'center';
    ctx.font = `bold ${px(Math.min(0.017, portW * 0.7))}px sans-serif`;
    list.forEach((p, i) => {
      ctx.fillStyle = '#14171b';
      ctx.fillText(String(i + 1), px(p.x + width / 2), px(height - (p.y + portH / 2 + LABEL_H * 0.5)));
    });
  }, 1, 1, { wrap: false });
}

// Wandkasten „INTERNET / WAN“ mit ports Glasfaser-Ports. Ursprung Mitte der Rückseite unten (an der Wand),
// Vorderseite +z. In world/ z. B. an der Westwand mit rotation.y = π/2 (Vorderseite zeigt dann nach +x, Kasten-x
// nach −z). Optional width/height/depth (Außenmaße) und positions [{ x, y }] (Lage der Ports in Kastenkoordinaten),
// damit Kasten und Ports genau zu den Zahlen in core/cable-tray.js passen.
// headerBelow: Schild mit Aufschrift unter statt über den Ports – wenn die Kabel von den Ports nach oben laufen, bleibt
// es so lesbar.
//
// userData:
//   ports       Lage der Ports [{ x, y, z }] in Kastenkoordinaten (knapp vor der Kupplung, wie portPositions bei
//               Geräten); Index i = Port i + 1 auf der Beschriftung
//   portSize    { w, h, d } – passende Größe für unsichtbare Klickflächen je Port
//   width, height, depth   Außenmaße des Kastens
//   outlet      { x, y, z } – Kabelauslass oben, dort setzt die Kabeltrasse (createWallRiser) an
export function createWallBox(options) {
  const layout = wallBoxLayout(options);
  const { width, height, depth, list, portW, portH, pitch } = layout;
  const g = new THREE.Group();
  g.name = 'wan-box';
  const front = new THREE.MeshStandardMaterial({ map: wallBoxFront(layout), roughness: 0.55, metalness: 0.2 });
  const s = MATS.housing;
  // Seiten in einer Gruppe, nur die Vorderseite (+z, Indizes 24–29) mit Textur: 3 Draw Calls statt 6
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  bodyGeo.clearGroups();
  bodyGeo.addGroup(0, 24, 0);
  bodyGeo.addGroup(24, 6, 1);
  bodyGeo.addGroup(30, 6, 0);
  const body = new THREE.Mesh(bodyGeo, [s, front]);
  body.position.set(0, height / 2, depth / 2);
  body.matrixAutoUpdate = false;
  body.updateMatrix();
  body.raycast = () => {};
  g.add(body);

  const parts = mergedParts();
  for (const p of list) {
    parts.add(MATS.adapter, boxGeo(portW, portH, 0.008, p.x, p.y, depth + 0.002));
    parts.add(MATS.port, boxGeo(portW * 0.55, portH * 0.6, 0.004, p.x, p.y, depth + 0.0045));
  }
  // Schrauben in den Ecken, Scharnierleiste links und Kabelauslass (Tülle) oben in der Mitte
  for (const x of [-width / 2 + 0.014, width / 2 - 0.014]) {
    for (const y of [0.014, height - 0.014]) {
      parts.add(MATS.screw, new THREE.CylinderGeometry(0.005, 0.005, 0.003, 10).rotateX(Math.PI / 2).translate(x, y, depth + 0.0015));
    }
  }
  parts.add(MATS.portRim, boxGeo(0.006, height - 0.06, 0.008, -width / 2 - 0.002, height / 2, depth - 0.01));
  const tube = Math.min(0.03, depth * 0.35);
  parts.add(MATS.port, new THREE.CylinderGeometry(tube, tube * 1.12, 0.025, 16).translate(0, height + 0.0125, depth / 2));
  g.add(...parts.meshes());

  Object.assign(g.userData, {
    ports: list.map((p) => ({ ...p })),
    portSize: { w: pitch * 0.95, h: Math.max(0.024, portH + 0.008), d: 0.016 },
    width,
    height,
    depth,
    outlet: { x: 0, y: height + 0.025, z: depth / 2 },
  });
  return g;
}

// ---------- Kabeltrasse an der Wand ----------

// Senkrechte Gitter-Kabelrinne an der Wand: height Meter hoch, width breit; reach > 0 knickt oben waagerecht
// um reach Meter nach vorn (+z) ab, falls das Gitter nicht direkt an der Wand anfängt; depth: Tiefe der Rinne.
// userData: lane { x, z } – Lage der Kabel in der Rinne (Abstand zur Wand), top { y, z } – Ende oben
export function createWallRiser({ height, width = 0.3, reach = 0, depth = 0.07 }) {
  const g = new THREE.Group();
  g.name = 'wan-riser';
  const sideD = depth;
  const parts = mergedParts();
  // Rücken aus Draht (senkrechte Drähte, Querdrähte im Maschenabstand) knapp vor der Wand
  const back = 0.012;
  const nx = Math.round(width / 0.05);
  for (let i = 0; i <= nx; i++) parts.add(MATS.zinc, boxGeo(WIRE, height, WIRE, -width / 2 + (i * width) / nx, height / 2, back));
  for (let y = 0; y <= height + 1e-6; y += MESH) {
    parts.add(MATS.zinc, boxGeo(width, WIRE, WIRE, 0, Math.min(y, height - WIRE), back + WIRE));
    // Seitenwände: U-förmige Bügel nach vorn
    for (const sx of [-1, 1]) parts.add(MATS.zinc, boxGeo(WIRE, WIRE, sideD, sx * width / 2, Math.min(y, height - WIRE), back + sideD / 2));
  }
  for (const sx of [-1, 1]) parts.add(MATS.zinc, boxGeo(WIRE, height, WIRE, sx * width / 2, height / 2, back + sideD));
  // Wandhalter alle 0,6 m
  for (let y = 0.15; y < height; y += 0.6) parts.add(MATS.rod, boxGeo(width + 0.04, 0.03, back, 0, y, back / 2));
  // Waagerechter Abschnitt oben bis ins Gitter
  if (reach > 0) {
    parts.add(MATS.zinc, ...wireMesh(width, reach, 0, height - WIRE / 2, back + reach / 2));
    for (const sx of [-1, 1]) parts.add(MATS.zinc, boxGeo(WIRE, WIRE, reach, sx * width / 2, height + RIM_H, back + reach / 2));
  }
  g.add(...parts.meshes());
  g.userData.lane = { x: 0, z: back + sideD / 2 };
  g.userData.top = { y: height, z: back + reach };
  return g;
}

// ---------- Kabelleitern im Daten-Bunker (#60) ----------

// Leiter-Kabeltrassen wie im Rechenzentrum: je Stück zwei Seitenholme und Sprossen alle 0,3 m, alle 2 m an zwei
// Gewindestangen von der Decke abgehängt. segments: [{ x0, z0, x1, z1 }] – achsparallele Mittellinien (Modell-
// koordinaten, y 0 = Boden); Oberkante der Sprossen auf height. Alles in einem Mesh je Material (2 Draw Calls),
// Klicks gehen an eigene Klickflächen in world/bunker.js.
export function createLadderTrays(segments, { height, ceiling, width = 0.5 }) {
  const g = new THREE.Group();
  g.name = 'ladder-trays';
  const parts = mergedParts();
  const RAIL_H = 0.06;
  const RAIL_W = 0.012;
  const RUNG = 0.3;
  const top = height;
  for (const s of segments) {
    const alongX = s.z0 === s.z1;
    const a = alongX ? Math.min(s.x0, s.x1) : Math.min(s.z0, s.z1);
    const b = alongX ? Math.max(s.x0, s.x1) : Math.max(s.z0, s.z1);
    const len = b - a;
    if (len <= 0) continue;
    const mid = (a + b) / 2;
    const at = alongX ? s.z0 : s.x0;
    const box = (along, across, h, w, d, y) => (alongX ? boxGeo(w, h, d, along, y, at + across) : boxGeo(d, h, w, at + across, y, along));
    for (const side of [-1, 1]) parts.add(MATS.zinc, box(mid, side * (width / 2), RAIL_H, len, RAIL_W, top + RAIL_H / 2 - 0.012));
    const rungs = Math.max(1, Math.round(len / RUNG));
    for (let k = 0; k <= rungs; k++) parts.add(MATS.zinc, box(a + (k * len) / rungs, 0, 0.012, 0.03, width, top - 0.006));
    // Abhängung: alle 2 m (und an den Enden) zwei Stangen bis zur Decke mit Querträger darunter
    const hangers = Math.max(1, Math.round(len / 2));
    for (let k = 0; k <= hangers; k++) {
      const p = a + (k * len) / hangers;
      parts.add(MATS.zinc, box(p, 0, STRUT_H, STRUT_W, width + 0.08, top - 0.012 - STRUT_H / 2));
      for (const side of [-1, 1]) {
        const x = alongX ? p : at + side * (width / 2 + 0.025);
        const z = alongX ? at + side * (width / 2 + 0.025) : p;
        const rodLen = ceiling - (top - 0.012 - STRUT_H);
        parts.add(MATS.rod, new THREE.CylinderGeometry(ROD_R, ROD_R, rodLen, 6, 1, true).translate(x, ceiling - rodLen / 2, z));
      }
    }
  }
  const meshes = parts.meshes();
  if (meshes.length) g.add(...meshes);
  return g;
}
