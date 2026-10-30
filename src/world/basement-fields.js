// Kellerfelder (#51): Der Keller (world/basement.js) wird so groß gezeichnet, wie er ausgebaut ist
// (core/basement-layout.js, 20 … 120 m, Felder zu 20 × 20 m). Je Feld: Boden, Decke mit Leuchten, Außenwände an den
// Kellerrändern, eine Betonstütze an der inneren Südost-Ecke und ein Schild.
//   - Lager: Betonboden mit gelben Bodenlinien (Rand und Mittelgang)
//   - Daten-Bunker: dunkler Stahl-Doppelboden; zu jedem Nachbarfeld, das kein Bunker ist, eine Wand mit dicker
//     Stahl-Schiebetür (öffnet von selbst, wenn man davorsteht). Zwischen zwei Bunker-Feldern bleibt es offen.
//   - nicht festgelegt: leerer Betonboden, Schild „Feld noch nicht festgelegt – im Ausbau-Menü wählen“
//
// Schilder: Je Feld hängt in der Mitte ein vierseitiges Schild von der Decke (aus jeder Richtung lesbar – Stützen gibt es
// nicht an jeder Feldecke, auf Stufe 1 gar keine), über jeder Bunkertür hängt außen dasselbe Schild. Nummeriert wird
// je Art fortlaufend in der Reihenfolge der Feldnummern („LAGER 1“ ist immer das Feld am Treppenhaus); darunter steht
// klein die Feldnummer wie in der Kellerkarte des Ausbau-Menüs („Feld 7“), damit man beides zuordnen kann.
//
// Leistung: Alles Unbewegliche eines Feldes wird per mergeStatic zusammengefasst (etwa zehn Draw Calls je Feld), Felder
// weiter als VIEW_DIST weg werden nicht gezeichnet (außerhalb des Bildes lässt three.js sie ohnehin weg). Echte Lichter
// gibt es hier keine – die Leuchten sind nur hell, das Licht folgt in world/basement.js der Spielfigur. Alle Materialien
// entstehen beim Anlegen; ein Ausbau baut nur die betroffenen Felder neu, verteilt auf mehrere Bilder.
//
// Für Einrichtung (#52 Bunker, #53 Lager): contentGroup(i) ist eine Gruppe je Feld, die über Neubauten hinweg bleibt
// und mit dem Feld ein- und ausgeblendet wird (Kinder in Weltkoordinaten). fieldInfo(i) nennt Türen und Bereiche,
// die frei bleiben müssen.
import * as THREE from 'three';
import { FIELD_SIZE, GRID, fieldBounds } from '../core/basement-layout.js';
import { ROOM_HEIGHT, WALL_THICKNESS } from './room.js';
import { box } from '../models/mesh-helpers.js';
import { canvasTexture, speckle } from '../models/canvas-texture.js';
import { mergeStatic } from '../models/merge-static.js';
import { STEEL_DOOR, createSteelDoor, createSteelDoorMaterials } from '../models/steel-door.js';

const H = ROOM_HEIGHT;          // Raumhöhe im Keller (3,5 m)
const T = WALL_THICKNESS;       // Außenwände
const BW = 0.3;                 // Bunkerwände (Beton, dicker als die Außenwände)
const LEAF_ROOM = STEEL_DOOR.leaf + 0.03; // so weit steht das Türblatt auf der Bunker-Seite vor der Wand
const PILLAR = 0.6;             // Kantenlänge der Betonstützen
export const VIEW_DIST = 60;           // m, weiter entfernte Felder werden nicht gezeichnet (40 m ließ in offenen Reihen schwarze Flächen sehen)
const SENSOR = { perp: 3.0, along: 1.3 }; // Bewegungsmelder der Stahltür: so nah davor/dahinter bzw. daneben (m)
// Öffnen dauert 0,6 s, durchgehbar ab 90 % (dann ist das Türblatt ganz aus der Öffnung). Bei 4 m/s ist man vom
// Bewegungsmelder (3 m) bis zur Tür etwa 0,65 s unterwegs – die Tür ist rechtzeitig offen.
const SLIDE_SECONDS = 0.6;
const PASSABLE = 0.9;
const BUDGET_MS = 4;            // so lange darf der Neubau von Feldern pro Bild höchstens dauern
const SIDES = ['N', 'E', 'S', 'W'];
const LINE_W = 0.1;             // gelbe Bodenlinien

const TYPE_STYLE = {
  storage: { bg: '#1f4f8a', name: 'LAGER' },
  bunker: { bg: '#1f6a46', name: 'DATEN-BUNKER' },
  none: { bg: '#4a4d52' },
};

// ---------- Materialien (einmal für alle Felder) ----------

function drawConcrete(ctx, w, h) {
  ctx.fillStyle = '#8c8f94';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 5000, 0.08);
  ctx.strokeStyle = 'rgba(40,40,40,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2); // Fuge alle 2 m
}

// Doppelboden wie im Rechenzentrum: dunkle Stahlplatten (4 × 4 je Kachel), einzelne gelocht
function drawSteelFloor(ctx, w, h) {
  ctx.fillStyle = '#2c3036';
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  const s = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = `hsl(212, 8%, ${27 + Math.random() * 4}%)`;
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      if ((x + y) % 3 === 0) {
        ctx.fillStyle = 'rgba(10,12,14,0.7)';
        for (let py = 8; py < s - 6; py += 7) for (let px = 8; px < s - 6; px += 7) ctx.fillRect(x * s + px, y * s + py, 3, 3);
      }
    }
  }
  speckle(ctx, w, h, 2500, 0.05);
}

function createMaterials() {
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(4) });
  return {
    // Kachel = 2 m bzw. 2,5 m, ein Feld (20 m) also 10- bzw. 8-mal
    concreteFloor: new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawConcrete, FIELD_SIZE / 2, FIELD_SIZE / 2), roughness: 0.8 }),
    steelFloor: new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawSteelFloor, FIELD_SIZE / 2.5, FIELD_SIZE / 2.5), roughness: 0.5, metalness: 0.5 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.95 }),   // Wände, Decke, Stützen, Leuchtengehäuse
    bunkerWall: new THREE.MeshStandardMaterial({ color: 0x5b6169, roughness: 0.85 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 }),       // Sockel, Schildhalter
    line: new THREE.MeshStandardMaterial({ color: 0xe2b21c, roughness: 0.6 }),          // gelbe Bodenlinien
    lamp,
    door: createSteelDoorMaterials(),
  };
}

// Schild-Textur: große Zeile (Feldart und Nummer) und kleine zweite Zeile
function signTexture(style, big, small) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fit = (text, size, weight, y) => {
      const font = (px) => `${weight} ${px}px "Segoe UI", Arial, sans-serif`;
      let px = size;
      ctx.font = font(px);
      while (ctx.measureText(text).width > w - 36 && px > 8) ctx.font = font(--px);
      ctx.fillText(text, w / 2, y);
    };
    fit(big, 60, 800, h * 0.42);
    fit(small, 24, 600, h * 0.8);
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

// ---------- Geometrie-Helfer ----------

// Seite s eines Feldes: Linie (fest: Koordinate quer zur Wand), Verlauf a0…a1, Richtung ins Feld (n) und Drehung,
// bei der lokales +z ins Feld zeigt
function sideLine(b, s) {
  switch (s) {
    case 'N': return { alongX: true, fixed: b.minZ, a0: b.minX, a1: b.maxX, n: 1, rotY: 0 };
    case 'S': return { alongX: true, fixed: b.maxZ, a0: b.minX, a1: b.maxX, n: -1, rotY: Math.PI };
    case 'W': return { alongX: false, fixed: b.minX, a0: b.minZ, a1: b.maxZ, n: 1, rotY: Math.PI / 2 };
    default: return { alongX: false, fixed: b.maxX, a0: b.minZ, a1: b.maxZ, n: -1, rotY: -Math.PI / 2 };
  }
}

// Quader entlang einer Seitenlinie: von a0 bis a1, Dicke d, Mitte um off (in Richtung ins Feld) versetzt
function sideBox(line, a0, a1, d, off, h, yBottom, material) {
  const len = a1 - a0;
  const along = (a0 + a1) / 2;
  const across = line.fixed + line.n * off;
  return line.alongX
    ? box(len, h, d, material, along, yBottom + h / 2, across)
    : box(d, h, len, material, across, yBottom + h / 2, along);
}

// Rechteck { minX, maxX, minZ, maxZ } entlang einer Seitenlinie (für Kollision), quer von c0 bis c1 (ins Feld positiv)
function sideRect(line, a0, a1, c0, c1) {
  const p = line.fixed + line.n * c0;
  const q = line.fixed + line.n * c1;
  const [lo, hi] = [Math.min(p, q), Math.max(p, q)];
  return line.alongX ? { minX: a0, maxX: a1, minZ: lo, maxZ: hi } : { minX: lo, maxX: hi, minZ: a0, maxZ: a1 };
}

// Gelbe Linien als achsenparallele Strecken [[x0, z0], [x1, z1]]
function lineBoxes(g, material, y, segments) {
  for (const [[x0, z0], [x1, z1]] of segments) {
    const len = Math.hypot(x1 - x0, z1 - z0) + LINE_W;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    g.add(alongX
      ? box(len, 0.004, LINE_W, material, (x0 + x1) / 2, y + 0.003, (z0 + z1) / 2)
      : box(LINE_W, 0.004, len, material, (x0 + x1) / 2, y + 0.003, (z0 + z1) / 2));
  }
}

const loop = (pts) => pts.map((p, k) => [p, pts[(k + 1) % pts.length]]);

function disposeTree(root, shared) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (!shared.has(o.material)) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

// layout: core/basement-layout.js (upgrades.basementLayout) · collision: Kollision der Spielfigur (Stahltüren)
// stairwell: { x0, x1, z0, z1 } Treppenhaus samt Wand in Feld 0 (keine Decke, kein Sockel, keine Linien dort)
// keepFree: weitere Rechtecke in Feld 0, die frei bleiben müssen (Fahrstuhl samt Platz davor)
// level: Stockwerk des Kellers für die Kollision
export function createBasementFields({ layout, collision, stairwell, keepFree = [], level = -2 }) {
  const group = new THREE.Group();
  group.name = 'basement-fields';
  const m = createMaterials();
  const shared = new Set([m.concreteFloor, m.steelFloor, m.concrete, m.bunkerWall, m.plinth, m.line, m.lamp, ...Object.values(m.door)]);
  const ORIGIN = fieldBounds(0).minX;

  // Je Feld eine dauerhafte Gruppe: darin der zusammengefasste Bau (wird ersetzt), die Türblätter und die Einrichtung
  const holders = Array.from({ length: GRID * GRID }, (_, i) => {
    const holder = new THREE.Group();
    holder.name = `basement-field-${i}`;
    holder.visible = false;
    const content = new THREE.Group();
    content.name = `basement-field-${i}-content`;
    holder.add(content);
    holder.userData.content = content;
    group.add(holder);
    return holder;
  });
  const built = new Map();    // Feld → { key, parts: [Gruppen], leaves: Map(Türschlüssel → Türblatt) }
  const queue = new Set();    // Felder, die neu gebaut werden müssen
  let plans = new Map();      // Feld → Plan (siehe plan())
  const doors = new Map();    // Türschlüssel → { key, field, x, z, alongX, open }
  let signature = '';
  let doorsClosed = null;

  // Beschriftung: je Art fortlaufend nach Feldnummer
  function label(i, type) {
    if (!type) return { big: 'Feld noch nicht festgelegt', small: `im Ausbau-Menü wählen · Feld ${i + 1}` };
    let n = 0;
    for (let k = 0; k <= i; k++) if (layout.isBuilt(k) && layout.fieldType(k) === type) n++;
    return { big: `${TYPE_STYLE[type].name} ${n}`, small: `Feld ${i + 1}` };
  }

  // Was in Feld i steht – hängt nur von Stufe und Feldarten ab, daraus kommen Bau, Kollision und Schlüssel
  function plan(i) {
    const b = fieldBounds(i);
    const span = layout.span;
    const type = layout.fieldType(i);
    const nb = {
      N: b.row > 0 ? i - GRID : -1,
      S: b.row < span - 1 ? i + GRID : -1,
      W: b.col > 0 ? i - 1 : -1,
      E: b.col < span - 1 ? i + 1 : -1,
    };
    const outer = {};
    const bunker = {};
    for (const s of SIDES) {
      outer[s] = nb[s] < 0;
      bunker[s] = type === 'bunker' && nb[s] >= 0 && layout.fieldType(nb[s]) !== 'bunker';
    }
    const pillar = b.col < span - 1 && b.row < span - 1;
    const text = label(i, type);
    const key = [type, ...SIDES.map((s) => `${+outer[s]}${+bunker[s]}`), +pillar, text.big, text.small].join('|');
    return { i, b, type, outer, bunker, pillar, text, key };
  }

  // ---------- Bau eines Feldes ----------

  function buildField(p) {
    const { i, b, type, outer } = p;
    const y = b.y;
    const g = new THREE.Group();
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const first = i === 0;
    const sw = stairwell;

    // Boden
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE), type === 'bunker' ? m.steelFloor : m.concreteFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, y, cz);
    g.add(floor);

    // Decke (in Feld 0 bleibt die Ecke des Treppenhauses frei)
    const cy = y + H + 0.15;
    if (first) {
      g.add(
        box(b.maxX - sw.x1, 0.3, FIELD_SIZE, m.concrete, (sw.x1 + b.maxX) / 2, cy, cz),
        box(sw.x1 - sw.x0, 0.3, b.maxZ - sw.z1, m.concrete, (sw.x0 + sw.x1) / 2, cy, (sw.z1 + b.maxZ) / 2),
      );
    } else {
      g.add(box(FIELD_SIZE, 0.3, FIELD_SIZE, m.concrete, cx, cy, cz));
    }
    // Leuchten 3 × 3 ohne die Mitte (dort hängt das Schild) – nur leuchtendes Material, kein echtes Licht
    for (const dx of [-6.5, 0, 6.5]) {
      for (const dz of [-6.5, 0, 6.5]) {
        if (!dx && !dz) continue;
        g.add(box(1.24, 0.06, 0.34, m.concrete, cx + dx, y + H - 0.03, cz + dz));
        g.add(box(1.16, 0.02, 0.26, m.lamp, cx + dx, y + H - 0.065, cz + dz));
      }
    }

    // Außenwände an den Kellerrändern (an Außenecken um die Wanddicke länger) mit Sockel
    for (const s of SIDES) {
      if (!outer[s]) continue;
      const line = sideLine(b, s);
      const ext0 = outer[line.alongX ? 'W' : 'N'] ? T : 0;
      const ext1 = outer[line.alongX ? 'E' : 'S'] ? T : 0;
      g.add(sideBox(line, line.a0 - ext0, line.a1 + ext1, T, -T / 2, H, y, m.concrete));
      // Sockel – in Feld 0 nicht im Treppenhaus
      let a0 = line.a0;
      if (first && s === 'N') a0 = sw.x1;
      if (first && s === 'W') a0 = sw.z1;
      g.add(sideBox(line, a0, line.a1, 0.02, 0.01, 0.1, y, m.plinth));
    }

    // Betonstütze an der inneren Südost-Ecke, unten mit Warnstreifen
    if (p.pillar) {
      g.add(box(PILLAR, H, PILLAR, m.concrete, b.maxX, y + H / 2, b.maxZ));
      g.add(box(PILLAR + 0.02, 0.6, PILLAR + 0.02, m.door.hazard, b.maxX, y + 0.3, b.maxZ));
    }

    // Lager: gelbe Linien (Rand 1 m innen, Mittelgang 2,5 m breit von Nord nach Süd)
    if (type === 'storage') {
      const x0 = b.minX + 1;
      const x1 = b.maxX - 1;
      const z0 = b.minZ + 1;
      const z1 = b.maxZ - 1;
      // Feld 0: Rand um Treppenhaus und Fahrstuhl herum
      const border = first
        ? [[sw.x1 + 1, z0], [x1, z0], [x1, z1], [x0, z1], [x0, sw.z1 + 3.1], [sw.x1 + 1, sw.z1 + 3.1]]
        : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      lineBoxes(g, m.line, y, [
        ...loop(border),
        [[cx - 1.25, z0], [cx - 1.25, z1]],
        [[cx + 1.25, z0], [cx + 1.25, z1]],
      ]);
    }

    // Schild mitten im Feld: vier Seiten, hängt an zwei Stangen von der Decke
    const style = TYPE_STYLE[type ?? 'none'];
    const texture = signTexture(style, p.text.big, p.text.small);
    const signMat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.5 });
    const SW = 1.8;
    const SH = SW / 4;
    const sy = y + 2.9;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), signMat);
      plane.rotation.y = a;
      plane.position.set(cx + Math.sin(a) * SW / 2, sy, cz + Math.cos(a) * SW / 2);
      g.add(plane);
    }
    for (const d of [-0.6, 0.6]) g.add(box(0.03, y + H - sy - SH / 2, 0.03, m.plinth, cx + d, (y + H + sy + SH / 2) / 2, cz));

    // Daten-Bunker: Wände mit Stahltür zu Nachbarfeldern, die keine Bunker sind
    const leaves = new Map();
    const doorParts = new THREE.Group();
    for (const s of SIDES) {
      if (!p.bunker[s]) continue;
      const line = sideLine(b, s);
      const c = (line.a0 + line.a1) / 2;
      const half = STEEL_DOOR.w / 2;
      g.add(
        sideBox(line, line.a0, c - half, BW, 0, H, y, m.bunkerWall),
        sideBox(line, c + half, line.a1, BW, 0, H, y, m.bunkerWall),
        sideBox(line, c - half, c + half, BW, 0, H - STEEL_DOOR.h, y + STEEL_DOOR.h, m.bunkerWall),
      );
      const pivot = new THREE.Group();
      pivot.position.set(line.alongX ? c : line.fixed, y, line.alongX ? line.fixed : c);
      pivot.rotation.y = line.rotY;
      const { frame, leaf } = createSteelDoor(m.door, BW);
      // Schild über der Tür auf der Außenseite (gleiche Textur wie das Hängeschild)
      const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), signMat);
      doorSign.rotation.y = Math.PI;
      doorSign.position.set(0, STEEL_DOOR.h + STEEL_DOOR.frame + 0.42, -BW / 2 - 0.01);
      frame.add(doorSign);
      // Unbewegliches (Zarge, Schiene, Schild) kommt in den Bau, das Türblatt bleibt einzeln
      const framePivot = pivot.clone(false);
      framePivot.add(frame);
      g.add(framePivot);
      pivot.add(leaf);
      doorParts.add(pivot);
      const key = `${i}${s}`;
      leaves.set(key, leaf);
      const state = doors.get(key);
      if (state) leaf.position.x = ease(state.open) * leaf.userData.travel;
    }

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    mergeStatic(g);
    doorParts.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { key: p.key, parts: [g, doorParts], leaves };
  }

  function removeBuilt(i) {
    const old = built.get(i);
    if (!old) return;
    for (const part of old.parts) {
      part.removeFromParent();
      disposeTree(part, shared);
    }
    built.delete(i);
  }

  function build(i) {
    queue.delete(i);
    const p = plans.get(i);
    if (!p) return;
    const next = buildField(p);
    removeBuilt(i);
    holders[i].add(...next.parts);
    built.set(i, next);
  }

  // ---------- Abgleich mit dem Ausbau-Stand ----------

  // Stufe und Feldarten übernehmen: geänderte Felder zum Neubau vormerken, Kollision neu berechnen. Billig, wenn sich
  // nichts geändert hat (wird bei jedem upgrades.notify aufgerufen). Gibt true zurück, wenn sich etwas geändert hat.
  function sync() {
    const sig = `${layout.stage}:${layout.save().join(',')}`;
    if (sig === signature) return false;
    signature = sig;
    plans = new Map(layout.fields().map(({ index }) => [index, plan(index)]));
    for (const i of [...built.keys()]) {
      if (!plans.has(i)) removeBuilt(i);
    }
    for (const [i, p] of plans) {
      if (built.get(i)?.key !== p.key) queue.add(i);
    }
    for (let i = 0; i < holders.length; i++) if (!plans.has(i)) holders[i].visible = false;
    // Türen: offene behalten ihren Stand
    const next = new Map();
    for (const p of plans.values()) {
      for (const s of SIDES) {
        if (!p.bunker[s]) continue;
        const line = sideLine(p.b, s);
        const key = `${p.i}${s}`;
        const c = (line.a0 + line.a1) / 2;
        next.set(key, {
          key, field: p.i, side: s, alongX: line.alongX, n: line.n,
          x: line.alongX ? c : line.fixed, z: line.alongX ? line.fixed : c,
          line, open: doors.get(key)?.open ?? 0,
        });
      }
    }
    doors.clear();
    for (const [k, v] of next) doors.set(k, v);
    doorsClosed = null;
    updateDoorCollision();
    return true;
  }

  // Unbewegliche Hindernisse: Außenwände des ganzen Kellers, Stützen, Bunkerwände (ohne Türen)
  function colliders() {
    const size = layout.size;
    if (!size) return [];
    const a = ORIGIN;
    const e = ORIGIN + size;
    const list = [
      { minX: a - T, maxX: e + T, minZ: a - T, maxZ: a, level },
      { minX: a - T, maxX: e + T, minZ: e, maxZ: e + T, level },
      { minX: a - T, maxX: a, minZ: a, maxZ: e, level },
      { minX: e, maxX: e + T, minZ: a, maxZ: e, level },
    ];
    for (const p of plans.values()) {
      const { b } = p;
      if (p.pillar) {
        list.push({ minX: b.maxX - PILLAR / 2, maxX: b.maxX + PILLAR / 2, minZ: b.maxZ - PILLAR / 2, maxZ: b.maxZ + PILLAR / 2, level });
      }
      for (const s of SIDES) {
        if (!p.bunker[s]) continue;
        const line = sideLine(b, s);
        const c = (line.a0 + line.a1) / 2;
        const half = STEEL_DOOR.w / 2;
        // Auf der Bunker-Seite etwas dicker: dort gleitet das Türblatt vor die Wand
        list.push(
          { ...sideRect(line, line.a0, c - half, -BW / 2, BW / 2 + LEAF_ROOM), level },
          { ...sideRect(line, c + half, line.a1, -BW / 2, BW / 2 + LEAF_ROOM), level },
        );
      }
    }
    return list;
  }

  // ---------- Stahltüren ----------

  const ease = (t) => t * t * (3 - 2 * t);

  function updateDoorCollision() {
    const closed = [...doors.values()].filter((d) => d.open < PASSABLE);
    const sig = closed.map((d) => d.key).join(',');
    if (sig === doorsClosed) return;
    doorsClosed = sig;
    const half = STEEL_DOOR.w / 2;
    collision.setDynamic('basement-doors', closed.map((d) => {
      const c = d.alongX ? d.x : d.z;
      return { ...sideRect(d.line, c - half, c + half, -BW / 2, BW / 2 + LEAF_ROOM), level };
    }));
  }

  // ---------- Jedes Bild ----------

  // camera: Spielkamera · shown: wird der Keller gerade gezeichnet? · inBasement: steht die Figur im Keller (Türen)?
  function update(dt, camera, shown, inBasement) {
    const p = camera.position;
    // Neubau: nächstgelegene Felder zuerst, höchstens BUDGET_MS pro Bild (mindestens eins)
    if (queue.size) {
      const start = performance.now();
      while (queue.size) {
        let best = -1;
        let bestD = Infinity;
        for (const i of queue) {
          const d = distTo(fieldBounds(i), p);
          if (d < bestD) { bestD = d; best = i; }
        }
        build(best);
        if (performance.now() - start > BUDGET_MS) break;
      }
    }
    if (!shown) return;
    for (const i of plans.keys()) holders[i].visible = distTo(fieldBounds(i), p) < VIEW_DIST;

    let changed = false;
    for (const d of doors.values()) {
      const along = d.alongX ? p.x - d.x : p.z - d.z;
      const perp = d.alongX ? p.z - d.z : p.x - d.x;
      const near = inBasement && Math.abs(along) < SENSOR.along && Math.abs(perp) < SENSOR.perp;
      const before = d.open;
      d.open = THREE.MathUtils.clamp(d.open + (near ? 1 : -1) * (dt / SLIDE_SECONDS), 0, 1);
      if (d.open === before) continue;
      changed = true;
      const leaf = built.get(d.field)?.leaves.get(d.key);
      if (leaf) leaf.position.x = ease(d.open) * leaf.userData.travel;
    }
    if (changed) updateDoorCollision();
  }

  // Abstand (x/z) vom Punkt p zum Rechteck b
  function distTo(b, p) {
    const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
    const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
    return Math.hypot(dx, dz);
  }

  // Alle vorgemerkten Felder sofort bauen (z. B. für Tests)
  function flush() {
    while (queue.size) build(queue.values().next().value);
  }

  // Für #52/#53: Feld i mit Art, Grenzen, Türen und Bereichen, die frei bleiben müssen (Türen samt 2,5 m davor und
  // dahinter, Stütze, in Feld 0 Treppenhaus und Fahrstuhl). Rechtecke in Weltkoordinaten. null, wenn nicht gebaut.
  function fieldInfo(i) {
    const p = plans.get(i);
    if (!p) return null;
    const { b } = p;
    const overlaps = (r) => r.minX < b.maxX && r.maxX > b.minX && r.minZ < b.maxZ && r.maxZ > b.minZ;
    const fieldDoors = [...doors.values()]
      .map((d) => {
        const c = d.alongX ? d.x : d.z;
        const zone = sideRect(d.line, c - STEEL_DOOR.w / 2 - 0.5, c + STEEL_DOOR.w / 2 + 0.5, -2.5, 2.5);
        return { x: d.x, z: d.z, alongX: d.alongX, bunkerField: d.field, zone };
      })
      .filter((d) => overlaps(d.zone));
    const blocked = fieldDoors.map((d) => d.zone);
    for (const q of plans.values()) {
      if (!q.pillar) continue;
      const r = { minX: q.b.maxX - PILLAR / 2 - 0.3, maxX: q.b.maxX + PILLAR / 2 + 0.3, minZ: q.b.maxZ - PILLAR / 2 - 0.3, maxZ: q.b.maxZ + PILLAR / 2 + 0.3 };
      if (overlaps(r)) blocked.push(r);
    }
    if (i === 0) blocked.push({ minX: stairwell.x0, maxX: stairwell.x1 + T, minZ: stairwell.z0, maxZ: stairwell.z1 }, ...keepFree.map((r) => ({ ...r })));
    return { index: i, type: p.type, bounds: b, doors: fieldDoors, blocked };
  }

  return {
    group, sync, update, colliders, flush, fieldInfo,
    contentGroup: (i) => holders[i]?.userData.content ?? null,
    get pending() { return queue.size; },
    get doors() { return [...doors.values()].map(({ key, field, x, z, open }) => ({ key, field, x, z, open })); },
  };
}
