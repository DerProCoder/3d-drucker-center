// Laser R1 in der Halle: die Holzplatte im Gerät und wie der Laser sie bearbeitet. Der Kopf fährt wie ein echter
// Laser erst alle Außenkonturen ab, dann alle Innenkonturen und – beim Gravieren – zuletzt die Füllung, Zeile für Zeile
// und nur dort, wo eingebrannt wird. Zwischen den Stücken fährt er mit ausgeschaltetem Strahl schnell hinüber.
// Reine Darstellung – Zeit und Fortschritt rechnet core/economy.js (advancePrints) ab.
import * as THREE from 'three';
import { SHEET_MM } from '../core/catalog.js';
import { laserDesign } from '../core/laser.js';
import { cutPlan, drawEngraving, drawGrain, engravePlan, orderLoops } from '../models/laser-art.js';

const PX_PER_MM = 2;        // Auflösung der Plattentextur
const SHEET_THICKNESS = 0.003;
// Geschwindigkeiten als Anteil der Höchstgeschwindigkeit des Lasers
const TRAVEL_SPEED = 1;     // Leerfahrten mit ausgeschaltetem Strahl: volle Geschwindigkeit
const FILL_SPEED = 0.35;    // Füllung Zeile für Zeile: 35 %
const OUTLINE_SPEED = 0.15; // Konturen (außenrum): 15 % – langsam und sauber
const OUTLINE_MM = 0.8;     // Strichbreite der Gravurkonturen
const KERF_MM = 1.6;        // Schnittbreite

// Holzplatte (und was darauf schon gelasert ist) passend zum Zustand des Lasers aufbauen. Aufrufen bei jeder
// Änderung des Spielstands (workshop.sync).
export function syncLaserWorkpiece(model, printer) {
  const job = printer.job;
  const source = job ?? (printer.sheet ? { laser: null, woodId: printer.sheet.woodId } : null);
  const key = source ? `${job ? 'job' : 'sheet'}|${source.woodId}|${source.laser}|${source.text ?? ''}|${source.motif ?? ''}` : null;
  const state = (model.userData.laserWork ??= { key: null });
  if (state.key === key) return;
  state.mesh?.parent.remove(state.mesh);
  state.texture?.dispose();
  for (const k of Object.keys(state)) delete state[k];
  state.key = key;
  if (!source) return;

  const design = laserDesign(source);
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_MM.x * PX_PER_MM;
  canvas.height = SHEET_MM.y * PX_PER_MM;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = design.wood.hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrain(ctx, PX_PER_MM, design.wood, design.sheet);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const side = new THREE.MeshStandardMaterial({ color: design.wood.hex, roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 });
  // BoxGeometry: Reihenfolge +x, -x, +y, -y, +z, -z – nur die Oberseite trägt die Textur
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(SHEET_MM.x / 1000, SHEET_THICKNESS, SHEET_MM.y / 1000), [side, side, top, side, side, side]);
  const rig = model.userData.printRig;
  mesh.position.set(0, rig.plateCenter.y - SHEET_THICKNESS / 2, 0);
  mesh.castShadow = mesh.receiveShadow = true;
  rig.partParent.add(mesh);
  Object.assign(state, { mesh, texture, ctx, design });
  if (!job) return;

  let plan;
  if (job.laser === 'cut') {
    plan = cutPlan(design);
  } else {
    state.engraving = document.createElement('canvas');
    state.engraving.width = canvas.width;
    state.engraving.height = canvas.height;
    const ectx = state.engraving.getContext('2d');
    drawEngraving(ectx, design, PX_PER_MM);
    plan = engravePlan(engraveMask(ectx, SHEET_MM.x, SHEET_MM.y), SHEET_MM.x, SHEET_MM.y);
  }
  Object.assign(state, buildMoves(plan, job.laser === 'cut' ? KERF_MM : OUTLINE_MM), { index: 0, offset: 0, done: 0 });
}

// Maske der Gravur, ein Wert pro mm: 1, wo eingebrannt wird
function engraveMask(ectx, cols, rows) {
  const { data, width } = ectx.getImageData(0, 0, cols * PX_PER_MM, rows * PX_PER_MM);
  const mask = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * PX_PER_MM + 1;
      const py = y * PX_PER_MM + 1;
      mask[y * cols + x] = data[(py * width + px) * 4 + 3] > 100 ? 1 : 0;
    }
  }
  return mask;
}

// Fahrplan → Liste von Strecken { kind: 'line' | 'fill' | 'travel', a, b, len, weight, width?, h? } in mm.
// weight: Zeit pro mm (1 / Geschwindigkeit) – Konturen am langsamsten, Leerfahrten am schnellsten
// Reihenfolge: Außenkonturen, Innenkonturen, Füllzeilen; dazwischen Leerfahrten.
function buildMoves({ outer, inner, spans }, lineWidth) {
  const moves = [];
  let at = [0, 0];
  const go = (kind, b, extra = {}) => {
    const len = Math.hypot(b[0] - at[0], b[1] - at[1]);
    const weight = 1 / (kind === 'travel' ? TRAVEL_SPEED : kind === 'line' ? OUTLINE_SPEED : FILL_SPEED);
    if (len > 1e-6) moves.push({ kind, a: at, b, len, weight, ...extra });
    at = b;
  };
  for (const loops of [outer, inner]) {
    for (const loop of orderLoops(loops, at)) {
      go('travel', loop[0]);
      for (let i = 1; i <= loop.length; i++) go('line', loop[i % loop.length], { width: lineWidth });
    }
  }
  for (const span of spans) {
    go('travel', [span.x0, span.y]);
    go('fill', [span.x1, span.y], { h: span.h });
  }
  return { moves, total: moves.reduce((sum, m) => sum + m.len * m.weight, 0) };
}

// Jedes Bild: Laserkopf bewegen, Strahl schalten, bis zum aktuellen Fortschritt zeichnen.
// Gibt den Zustand für die Kopfbewegung zurück ({ mode, x, z } wie bei den Druckern, fürs Surren).
export function animateLaser(model, printer) {
  const job = printer.job;
  const rig = model.userData.printRig;
  const { beam, glow } = model.userData.laser;
  const work = model.userData.laserWork;
  const active = job && job.status !== 'done' && work?.moves;
  const state = { mode: active ? 'printing' : 'idle', x: 0, z: 0 };
  let burning = false;

  if (active) {
    const step = advance(work, job.progress);
    burning = step.burning;
    // Platte (mm, Ursprung oben links) → Bett (m, Ursprung in der Mitte, +z nach vorn)
    state.x = step.point[0] / 1000 - SHEET_MM.x / 2000;
    state.z = step.point[1] / 1000 - SHEET_MM.y / 2000;
  } else if (job?.status === 'done' && work?.moves && !work.finished) {
    // Fertig: alles zeigen (z. B. wenn der Spielstand mit einem fertigen Auftrag geladen wurde)
    advance(work, 1);
    if (work.engraving) work.ctx.drawImage(work.engraving, 0, 0); // auch die weichen Ränder der Gravur
    work.texture.needsUpdate = true;
    work.finished = true;
  }
  // Strahl nur, solange wirklich gelasert wird – nicht bei Leerfahrten und nicht in der Pause
  const firing = active && job.status === 'printing' && burning;
  beam.visible = firing;
  glow.visible = firing;
  rig.pose(state);
  return state;
}

// Fahrplan bis zum Fortschritt progress abarbeiten und dabei Konturen bzw. Füllung aufs Holz bringen.
// Gibt { point, burning } zurück: wo der Kopf steht und ob er dort gerade lasert.
function advance(work, progress) {
  const target = work.total * Math.min(1, progress);
  const { moves, ctx } = work;
  let drew = false;
  while (work.done < target - 1e-9 && work.index < moves.length) {
    const m = moves[work.index];
    const take = Math.min((m.len - work.offset) * m.weight, target - work.done);
    const from = work.offset;
    work.offset += take / m.weight;
    work.done += take;
    if (m.kind !== 'travel') {
      drawMove(work, m, from / m.len, work.offset / m.len);
      drew = true;
    }
    if (work.offset >= m.len - 1e-9) {
      work.index++;
      work.offset = 0;
    }
  }
  if (drew) work.texture.needsUpdate = true;
  const m = moves[Math.min(work.index, moves.length - 1)];
  if (!m) return { point: [0, 0], burning: false };
  const t = work.index >= moves.length ? 1 : work.offset / m.len;
  return { point: [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t], burning: m.kind !== 'travel' };
}

// Ein Stück einer Strecke aufs Holz bringen (t0…t1 von 0 bis 1): Konturen als dunkle Linie,
// Füllung als Streifen aus dem fertigen Gravurbild
function drawMove(work, m, t0, t1) {
  const { ctx } = work;
  const x0 = (m.a[0] + (m.b[0] - m.a[0]) * t0) * PX_PER_MM;
  const y0 = (m.a[1] + (m.b[1] - m.a[1]) * t0) * PX_PER_MM;
  const x1 = (m.a[0] + (m.b[0] - m.a[0]) * t1) * PX_PER_MM;
  const y1 = (m.a[1] + (m.b[1] - m.a[1]) * t1) * PX_PER_MM;
  if (m.kind === 'line') {
    ctx.strokeStyle = work.design.wood.burn;
    ctx.lineWidth = m.width * PX_PER_MM;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    return;
  }
  // Füllzeile: genau dieses Stück der Gravur freilegen
  const left = Math.floor(Math.min(x0, x1));
  const width = Math.ceil(Math.abs(x1 - x0)) + 1;
  const top = Math.floor((m.a[1] - m.h / 2) * PX_PER_MM);
  const height = Math.ceil(m.h * PX_PER_MM) + 1;
  ctx.drawImage(work.engraving, left, top, width, height, left, top, width, height);
}
