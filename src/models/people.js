// Menschen: animierte Figuren von Quaternius („Ultimate Modular Men/Women“, siehe README) als GLB unter
// assets/people/. Jede Datei bringt ihre eigenen Animationen mit (Idle, Idle_Neutral, Walk, Run, Interact, Wave).
// Sitzen, Tragen und Controller-Halten gibt es als Clip nicht – diese Posen setzt Person selbst über die Knochen,
// jeweils nach dem Abspielen der Animation. Figuren werden erst geladen, wenn jemand sie braucht.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// gender: 'm' | 'w' · roles: wofür die Figur passt (staff = Azubi, customer = Kunde, passer = Passant)
export const PEOPLE = [
  { id: 'casual-man', gender: 'm', roles: ['staff', 'customer', 'passer'] },
  { id: 'hoodie-man', gender: 'm', roles: ['staff', 'customer', 'passer'] },
  { id: 'punk-man', gender: 'm', roles: ['staff', 'passer'] },
  { id: 'business-man', gender: 'm', roles: ['customer', 'passer'] },
  { id: 'worker-man', gender: 'm', roles: ['customer', 'passer'] },
  { id: 'farmer-man', gender: 'm', roles: ['customer', 'passer'] },
  { id: 'beach-man', gender: 'm', roles: ['passer'] },
  { id: 'casual-woman', gender: 'w', roles: ['staff', 'customer', 'passer'] },
  { id: 'punk-woman', gender: 'w', roles: ['staff', 'customer', 'passer'] },
  { id: 'formal-woman', gender: 'w', roles: ['customer', 'passer'] },
  { id: 'suit-woman', gender: 'w', roles: ['customer', 'passer'] },
  { id: 'worker-woman', gender: 'w', roles: ['customer', 'passer'] },
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

const FADE = 0.25; // s Überblendung zwischen zwei Animationen
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
  constructor(gltf) {
    this.object = new THREE.Group();     // Ursprung zwischen den Füßen, Blick nach +z
    this.body = SkeletonUtils.clone(gltf.scene);
    this.object.add(this.body);
    this.body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // animierte Figuren ragen sonst manchmal aus ihrer Hülle und verschwinden
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
  update(dt) {
    this.mixer.update(dt);
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
      for (const [s, sign] of [['L', 1], ['R', -1]]) {
        // Oberarm nach vorn unten, Unterarm nach vorn und zur Körpermitte
        const inward = this.arms === 'controller' ? 0.45 : 0.25;
        _aim.copy(DOWN).multiplyScalar(0.75).addScaledVector(_fwd, 0.55).normalize();
        pointBone(b[`UpperArm${s}`], b[`LowerArm${s}`], _aim);
        _aim.copy(_fwd).addScaledVector(_side, -sign * inward).addScaledVector(DOWN, this.arms === 'controller' ? 0.25 : -0.1).normalize();
        pointBone(b[`LowerArm${s}`], b[`Wrist${s}`], _aim);
      }
    }
  }

  // Mitte zwischen beiden Händen in lokalen Koordinaten der Figur (z. B. für Controller oder Spule)
  handsCenter(target = new THREE.Vector3()) {
    this.bones.WristL.getWorldPosition(_a);
    this.bones.WristR.getWorldPosition(_b);
    target.addVectors(_a, _b).multiplyScalar(0.5);
    return this.object.worldToLocal(target);
  }
}
