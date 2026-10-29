// Menschen: animierte Figuren von Quaternius („Ultimate Modular Men/Women“, siehe README) als GLB unter
// assets/people/. Jede Datei bringt ihre eigenen Animationen mit (Idle, Idle_Neutral, Walk, Run, Interact, Wave).
// Sitzen, Tragen und Controller-Halten gibt es als Clip nicht – diese Posen setzt Person selbst über die Knochen,
// jeweils nach dem Abspielen der Animation. Figuren werden erst geladen, wenn jemand sie braucht.
// Für Menschenmengen (Besuchergruppen, world/visitors.js) gibt es eine sparsame Fassung: alle Teile einer Figur zu
// einem Mesh zusammengefasst, Farben in den Ecken statt eigener Materialien, ein Material für alle, keine Schatten.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// gender: 'm' | 'w' · roles: wofür die Figur passt (staff = Azubi, customer = Kunde, passer = Passant,
// visitor = Besuchergruppe, pupil = auch als Schulkind, dann kleiner skaliert)
export const PEOPLE = [
  { id: 'casual-man', gender: 'm', roles: ['staff', 'customer', 'passer', 'visitor', 'pupil'] },
  { id: 'hoodie-man', gender: 'm', roles: ['staff', 'customer', 'passer', 'visitor', 'pupil'] },
  { id: 'punk-man', gender: 'm', roles: ['staff', 'passer', 'visitor', 'pupil'] },
  { id: 'business-man', gender: 'm', roles: ['customer', 'passer', 'visitor'] },
  { id: 'worker-man', gender: 'm', roles: ['customer', 'passer'] },
  { id: 'farmer-man', gender: 'm', roles: ['customer', 'passer', 'visitor'] },
  { id: 'beach-man', gender: 'm', roles: ['passer', 'visitor', 'pupil'] },
  { id: 'casual-woman', gender: 'w', roles: ['staff', 'customer', 'passer', 'visitor', 'pupil'] },
  { id: 'punk-woman', gender: 'w', roles: ['staff', 'customer', 'passer', 'visitor', 'pupil'] },
  { id: 'formal-woman', gender: 'w', roles: ['customer', 'passer', 'visitor'] },
  { id: 'suit-woman', gender: 'w', roles: ['customer', 'passer', 'visitor'] },
  { id: 'worker-woman', gender: 'w', roles: ['customer', 'passer', 'visitor'] },
];

export const peopleFor = (role, gender = null) => PEOPLE.filter((p) => p.roles.includes(role) && (!gender || p.gender === gender));

const loader = new GLTFLoader();
const cache = new Map(); // id → Promise<gltf>
const loadedListeners = new Set();

// Rückruf, sobald eine neue Figur geladen ist (z. B. um ihre Shader vorab zu übersetzen)
export function onPersonLoaded(listener) {
  loadedListeners.add(listener);
}

function load(id) {
  if (!cache.has(id)) {
    const url = new URL(`../../assets/people/${id}.glb`, import.meta.url).href;
    const promise = loader.loadAsync(url);
    promise.then(() => { for (const listener of loadedListeners) listener(id); }, () => {});
    cache.set(id, promise);
  }
  return cache.get(id);
}

// Figur laden und eine eigene Kopie (eigenes Skelett) anlegen
export async function createPerson(id) {
  return new Person(await load(id));
}

// ---------- Menschenmenge: zusammengefasste Figuren ----------

// Ein Material für alle Figuren einer Menge – die Farben stecken in den Ecken. Matt wie bei Person; Lambert statt PBR,
// weil die Figuren in der Halle sonst je Pixel teuer werden (viele Lampen).
const crowdMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const crowdTemplates = new Map(); // id → Promise<{ scene, animations }>
const crowdReady = new Map();     // id → { scene, animations }, sobald fertig

// Alle Teile einer Figur (je Material ein SkinnedMesh, teils mit eigenem Skelett) zu einem SkinnedMesh mit einem
// Skelett zusammenfassen: ein Draw Call statt zehn, ein Knochensatz statt vier. Die Farbe des Materials wandert in die
// Ecken. Geometrie und Material teilen sich danach alle Kopien.
function mergeFigure(gltf) {
  const scene = SkeletonUtils.clone(gltf.scene);
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const bones = [];
  const inverses = [];
  const parts = [];
  for (const mesh of meshes) {
    // Knochen dieses Teils auf den gemeinsamen Knochensatz abbilden
    // Teile können in einer anderen Ruhelage gebunden sein (andere Inverse je Knochen). Unterscheiden sie sich für alle
    // Knochen um dieselbe Verschiebung/Drehung, wird die Geometrie des Teils einfach mit umgerechnet.
    const ownInverses = mesh.skeleton.boneInverses;
    let offset = null; // Ruhelage des Teils → gemeinsame Ruhelage
    const map = mesh.skeleton.bones.map((bone, i) => {
      let k = bones.indexOf(bone);
      if (k < 0) {
        k = bones.push(bone) - 1;
        inverses.push(ownInverses[i].clone());
      } else {
        offset ??= inverses[k].clone().invert().multiply(ownInverses[i]);
      }
      return k;
    });
    const src = mesh.geometry;
    const n = src.attributes.position.count;
    if (offset) {
      // Nur Knochen prüfen, die das Teil wirklich bewegen
      const check = new THREE.Matrix4();
      const used = new Set();
      const si0 = src.attributes.skinIndex;
      const sw0 = src.attributes.skinWeight;
      for (let v = 0; v < n; v++) {
        for (let c = 0; c < 4; c++) if (sw0.getComponent(v, c) > 0) used.add(si0.getComponent(v, c));
      }
      for (const i of used) {
        check.copy(inverses[map[i]]).invert().multiply(ownInverses[i]);
        if (check.elements.some((e, j) => Math.abs(e - offset.elements[j]) > 1e-3)) {
          throw new Error('Figur lässt sich nicht zusammenfassen (Ruheposen verschieden)');
        }
      }
    }
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', src.attributes.position.clone());
    part.setAttribute('normal', src.attributes.normal.clone());
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const si = src.attributes.skinIndex;
    const sw = src.attributes.skinWeight;
    for (let v = 0; v < n; v++) {
      const k = v * 4;
      skinIndex[k] = map[si.getX(v)];
      skinIndex[k + 1] = map[si.getY(v)];
      skinIndex[k + 2] = map[si.getZ(v)];
      skinIndex[k + 3] = map[si.getW(v)];
      skinWeight[k] = sw.getX(v);
      skinWeight[k + 1] = sw.getY(v);
      skinWeight[k + 2] = sw.getZ(v);
      skinWeight[k + 3] = sw.getW(v);
    }
    part.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    part.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const colors = new Float32Array(n * 3);
    const c = mesh.material.color;
    const own = mesh.material.vertexColors ? src.attributes.color : null;
    for (let v = 0; v < n; v++) {
      colors[v * 3] = own ? c.r * own.getX(v) : c.r;
      colors[v * 3 + 1] = own ? c.g * own.getY(v) : c.g;
      colors[v * 3 + 2] = own ? c.b * own.getZ(v) : c.b;
    }
    part.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (src.index) part.setIndex(src.index.clone());
    part.applyMatrix4(offset ? offset.multiply(mesh.bindMatrix) : mesh.bindMatrix); // in die gemeinsame Ruhelage
    parts.push(part);
  }
  const indexed = parts.every((p) => p.index);
  const geometry = mergeGeometries(indexed ? parts : parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const mesh of meshes) mesh.removeFromParent();
  const merged = new THREE.SkinnedMesh(geometry, crowdMaterial);
  merged.name = 'crowd-figure';
  scene.add(merged);
  scene.updateMatrixWorld(true);
  merged.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  // Hülle einmal hier berechnen (wie in Person: großzügig) – Kopien übernehmen sie
  merged.skeleton.update();
  merged.computeBoundingSphere();
  merged.boundingSphere.radius *= 2;
  return { scene, animations: gltf.animations };
}

// Lässt sich eine Figur nicht zusammenfassen: eigene Kopie mit einmal kopierten, matten Materialien (wie in Person),
// die sich alle Kopien der Menge teilen. Die Originale im Zwischenspeicher bleiben unberührt – Azubis, Kunden und
// Passanten klonen sie weiterhin für sich.
function fallbackFigure(gltf) {
  const scene = SkeletonUtils.clone(gltf.scene);
  const copies = new Map();
  const matte = (m) => {
    if (!copies.has(m)) {
      const copy = m.clone();
      copy.metalness = 0;
      copy.roughness = 0.85;
      copies.set(m, copy);
    }
    return copies.get(m);
  };
  scene.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(matte) : matte(o.material);
  });
  return { scene, animations: gltf.animations };
}

// Das Zusammenfassen kostet je Figur einige Millisekunden. Damit mehrere Figuren nicht in einem Stück laufen (langer
// Ruckler), kommt jede einzeln dran, wenn der Browser gerade Luft hat (requestIdleCallback, sonst kurz nach dem
// nächsten Bild) – nacheinander über eine Warteschlange.
let mergeQueue = Promise.resolve();
const whenIdle = () => new Promise((resolve) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 200 });
  else setTimeout(resolve, 16);
});

// Zusammengefasste Figuren laden (z. B. vor der Ankunft einer Besuchergruppe), damit es dann nicht ruckelt
export function loadCrowd(ids) {
  return Promise.all(ids.map((id) => {
    if (!crowdTemplates.has(id)) {
      const promise = load(id).then((gltf) => {
        const merged = mergeQueue.then(whenIdle).then(() => {
          let template;
          try {
            template = mergeFigure(gltf);
          } catch (err) {
            console.warn(`${id}: Figur nicht zusammengefasst`, err);
            template = fallbackFigure(gltf);
          }
          crowdReady.set(id, template);
          return template;
        });
        mergeQueue = merged.catch(() => {});
        return merged;
      });
      crowdTemplates.set(id, promise);
    }
    return crowdTemplates.get(id);
  }));
}

// Figur für eine Menschenmenge sofort anlegen (null, solange loadCrowd sie noch nicht fertig hat): geteilte Geometrie
// und geteiltes Material, wirft keine Schatten
export function crowdPerson(id) {
  const template = crowdReady.get(id);
  return template ? new Person(template, { shared: true, shadows: false }) : null;
}

const FADE = 0.25; // s Überblendung zwischen zwei Animationen
const OFFSCREEN_STEP = 0.2; // s – so oft wird eine Figur außerhalb des Bildes weiterbewegt
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qBone = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _aim = new THREE.Vector3(); // gewünschte Knochenrichtung (nicht _a/_b, die braucht pointBone selbst)
const DOWN = new THREE.Vector3(0, -1, 0);

// Knochen so drehen, dass er (vom Gelenk zum Ende) in Weltrichtung dir zeigt
function pointBone(bone, end, dir) {
  bone.getWorldPosition(_a);
  end.getWorldPosition(_b);
  _dir.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_dir, dir);
  bone.getWorldQuaternion(_qBone);
  bone.parent.getWorldQuaternion(_qParent);
  bone.quaternion.copy(_qParent.invert().multiply(_q.multiply(_qBone)));
  bone.updateMatrixWorld(true);
}

export class Person {
  // shared: Geometrie und Material nicht kopieren (Menschenmenge, siehe crowdPerson) · shadows: wirft Schatten
  constructor(gltf, { shared = false, shadows = true } = {}) {
    this.object = new THREE.Group();     // Ursprung zwischen den Füßen, Blick nach +z
    this.shared = shared;
    this.body = SkeletonUtils.clone(gltf.scene);
    this.object.add(this.body);
    this.object.updateMatrixWorld(true);
    this.lastSeen = 0;      // wann die Figur zuletzt im Bild war (performance.now)
    this.pendingDt = 0;     // aufgesparte Zeit, solange die Animation pausiert
    this.body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows; // Menge: auch keine Schatten empfangen (spart je Pixel die Schattenkarten)
        // Animierte Figuren ragen aus der Hülle ihrer Ruhepose heraus – die Hülle großzügig vergrößern, statt
        // die Figur immer zu zeichnen (auch hinter Wänden und hinter dem Rücken des Spielers)
        if (o.isSkinnedMesh && !(shared && o.boundingSphere)) {
          o.skeleton.update();
          o.computeBoundingSphere();
          o.boundingSphere.radius *= 2;
        }
        o.onBeforeRender = () => { this.lastSeen = performance.now(); };
        if (shared) return;
        // Die Dateien bringen halb metallische Materialien mit – Haut und Stoff sollen matt sein, nicht glänzen
        o.material = o.material.clone();
        o.material.metalness = 0;
        o.material.roughness = 0.85;
      }
    });
    this.bones = {};
    // Alle Knoten nach Namen – auch die Enden wie LowerLegL_end, die keine echten Knochen sind
    this.body.traverse((o) => { if (o.name && !o.isMesh) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name.split('|').pop()] = this.mixer.clipAction(clip);
    this.current = null;
    this.seat = null;   // Sitzhöhe in m, wenn die Figur sitzt
    this.arms = null;   // null | 'carry' | 'controller'
    this.object.updateMatrixWorld(true);
    this.hipHeight = this.bones.UpperLegL.getWorldPosition(new THREE.Vector3()).y;
    this.play('Idle');
  }

  // Animation wechseln (weich überblendet). speed: Abspielgeschwindigkeit
  play(name, speed = 1) {
    const next = this.actions[name] ?? this.actions.Idle;
    next.timeScale = speed;
    if (next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
  }

  // Größe ändern (z. B. 0,8 für ein Kind), Sitzhöhe bleibt richtig
  setScale(s) {
    this.object.scale.setScalar(s);
    this.sitDown(this.seat);
  }

  // Hinsetzen: seatHeight = Oberkante der Sitzfläche. null = aufstehen.
  sitDown(seatHeight) {
    this.seat = seatHeight;
    const s = this.object.scale.y;
    this.body.position.y = seatHeight === null ? 0 : (seatHeight + 0.08) / s - this.hipHeight;
  }

  // Zeitschritt: Animation abspielen, danach Sitz- und Armhaltung über die Knochen setzen
  // Außerhalb des Bildes läuft die Animation nur noch fünfmal pro Sekunde (mit der aufgesparten Zeit),
  // damit Figuren hinter Wänden, draußen oder hinter dem Spieler kaum Rechenzeit kosten.
  update(dt) {
    this.pendingDt += dt;
    const onScreen = performance.now() - this.lastSeen < 250;
    if (!onScreen && this.pendingDt < OFFSCREEN_STEP) return;
    this.mixer.update(this.pendingDt);
    this.pendingDt = 0;
    if (this.seat === null && !this.arms) return;
    this.object.updateMatrixWorld(true);
    this.object.getWorldDirection(_fwd); // +z der Figur in Weltkoordinaten
    _side.crossVectors(_fwd, DOWN).normalize(); // zeigt zur linken Seite der Figur (dort sitzen die .L-Knochen)
    const b = this.bones;

    if (this.seat !== null) {
      for (const s of ['L', 'R']) {
        pointBone(b[`UpperLeg${s}`], b[`LowerLeg${s}`], _fwd);
        pointBone(b[`LowerLeg${s}`], b[`LowerLeg${s}_end`], DOWN);
        // Füße hängen nicht am Bein, sondern direkt an der Wurzel: unter das Knie stellen
        const foot = b[`Foot${s}`];
        b[`LowerLeg${s}_end`].getWorldPosition(_a);
        foot.parent.updateMatrixWorld(true);
        foot.position.copy(foot.parent.worldToLocal(_a));
        foot.updateMatrixWorld(true);
      }
    }

    if (this.arms) {
      const controller = this.arms === 'controller';
      for (const [s, sign] of [['L', 1], ['R', -1]]) {
        // Oberarm hängt fast senkrecht am Körper, Ellbogen etwas nach vorn und außen.
        // Unterarm nach vorn und leicht zur Mitte, sodass sich die Hände vor dem Bauch treffen (ohne Überkreuzen)
        _aim.copy(DOWN).addScaledVector(_fwd, controller ? 0.3 : 0.45).addScaledVector(_side, sign * 0.12).normalize();
        pointBone(b[`UpperArm${s}`], b[`LowerArm${s}`], _aim);
        _aim.copy(_fwd).addScaledVector(_side, -sign * (controller ? 0.3 : 0.2)).addScaledVector(DOWN, -0.1).normalize();
        pointBone(b[`LowerArm${s}`], b[`Wrist${s}`], _aim);
        // Handgelenk gerade wie in der Grundhaltung, sonst verdreht die Idle-Animation die Hände unterschiedlich
        b[`Wrist${s}`].quaternion.identity();
      }
    }
  }

  // Figur wird nicht mehr gebraucht: Animation und Knochen (Knochen-Textur auf der Grafikkarte) freigeben, eigene
  // Materialkopien ebenso. Geometrie teilen sich alle Kopien einer Figur – sie bleibt, geteilte Materialien auch.
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.object.removeFromParent();
    this.body.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.dispose();
      if (o.isMesh && !this.shared) o.material.dispose();
    });
  }

  // Mitte zwischen beiden Händen in lokalen Koordinaten der Figur (z. B. für Controller oder Spule)
  handsCenter(target = new THREE.Vector3()) {
    this.bones.WristL.getWorldPosition(_a);
    this.bones.WristR.getWorldPosition(_b);
    target.addVectors(_a, _b).multiplyScalar(0.5);
    return this.object.worldToLocal(target);
  }
}
