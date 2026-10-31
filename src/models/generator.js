// Dieselgenerator (#59, #71, Logik in core/backup-power.js): Schallschutzhaube auf einem Stahlrahmen, Lüftungsgitter
// an den Seiten, Kühlergitter an der Stirnseite, Bedienfeld mit Statuslampe, Tankanzeige und Leistungsschild vorn,
// hinten ein Auspuffrohr mit Schalldämpfer, das senkrecht nach oben führt.
// Vier Größen nach Leistung (kw 40/80/120/240, GENERATOR_SIZES): der 40er gelb wie bisher, der 80er etwas länger
// (orange), der 120er größer (grün), der 240er deutlich größer (blau) mit zwei Auspuffrohren.
// Reines Modell: Ursprung Mitte unten, Vorderseite +z, Auspuff hinten (−z). exhaustHeight: Höhe der Rohrmündung über
// dem Boden (im Technikraum bis knapp unter die Decke; ohne Angabe nur ein kurzer Stutzen, z. B. für die Vorschau).
// userData.housing: Haube samt Anbauten – world/backup-power.js lässt sie im Betrieb vibrieren.
// userData.setState({ running, diesel (Anteil 0 … 1), starting }) schaltet Lampe und Tankanzeige.
// userData.exhausts: x/z der Auspuffmündungen (Modellkoordinaten) · userData.size: Abmessungen w × h × d
import * as THREE from 'three';
import { box, cylinder, mat, rbox } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';

// Abmessungen und Farbe je Leistung (kW)
export const GENERATOR_SIZES = {
  40: { w: 2.3, h: 1.45, d: 1.0, color: 0xe2b21c, exhausts: 1 },
  80: { w: 2.5, h: 1.5, d: 1.05, color: 0xe0761c, exhausts: 1 },
  120: { w: 2.65, h: 1.65, d: 1.15, color: 0x3f9150, exhausts: 1 },
  240: { w: 2.8, h: 1.9, d: 1.3, color: 0x2f6aa3, exhausts: 2 },
};
export const GENERATOR_SIZE = { w: 2.3, h: 1.45, d: 1.0 }; // 40er (wie bisher)
// Größte Abmessungen (für die Stellplätze im Technikraum)
export const GENERATOR_MAX_SIZE = { w: 2.8, h: 1.9, d: 1.3 };

// Passende Größe zur Leistung (unbekannte Leistung: nächstkleinere Stufe)
export function generatorSize(kw = 40) {
  const steps = Object.keys(GENERATOR_SIZES).map(Number).sort((a, b) => a - b);
  const key = steps.filter((s) => s <= kw).at(-1) ?? steps[0];
  return { kw: key, ...GENERATOR_SIZES[key] };
}

let shared = null;
function materials() {
  if (shared) return shared;
  const lamp = (color, intensity) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  shared = {
    frame: mat(0x2c2f33, 0.6, 0.6),
    grille: new THREE.MeshStandardMaterial({ map: louvreTexture(), roughness: 0.7, metalness: 0.3 }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.6, metalness: 0.5 }),
    panel: mat(0x1b1e22, 0.5, 0.3),
    pipe: mat(0x8f8a84, 0.45, 0.8),
    muffler: mat(0x5b5752, 0.5, 0.7),
    off: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }),
    green: lamp(0x37e46a, 1.6),
    amber: lamp(0xffa21f, 1.6),
    red: lamp(0xf0473a, 1.4),
    gaugeBack: mat(0x0e1012, 0.6, 0.1),
    canopies: new Map(), // kW → Haube in der Modellfarbe
    labels: new Map(),   // kW → Schild „DIESEL 80 kW“
  };
  return shared;
}

function canopyMaterial(kw, color) {
  const m = materials();
  if (!m.canopies.has(kw)) m.canopies.set(kw, mat(color, 0.5, 0.3));
  return m.canopies.get(kw);
}

function labelMaterial(kw, tankLiters) {
  const m = materials();
  const key = `${kw}|${tankLiters}`;
  if (!m.labels.has(key)) m.labels.set(key, new THREE.MeshStandardMaterial({ map: labelTexture(kw, tankLiters), roughness: 0.6 }));
  return m.labels.get(key);
}

// Lüftungsgitter: waagrechte Lamellen (dunkelgrau, passt zu jeder Haubenfarbe)
function louvreTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#202225';
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 12) {
      ctx.fillStyle = '#5d6168';
      ctx.fillRect(0, y, w, 6);
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(0, y + 6, w, 2);
    }
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

// Kühlergitter: feines Raster
function radiatorTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5e6268';
    ctx.lineWidth = 2;
    for (let i = 0; i <= w; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

function labelTexture(kw, tankLiters) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1b1e22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f2ee';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`DIESEL ${kw} kW`, w / 2, 30);
    ctx.font = '16px sans-serif';
    ctx.fillText(`Notstromaggregat · Tank ${tankLiters} L`, w / 2, 54);
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

// Große Leistungszahl für die Haubenseite („240 kW“), gut lesbar aus dem Raum
function kwPlateTexture(kw) {
  return canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1b1e22';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#1b1e22';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${kw} kW`, w / 2, h / 2 + 3);
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

const TANK_BY_KW = { 40: 200, 80: 250, 120: 300, 240: 400 }; // nur für das Schild (Werte wie core/backup-power.js)

// kw: Leistung (bestimmt Größe, Farbe, Schild) · tankLiters: fürs Schild (Standard passend zur Leistung)
export function createGenerator({ exhaustHeight = null, kw = 40, tankLiters = null } = {}) {
  const m = materials();
  const size = generatorSize(kw);
  const { w, h, d } = size;
  const s = w / GENERATOR_SIZE.w;      // Maßstab entlang der Länge (40er = 1)
  const canopy = canopyMaterial(size.kw, size.color);
  const g = new THREE.Group();
  // Stahlrahmen (Grundrahmen mit Tank) steht still, die Haube vibriert
  const skidH = 0.16 * Math.min(1.3, h / GENERATOR_SIZE.h);
  g.add(box(w, skidH, d, m.frame, 0, skidH / 2, 0));
  for (const sx of [-1, 1]) g.add(box(0.12, 0.04, d + 0.04, m.frame, sx * (w / 2 - 0.25), 0.02, 0)); // Kufen
  const housing = new THREE.Group();
  housing.position.y = skidH;
  g.add(housing);
  const ch = h - skidH;
  const front = (d - 0.04) / 2;
  housing.add(rbox(w - 0.04, ch, d - 0.04, 0.04, canopy, 0, ch / 2, 0));
  // Lüftungsgitter vorn und hinten (lange Seiten), Kühler an der rechten Stirnseite; große Modelle haben mehr Gitter
  const grilles = w >= 2.6 ? [-0.9, -0.3, 0.32] : [-0.65, 0.05];
  const gh = 0.5 * (ch / (GENERATOR_SIZE.h - 0.16));
  for (const sz of [-1, 1]) {
    for (const x of grilles) housing.add(box(0.5, gh, 0.004, m.grille, x * s, ch * 0.52, sz * (front + 0.002)));
  }
  housing.add(box(0.004, ch * 0.7, d * 0.7, m.radiator, (w - 0.04) / 2 + 0.002, ch * 0.5, 0));
  // Leistungsschild an der linken Stirnseite (gut zu sehen, wenn man den Raum betritt)
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: kwPlateTexture(size.kw), roughness: 0.6 }));
  plate.rotation.y = -Math.PI / 2;
  plate.position.set(-(w - 0.04) / 2 - 0.003, ch * 0.62, 0);
  housing.add(plate);
  // Bedienfeld vorn rechts: Schild, Lampe, Tankanzeige
  const px = w / 2 - 0.43;
  const py = Math.min(ch * 0.55, 0.85);
  housing.add(box(0.5, 0.42, 0.02, m.panel, px, py, front + 0.01));
  housing.add(box(0.44, 0.11, 0.003, labelMaterial(size.kw, tankLiters ?? TANK_BY_KW[size.kw] ?? 200), px, py + 0.13, front + 0.022));
  const lamp = cylinder(0.025, 0.025, 0.02, 16, m.off, px - 0.15, py - 0.04, front + 0.03);
  lamp.rotation.x = Math.PI / 2;
  housing.add(lamp);
  // Tankanzeige: Balken, der mit dem Diesel wächst (scale.x)
  const gaugeW = 0.24;
  housing.add(box(gaugeW + 0.02, 0.05, 0.004, m.gaugeBack, px + 0.06, py - 0.04, front + 0.022));
  const gauge = box(gaugeW, 0.032, 0.004, m.green, px + 0.06, py - 0.04, front + 0.026);
  housing.add(gauge);
  // Tankdeckel oben links, Hebeösen
  housing.add(cylinder(0.05, 0.05, 0.04, 16, m.frame, -0.8 * s, ch + 0.02, d * 0.25));
  for (const sx of [-1, 1]) housing.add(box(0.06, 0.06, 0.02, m.frame, sx * 0.9 * s, ch + 0.03, 0));
  // Auspuff: Schalldämpfer oben hinten, Rohr bis zur Mündung (240er: zwei)
  const mz = -(d / 2) + 0.18;
  const mr = 0.11 * Math.min(1.35, d / GENERATOR_SIZE.d);
  const topY = Math.max(h + 0.35, exhaustHeight ?? h + 0.35);
  const riseFrom = h + 0.02 + mr;
  const mufflers = size.exhausts === 2 ? [-0.75 * s, -0.05 * s] : [-0.55 * s];
  const exhausts = [];
  for (const mx of mufflers) {
    const muffler = cylinder(mr, mr, 0.55, 20, m.muffler, mx, ch + 0.02 + mr, mz);
    muffler.rotation.z = Math.PI / 2;
    housing.add(muffler);
    housing.add(cylinder(0.05, 0.05, 0.12, 16, m.pipe, mx, ch + 0.02, mz));
    // Senkrechtes Rohr: am Rahmen (steht still), vom Schalldämpfer bis zur Mündung
    const rx = mx + 0.3;
    g.add(cylinder(0.055, 0.055, topY - riseFrom, 16, m.pipe, rx, riseFrom + (topY - riseFrom) / 2, mz));
    g.add(cylinder(0.075, 0.075, 0.08, 16, m.muffler, rx, topY - 0.04, mz)); // Regenkappe/Muffe oben
    if (exhaustHeight) {
      // Wandschellen alle ~0,8 m
      for (let y = riseFrom + 0.5; y < topY - 0.2; y += 0.8) g.add(box(0.14, 0.03, 0.1, m.frame, rx, y, mz - 0.05));
    }
    exhausts.push({ x: rx, z: mz });
  }

  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  // running: läuft · starting: springt gleich an (Lampe blinkt gelb, time in s) · diesel: Tankstand 0 … 1
  g.userData.setState = ({ running = false, starting = false, diesel = 1, time = 0 } = {}) => {
    const level = Math.min(1, Math.max(0, diesel));
    gauge.scale.x = Math.max(0.001, level);
    gauge.position.x = px + 0.06 - (gaugeW * (1 - level)) / 2;
    gauge.material = level < 0.15 ? m.red : level < 0.4 ? m.amber : m.green;
    const blink = Math.floor(time * 3) % 2 === 0;
    lamp.material = running ? m.green : starting ? (blink ? m.amber : m.off) : level <= 0 ? m.red : m.off;
  };
  g.userData.setState({});
  g.userData.housing = housing;
  g.userData.size = { w, h, d };
  g.userData.kw = size.kw;
  g.userData.exhausts = exhausts;
  return g;
}

// Der Generator kommt zerlegt in einem kompakten Karton (passt wie ein Serverschrank in den Abstellraum und in die
// Hand) – für alle Modelle gleich groß. models/furniture.js nimmt diese Form nur für die Kartongröße.
export const GENERATOR_CRATE = { w: 1.1, h: 1.0, d: 0.85 };
export function createGeneratorCrateShape() {
  const g = new THREE.Group();
  const { w, h, d } = GENERATOR_CRATE;
  g.add(box(w, h, d, canopyMaterial(40, GENERATOR_SIZES[40].color), 0, h / 2, 0));
  return g;
}
