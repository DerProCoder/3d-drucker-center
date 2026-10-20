// Einrichtung des Empfangs im Eingangsbereich: Tresen (Aufträge annehmen), Wartestühle und das Abholregal, in dem
// fertige Aufträge als Pakete mit Kundennamen liegen. Die Abläufe stehen in core/reception.js, die Kunden als Figuren
// in world/customers.js. Hier: Möbel, Pakete im Regal und was ein Klick auf Tresen oder Regal bewirkt.
import * as THREE from 'three';
import { SHELF_SLOTS, orderSummary } from '../core/reception.js';
import {
  COUNTER, PICKUP_SHELF, CHAIR_SEAT, createCounter, createParcel, createPickupShelf, createWaitingChair,
} from '../models/reception-furniture.js';
import { createPlant } from '../models/office-furniture.js';
import { ENTRANCE } from './entrance.js';
import { canvasTexture } from './room.js';
import { mergeStatic } from '../models/merge-static.js';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Lage im Eingangsbereich (Welt-Koordinaten). heading: Blickrichtung der Figur an diesem Platz.
const COUNTER_POS = { x: -13.3, z: ENTRANCE.z0 + COUNTER.d / 2 + 0.55 };
const SHELF_POS = { x: -13.4, z: ENTRANCE.z1 - PICKUP_SHELF.d / 2 - 0.02 };
const CHAIR_X = ENTRANCE.x0 + 0.42;
export const RECEPTION_SPOTS = {
  counter: { x: COUNTER_POS.x - 0.2, z: COUNTER_POS.z + COUNTER.d / 2 + 0.5, heading: Math.PI },   // Kunde gibt ab
  pay: { x: COUNTER_POS.x + 0.8, z: COUNTER_POS.z + COUNTER.d / 2 + 0.5, heading: Math.PI },       // Kunde zahlt
  shelf: { x: SHELF_POS.x, z: SHELF_POS.z - PICKUP_SHELF.d / 2 - 0.55, heading: 0 },               // vor dem Regal
  staff: { x: COUNTER_POS.x + 0.05, z: ENTRANCE.z0 + 0.27, heading: 0 },                            // Empfangskraft neben dem Bildschirm
  chairs: [-2.3, -1.65, 1.65, 2.3].map((z) => ({
    stand: { x: CHAIR_X + 0.6, z }, seat: { x: CHAIR_X - 0.06, z }, y: CHAIR_SEAT, heading: Math.PI / 2,
  })),
};

function drawScreen(waiting, packed) {
  return (ctx, w, h) => {
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7ef0a8';
    ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText('EMPFANG', 16, 36);
    ctx.fillStyle = '#d9e4ee';
    ctx.font = '500 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Wartende Kunden: ${waiting}`, 16, 76);
    ctx.fillText(`Im Abholregal: ${packed} / ${SHELF_SLOTS}`, 16, 104);
  };
}

function drawSign(ctx, w, h) {
  ctx.fillStyle = '#1d2228';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ABHOLUNG', w / 2, h / 2 + 4);
}

function drawHours(ctx, w, h) {
  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#00ae42';
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Öffnungszeiten', 18, 29);
  ctx.fillStyle = '#222';
  ctx.font = '500 22px "Segoe UI", Arial, sans-serif';
  ['Mo–Fr  8–18 Uhr', 'Sa  9–14 Uhr', '', 'Bitte am Tresen klingeln.', 'Abholung: Regal rechts.'].forEach((t, i) => ctx.fillText(t, 18, 80 + i * 32));
}

// reception: core/reception.js · orders: Aufträge (für Änderungen) · customers: world/customers.js (wer am Tresen
// steht, welche Pakete gerade getragen werden) · collision: Kollision der Spielfigur · staff: für die Empfangskraft
export function createReceptionDesk({ reception, orders, customers, collision, staff }) {
  const group = new THREE.Group();

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 320;
  screenCanvas.height = 180;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  const counter = createCounter(new THREE.MeshBasicMaterial({ map: screenTexture }));
  counter.position.set(COUNTER_POS.x, 0, COUNTER_POS.z);
  group.add(counter);

  const shelf = createPickupShelf();
  shelf.position.set(SHELF_POS.x, 0, SHELF_POS.z);
  shelf.rotation.y = Math.PI; // Fächer zeigen in den Raum (-z)
  group.add(shelf);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.2), new THREE.MeshStandardMaterial({ map: canvasTexture(400, 80, drawSign), roughness: 0.5 }));
  sign.position.set(SHELF_POS.x, PICKUP_SHELF.h + 0.12, SHELF_POS.z + PICKUP_SHELF.d / 2 - 0.035);
  sign.rotation.y = Math.PI;
  group.add(sign);

  for (const c of RECEPTION_SPOTS.chairs) {
    const chair = createWaitingChair();
    chair.position.set(CHAIR_X, 0, c.stand.z);
    chair.rotation.y = Math.PI / 2; // Sitz zeigt in den Raum (+x)
    group.add(chair);
  }
  for (const [x, z] of [[ENTRANCE.x1 - 0.35, ENTRANCE.z0 + 0.35], [ENTRANCE.x1 - 0.35, ENTRANCE.z1 - 0.35]]) {
    const plant = createPlant();
    plant.position.set(x, 0, z);
    group.add(plant);
  }
  const hours = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: canvasTexture(300, 375, drawHours), roughness: 0.6 }));
  hours.position.set(COUNTER_POS.x, 1.75, ENTRANCE.z0 + 0.005);
  group.add(hours);

  // Pakete im Abholregal: eines je verpacktem Auftrag in seinem Fach
  const parcels = new THREE.Group();
  group.add(parcels);
  const parcelByOrder = new Map();
  function sync() {
    const packed = reception.packed;
    for (const [id, parcel] of parcelByOrder) {
      if (!packed.some((o) => o.id === id)) {
        parcels.remove(parcel);
        parcelByOrder.delete(id);
      }
    }
    for (const order of packed) {
      if (parcelByOrder.has(order.id)) continue;
      const parcel = createParcel(order.customer, orderSummary(order).split(' · ')[0]);
      const spot = shelf.userData.slots[order.shelfSlot % SHELF_SLOTS].clone();
      shelf.localToWorld(spot);
      parcel.position.copy(spot);
      parcel.rotation.y = Math.PI;
      parcel.userData.interaction = { hint: () => `Paket für ${order.customer} (${orderSummary(order)}) – wird bald abgeholt` };
      parcels.add(parcel);
      parcelByOrder.set(order.id, parcel);
    }
    drawScreen(reception.waiting.length, packed.length)(screenCanvas.getContext('2d'), screenCanvas.width, screenCanvas.height);
    screenTexture.needsUpdate = true;
  }
  orders.subscribe(sync);

  // Tresen: den Kunden, der dort steht, annehmen
  const counterInteraction = {
    hint: () => {
      const c = customers.atCounter();
      const order = c && orders.orderById(c.orderId);
      if (order) {
        const tags = `${order.rush ? ' ⚡ Eilauftrag' : ''}${order.special ? ' 🤪' : ''}`;
        const greeter = staff?.receptionist ? ` (sonst macht es gleich ${staff.receptionist.name})` : '';
        return `Linksklick: Auftrag von ${order.customer} annehmen${greeter} – ${orderSummary(order)} · ${euro.format(order.reward)}${tags}`;
      }
      const n = reception.waiting.length;
      return n ? `${n === 1 ? 'Ein Kunde ist' : `${n} Kunden sind`} auf dem Weg zum Tresen` : 'Empfang – gerade wartet niemand';
    },
    action: () => {
      const c = customers.atCounter();
      if (c) reception.accept(c.orderId);
    },
  };
  counter.userData.interaction = counterInteraction;
  customers.counterInteraction = counterInteraction; // auch ein Klick auf den Kunden am Tresen nimmt an

  // Abholregal: den ältesten fertigen Auftrag verpacken und einräumen
  shelf.userData.interaction = {
    hint: () => {
      const ready = reception.readyToPack[0];
      const used = `${reception.packed.length}/${SHELF_SLOTS} Fächer belegt`;
      if (ready && reception.freeSlot() === -1) return `Abholregal voll (${used}) – erst muss jemand abholen`;
      if (ready) return `Linksklick: Auftrag für ${ready.customer} verpacken und einräumen (${orderSummary(ready)})`;
      return `Abholregal: ${used} · gerade ist kein Auftrag komplett fertig`;
    },
    action: () => reception.pack(),
  };

  // Kollision: Tresen, Regal, Stühle
  const c = COUNTER_POS;
  const s = SHELF_POS;
  collision.addBox({ minX: c.x - COUNTER.w / 2 - 0.04, maxX: c.x + COUNTER.w / 2 + 0.04, minZ: c.z - COUNTER.d / 2, maxZ: c.z + COUNTER.d / 2 + 0.09 });
  collision.addBox({ minX: s.x - PICKUP_SHELF.w / 2, maxX: s.x + PICKUP_SHELF.w / 2, minZ: s.z - PICKUP_SHELF.d / 2, maxZ: ENTRANCE.z1 });
  for (const ch of RECEPTION_SPOTS.chairs) collision.addBox({ minX: CHAIR_X - 0.25, maxX: CHAIR_X + 0.25, minZ: ch.stand.z - 0.25, maxZ: ch.stand.z + 0.25 });

  // Paket wird gerade von einem Kunden getragen: im Regal ausblenden
  function update() {
    for (const [id, parcel] of parcelByOrder) parcel.visible = !customers.carrying.has(id);
  }

  mergeStatic(group); // Stühle, Pflanzen, Schilder pro Material zusammenfassen (Tresen, Regal, Pakete bleiben eigenständig)

  return { group, update };
}
