// Unbewegliche Einzelteile zusammenführen: Ein Drucker besteht aus Hunderten kleiner Meshes (Schrauben, Leisten,
// Lüftungsschlitze …), und jedes kostet die Grafikkarte einen eigenen Draw Call – im Bild und noch einmal in der
// Schattenkarte. mergeStatic() fasst alle Meshes mit demselben Material zu einem einzigen zusammen.
//
// Was getrennt bleibt (und darin für sich zusammengeführt wird):
//   - Objekte, die in irgendeinem userData stehen (z. B. printRig.head, flexTubes, userData.moving: [...]) –
//     so bleiben alle Teile erhalten, die Animationen bewegen, ein- und ausblenden oder umfärben
//   - Objekte mit eigenem userData (Interaktion, Spulenfarbe …), außer noShadow/noBounds
//   - Lichter, Sprites, Linien, InstancedMesh und SkinnedMesh werden nicht angefasst
// Was sich bewegt, ohne irgendwo in userData zu stehen (nur in einer Closure), muss in userData.moving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NEUTRAL_KEYS = new Set(['noShadow', 'noBounds']);
const PLAIN_TYPES = new Set(['Group', 'Object3D', 'Mesh']);
const defaultRaycast = THREE.Mesh.prototype.raycast;
const defaultBeforeRender = THREE.Object3D.prototype.onBeforeRender;

// Alle Objekte, auf die irgendein userData (auch verschachtelt) zeigt
function collectReferenced(root) {
  const referenced = new Set();
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) return;
    seen.add(value);
    if (value.isObject3D) {
      referenced.add(value);
      return;
    }
    if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (value.constructor === Object) Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  root.traverse((o) => visit(o.userData, 0));
  return referenced;
}

const hasOwnData = (o) => Object.keys(o.userData).some((k) => !NEUTRAL_KEYS.has(k));

// Mehrere Würfel zeigen auf dieselbe Geometrie (z. B. Lüfterblätter) – vor dem Verschieben kopieren
function bakedGeometry(mesh, matrix) {
  const source = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    if (source.attributes[name]) geo.setAttribute(name, source.attributes[name].clone());
  }
  if (source.index) geo.setIndex(source.index.clone());
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.applyMatrix4(matrix);
  // Gespiegelte Teile (negative Skalierung): Dreiecke umdrehen, sonst zeigt die Vorderseite nach innen
  if (matrix.determinant() < 0) flipWinding(geo);
  return geo;
}

function flipWinding(geo) {
  if (geo.index) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    return;
  }
  for (const attr of Object.values(geo.attributes)) {
    const { array, itemSize } = attr;
    for (let v = 0; v < attr.count; v += 3) {
      for (let k = 0; k < itemSize; k++) {
        const a = (v + 1) * itemSize + k;
        const b = (v + 2) * itemSize + k;
        [array[a], array[b]] = [array[b], array[a]];
      }
    }
  }
}

// root: Gruppe, deren unbewegliche Teile verschmolzen werden.
// cell: Kantenlänge (m) eines Rasters – große Räume werden pro Feld zusammengefasst, damit Teile außerhalb des
// Bildes weiter weggelassen werden können und der Klickstrahl nicht jedes Dreieck der Halle prüfen muss.
export function mergeStatic(root, { cell = 0 } = {}) {
  const referenced = collectReferenced(root);
  const separate = (o) => referenced.has(o) || hasOwnData(o) || !PLAIN_TYPES.has(o.type);
  mergeInto(root, separate, cell);
  return root;
}

function mergeInto(root, separate, cell) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const center = new THREE.Vector3();

  const walk = (node) => {
    for (const child of node.children) {
      if (separate(child)) {
        mergeInto(child, separate, cell);
        continue;
      }
      walk(child);
      if (!isMergeable(child)) continue;
      const geo = child.geometry;
      const attrs = ['position', 'normal', 'uv', 'color'].filter((n) => geo.attributes[n] || n === 'normal').join(',');
      let key = [child.material.uuid, child.castShadow, child.receiveShadow, child.renderOrder, child.frustumCulled,
        !!child.userData.noBounds, !!child.userData.noShadow, attrs].join('|');
      if (cell) {
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        center.copy(geo.boundingSphere.center).applyMatrix4(child.matrixWorld);
        key += `|${Math.floor(center.x / cell)},${Math.floor(center.z / cell)}`;
      }
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(child);
    }
  };
  walk(root);

  const matrix = new THREE.Matrix4();
  const emptied = new Set();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    let geos = meshes.map((m) => bakedGeometry(m, matrix.multiplyMatrices(toRoot, m.matrixWorld)));
    // Gemischt mit und ohne Index lässt sich nicht verschmelzen
    if (geos.some((g) => g.index) && geos.some((g) => !g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    Object.assign(mesh, {
      castShadow: first.castShadow, receiveShadow: first.receiveShadow, renderOrder: first.renderOrder,
      frustumCulled: first.frustumCulled, matrixAutoUpdate: false,
    });
    if (first.userData.noBounds) mesh.userData.noBounds = true;
    if (first.userData.noShadow) mesh.userData.noShadow = true;
    for (const m of meshes) {
      emptied.add(m.parent);
      m.removeFromParent();
    }
    root.add(mesh);
  }
  // Zwischengruppen, die dadurch leer geworden sind, fallen weg (leere Gruppen von Anfang an bleiben –
  // manche Module füllen sie erst später)
  for (let group of emptied) {
    while (group !== root && !group.children.length && !separate(group)) {
      const parent = group.parent;
      group.removeFromParent();
      group = parent;
    }
  }
}

function isMergeable(o) {
  return o.isMesh && o.type === 'Mesh' && o.visible && !o.children.length && !Array.isArray(o.material)
    && o.material.visible && o.geometry.attributes.position && !o.geometry.morphAttributes.position
    && o.raycast === defaultRaycast && o.onBeforeRender === defaultBeforeRender;
}
