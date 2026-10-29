// Mitarbeiter als Figuren in der Halle: holen sich Aufgaben aus core/staff.js, laufen über den Gang links neben den
// Drucktischen (und durch die Tür ins Lager), arbeiten am Ziel und tragen dabei sichtbar Spulen. Ohne Arbeit gehen sie
// ins Büro (world/office.js) und werkeln an der Werkbank oder zocken auf der Couch. Fertige Aufträge bringen sie als
// Paket ins Abholregal am Empfang (world/reception.js). Bewegung über Delta-Zeit.
// Aussehen und Animationen kommen aus models/people.js (echte Menschenfiguren, je nach Name Mann oder Frau).
// Führt ein Azubi eine Besuchergruppe (core/visitors.js reserviert ihn), steuert world/visitors.js die Figur über
// guide(): Er nimmt dann keine Aufgaben an und läuft vorneweg – auch draußen im Garten und die Treppe hinauf.
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { slotX, slotZ } from './hall-layout.js';
import { OFFICE_PATH, OFFICE_SPOTS, inOffice } from './office.js';
import { ENTRANCE, ENTRANCE_PATH, inEntrance } from './entrance.js';
import { STAIRS } from './upper-floor.js';
import { RECEPTION_SPOTS } from './reception.js';
import { WAGE_PER_HOUR, WORK_SECONDS, taskKey, taskText, workerGender } from '../core/staff.js';
import { filamentById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { createController } from '../models/office-furniture.js';
import { createParcel } from '../models/reception-furniture.js';
import { createPerson, peopleFor } from '../models/people.js';
import { createNameTag } from '../models/name-tag.js';

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
// Draußen im Garten vor der Haustür (nur beim Führen einer Besuchergruppe)
const outdoors = (p) => p.x < ENTRANCE.x0;
// Vom Quergang vor den Tischen durch die Bürotür
const OFFICE_LANE = [{ x: OFFICE_PATH.hall.x, z: FRONT_Z }, OFFICE_PATH.hall, OFFICE_PATH.inside];

// Wo man von einem Raum aus die Halle betritt (Tür von Lager, Büro bzw. Eingang), in der Halle selbst der Punkt
const portal = (p) => (inStorage(p) ? DOOR_IN : inOffice(p) ? OFFICE_LANE[0] : inEntrance(p) ? ENTRANCE_PATH.hall : p);

// Weg als Liste von Punkten: in der Halle über den Gang links neben den Drucktischen, ins Lager über die Tür.
// Zum Büro geht es über den rechten Gang und den Quergang vor den Tischen, im Büro über den Bürogang.
// Zwischen Eingang und Büro direkt über den Quergang vor den Tischen.
function route(from, to) {
  // Aus dem Garten erst durch die Haustür herein
  if (outdoors(from)) return [ENTRANCE_PATH.frontOutside, ENTRANCE_PATH.frontInside, ...route(ENTRANCE_PATH.frontInside, to)];
  const officeAisle = (p) => ({ x: OFFICE_PATH.aisleX, z: p.z });
  if (inStorage(from) && inStorage(to)) return [to];
  if (inEntrance(from) && inEntrance(to)) return [to];
  if (inOffice(from) && inOffice(to)) return [officeAisle(from), officeAisle(to), to];
  const points = [];
  // Raus aus dem Raum, in dem man gerade ist
  if (inStorage(from)) points.push(DOOR_OUT, DOOR_IN);
  else if (inOffice(from)) points.push(officeAisle(from), ...[...OFFICE_LANE].reverse());
  else if (inEntrance(from)) points.push(ENTRANCE_PATH.inside, ENTRANCE_PATH.hall);
  const start = portal(from);
  const end = portal(to);
  // Durch die Halle
  if ((inOffice(from) && inEntrance(to)) || (inEntrance(from) && inOffice(to))) {
    points.push({ x: start.x, z: FRONT_Z }, { x: end.x, z: FRONT_Z }, end);
  } else {
    const aisleX = inOffice(from) || inOffice(to) ? EAST_AISLE_X : AISLE_X;
    points.push({ x: aisleX, z: start.z }, { x: aisleX, z: end.z }, end);
  }
  // Hinein in den Zielraum
  if (inStorage(to)) points.push(DOOR_OUT, to);
  else if (inOffice(to)) points.push(...OFFICE_LANE.slice(1), officeAisle(to), to);
  else if (inEntrance(to)) points.push(ENTRANCE_PATH.inside, to);
  return points;
}

// Unsichtbare Trefferbox: Anvisieren trifft sie statt der animierten Figur (das wäre viel teurer)
const hitboxGeometry = new THREE.BoxGeometry(0.5, 1.8, 0.4).translate(0, 0.9, 0);
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

// Halter für einen Azubi, schaut nach +z, Ursprung zwischen den Füßen. Die Figur kommt nach, sobald sie geladen ist.
function createHolder(worker) {
  const holder = new THREE.Group();
  holder.add(new THREE.Mesh(hitboxGeometry, hitboxMaterial));
  const tag = createNameTag(`Azubi ${worker.name}`);
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
  if (r.guide) return 'führt eine Besuchergruppe';
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
    if (task.type === 'pack') return RECEPTION_SPOTS.shelf;
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
      worker, mesh, person: null, path: [], task: null, phase: 'idle', timer: 0, look: 0, carried: null, spoolMesh: null, parcel: null,
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
    dropParcel(r);
  }

  function holdParcel(r, task) {
    const order = staff.reception?.orders.orderById(task.orderId);
    r.parcel = createParcel(order?.customer ?? 'Auftrag', '', { w: 0.34, h: 0.22, d: 0.26 });
    r.mesh.add(r.parcel);
  }

  function dropParcel(r) {
    if (r.parcel) r.mesh.remove(r.parcel);
    r.parcel = null;
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
    r.heading = r.task.type === 'pick' ? Math.PI : r.phase === 'take' ? -Math.PI / 2 : r.task.type === 'pack' ? 0 : Math.PI;
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
    if (task.type === 'pack') holdParcel(r, task); // Teile verpackt in der Hand zum Regal tragen
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
    const holding = (r.carried || r.parcel) && r.phase !== 'work';
    person.arms = r.phase === 'couch' ? 'controller' : holding ? 'carry' : null;
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
    if (r.parcel) {
      person.handsCenter(hands);
      r.parcel.position.set(0, hands.y - 0.1, hands.z + 0.04);
    }
  }

  // Einen Schritt auf dem Weg gehen; true, solange die Figur unterwegs ist
  function walk(r, dt) {
    if (!r.path.length) return false;
    const pos = r.mesh.position;
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
    return true;
  }

  // Laufende Aufgabe sauber abbrechen (Azubi wird für eine Führung gebraucht): Spule zurück ins Lager, Paket weg –
  // die Aufgabe selbst bleibt offen und geht an einen anderen Azubi
  function abortTask(r) {
    if (r.carried) {
      if (staff.abortTask) staff.abortTask(r.task, r.carried);
      else economy.returnFilamentToStorage(r.carried);
    }
    dropSpool(r);
    finishTask(r);
    r.path = [];
  }

  // Führender Azubi: world/visitors.js setzt ihn (place) oder schickt ihn über die üblichen Wege (walkTo)
  function updateGuide(r, dt) {
    const g = r.guide;
    let moving = walk(r, dt);
    if (!moving) moving = g.speed > 0.05;
    if (g.wave > 0) g.wave -= dt;
    turnTowards(r.mesh, r.heading, dt);
    const { person } = r;
    if (!person) return;
    person.sitDown(null);
    person.arms = null;
    if (moving) person.play('Walk', (r.path.length ? r.speed : g.speed) / WALK_CLIP_SPEED);
    else person.play(g.wave > 0 ? 'Wave' : 'Idle');
    person.update(dt);
    r.mesh.userData.controller.visible = false;
  }

  function update(dt) {
    const reserved = new Set([...runners.values()].filter((x) => x.task).map((x) => taskKey(x.task)));
    for (const r of runners.values()) {
      if (r.guide) {
        updateGuide(r, dt);
        continue;
      }
      let moving = false;

      // Unterwegs zu einer Aufgabe, die sich erledigt hat (z. B. vom Spieler): abbrechen
      if (r.task && r.phase === 'to-target' && !r.carried && !staff.stillNeeded(r.task)) {
        finishTask(r);
        r.path = [];
      }
      // Für eine Führung reserviert (core/staff.js), aber noch nicht von world/visitors.js übernommen: Aufgabe abbrechen
      if (r.task && staff.isReserved?.(r.worker.id)) abortTask(r);

      if (r.path.length) {
        moving = walk(r, dt);
      } else if (r.phase === 'take' || r.phase === 'work') {
        r.timer -= dt;
        if (r.timer <= 0) workDone(r);
      }

      // Ohne Aufgabe: regelmäßig nach Arbeit schauen – auch im Sitzen und auf dem Weg ins Büro
      if (!r.task) {
        r.look -= dt;
        if (r.look <= 0) {
          r.look = LOOK_FOR_WORK_SECONDS;
          const task = staff.isReserved?.(r.worker.id) ? null : staff.findTask(reserved, r.worker.id);
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

  // Azubi id führt eine Besuchergruppe (world/visitors.js): Er bricht seine Aufgabe ab, steht auf und folgt ab jetzt
  // nur noch dem, was die Gruppe vorgibt. Gibt eine Steuerung zurück (null, wenn es den Azubi nicht gibt):
  //   position      Vector3 der Figur (y: Höhe, z. B. auf der Treppe)
  //   walkTo(pts)   über die üblichen Wege (Halle, Empfang) zum ersten Punkt, danach geradeaus über die übrigen
  //   walking       noch unterwegs (walkTo)?
  //   place(x, y, z, heading, speed)  direkt setzen (Rundgang); speed > 0: läuft gerade mit diesem Tempo (m/s)
  //   face(heading) · wave(s): so lange winken · release(): zurück an die Arbeit · alive: Azubi noch da?
  function guide(id) {
    const r = runners.get(id);
    if (!r) return null;
    if (!r.guide) {
      if (r.task) abortTask(r);
      if (seated(r)) standUp(r);
      r.path = [];
      r.phase = 'guide';
      r.guide = { speed: 0, wave: 0 };
    }
    return {
      get alive() { return runners.get(id) === r && !!r.guide; },
      get position() { return r.mesh.position; },
      get walking() { return r.path.length > 0; },
      walkTo(points) {
        if (!r.guide) return;
        r.path = [...route(r.mesh.position, points[0]), ...points.slice(1)];
      },
      place(x, y, z, heading, speed = 0) {
        if (!r.guide) return;
        r.path = [];
        r.mesh.position.set(x, y, z);
        r.heading = heading;
        r.guide.speed = speed;
      },
      face(heading) { r.heading = heading; },
      wave(seconds) { if (r.guide) r.guide.wave = seconds; },
      release() {
        if (!r.guide) return;
        r.guide = null;
        r.phase = 'idle';
        r.path = [];
        // Oben oder auf der Treppe losgelassen (Gruppe plötzlich weg): unten an der Treppe weitermachen
        if (r.mesh.position.y > 0.05) r.mesh.position.set((STAIRS.x0 + STAIRS.x1) / 2, 0, STAIRS.zLow + 0.6);
      },
    };
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

  return { group, update, carriedSpools, statusOf, gaming, guide };
}
