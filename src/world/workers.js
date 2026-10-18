// Mitarbeiter als Figuren in der Halle: holen sich Aufgaben aus core/staff.js, laufen über den Gang links neben den
// Drucktischen (und durch die Tür ins Lager), arbeiten am Ziel und tragen dabei sichtbar Spulen. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { slotX, slotZ } from './workshop.js';
import { WAGE_PER_HOUR, WORK_SECONDS, taskKey, taskText } from '../core/staff.js';
import { filamentById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { enableShadows } from './util.js';

const WALK_SPEED = 1.5;               // m/s
const LOOK_FOR_WORK_SECONDS = 0.5;    // so oft schaut ein freier Mitarbeiter nach Arbeit
const HALL_EDGE_Z = ROOM_SIZE / 2;    // Wand zwischen Halle und Abstellraum
const AISLE_X = -3.7;                 // Gang links neben den Drucktischen
const DOOR_IN = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z - 0.8 };
const DOOR_OUT = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z + 0.9 };
const SHELF_SPOT = { x: -7.05, z: 12.3 }; // vor dem Lagerregal
const BREAK_SPOTS = [{ x: -4.6, z: 3.2 }, { x: -4.6, z: 4.4 }]; // hier warten sie auf Arbeit
const PRINTER_FRONT = 0.75;           // Abstand vor der Tischmitte, wo sie am Drucker stehen

const inStorage = (p) => p.z > HALL_EDGE_Z;

// Weg als Liste von Punkten: in der Halle erst in den Gang, den Gang entlang und dann quer zum Ziel,
// ins Lager über die Tür
function route(from, to) {
  const points = [];
  let start = from;
  if (inStorage(from) && inStorage(to)) return [to];
  if (inStorage(from)) {
    points.push(DOOR_OUT, DOOR_IN);
    start = DOOR_IN;
  }
  const hallTarget = inStorage(to) ? DOOR_IN : to;
  points.push({ x: AISLE_X, z: start.z }, { x: AISLE_X, z: hallTarget.z }, hallTarget);
  if (inStorage(to)) points.push(DOOR_OUT, to);
  return points;
}

function createNameTag(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 12, 16, 0.7)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 24);
  ctx.fill();
  ctx.fillStyle = '#7ef0a8';
  ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Azubi ${name}`, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  tag.scale.set(0.6, 0.15, 1);
  tag.raycast = () => {};
  return tag;
}

// Figur mit Bambu-grünem Shirt und Kappe, schaut nach +z. Ursprung zwischen den Füßen.
function createWorkerModel(name) {
  const figure = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x00ae42, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b996, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6 });

  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, 0.88, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.7, 4, 10), pants);
    mesh.position.y = -0.42;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.22), dark);
    shoe.position.set(0, -0.84, 0.04);
    leg.add(mesh, shoe);
    figure.add(leg);
    return leg;
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.38, 4, 14), shirt);
  torso.position.y = 1.2;
  torso.scale.z = 0.7;
  figure.add(torso);

  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 1.45, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 10), shirt);
    sleeve.position.y = -0.27;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
    hand.position.y = -0.55;
    arm.add(sleeve, hand);
    figure.add(arm);
    return arm;
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), skin);
  head.position.y = 1.7;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shirt);
  cap.position.y = 1.72;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.015, 0.11), shirt);
  brim.position.set(0, 1.73, 0.13);
  figure.add(head, cap, brim);

  const tag = createNameTag(name);
  tag.position.y = 2.05;
  figure.add(tag);

  enableShadows(figure);
  figure.userData.parts = { legs, arms };
  return figure;
}

export function createWorkers({ economy, staff }) {
  const group = new THREE.Group();
  const runners = new Map(); // Mitarbeiter-ID → Laufzustand
  let spawnIndex = 0;

  // Ziel für eine Aufgabe: vor dem Drucker bzw. neben dem Teil auf dem Boden
  function targetOf(task) {
    if (task.type === 'pick') {
      const part = economy.looseParts.find((l) => l.id === task.looseId);
      return part ? { x: part.x, z: part.z + 0.35 } : null;
    }
    const p = economy.printerById(task.printerId);
    return p?.location === 'table' ? { x: slotX(p.slot), z: slotZ(p.slot) + PRINTER_FRONT } : null;
  }

  function add(worker) {
    const mesh = createWorkerModel(worker.name);
    mesh.position.set(DOOR_IN.x, 0, DOOR_IN.z); // kommt durch die Lagertür herein
    const r = {
      worker, mesh, path: [], task: null, phase: 'idle', timer: 0, look: 0, carried: null, spoolMesh: null,
      breakSpot: BREAK_SPOTS[spawnIndex++ % BREAK_SPOTS.length], walkPhase: 0, atBreak: false,
    };
    mesh.userData.interaction = {
      hint: () => `Azubi ${worker.name} ${taskText(r.task, economy, r.phase)} · Lohn ${WAGE_PER_HOUR} €/h`,
      action: () => {},
    };
    group.add(mesh);
    runners.set(worker.id, r);
  }

  function remove(id) {
    const r = runners.get(id);
    if (!r) return;
    if (r.carried) economy.returnFilamentToStorage(r.carried); // Spule nicht mitnehmen
    group.remove(r.mesh);
    runners.delete(id);
  }

  function sync() {
    for (const worker of staff.workers) if (!runners.has(worker.id)) add(worker);
    for (const id of [...runners.keys()]) if (!staff.workers.some((w) => w.id === id)) remove(id);
  }

  function walkTo(r, target) {
    r.path = route(r.mesh.position, target);
    r.atBreak = false;
  }

  function holdSpool(r, spool) {
    r.carried = spool;
    r.spoolMesh = createSpool(filamentById(spool.filamentId));
    r.spoolMesh.position.set(0, 1.05, 0.28);
    r.spoolMesh.scale.setScalar(0.9);
    r.mesh.add(r.spoolMesh);
  }

  function dropSpool(r) {
    if (r.spoolMesh) r.mesh.remove(r.spoolMesh);
    r.spoolMesh = null;
    r.carried = null;
  }

  function finishTask(r) {
    r.task = null;
    r.phase = 'idle';
  }

  // Ankunft am Ziel: arbeiten (Lager: Spule nehmen, sonst Aufgabe erledigen)
  function arrive(r) {
    if (!r.task) return;
    r.phase = r.phase === 'to-shelf' ? 'take' : 'work';
    r.timer = r.phase === 'take' ? WORK_SECONDS.take : WORK_SECONDS[r.task.type === 'refill' ? 'load' : r.task.type];
    r.mesh.rotation.y = r.task.type === 'pick' ? Math.PI : r.phase === 'take' ? -Math.PI / 2 : Math.PI;
  }

  function workDone(r) {
    const task = r.task;
    if (r.phase === 'take') {
      if (!staff.stillNeeded(task)) return finishTask(r); // inzwischen selbst nachgelegt
      const spool = staff.takeSpoolFor(task);
      if (!spool) return finishTask(r); // jemand war schneller
      holdSpool(r, spool);
      r.phase = 'to-target';
      const target = targetOf(task);
      if (!target) {
        economy.returnFilamentToStorage(r.carried);
        dropSpool(r);
        return finishTask(r);
      }
      walkTo(r, target);
      return;
    }
    if (task.type !== 'refill' && !staff.stillNeeded(task)) return finishTask(r);
    const done = staff.perform(task, r.carried);
    if (task.type === 'refill') dropSpool(r);
    if (done) finishTask(r);
    else r.timer = WORK_SECONDS[task.type]; // Düse noch zu: weiterstechen
  }

  function startTask(r, task) {
    r.task = task;
    if (task.type === 'refill') {
      r.phase = 'to-shelf';
      walkTo(r, SHELF_SPOT);
    } else {
      r.phase = 'to-target';
      walkTo(r, targetOf(task));
    }
  }

  function update(dt) {
    const reserved = new Set([...runners.values()].filter((x) => x.task).map((x) => taskKey(x.task)));
    for (const r of runners.values()) {
      const pos = r.mesh.position;
      let moving = false;

      // Unterwegs zu einer Aufgabe, die sich erledigt hat (z. B. vom Spieler): abbrechen
      if (r.task && r.phase === 'to-target' && !r.carried && !staff.stillNeeded(r.task)) {
        finishTask(r);
        r.path = [];
      }

      if (r.path.length) {
        const next = r.path[0];
        const dx = next.x - pos.x;
        const dz = next.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const step = WALK_SPEED * dt;
        if (dist > 1e-3) r.mesh.rotation.y = Math.atan2(dx, dz);
        if (dist <= step) {
          pos.x = next.x;
          pos.z = next.z;
          r.path.shift();
          if (!r.path.length) arrive(r);
        } else {
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;
        }
        moving = true;
      } else if (r.phase === 'take' || r.phase === 'work') {
        r.timer -= dt;
        if (r.timer <= 0) workDone(r);
      } else if (!r.task) {
        r.look -= dt;
        if (r.look <= 0) {
          r.look = LOOK_FOR_WORK_SECONDS;
          const task = staff.findTask(reserved);
          if (task && targetOf(task)) {
            reserved.add(taskKey(task));
            startTask(r, task);
          } else if (!r.atBreak) {
            walkTo(r, r.breakSpot); // nichts zu tun: zum Pausenplatz
            r.atBreak = true;
          }
        }
      }

      // Animation: Beine und Arme pendeln beim Laufen, beim Arbeiten bewegen sich die Hände
      const { legs, arms } = r.mesh.userData.parts;
      r.walkPhase += dt * (moving ? 9 : 0);
      const swing = moving ? Math.sin(r.walkPhase) * 0.5 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      const working = r.phase === 'work' || r.phase === 'take';
      const reach = working ? -1.1 + Math.sin(performance.now() / 120) * 0.25 : r.carried ? -0.9 : -swing * 0.8;
      arms[0].rotation.x = reach;
      arms[1].rotation.x = working || r.carried ? reach : swing * 0.8;
    }
  }

  // Spulen, die Mitarbeiter gerade tragen – landen beim Speichern im Regal
  const carriedSpools = () => [...runners.values()].filter((r) => r.carried).map((r) => r.carried);

  staff.subscribe(sync);
  // Was der Mitarbeiter gerade tut (für die PC-App)
  const statusOf = (id) => {
    const r = runners.get(id);
    return r ? `Gerade: ${taskText(r.task, economy, r.phase)}` : 'kommt gleich';
  };

  return { group, update, carriedSpools, statusOf };
}
