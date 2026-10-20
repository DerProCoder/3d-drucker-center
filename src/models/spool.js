// Filamentspule (1 kg, Ø 200 mm, 70 mm breit). Achse entlang x, Ursprung in der Mitte.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RADIUS = 0.1;
const WIDTH = 0.07;

let shared = null;

// Teile einer Spule als fertige Geometrie in Spulen-Koordinaten (Achse entlang x). Statt neun Meshes pro Spule
// gibt es nur noch vier Draw Calls: Wicklung (Mantel + Stirnflächen), Seitenscheiben, Rest (Nabe, Löcher, Etikett).
function getShared() {
  if (shared) return shared;
  // Wicklung: feine Rillen quer zur Spulenachse
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 64; y++) {
    ctx.fillStyle = y % 2 ? '#ffffff' : '#c8c8c8';
    ctx.fillRect(0, y, 4, 1);
  }
  const winding = new THREE.CanvasTexture(canvas);
  winding.colorSpace = THREE.SRGBColorSpace;

  const toAxisX = new THREE.Matrix4().makeRotationZ(Math.PI / 2); // Zylinderachse y → x
  const part = (geo, matrix = new THREE.Matrix4()) => geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toAxisX, matrix));

  // etwas schmaler als der Abstand der Seitenscheiben, sonst flackern die Flächen (gleiche Ebene).
  // Die beiden Stirnflächen bilden zusammen eine Gruppe (ein Draw Call für Mantel, einer für beide Deckel).
  const coreGeo = part(new THREE.CylinderGeometry(RADIUS * 0.86, RADIUS * 0.86, WIDTH - 0.012, 48));
  const [side, top, bottom] = coreGeo.groups;
  coreGeo.clearGroups();
  coreGeo.addGroup(side.start, side.count, 0);
  coreGeo.addGroup(top.start, top.count + bottom.count, 1);

  const flangeGeo = mergeGeometries([-1, 1].map((sideSign) => part(
    new THREE.CylinderGeometry(RADIUS, RADIUS, 0.005, 48),
    new THREE.Matrix4().makeTranslation(0, sideSign * (WIDTH / 2 - 0.0025), 0),
  )));

  // Nabe, Löcher und Etikett mit Vertexfarben in einem Material
  const colored = (geo, hex) => {
    const c = new THREE.Color(hex);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo.index ? geo.toNonIndexed() : geo;
  };
  const restGeo = mergeGeometries([
    colored(part(new THREE.CylinderGeometry(0.03, 0.03, WIDTH + 0.002, 24)), 0x3a3c40),
    ...[-1, 1].map((sideSign) => colored(part(
      new THREE.CircleGeometry(0.027, 24),
      new THREE.Matrix4().makeTranslation(0, sideSign * (WIDTH / 2 + 0.0002), 0).multiply(new THREE.Matrix4().makeRotationX(sideSign * -Math.PI / 2)),
    ), 0x050505)),
    // Etikett auf der +x-Seite (nach der Drehung um z nicht mehr drehen – deshalb direkt in Spulen-Koordinaten)
    colored(new THREE.PlaneGeometry(0.05, 0.03)
      .applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .applyMatrix4(new THREE.Matrix4().makeTranslation(WIDTH / 2 + 0.0003, 0.06, 0)), 0xf2f2f2),
  ]);

  shared = {
    winding,
    coreGeo,
    flangeGeo,
    restGeo,
    // Seitenscheiben leicht durchsichtig (Klarsicht-Spule), damit die Filamentfarbe durchscheint
    flangeMat: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.3, transparent: true, opacity: 0.45 }),
    restMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    filamentMats: new Map(),
  };
  return shared;
}

// Glow-Filament leuchtet bei Licht nur leicht nach, im Dunkeln (Hallenlicht aus, siehe world/hall-lights.js) so
// hell, dass der Bloom-Effekt es glühen lässt. Die Stärke gilt für alle Glow-Materialien gemeinsam (setGlowDark).
const GLOW_INTENSITY = { lit: 0.75, dark: 3 };
let glowIntensity = GLOW_INTENSITY.lit;

// Materialwerte je Sorte (filament.finish aus core/catalog.js): Matte schluckt Licht, Silk+ glänzt metallisch,
// Glow leuchtet nach, Translucent lässt Licht durch. roughness: Wert für normales Filament.
export function finishProps(filament, roughness) {
  switch (filament.finish) {
    case 'matte': return { roughness: 0.92 };
    case 'silk': return { roughness: 0.2, metalness: 0.55 };
    case 'glow': return { roughness, emissive: filament.hex, emissiveIntensity: glowIntensity, userData: { glow: true } };
    case 'translucent': return { roughness: 0.15, transparent: true, opacity: 0.7 };
    default: return { roughness };
  }
}

// Alle Glow-Materialien unter root (und die zwischengespeicherten Spulen-Materialien) hell oder dunkel leuchten lassen.
// Neue Materialien übernehmen die aktuelle Stärke über finishProps.
export function setGlowDark(dark, root) {
  const value = dark ? GLOW_INTENSITY.dark : GLOW_INTENSITY.lit;
  if (value === glowIntensity) return;
  glowIntensity = value;
  const apply = (material) => {
    if (material?.userData.glow) material.emissiveIntensity = value;
  };
  for (const mats of shared?.filamentMats.values() ?? []) mats.forEach(apply);
  root.traverse((o) => {
    if (Array.isArray(o.material)) o.material.forEach(apply);
    else apply(o.material);
  });
}

// Materialien für den Wickelkörper: [Mantel mit Rillen, Deckflächen]
function filamentMaterials(filament) {
  const s = getShared();
  if (!s.filamentMats.has(filament.id)) {
    const base = { color: filament.hex, ...finishProps(filament, 0.35) };
    const side = new THREE.MeshStandardMaterial({ ...base, map: s.winding });
    const cap = new THREE.MeshStandardMaterial(base); // ohne Rillen, sonst flimmert die Stirnseite
    s.filamentMats.set(filament.id, [side, cap]);
  }
  return s.filamentMats.get(filament.id);
}

export function createSpool(filament) {
  const s = getShared();
  const spool = new THREE.Group();
  spool.add(
    new THREE.Mesh(s.coreGeo, filamentMaterials(filament)),
    new THREE.Mesh(s.flangeGeo, s.flangeMat),
    new THREE.Mesh(s.restGeo, s.restMat),
  );
  spool.userData.filament = filament;
  return spool;
}

// Viele Spulen auf einmal (Lagerregal, Filament-Regal): pro Teil ein InstancedMesh für alle Spulen, die Wicklung
// eines pro Filament – statt neun Draw Calls pro Spule nur noch wenige für das ganze Regal.
// items: [{ filament, position, rotationY, interaction }] – interaction wie bei world/interaction.js, gilt für
// die angeklickte Spule (der Klickstrahl liefert die Nummer der Instanz).
export function createSpoolBatch(items) {
  const s = getShared();
  const group = new THREE.Group();
  if (!items.length) return group;
  const matrices = items.map(({ position, rotationY = 0 }) => new THREE.Matrix4().compose(
    position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY), new THREE.Vector3(1, 1, 1),
  ));

  const add = (geometry, material, indices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    indices.forEach((item, i) => mesh.setMatrixAt(i, matrices[item]));
    mesh.computeBoundingSphere();
    const itemAt = (hit) => items[indices[hit?.instanceId]]?.interaction;
    mesh.userData.interaction = {
      hint: (hit) => itemAt(hit)?.hint(hit) ?? null,
      action: (hit) => itemAt(hit)?.action?.(hit),
    };
    group.add(mesh);
  };

  const all = items.map((_, i) => i);
  add(s.flangeGeo, s.flangeMat, all);
  add(s.restGeo, s.restMat, all);
  const byFilament = new Map();
  items.forEach((item, i) => {
    if (!byFilament.has(item.filament.id)) byFilament.set(item.filament.id, []);
    byFilament.get(item.filament.id).push(i);
  });
  for (const [, indices] of byFilament) add(s.coreGeo, filamentMaterials(items[indices[0]].filament), indices);
  return group;
}
