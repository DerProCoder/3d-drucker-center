// Werfen: Drucker (oder Druckerkarton) aus der Hand werfen. Er fliegt im Bogen, dreht sich, prallt vom Boden
// und von Wänden ab und bleibt dann auf dem Boden liegen, wo man ihn wieder aufheben kann.
// Trifft er unterwegs den Kater, kippt der um. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { ROOM_SIZE } from './room.js';
import { createPrinterModel } from '../models/printer-model.js';
import { createPrinterBox } from '../models/printer-box.js';
import { enableShadows } from './util.js';

const GRAVITY = 9.81;
const THROW_SPEED = 7;     // m/s nach vorne
const THROW_LIFT = 2.2;    // m/s zusätzlich nach oben
const BOUNCE = 0.3;        // so viel Tempo bleibt beim Aufprall nach oben erhalten
const FRICTION = 0.55;     // so viel Tempo bleibt beim Aufprall in der Fläche erhalten
const REST_SPEED = 0.4;    // darunter bleibt er liegen
const CAT_HIT_RADIUS = 0.45;
const WALL_MARGIN = 0.35;

// Bereiche, in denen ein Wurf landen kann: Halle und Abstellraum (Maße aus room.js / storage-room.js)
const HALL = { minX: -ROOM_SIZE / 2, maxX: ROOM_SIZE / 2, minZ: -ROOM_SIZE / 2, maxZ: ROOM_SIZE / 2 };
const STORAGE = { minX: -8, maxX: -2, minZ: ROOM_SIZE / 2 + 0.2, maxZ: 14.7 };

function createMesh(printer, boxed) {
  const mesh = boxed ? createPrinterBox(printer.model) : createPrinterModel(printer.model);
  enableShadows(mesh);
  return mesh;
}

// onEvent(type, data): 'throw' | 'land' | 'cat-hit' – für Sound, Meldungen und Erfolge
export function createThrowing({ camera, economy, carry, cat, onEvent }) {
  const group = new THREE.Group();
  const flying = [];       // { printer, boxed, mesh, velocity, spin }
  const lying = new Map(); // Drucker-ID → Modell auf dem Boden
  const dir = new THREE.Vector3();

  // F: was man gerade trägt, wegwerfen. Gibt false zurück, wenn man keinen Drucker trägt.
  function throwCarried() {
    if (!carry.printer) return false;
    const boxed = !carry.unboxed;
    const printer = carry.releasePrinter();
    economy.dropPrinter(printer.id, null); // unterwegs: weder Tisch noch Lager
    camera.getWorldDirection(dir);
    const mesh = createMesh(printer, boxed);
    camera.getWorldPosition(mesh.position);
    mesh.position.addScaledVector(dir, 0.6);
    mesh.position.y -= 0.45;
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(mesh);
    flying.push({
      printer, boxed, mesh,
      velocity: dir.clone().multiplyScalar(THROW_SPEED).add(new THREE.Vector3(0, THROW_LIFT, 0)),
      spin: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4),
    });
    onEvent?.('throw');
    return true;
  }

  function bounds(pos) {
    return pos.z > HALL.maxZ ? STORAGE : HALL;
  }

  function update(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      const { mesh, velocity } = f;
      velocity.y -= GRAVITY * dt;
      mesh.position.addScaledVector(velocity, dt);
      mesh.rotation.y += f.spin * dt;
      mesh.rotation.x = Math.sin(mesh.rotation.y * 0.7) * 0.4 * Math.min(1, velocity.length() / THROW_SPEED);

      // Wände: abprallen
      const b = bounds(mesh.position);
      for (const [axis, min, max] of [['x', b.minX, b.maxX], ['z', b.minZ, b.maxZ]]) {
        if (mesh.position[axis] < min + WALL_MARGIN || mesh.position[axis] > max - WALL_MARGIN) {
          mesh.position[axis] = THREE.MathUtils.clamp(mesh.position[axis], min + WALL_MARGIN, max - WALL_MARGIN);
          velocity[axis] *= -0.4;
        }
      }

      // Kater getroffen? (nur solange der Drucker noch Schwung hat)
      if (!cat.isKo && velocity.length() > 1.5) {
        const c = cat.position;
        const dx = mesh.position.x - c.x;
        const dz = mesh.position.z - c.z;
        const dy = mesh.position.y - (c.y + 0.2);
        if (Math.hypot(dx, dy, dz) < CAT_HIT_RADIUS && cat.hit()) onEvent?.('cat-hit', { printer: f.printer });
      }

      // Boden: abprallen und ausrollen
      if (mesh.position.y <= 0) {
        mesh.position.y = 0;
        if (velocity.y < -1) onEvent?.('land', { speed: -velocity.y });
        velocity.y = -velocity.y * BOUNCE;
        velocity.x *= FRICTION;
        velocity.z *= FRICTION;
        f.spin *= FRICTION;
        if (velocity.length() < REST_SPEED) {
          group.remove(mesh);
          flying.splice(i, 1);
          economy.dropPrinter(f.printer.id, {
            x: mesh.position.x, z: mesh.position.z, rotY: mesh.rotation.y, boxed: f.boxed,
          });
        }
      }
    }
  }

  // Drucker auf dem Boden: Modell bauen, Linksklick hebt ihn wieder auf
  function sync() {
    const onFloor = economy.printers.filter((p) => p.location === 'floor' && p.floor);
    for (const [id, mesh] of lying) {
      if (!onFloor.some((p) => p.id === id)) {
        group.remove(mesh);
        lying.delete(id);
      }
    }
    for (const printer of onFloor) {
      if (lying.has(printer.id)) continue;
      const { x, z, rotY, boxed } = printer.floor;
      const mesh = createMesh(printer, boxed);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rotY;
      mesh.userData.interaction = {
        hint: () => ((boxed ? carry.canTakeBox : carry.isEmpty) ? `Linksklick: ${printer.model.name} aufheben` : 'Hände voll – Q legt es zurück ins Lager'),
        action: () => {
          if (!(boxed ? carry.canTakeBox : carry.isEmpty) || !economy.takePrinterFromFloor(printer.id)) return;
          carry.holdPrinter(printer, { unboxed: !boxed });
        },
      };
      group.add(mesh);
      lying.set(printer.id, mesh);
    }
  }

  economy.subscribe(sync);
  return { group, throwCarried, update };
}
