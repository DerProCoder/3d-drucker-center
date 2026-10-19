// Mitarbeiter als Figuren in der Halle: holen sich Aufgaben aus core/staff.js, laufen über den Gang links neben den
// Drucktischen (und durch die Tür ins Lager), arbeiten am Ziel und tragen dabei sichtbar Spulen. Ohne Arbeit gehen sie
// ins Büro (world/office.js) und werkeln an der Werkbank oder zocken auf der Couch. Bewegung über Delta-Zeit.
// Aussehen und Animationen kommen aus models/people.js (echte Menschenfiguren, je nach Name Mann oder Frau).
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { slotX, slotZ } from './workshop.js';
import { OFFICE_PATH, OFFICE_SPOTS, inOffice } from './office.js';
import { WAGE_PER_HOUR, WORK_SECONDS, taskKey, taskText, workerGender } from '../core/staff.js';
import { filamentById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { createController } from '../models/office-furniture.js';
import { createPerson, peopleFor } from '../models/people.js';

const WALK_SPEED = [1.3, 1.6];        // m/s – jeder Azubi hat sein eigenes Tempo
const WALK_CLIP_SPEED = 1.45;         // bei diesem Tempo passt die Laufanimation genau
const TURN_SPEED = 8;                 // wie schnell sie sich zur Laufrichtung drehen (1/s)
const LOOK_FOR_WORK_SECONDS = 0.5;    // so oft schaut ein freier Mitarbeiter nach Arbeit
const HALL_EDGE_Z = ROOM_SIZE / 2;    // Wand zwischen Halle und Abstellraum
const AISLE_X = -3.7;                 // Gang links neben den Drucktischen
const DOOR_IN = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z - 0.8 };
const DOOR_OUT = { x: STORAGE_DOOR.x, z: HALL_EDGE_Z + 0.9 };
const SHELF_SPOT = { x: -7.05, z: 12.3 }; // vor dem Lagerregal
const FRONT_Z = 1.6;                  // Quergang vor dem ersten Drucktisch, über den sie zum Büro gehen
const PRINTER_FRONT = 0.75;           // Abstand vor der Tischmitte, wo sie am Drucker stehen
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

// Unsichtbare Trefferbox: Anvisieren trifft sie statt der animierten Figur (das wäre viel teurer)
const hitboxGeometry = new THREE.BoxGeometry(0.5, 1.8, 0.4).translate(0, 0.9, 0);
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

// Halter für einen Azubi, schaut nach +z, Ursprung zwischen den Füßen. Die Figur kommt nach, sobald sie geladen ist.
function createHolder(worker) {
  const holder = new THREE.Group();
  holder.add(new THREE.Mesh(hitboxGeometry, hitboxMaterial));
  const tag = createNameTag(worker.name);
  tag.position.y = 2.05;
  holder.add(tag);
  const controller = createController();
  controller.visible = false;
  holder.add(controller);
  holder.userData.controller = controller;
  return holder;
}

// Figur passend zum Namen, zwei Azubis gleichen Geschlechts sehen verschieden aus
function figureFor(worker) {
  const choices = peopleFor('staff', workerGender(worker));
  return choices[Math.floor((worker.id - 1) / 2) % choices.length].id;
}

// Was ein Azubi ohne Aufgabe gerade macht
function idleText(r) {
  if (r.phase === 'desk') return 'werkelt an der Werkbank im Büro';
  if (r.phase === 'couch') return 'zockt im Büro auf der Konsole';
  if (r.phase === 'to-idle') return 'geht ins Büro';
  return 'wartet auf Arbeit';
}

// Winkel a weich in Richtung b drehen (kürzester Weg)
function turnTowards(object, b, dt) {
  const a = object.rotation.y;
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  object.rotation.y = a + diff * Math.min(1, TURN_SPEED * dt);
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
    const mesh = createHolder(worker);
    mesh.position.set(DOOR_IN.x, 0, DOOR_IN.z); // kommt durch die Lagertür herein
    const r = {
      worker, mesh, person: null, path: [], task: null, phase: 'idle', timer: 0, look: 0, carried: null, spoolMesh: null,
      seat: freeSeat(), spot: null, nextIdle: Math.random() < 0.5 ? 'desk' : 'couch', heading: 0,
      speed: WALK_SPEED[0] + Math.random() * (WALK_SPEED[1] - WALK_SPEED[0]),
    };
    mesh.userData.interaction = {
      hint: () => `Azubi ${worker.name} ${statusText(r)} · Lohn ${WAGE_PER_HOUR} €/h`,
      action: () => {},
    };
    group.add(mesh);
    runners.set(worker.id, r);
    createPerson(figureFor(worker)).then((person) => {
      if (runners.get(worker.id) !== r) return; // inzwischen entlassen
      person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      r.person = person;
      mesh.add(person.object);
    }).catch((err) => console.warn('Azubi-Figur konnte nicht geladen werden', err));
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
    r.spoolMesh.position.set(0, 1.0, 0.32);
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
    const { seat, rotY, kind } = r.spot;
    r.mesh.position.set(seat.x, 0, seat.z);
    r.heading = rotY;
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
    r.heading = r.task.type === 'pick' ? Math.PI : r.phase === 'take' ? -Math.PI / 2 : Math.PI;
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

  const hands = new THREE.Vector3();
  // Animation und Haltung passend zur Tätigkeit: laufen, am Drucker hantieren, sitzend werkeln oder zocken
  function animate(r, dt, moving) {
    const { person } = r;
    if (!person) return;
    const sitting = seated(r);
    person.sitDown(sitting ? r.spot.y : null);
    person.arms = r.phase === 'couch' ? 'controller' : r.carried && !(r.phase === 'work') ? 'carry' : null;
    if (moving) person.play('Walk', r.speed / WALK_CLIP_SPEED);
    else if (r.phase === 'work' || r.phase === 'take') person.play('Interact');
    else if (r.phase === 'desk') person.play('Interact', 0.55); // in Ruhe am Übungsdrucker tüfteln
    else person.play(r.phase === 'couch' ? 'Idle_Neutral' : 'Idle');
    person.update(dt);

    const controller = r.mesh.userData.controller;
    controller.visible = r.phase === 'couch';
    if (controller.visible) {
      controller.position.copy(person.handsCenter(hands));
      controller.rotation.set(0.6, 0, 0);
    }
    if (r.spoolMesh) {
      person.handsCenter(hands);
      r.spoolMesh.position.set(0, hands.y + 0.02, hands.z + 0.06);
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
        const step = r.speed * dt;
        if (dist > 1e-3) r.heading = Math.atan2(dx, dz);
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

      if (seated(r)) r.mesh.rotation.y = r.heading;
      else turnTowards(r.mesh, r.heading, dt);
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
