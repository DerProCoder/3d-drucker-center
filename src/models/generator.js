// Dieselgenerator (#59, Logik in core/backup-power.js): gelbe Schallschutzhaube auf einem Stahlrahmen, Lüftungsgitter
// an den Seiten, Kühlergitter an der Stirnseite, Bedienfeld mit Statuslampe und Tankanzeige vorn, hinten ein
// Auspuffrohr mit Schalldämpfer, das senkrecht nach oben führt.
// Reines Modell: Ursprung Mitte unten, Vorderseite +z, Auspuff hinten (−z). exhaustHeight: Höhe der Rohrmündung über
// dem Boden (im Technikraum bis knapp unter die Decke; ohne Angabe nur ein kurzer Stutzen, z. B. für die Kartongröße).
// userData.housing: Haube samt Anbauten – world/backup-power.js lässt sie im Betrieb vibrieren.
// userData.setState({ running, diesel (Anteil 0 … 1), starting }) schaltet Lampe und Tankanzeige.
import * as THREE from 'three';
import { box, cylinder, mat, rbox } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';

export const GENERATOR_SIZE = { w: 2.3, h: 1.45, d: 1.0 };

let shared = null;
function materials() {
  if (shared) return shared;
  const lamp = (color, intensity) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  shared = {
    frame: mat(0x2c2f33, 0.6, 0.6),
    canopy: mat(0xe2b21c, 0.5, 0.3),
    grille: new THREE.MeshStandardMaterial({ map: louvreTexture(), roughness: 0.7, metalness: 0.3 }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.6, metalness: 0.5 }),
    panel: mat(0x1b1e22, 0.5, 0.3),
    pipe: mat(0x8f8a84, 0.45, 0.8),
    muffler: mat(0x5b5752, 0.5, 0.7),
    label: new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.6 }),
    off: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }),
    green: lamp(0x37e46a, 1.6),
    amber: lamp(0xffa21f, 1.6),
    red: lamp(0xf0473a, 1.4),
    gaugeBack: mat(0x0e1012, 0.6, 0.1),
  };
  return shared;
}

// Lüftungsgitter: waagrechte Lamellen
function louvreTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2b2d30';
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 12) {
      ctx.fillStyle = '#c99d15';
      ctx.fillRect(0, y, w, 6);
      ctx.fillStyle = '#8a6c0e';
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

function labelTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1b1e22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f2ee';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DIESEL 40 kW', w / 2, 30);
    ctx.font = '16px sans-serif';
    ctx.fillText('Notstromaggregat · Tank 200 L', w / 2, 54);
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

export function createGenerator({ exhaustHeight = null } = {}) {
  const m = materials();
  const { w, h, d } = GENERATOR_SIZE;
  const g = new THREE.Group();
  // Stahlrahmen (Grundrahmen mit Tank) steht still, die Haube vibriert
  const skidH = 0.16;
  g.add(box(w, skidH, d, m.frame, 0, skidH / 2, 0));
  for (const sx of [-1, 1]) g.add(box(0.12, 0.04, d + 0.04, m.frame, sx * (w / 2 - 0.25), 0.02, 0)); // Kufen
  const housing = new THREE.Group();
  housing.position.y = skidH;
  g.add(housing);
  const ch = h - skidH;
  housing.add(rbox(w - 0.04, ch, d - 0.04, 0.04, m.canopy, 0, ch / 2, 0));
  // Lüftungsgitter vorn und hinten (lange Seiten), Kühler an der rechten Stirnseite
  for (const sz of [-1, 1]) {
    for (const x of [-0.65, 0.05]) housing.add(box(0.55, 0.5, 0.004, m.grille, x, ch * 0.52, sz * ((d - 0.04) / 2 + 0.002)));
  }
  const radiator = box(0.004, ch * 0.7, d * 0.7, m.radiator, (w - 0.04) / 2 + 0.002, ch * 0.5, 0);
  housing.add(radiator);
  // Bedienfeld vorn rechts: Schild, Lampe, Tankanzeige
  const px = 0.72;
  housing.add(box(0.5, 0.42, 0.02, m.panel, px, ch * 0.55, (d - 0.04) / 2 + 0.01));
  housing.add(box(0.44, 0.11, 0.003, m.label, px, ch * 0.55 + 0.13, (d - 0.04) / 2 + 0.022));
  const lamp = cylinder(0.025, 0.025, 0.02, 16, m.off, px - 0.15, ch * 0.55 - 0.04, (d - 0.04) / 2 + 0.03);
  lamp.rotation.x = Math.PI / 2;
  housing.add(lamp);
  // Tankanzeige: Balken, der mit dem Diesel wächst (scale.x)
  const gaugeW = 0.24;
  housing.add(box(gaugeW + 0.02, 0.05, 0.004, m.gaugeBack, px + 0.06, ch * 0.55 - 0.04, (d - 0.04) / 2 + 0.022));
  const gauge = box(gaugeW, 0.032, 0.004, m.green, px + 0.06, ch * 0.55 - 0.04, (d - 0.04) / 2 + 0.026);
  housing.add(gauge);
  // Tankdeckel oben links, Hebeösen
  housing.add(cylinder(0.05, 0.05, 0.04, 16, m.frame, -0.8, ch + 0.02, 0.25));
  for (const sx of [-1, 1]) housing.add(box(0.06, 0.06, 0.02, m.frame, sx * 0.9, ch + 0.03, 0));
  // Auspuff: Schalldämpfer oben hinten, Rohr bis zur Mündung
  const mx = -0.55;
  const mz = -(d / 2) + 0.18;
  const muffler = cylinder(0.11, 0.11, 0.55, 20, m.muffler, mx, ch + 0.13, mz);
  muffler.rotation.z = Math.PI / 2;
  housing.add(muffler);
  housing.add(cylinder(0.05, 0.05, 0.12, 16, m.pipe, mx, ch + 0.02, mz));
  // Senkrechtes Rohr: am Rahmen (steht still), vom Schalldämpfer bis zur Mündung
  const topY = Math.max(h + 0.35, exhaustHeight ?? h + 0.35);
  const rx = mx + 0.3;
  const riseFrom = h + 0.13;
  g.add(cylinder(0.055, 0.055, topY - riseFrom, 16, m.pipe, rx, riseFrom + (topY - riseFrom) / 2, mz));
  g.add(cylinder(0.075, 0.075, 0.08, 16, m.muffler, rx, topY - 0.04, mz)); // Regenkappe/Muffe oben
  if (exhaustHeight) {
    // Wandschellen alle ~0,8 m
    for (let y = riseFrom + 0.5; y < topY - 0.2; y += 0.8) g.add(box(0.14, 0.03, 0.1, m.frame, rx, y, mz - 0.05));
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
  g.userData.size = { ...GENERATOR_SIZE };
  return g;
}

// Der Generator kommt zerlegt in einem kompakten Karton (passt wie ein Serverschrank in den Abstellraum und in die
// Hand). models/furniture.js nimmt diese Form nur für die Kartongröße.
export const GENERATOR_CRATE = { w: 1.1, h: 1.0, d: 0.85 };
export function createGeneratorCrateShape() {
  const g = new THREE.Group();
  const { w, h, d } = GENERATOR_CRATE;
  g.add(box(w, h, d, materials().canopy, 0, h / 2, 0));
  return g;
}
