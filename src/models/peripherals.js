// Detaillierte PC-Peripherie: Tastatur (deutsches ISO-Layout), Maus, Mauspad, Kabel.
// Alle Maße in Metern, Ursprung jeweils mittig am Boden. Vorderseite zeigt nach +z (zum Benutzer).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Tastatur ----------

const U = 0.019;            // Tastenraster (Standard 19,05 mm)
const KEY_GAP = 0.0025;     // Abstand zwischen zwei Kappen
const KEY_HEIGHT = 0.008;
const CASE_HEIGHT = 0.018;
const CASE_MARGIN = 0.012;
const LABEL_PX_PER_U = 96;  // Auflösung der Beschriftungstextur

const key = (l, w = 1, opts = {}) => ({ l, w, h: 1, ...opts });
const gap = (w) => ({ gap: w });
const keys = (labels) => [...labels].map((l) => key(l));
const shifted = (pairs) => pairs.map(([l, s]) => key(l, 1, { s }));

const MODIFIERS = new Set([
  'Esc', '⟵', '↹', '↵', '⇪', '⇧', 'Strg', '⊞', 'Alt', 'AltGr', '☰',
  'Druck', 'Rollen', 'Pause', 'Einfg', 'Pos1', 'Bild↑', 'Entf', 'Ende', 'Bild↓',
]);

// Reihen von hinten (Funktionstasten) nach vorne (Leertaste), y in Rastereinheiten
const KEY_ROWS = [
  { y: 0, keys: [
    key('Esc'), gap(1), ...keys(['F1', 'F2', 'F3', 'F4']), gap(0.5),
    ...keys(['F5', 'F6', 'F7', 'F8']), gap(0.5), ...keys(['F9', 'F10', 'F11', 'F12']), gap(0.5),
    ...keys(['Druck', 'Rollen', 'Pause']),
  ] },
  { y: 1.5, keys: [
    ...shifted([['^', '°'], ['1', '!'], ['2', '"'], ['3', '§'], ['4', '$'], ['5', '%'], ['6', '&'],
      ['7', '/'], ['8', '('], ['9', ')'], ['0', '='], ['ß', '?'], ['´', '`']]),
    key('⟵', 2), gap(0.5), ...keys(['Einfg', 'Pos1', 'Bild↑']),
  ] },
  { y: 2.5, keys: [
    key('↹', 1.5), ...keys('QWERTZUIOPÜ'), key('+', 1, { s: '*' }), gap(0.25),
    key('↵', 1.25, { h: 2 }), gap(0.5), ...keys(['Entf', 'Ende', 'Bild↓']),
  ] },
  { y: 3.5, keys: [
    key('⇪', 1.75), ...keys('ASDFGHJKLÖÄ'), key('#', 1, { s: "'" }), gap(1.25),
  ] },
  { y: 4.5, keys: [
    key('⇧', 1.25), key('<', 1, { s: '>' }), ...keys('YXCVBNM'),
    ...shifted([[',', ';'], ['.', ':'], ['-', '_']]), key('⇧', 2.75), gap(1.5), key('↑'),
  ] },
  { y: 5.5, keys: [
    key('Strg', 1.25), key('⊞', 1.25), key('Alt', 1.25), key('', 6.25), key('AltGr', 1.25),
    key('⊞', 1.25), key('☰', 1.25), key('Strg', 1.25), gap(0.5), ...keys(['←', '↓', '→']),
  ] },
];

const LAYOUT_W = 18.5;
const LAYOUT_D = 6.5;

function layoutKeys() {
  const placed = [];
  for (const row of KEY_ROWS) {
    let x = 0;
    for (const k of row.keys) {
      if (k.gap === undefined) placed.push({ ...k, x, y: row.y });
      x += k.gap ?? k.w;
    }
  }
  return placed;
}

function drawKeyLabels(placed) {
  const P = LABEL_PX_PER_U;
  const canvas = document.createElement('canvas');
  canvas.width = LAYOUT_W * P;
  canvas.height = LAYOUT_D * P;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e6e6e6';
  const font = (px, bold = false) => `${bold ? '600 ' : ''}${px}px "Segoe UI", Arial, sans-serif`;

  for (const k of placed) {
    if (!k.l) continue;
    const left = k.x * P;
    const top = k.y * P;
    const cx = left + (k.w * P) / 2;
    const cy = top + P / 2;

    if (k.s) {
      // Zweitbelegung oben links, Hauptzeichen unten links (wie auf echten Tastaturen)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(26);
      ctx.fillText(k.s, left + 20, top + 38);
      ctx.font = font(28, true);
      ctx.fillText(k.l, left + 20, top + P - 18);
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = k.l.length > 2 ? font(20) : font(k.l.length > 1 ? 24 : 32, true);
      ctx.fillText(k.l, cx, cy);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createKeyboard() {
  const keyboard = new THREE.Group();
  const width = LAYOUT_W * U + CASE_MARGIN * 2;
  const depth = LAYOUT_D * U + CASE_MARGIN * 2;

  const caseMesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, CASE_HEIGHT, depth, 3, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.6, roughness: 0.45 })
  );
  caseMesh.position.y = CASE_HEIGHT / 2;
  keyboard.add(caseMesh);

  // Tastenkappen: nach Typ zu je einem Mesh zusammengefasst (2 Draw Calls statt ~100)
  const placed = layoutKeys();
  const geometryCache = new Map();
  const alphaGeos = [];
  const modGeos = [];
  const keyBottom = CASE_HEIGHT - 0.003; // Kappen sitzen leicht im Gehäuse

  for (const k of placed) {
    const cacheKey = `${k.w}x${k.h}`;
    if (!geometryCache.has(cacheKey)) {
      geometryCache.set(cacheKey, new RoundedBoxGeometry(
        k.w * U - KEY_GAP, KEY_HEIGHT, k.h * U - KEY_GAP, 2, 0.0013
      ));
    }
    const geo = geometryCache.get(cacheKey).clone();
    geo.translate(
      -(LAYOUT_W * U) / 2 + (k.x + k.w / 2) * U,
      keyBottom + KEY_HEIGHT / 2,
      -(LAYOUT_D * U) / 2 + (k.y + k.h / 2) * U
    );
    (MODIFIERS.has(k.l) ? modGeos : alphaGeos).push(geo);
  }

  const keycapMaterial = { roughness: 0.7, metalness: 0 };
  keyboard.add(
    new THREE.Mesh(mergeGeometries(alphaGeos), new THREE.MeshStandardMaterial({ color: 0x1e2024, ...keycapMaterial })),
    new THREE.Mesh(mergeGeometries(modGeos), new THREE.MeshStandardMaterial({ color: 0x34373d, ...keycapMaterial }))
  );

  // Beschriftung als transparente Folie knapp über den Kappenoberseiten
  const labels = new THREE.Mesh(
    new THREE.PlaneGeometry(LAYOUT_W * U, LAYOUT_D * U),
    new THREE.MeshStandardMaterial({ map: drawKeyLabels(placed), transparent: true, depthWrite: false, roughness: 0.7 })
  );
  labels.rotation.x = -Math.PI / 2;
  labels.position.y = keyBottom + KEY_HEIGHT + 0.0002;
  labels.userData.noShadow = true; // Folie darf die Kappen nicht abschatten
  keyboard.add(labels);

  // Status-LEDs (Num, Caps, Scroll) auf dem hinteren Rand über dem Navigationsblock
  const ledMaterial = new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x33ff88, emissiveIntensity: 1.2 });
  const ledGeometry = new THREE.CircleGeometry(0.0012, 12);
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    led.rotation.x = -Math.PI / 2;
    led.position.set(-(LAYOUT_W * U) / 2 + (16 + i) * U, CASE_HEIGHT + 0.0001, -depth / 2 + CASE_MARGIN / 2);
    keyboard.add(led);
  }

  keyboard.userData.size = { width, depth };
  return keyboard;
}

// ---------- Maus ----------

const MOUSE_HALF_W = 0.032;
const MOUSE_HALF_L = 0.06;
const MOUSE_MAX_H = 0.037;

// Höhenprofil entlang der Länge (zn = -1 hinten … +1 vorne): Buckel leicht hinter der Mitte
const mouseHeightAt = (zn) => MOUSE_MAX_H * (1 - 0.35 * (zn + 0.25) ** 2);

function mouseSurfaceY(x, z) {
  const xn = x / MOUSE_HALF_W;
  const zn = z / MOUSE_HALF_L;
  return mouseHeightAt(zn) * Math.sqrt(Math.max(0, 1 - xn * xn - zn * zn));
}

// Gitterfläche, deren Punkte eine Funktion (s, t) ∈ [0,1]² → Vector3 liefert
function surfacePatch(pointAt, segS, segT) {
  const positions = [];
  const indices = [];
  for (let j = 0; j <= segT; j++) {
    for (let i = 0; i <= segS; i++) {
      const p = pointAt(i / segS, j / segT);
      positions.push(p.x, p.y, p.z);
    }
  }
  const row = segS + 1;
  for (let j = 0; j < segT; j++) {
    for (let i = 0; i < segS; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createMouse() {
  const mouse = new THREE.Group();

  // Gehäuse: obere Halbkugel, zum Ellipsoid mit Höhenprofil verformt
  const bodyGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const zn = pos.getZ(i);
    pos.setXYZ(i, pos.getX(i) * MOUSE_HALF_W, pos.getY(i) * mouseHeightAt(zn), zn * MOUSE_HALF_L);
  }
  bodyGeo.computeVertexNormals();
  mouse.add(new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.85 })));

  // Linke und rechte Taste als eigene Schalen auf der vorderen Hälfte, mit Spalt in der Mitte
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.4, side: THREE.DoubleSide });
  const halfGap = 0.0045;
  for (const side of [-1, 1]) {
    const geo = surfacePatch((s, t) => {
      const z = t * MOUSE_HALF_L * 0.93;
      const zn = z / MOUSE_HALF_L;
      const xMax = MOUSE_HALF_W * Math.sqrt(1 - zn * zn) * 0.94;
      const x = side * (halfGap + s * (xMax - halfGap));
      return new THREE.Vector3(x, mouseSurfaceY(x, z) + 0.0006, z);
    }, 16, 20);
    mouse.add(new THREE.Mesh(geo, buttonMaterial));
  }

  // Mausrad mit Gummiprofil
  const wheelZ = MOUSE_HALF_L * 0.35;
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 24),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.95 })
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, mouseSurfaceY(0, wheelZ) - 0.0045, wheelZ);
  mouse.add(wheel);

  const ribGeometry = new THREE.BoxGeometry(0.0062, 0.0008, 0.0012);
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.9 });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.position.set(0, wheel.position.y + Math.cos(angle) * 0.0087, wheelZ + Math.sin(angle) * 0.0087);
    rib.rotation.x = angle;
    mouse.add(rib);
  }

  // DPI-Taste hinter dem Mausrad
  const dpiZ = -0.004;
  const dpi = new THREE.Mesh(
    new RoundedBoxGeometry(0.005, 0.003, 0.008, 2, 0.001),
    new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.4 })
  );
  dpi.position.set(0, mouseSurfaceY(0, dpiZ), dpiZ);
  mouse.add(dpi);

  // Seitliche Daumentasten: +x ist von hinten gesehen links, also die Daumenseite einer Rechtshändermaus
  const thumbMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.4 });
  const thumbY = 0.012;
  for (const z of [0.004, -0.016]) {
    const thumb = new THREE.Mesh(new RoundedBoxGeometry(0.003, 0.006, 0.016, 2, 0.001), thumbMaterial);
    const zn = z / MOUSE_HALF_L;
    const yn = thumbY / mouseHeightAt(zn);
    thumb.position.set(MOUSE_HALF_W * Math.sqrt(Math.max(0, 1 - zn * zn - yn * yn)), thumbY, z);
    mouse.add(thumb);
  }

  // Vorderseite zeigt nach +z, Kabel tritt dort aus
  mouse.userData.cableExit = new THREE.Vector3(0, 0.008, MOUSE_HALF_L);
  return mouse;
}

// ---------- Mauspad & Kabel ----------

export function createMousePad(width = 0.26, depth = 0.21) {
  const pad = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.003, depth, 2, 0.0015),
    new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.95 })
  );
  pad.position.y = 0.0015;
  const group = new THREE.Group();
  group.add(pad);
  group.userData.height = 0.003;
  return group;
}

export function createCable(points, radius = 0.0018) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 96, radius, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
  );
}
