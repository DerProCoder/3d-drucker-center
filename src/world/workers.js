// Mitarbeiter als Figuren in der Halle: holen sich Aufgaben aus core/staff.js, laufen über den Gang links neben den
// Drucktischen (und durch die Tür ins Lager), arbeiten am Ziel und tragen dabei sichtbar Spulen. Ohne Arbeit gehen sie
// ins Büro (world/office.js) und werkeln an der Werkbank oder zocken auf der Couch. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { slotX, slotZ } from './workshop.js';
import { OFFICE_PATH, OFFICE_SPOTS, inOffice } from './office.js';
import { WAGE_PER_HOUR, WORK_SECONDS, taskKey, taskText } from '../core/staff.js';
import { filamentById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { createController } from '../models/office-furniture.js';
import { enableShadows } from './util.js';

const WALK_SPEED = 1.5;               // m/s
const LOOK_FOR_WORK_SECONDS = 0.5;    // so oft schaut ein freier Mitarbeiter nach Arbeit
const HALL_EDGE_Z = ROOM_SIZE / 2;    // Wand zwischen Halle und Abstellraum
const AISLE_X = -3.7;                 // Gang links neben den Drucktischen
const DOOR_IN = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z - 0.8 };
const DOOR_OUT = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z + 0.9 };
const SHELF_SPOT = { x: -7.05, z: 12.3 }; // vor dem Lagerregal
const FRONT_Z = 1.6;                  // Quergang vor dem ersten Drucktisch, über den sie zum Büro gehen
const PRINTER_FRONT = 0.75;           // Abstand vor der Tischmitte, wo sie am Drucker stehen
const HIP_HEIGHT = 0.88;              // Hüftgelenk über dem Boden (Ursprung der Beine)
const IDLE_SECONDS = [20, 45];        // so lange bleiben sie an der Werkbank bzw. auf der Couch, dann wechseln sie

const EAST_AISLE_X = 3.15;             // Gang rechts neben den Drucktischen, Richtung Büro

const inStorage = (p) => p.z > HALL_EDGE_Z;
// Vom Quergang vor den Tischen durch die Bürotür
const OFFICE_LANE = [{ x: OFFICE_PATH.hall.x, z: FRONT_Z }, OFFICE_PATH.hall, OFFICE_PATH.inside];

// Weg als Liste von Punkten: in der Halle erst in den Gang, den Gang entlang und dann quer zum Ziel,
// ins Lager über die Tür. Zum Büro und zurück geht es über den rechten Gang und den Quergang vor den Tischen,
// im Büro über den Bürogang.
function route(from, to) {
  const officeAisle = (p) => ({ x: OFFICE_PATH.aisleX, z: p.z });
  if (inStorage(from) && inStorage(to)) return [to];
  if (inOffice(from) && inOffice(to)) return [officeAisle(from), officeAisle(to), to];
  const aisleX = inOffice(from) || inOffice(to) ? EAST_AISLE_X : AISLE_X;
  const points = [];
  let start = from;
  if (inStorage(from)) {
    points.push(DOOR_OUT, DOOR_IN);
    start = DOOR_IN;
  } else if (inOffice(from)) {
    points.push(officeAisle(from), ...[...OFFICE_LANE].reverse());
    start = OFFICE_LANE[0];
  }
  const hallTarget = inStorage(to) ? DOOR_IN : inOffice(to) ? OFFICE_LANE[0] : to;
  points.push({ x: aisleX, z: start.z }, { x: aisleX, z: hallTarget.z }, hallTarget);
  if (inStorage(to)) points.push(DOOR_OUT, to);
  if (inOffice(to)) points.push(...OFFICE_LANE.slice(1), officeAisle(to), to);
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

  // Bein: Oberschenkel an der Hüfte, Unterschenkel mit Schuh am Knie – so können sie sich hinsetzen
  const knees = [];
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, HIP_HEIGHT, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), pants);
    thigh.position.y = -0.21;
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 10), pants);
    shin.position.y = -0.2;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.22), dark);
    shoe.position.set(0, -0.42, 0.04);
    knee.add(shin, shoe);
    leg.add(thigh, knee);
    figure.add(leg);
    knees.push(knee);
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

  // Controller zum Zocken, liegt zwischen den Händen (Arme nach vorn und leicht nach innen)
  const controller = createController();
  controller.position.set(0, 1.14, 0.4);
  controller.rotation.x = 0.5;
  controller.visible = false;
  figure.add(controller);

  enableShadows(figure);
  figure.userData.parts = { legs, knees, arms, controller };
  return figure;
}

// Was ein Azubi ohne Aufgabe gerade macht
function idleText(r) {
  if (r.phase === 'desk') return 'werkelt an der Werkbank im Büro';
  if (r.phase === 'couch') return 'zockt im Büro auf der Konsole';
  if (r.phase === 'to-idle') return 'geht ins Büro';
  return 'wartet auf Arbeit';
}

export function createWorkers({ economy, staff }) {
  const group = new THREE.Group();
  const runners = new Map(); // Mitarbeiter-ID → Laufzustand

  // Ziel für eine Aufgabe: vor dem Drucker bzw. neben dem Teil auf dem Boden
  function targetOf(task) {
    if (task.type === 'pick') {
      const part = economy.looseParts.find((l) => l.id === task.looseId);
      return part ? { x: part.x, z: part.z + 0.35 } : null;
    }
    const p = economy.printerById(task.printerId);
    return p?.location === 'table' ? { x: slotX(p.slot), z: slotZ(p.slot) + PRINTER_FRONT } : null;
  }

  // Jeder bekommt einen eigenen Stuhl und Couchplatz im Büro
  function freeSeat() {
    const used = new Set([...runners.values()].map((r) => r.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    return seat;
  }

  function add(worker) {
    const mesh = createWorkerModel(worker.name);
    mesh.position.set(DOOR_IN.x, 0, DOOR_IN.z); // kommt durch die Lagertür herein
    const r = {
      worker, mesh, path: [], task: null, phase: 'idle', timer: 0, look: 0, carried: null, spoolMesh: null,
      seat: freeSeat(), spot: null, nextIdle: Math.random() < 0.5 ? 'desk' : 'couch', walkPhase: 0,
    };
    mesh.userData.interaction = {
      hint: () => `Azubi ${worker.name} ${statusText(r)} · Lohn ${WAGE_PER_HOUR} €/h`,
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

  const statusText = (r) => (r.task ? taskText(r.task, economy, r.phase) : idleText(r));
  const seated = (r) => r.phase === 'desk' || r.phase === 'couch';

  function walkTo(r, target) {
    r.path = route(r.mesh.position, target);
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

  // Ins Büro an die Werkbank oder auf die Couch – abwechselnd
  function goIdle(r) {
    const kind = r.nextIdle;
    r.nextIdle = kind === 'desk' ? 'couch' : 'desk';
    const spots = OFFICE_SPOTS[kind];
    r.spot = { kind, ...spots[r.seat % spots.length] };
    r.phase = 'to-idle';
    walkTo(r, r.spot.stand);
  }

  function sitDown(r) {
    const { seat, y, rotY, kind } = r.spot;
    r.mesh.position.set(seat.x, y + 0.07 - HIP_HEIGHT, seat.z);
    r.mesh.rotation.y = rotY;
    r.phase = kind;
    r.timer = IDLE_SECONDS[0] + Math.random() * (IDLE_SECONDS[1] - IDLE_SECONDS[0]);
  }

  function standUp(r) {
    const { stand } = r.spot;
    r.mesh.position.set(stand.x, 0, stand.z);
    r.phase = 'idle';
  }

  // Ankunft am Ziel: arbeiten (Lager: Spule nehmen, sonst Aufgabe erledigen) bzw. im Büro hinsetzen
  function arrive(r) {
    if (!r.task) {
      if (r.phase === 'to-idle') sitDown(r);
      return;
    }
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
    const done = staff.perform(task, r.carried, r.worker);
    if (task.type === 'refill') dropSpool(r);
    if (done) finishTask(r);
    else r.timer = WORK_SECONDS[task.type]; // Düse noch zu: weiterstechen
  }

  function startTask(r, task) {
    if (seated(r)) standUp(r);
    r.task = task;
    if (task.type === 'refill') {
      r.phase = 'to-shelf';
      walkTo(r, SHELF_SPOT);
    } else {
      r.phase = 'to-target';
      walkTo(r, targetOf(task));
    }
  }

  // Pose: Beine und Arme pendeln beim Laufen, beim Arbeiten bewegen sich die Hände, im Büro sitzen sie
  function animate(r, dt, moving) {
    const { legs, knees, arms, controller } = r.mesh.userData.parts;
    const now = performance.now();
    r.walkPhase += dt * (moving ? 9 : 0);
    const swing = moving ? Math.sin(r.walkPhase) * 0.5 : 0;
    const sitting = seated(r);
    legs[0].rotation.x = sitting ? -Math.PI / 2 : swing;
    legs[1].rotation.x = sitting ? -Math.PI / 2 : -swing;
    knees[0].rotation.x = sitting ? Math.PI / 2 : Math.max(0, -swing) * 0.8;
    knees[1].rotation.x = sitting ? Math.PI / 2 : Math.max(0, swing) * 0.8;
    controller.visible = r.phase === 'couch';

    if (r.phase === 'couch') {
      // Controller halten, die Daumen zucken, in Kurven lehnt man sich mit
      arms[0].rotation.set(-0.9 + Math.sin(now / 70) * 0.03, 0, 0.4);
      arms[1].rotation.set(-0.9 + Math.sin(now / 83) * 0.03, 0, -0.4);
      r.mesh.rotation.z = Math.sin(now / 900 + r.worker.id) * 0.04;
      return;
    }
    r.mesh.rotation.z = 0;
    arms[0].rotation.z = 0;
    arms[1].rotation.z = 0;
    if (r.phase === 'desk') {
      // An der Werkbank in Ruhe tüfteln: beide Hände am Übungsdrucker, versetzt
      arms[0].rotation.x = -1.1 + Math.sin(now / 260) * 0.2;
      arms[1].rotation.x = -1.1 + Math.sin(now / 310 + 1) * 0.2;
      return;
    }
    const working = r.phase === 'work' || r.phase === 'take';
    const reach = working ? -1.1 + Math.sin(now / 120) * 0.25 : r.carried ? -0.9 : -swing * 0.8;
    arms[0].rotation.x = reach;
    arms[1].rotation.x = working || r.carried ? reach : swing * 0.8;
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
      }

      // Ohne Aufgabe: regelmäßig nach Arbeit schauen – auch im Sitzen und auf dem Weg ins Büro
      if (!r.task) {
        r.look -= dt;
        if (r.look <= 0) {
          r.look = LOOK_FOR_WORK_SECONDS;
          const task = staff.findTask(reserved);
          if (task && targetOf(task)) {
            reserved.add(taskKey(task));
            startTask(r, task);
          }
        }
      }
      if (!r.task) {
        if (seated(r)) {
          r.timer -= dt;
          if (r.timer <= 0) {
            standUp(r); // genug gezockt bzw. getüftelt: Platz wechseln
            goIdle(r);
          }
        } else if (r.phase !== 'to-idle') {
          goIdle(r);
        }
      }

      animate(r, dt, moving);
    }
  }

  // Spulen, die Mitarbeiter gerade tragen – landen beim Speichern im Regal
  const carriedSpools = () => [...runners.values()].filter((r) => r.carried).map((r) => r.carried);
  // Zockt gerade jemand? (Fernseher im Büro)
  const gaming = () => [...runners.values()].some((r) => r.phase === 'couch');

  staff.subscribe(sync);
  // Was der Mitarbeiter gerade tut (für die PC-App)
  const statusOf = (id) => {
    const r = runners.get(id);
    return r ? `Gerade: ${statusText(r)}` : 'kommt gleich';
  };

  return { group, update, carriedSpools, statusOf, gaming };
}
