// Kater Düsentrieb: streunt durch die Halle, macht Nickerchen, springt auf den Druckertisch, setzt sich neben
// die Drucker – und schubst fertige Teile, die keiner abholt, gern auf den Boden. Linksklick streichelt ihn.
// Bewegung über Delta-Zeit. Das Herunterwerfen selbst erledigt economy.knockPartOff.
import * as THREE from 'three';
import { PRINTER_SLOTS_X, RACK_SLOTS_X } from './workshop.js';
import { furnitureSize } from './furniture.js';

const NAME = 'Kater Düsentrieb';
const WALK_SPEED = 0.7;     // m/s
const JUMP_SECONDS = 0.55;
const KNOCK_CHANCE = 0.55;  // so oft schubst er ein fertiges Teil, wenn er daneben sitzt
const HALL = { minX: -8.5, maxX: 8.5, minZ: -8.5, maxZ: 8.5 };
const TABLE_FRONT_Z = 0.8;  // hier springt er hoch
const TABLE_SEAT_Z = 0.15;  // hier sitzt er auf dem Tisch
const SEAT_OFFSET_X = 0.55; // rechts neben dem Stellplatz, zwischen zwei Druckern

const rand = (min, max) => min + Math.random() * (max - min);

function createCatModel() {
  const cat = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.9 });
  const light = new THREE.MeshStandardMaterial({ color: 0xf3e6d3, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x9be05a, emissive: 0x3c6a12, emissiveIntensity: 0.6, roughness: 0.2 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe89aa6, roughness: 0.6 });

  // Körper zeigt nach +x
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fur);
  body.scale.set(0.2, 0.1, 0.09);
  body.position.y = 0.2;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), light);
  belly.scale.set(0.15, 0.07, 0.075);
  belly.position.set(0.03, 0.16, 0);
  cat.add(body, belly);

  const head = new THREE.Group();
  head.position.set(0.21, 0.3, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), fur);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), light);
  muzzle.position.set(0.055, -0.02, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), pink);
  nose.position.set(0.088, -0.008, 0);
  head.add(skull, muzzle, nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur);
    ear.position.set(-0.005, 0.07, side * 0.04);
    ear.rotation.x = side * -0.3;
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), eye);
    e.position.set(0.06, 0.018, side * 0.03);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), dark);
    pupil.position.set(0.07, 0.018, side * 0.031);
    pupil.scale.set(0.6, 1.4, 0.6);
    head.add(ear, e, pupil);
  }
  cat.add(head);

  const legs = [];
  for (const [x, z] of [[0.12, 0.05], [0.12, -0.05], [-0.12, 0.05], [-0.12, -0.05]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.17, z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.17, 8), fur);
    mesh.position.y = -0.085;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), light);
    paw.position.y = -0.165;
    paw.scale.y = 0.6;
    leg.add(mesh, paw);
    cat.add(leg);
    legs.push(leg);
  }

  // Schwanz: geschwungene Röhre, die als Ganzes wedelt
  const tail = new THREE.Group();
  tail.position.set(-0.18, 0.23, 0);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.08, 0.05, 0),
    new THREE.Vector3(-0.12, 0.15, 0), new THREE.Vector3(-0.1, 0.24, 0),
  ]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 8), fur));
  cat.add(tail);

  cat.userData.parts = { head, legs, tail, body };
  cat.traverse((o) => { o.castShadow = true; });
  return cat;
}

// Herzchen, die beim Streicheln aufsteigen
let heartTexture = null;
function createHeart() {
  if (!heartTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '52px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', 32, 36);
    heartTexture = new THREE.CanvasTexture(canvas);
    heartTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.08, 0.08, 1);
  sprite.raycast = () => {};
  return sprite;
}

// onEvent(type): 'pet' | 'meow' | 'knock' – für Sound, Meldungen und Erfolge
export function createCat({ economy, tableHeight, onEvent }) {
  const group = new THREE.Group();
  const cat = createCatModel();
  group.add(cat);
  const { head, legs, tail, body } = cat.userData.parts;
  const hearts = [];

  // Zustand: was er gerade tut, wohin er will, wie lange noch
  let state = 'idle';
  let timer = 2;
  let walkPhase = 0;
  let time = 0;
  let target = null;      // Laufziel { x, z }
  let afterWalk = null;   // was nach dem Ankommen passiert
  let jump = null;        // { from, to, t }
  let seat = null;        // { printerId, x } wenn er auf dem Tisch sitzt
  let meowTimer = rand(20, 40);
  cat.position.set(-3, 0, 4);

  function faceTowards(x, z) {
    cat.rotation.y = Math.atan2(-(z - cat.position.z), x - cat.position.x);
  }

  function walkTo(x, z, then) {
    target = { x, z };
    afterWalk = then;
    state = 'walk';
    faceTowards(x, z);
  }

  function randomFloorSpot() {
    for (let i = 0; i < 20; i++) {
      const x = rand(HALL.minX, HALL.maxX);
      const z = rand(HALL.minZ, HALL.maxZ);
      // nicht in Tisch oder Computertisch
      if (Math.abs(z) < 0.7 && x > -3 && x < 5) continue;
      return { x, z };
    }
    return { x: 0, z: 4 };
  }

  // Lieber zu Druckern mit fertigem Teil – da gibt es was zu schubsen
  function pickPrinterSeat() {
    const onTable = economy.printers.filter((p) => p.location === 'table');
    if (!onTable.length) return null;
    const done = onTable.filter((p) => p.job?.status === 'done');
    const printer = done.length && Math.random() < 0.6
      ? done[Math.floor(Math.random() * done.length)]
      : onTable[Math.floor(Math.random() * onTable.length)];
    // Regalplatz i liegt rechts neben Druckerplatz i: steht dort ein Regal, sitzt er oben drauf
    const rack = economy.furniture.find((f) => f.location === 'table' && f.slot === printer.slot);
    if (rack) return { printerId: printer.id, x: RACK_SLOTS_X[rack.slot], y: furnitureSize(rack.type).y };
    return { printerId: printer.id, x: PRINTER_SLOTS_X[printer.slot] + SEAT_OFFSET_X, y: 0 };
  }

  function decide() {
    const roll = Math.random();
    if (roll < 0.35) {
      const s = pickPrinterSeat();
      if (s) {
        walkTo(s.x, TABLE_FRONT_Z, () => {
          seat = s;
          startJump(new THREE.Vector3(s.x, tableHeight + s.y, s.y ? 0 : TABLE_SEAT_Z), 'onTable');
        });
        return;
      }
    }
    if (roll > 0.85) {
      state = 'sleep';
      timer = rand(10, 20);
      return;
    }
    const spot = randomFloorSpot();
    walkTo(spot.x, spot.z, () => {
      state = 'idle';
      timer = rand(2, 6);
    });
  }

  function startJump(to, next) {
    jump = { from: cat.position.clone(), to, t: 0, next };
    state = 'jump';
  }

  function finishTableVisit() {
    // Vor dem Runterspringen: fertiges Teil vom Nachbardrucker schubsen?
    const printer = seat && economy.printerById(seat.printerId);
    if (printer?.job?.status === 'done' && Math.random() < KNOCK_CHANCE) {
      const x = PRINTER_SLOTS_X[printer.slot] + rand(-0.3, 0.3);
      if (economy.knockPartOff(printer.id, x, rand(0.7, 1.1))) onEvent?.('knock');
    }
    seat = null;
    startJump(new THREE.Vector3(cat.position.x, 0, TABLE_FRONT_Z), 'idle');
  }

  function pet() {
    if (state === 'jump') return;
    if (state === 'walk') {
      state = 'idle';
      target = null;
    }
    if (state !== 'onTable') state = 'idle';
    timer = Math.max(timer, 2.5);
    for (let i = 0; i < 3; i++) {
      const heart = createHeart();
      heart.position.set(cat.position.x + rand(-0.08, 0.08), cat.position.y + 0.4 + i * 0.05, cat.position.z + rand(-0.08, 0.08));
      heart.userData.age = -i * 0.15;
      group.add(heart);
      hearts.push(heart);
    }
    onEvent?.('pet');
  }

  cat.userData.interaction = {
    hint: () => (state === 'sleep' ? `Linksklick: ${NAME} sanft wecken und streicheln` : `Linksklick: ${NAME} streicheln`),
    action: pet,
  };

  function update(dt) {
    time += dt;
    timer -= dt;
    let moving = false;

    if (state === 'walk') {
      const dx = target.x - cat.position.x;
      const dz = target.z - cat.position.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        cat.position.x = target.x;
        cat.position.z = target.z;
        target = null;
        afterWalk?.();
      } else {
        cat.position.x += (dx / dist) * step;
        cat.position.z += (dz / dist) * step;
        moving = true;
      }
    } else if (state === 'jump') {
      jump.t = Math.min(1, jump.t + dt / JUMP_SECONDS);
      cat.position.lerpVectors(jump.from, jump.to, jump.t);
      cat.position.y += Math.sin(jump.t * Math.PI) * 0.35; // Bogen
      if (jump.t >= 1) {
        cat.position.copy(jump.to);
        state = jump.next;
        jump = null;
        if (state === 'onTable') {
          timer = rand(6, 12);
          cat.rotation.y = Math.PI; // schaut zum Drucker links neben sich
        } else {
          timer = rand(1, 3);
        }
      }
    } else if (state === 'onTable' && timer <= 0) {
      finishTableVisit();
    } else if ((state === 'idle' || state === 'sleep') && timer <= 0) {
      decide();
    }

    // Laufanimation: Beine pendeln, Kopf nickt leicht. Schlafen: flach zusammengerollt.
    walkPhase += dt * (moving ? 12 : 0);
    legs.forEach((leg, i) => {
      leg.rotation.z = moving ? Math.sin(walkPhase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0;
    });
    const sleeping = state === 'sleep';
    body.scale.y = sleeping ? 0.075 : 0.1;
    cat.scale.y = THREE.MathUtils.damp(cat.scale.y, sleeping ? 0.6 : 1, 6, dt);
    head.rotation.z = moving ? Math.sin(walkPhase * 2) * 0.05 : sleeping ? -0.4 : Math.sin(time * 0.7) * 0.15;
    tail.rotation.x = Math.sin(time * (sleeping ? 0.8 : 2.2)) * (sleeping ? 0.1 : 0.45);

    // Gelegentlich miauen
    if (!sleeping && (meowTimer -= dt) <= 0) {
      meowTimer = rand(25, 60);
      onEvent?.('meow');
    }

    for (let i = hearts.length - 1; i >= 0; i--) {
      const heart = hearts[i];
      heart.userData.age += dt;
      if (heart.userData.age < 0) continue;
      heart.position.y += dt * 0.25;
      heart.material.opacity = Math.max(0, 1 - heart.userData.age / 1.4);
      if (heart.userData.age > 1.4) {
        group.remove(heart);
        heart.material.dispose();
        hearts.splice(i, 1);
      }
    }
  }

  return { group, update, get position() { return cat.position; } };
}
