// Kunden als Figuren: Wer einen Auftrag abgeben will, kommt über den Gehweg und den Gartenweg zum Empfang, wartet am
// Tresen (oder setzt sich, solange dort schon jemand steht) und geht wieder, sobald man annimmt. Liegt ein Auftrag im
// Abholregal, kommt der Kunde, nimmt sein Paket, zahlt am Tresen und trägt es nach Hause. Wer einen Server (VM)
// mieten will, wartet genauso am Tresen, auf einem Stuhl oder auf der Terrasse, bis man am PC annimmt (winkt und
// geht) oder die Anfrage verfällt (geht einfach). Die Abläufe stehen in core/reception.js und core/server-rentals.js,
// hier geht es nur ums Laufen und Aussehen. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { createPerson, peopleFor } from '../models/people.js';
import { createParcel } from '../models/reception-furniture.js';
import { orderSummary } from '../core/reception.js';
import { ENTRANCE_PATH } from './entrance.js';
import { SIDEWALK_LANES, SIDEWALK_END } from './outdoor.js';
import { RECEPTION_SPOTS, rentalHint } from './reception.js';

const WALK_SPEED = [1.15, 1.45];
const WALK_CLIP_SPEED = 1.45;
const TURN_SPEED = 7;
const SPAWN_GAP = 2.5;            // s zwischen zwei neuen Kunden
const SPAWN_Z = 24;               // hier tauchen sie auf dem Gehweg auf (im Dunst)
const TAKE_SECONDS = 1.6;
const PAY_SECONDS = 1.4;
const WAVE_SECONDS = 1.6;
const LANE_X = SIDEWALK_LANES[0];
const GATE = { x: LANE_X, z: ENTRANCE_PATH.frontOutside.z }; // Gehweg vor dem Gartenweg
const TERRACE = [{ x: -18.6, z: -1.5 }, { x: -18.6, z: 1.5 }]; // falls drinnen alles voll ist

// Bekannte Kunden bekommen eine passende Figur, alle anderen eine feste zufällige
const LOOKS = {
  'Opa Heinz': 'farmer-man',
  'Tante Erika': 'formal-woman',
  'Jonas (12)': 'hoodie-man',
  'Influencerin @PrintQueen': 'punk-woman',
  'Autohaus Neumann': 'business-man',
  'Werkstatt Hoffmann': 'worker-man',
  'Fahrradladen Becker': 'casual-man',
  'Bäckerei Schmidt': 'casual-woman',
  'Blumen Wagner': 'worker-woman',
  'Café Sonnenschein': 'suit-woman',
  'Familie Yılmaz': 'casual-man',
  'Modellbau Krause': 'punk-man',
  'Schülerfirma Gymnasium Nord': 'punk-woman',
  'Spieleladen Würfelglück': 'hoodie-man',
  'Hausmeister Krawuttke': 'worker-man',
  // Server-Kunden (core/server-rentals.js)
  'Startup Wolkig GmbH': 'business-man',
  'Gaming-Clan Pixelsturm': 'hoodie-man',
  'Onlineshop Kaffeebohne': 'casual-woman',
  'Lehrstuhl Informatik': 'formal-woman',
  'Agentur Klickwerk': 'punk-man',
  'Praxis Dr. Sommer': 'suit-woman',
  'Stadtwerke Talheim': 'worker-man',
  'KI-Labor Neuronix': 'business-man',
  'Hobbyfunk e.V.': 'farmer-man',
};
const SCALE = { 'Jonas (12)': 0.78 };

function lookFor(customer) {
  if (LOOKS[customer]) return LOOKS[customer];
  const choices = peopleFor('customer');
  let hash = 0;
  for (const ch of customer) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return choices[hash % choices.length].id;
}

const hitboxGeometry = new THREE.BoxGeometry(0.5, 1.8, 0.4).translate(0, 0.9, 0);
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

function turnTowards(object, b, dt) {
  const a = object.rotation.y;
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  object.rotation.y = a + diff * Math.min(1, TURN_SPEED * dt);
}

// reception: core/reception.js · orders: Aufträge · rentals: core/server-rentals.js (VM-Anfragen, optional)
// onEvent(type, data): 'arrived' { customer } (Kunde steht am Tresen) bzw. { customer, request } (Server-Kunde ist an
// seinem Warteplatz angekommen – einmal je Anfrage, egal ob Tresen, Stuhl oder Terrasse)
export function createCustomers({ reception, orders, rentals = null, onEvent = () => {} }) {
  const group = new THREE.Group();
  const customers = [];
  const carrying = new Set();   // Aufträge, deren Paket gerade jemand trägt
  let spawnTimer = 0;

  const byOrder = (id, kind) => customers.find((c) => c.orderId === id && c.kind === kind);
  const byRequest = (id) => customers.find((c) => c.requestId === id && c.kind === 'server');
  const waits = (c) => c.kind === 'dropoff' || c.kind === 'server'; // braucht einen Platz am Tresen
  const counterTaken = (except) => customers.some((c) => c !== except && c.spot === 'counter' && c.phase !== 'leave');
  const chairTaken = (i, except) => customers.some((c) => c !== except && c.spot === i && c.phase !== 'leave');

  // Weg von draußen herein bzw. hinaus. Drinnen geht es ab der Haustür geradeaus zum Platz.
  const wayIn = (target) => [{ x: LANE_X, z: GATE.z }, ENTRANCE_PATH.frontOutside, ENTRANCE_PATH.frontInside, target];
  const wayOut = (exitZ) => [ENTRANCE_PATH.frontInside, ENTRANCE_PATH.frontOutside, GATE, { x: LANE_X, z: exitZ }];

  // Platz für einen Kunden, der abgeben oder mieten will: Tresen, sonst ein Stuhl, sonst draußen auf der Terrasse
  function waitingSpot(c) {
    if (!counterTaken(c)) return 'counter';
    for (let i = 0; i < RECEPTION_SPOTS.chairs.length; i++) if (!chairTaken(i, c)) return i;
    return 'terrace';
  }

  function spotPoint(c) {
    if (c.spot === 'counter') return RECEPTION_SPOTS.counter;
    if (c.spot === 'terrace') return TERRACE[c.id % 2];
    if (c.spot === 'shelf') return RECEPTION_SPOTS.shelf;
    if (c.spot === 'pay') return RECEPTION_SPOTS.pay;
    return RECEPTION_SPOTS.chairs[c.spot].stand;
  }

  let nextId = 1;
  // source: Auftrag (dropoff, pickup) oder VM-Anfrage (server)
  function spawn(source, kind) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(hitboxGeometry, hitboxMaterial));
    holder.position.set(LANE_X, 0.03, side * SPAWN_Z);
    const c = {
      id: nextId++, orderId: kind === 'server' ? null : source.id, requestId: kind === 'server' ? source.id : null,
      customer: source.customer, kind, holder, person: null, path: [], phase: 'enter', announced: false, spot: null, heading: 0, timer: 0, exitZ: -side * SIDEWALK_END, parcel: null,
      speed: WALK_SPEED[0] + Math.random() * (WALK_SPEED[1] - WALK_SPEED[0]),
    };
    c.spot = kind === 'pickup' ? 'shelf' : waitingSpot(c);
    c.path = [{ x: LANE_X, z: side * SPAWN_Z }, ...wayIn(spotPoint(c))];
    holder.userData.interaction = {
      hint: () => {
        if (c.phase === 'counter' && api.counterInteraction) return api.counterInteraction.hint();
        if (c.kind === 'server') {
          const request = rentals?.requestById(c.requestId);
          return request ? rentalHint(request) : c.customer;
        }
        const o = orders.orderById(c.orderId);
        if (c.kind === 'pickup') return `${c.customer} holt ab: ${o ? orderSummary(o) : 'Paket'}`;
        if (c.phase === 'seated' || c.phase === 'enter') return `${c.customer} wartet auf den Tresen${o ? ` (${orderSummary(o)})` : ''}`;
        return c.customer;
      },
      action: () => { if (c.phase === 'counter') api.counterInteraction?.action(); },
    };
    group.add(holder);
    customers.push(c);
    createPerson(lookFor(source.customer)).then((person) => {
      person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      person.setScale(SCALE[source.customer] ?? 1);
      c.person = person;
      holder.add(person.object);
    }).catch((err) => console.warn('Kunde konnte nicht geladen werden', err));
  }

  function leave(c) {
    c.phase = 'leave';
    c.spot = null;
    c.path = [{ x: c.holder.position.x, z: c.holder.position.z }, ...wayOut(c.exitZ)];
  }

  function holdParcel(c, order) {
    c.parcel = createParcel(order.customer, orderSummary(order).split(' · ')[0], { w: 0.36, h: 0.24, d: 0.28 });
    c.holder.add(c.parcel);
  }

  // Am Ziel angekommen
  function arrive(c) {
    if (c.phase === 'leave') return; // am Rand angekommen, wird unten entfernt (hat keinen Platz mehr)
    const p = spotPoint(c);
    if (c.kind === 'pickup') {
      if (c.spot === 'shelf') {
        c.phase = 'take';
        c.timer = TAKE_SECONDS;
      } else {
        c.phase = 'pay';
        c.timer = PAY_SECONDS;
      }
      c.heading = p.heading;
      return;
    }
    // Server-Kunden melden sich gleich am ersten Platz – angenommen wird ja am PC, nicht am Tresen
    if (c.kind === 'server' && !c.announced) {
      c.announced = true;
      const request = rentals?.requestById(c.requestId);
      if (request) onEvent('arrived', { customer: c.customer, request });
    }
    if (c.spot === 'counter') {
      c.phase = 'counter';
      c.heading = p.heading;
      if (c.kind === 'dropoff') onEvent('arrived', { customer: c.customer });
    } else if (typeof c.spot === 'number') {
      const chair = RECEPTION_SPOTS.chairs[c.spot];
      c.holder.position.set(chair.seat.x, 0, chair.seat.z);
      c.heading = chair.heading;
      c.holder.rotation.y = chair.heading;
      c.phase = 'seated';
    } else {
      c.phase = 'seated'; // draußen auf der Terrasse stehen bleiben
      c.heading = Math.PI / 2;
    }
  }

  function updateCustomer(c, dt, active) {
    const order = orders.orderById(c.orderId);
    // Abgabe erledigt (angenommen, abgelehnt oder zu lange gewartet): verabschieden und gehen
    if (c.kind === 'dropoff' && c.phase !== 'leave' && c.phase !== 'farewell' && order?.stage !== 'counter') {
      if (order && c.phase === 'counter') {
        c.phase = 'farewell';
        c.timer = WAVE_SECONDS;
      } else {
        leave(c);
      }
    }
    // Server-Anfrage erledigt: am PC angenommen (winken, auch vom Stuhl aus) oder verfallen/abgelehnt (einfach gehen)
    if (c.kind === 'server' && c.phase !== 'leave' && c.phase !== 'farewell' && !rentals?.requestById(c.requestId)) {
      if (rentals?.vmById(c.requestId) && (c.phase === 'counter' || c.phase === 'seated')) {
        if (typeof c.spot === 'number') {
          const chair = RECEPTION_SPOTS.chairs[c.spot];
          c.holder.position.set(chair.stand.x, 0, chair.stand.z); // vom Stuhl aufstehen
        }
        c.phase = 'farewell';
        c.timer = WAVE_SECONDS;
      } else {
        leave(c);
      }
    }
    // Wartet auf einem Stuhl oder draußen und der Tresen ist frei: aufstehen und hingehen
    if (waits(c) && c.phase === 'seated' && !counterTaken(c)) {
      if (typeof c.spot === 'number') {
        const chair = RECEPTION_SPOTS.chairs[c.spot];
        c.holder.position.set(chair.stand.x, 0, chair.stand.z);
      }
      c.spot = 'counter';
      c.phase = 'enter';
      c.path = c.holder.position.x < ENTRANCE_PATH.frontInside.x - 0.5
        ? [ENTRANCE_PATH.frontOutside, ENTRANCE_PATH.frontInside, RECEPTION_SPOTS.counter]
        : [RECEPTION_SPOTS.counter];
    }

    let moving = false;
    const pos = c.holder.position;
    if (c.path.length) {
      const next = c.path[0];
      const dx = next.x - pos.x;
      const dz = next.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = c.speed * dt;
      if (dist > 1e-3) c.heading = Math.atan2(dx, dz);
      if (dist <= step) {
        pos.x = next.x;
        pos.z = next.z;
        c.path.shift();
        if (!c.path.length) arrive(c);
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
      }
      moving = true;
    } else if (c.phase === 'take' || c.phase === 'pay' || c.phase === 'farewell') {
      c.timer -= dt;
      if (c.timer <= 0) {
        if (c.phase === 'take') {
          if (order) {
            carrying.add(order.id);
            holdParcel(c, order);
          }
          c.spot = 'pay';
          c.phase = 'enter';
          c.path = [RECEPTION_SPOTS.pay];
        } else if (c.phase === 'pay') {
          if (order) reception.handOver(order.id);
          carrying.delete(c.orderId);
          leave(c);
        } else {
          leave(c);
        }
      }
    }
    if (c.phase === 'seated' && typeof c.spot === 'number') c.holder.rotation.y = c.heading;
    else turnTowards(c.holder, c.heading, dt);

    if (!c.person || !active) return;
    const p = c.person;
    const onChair = c.phase === 'seated' && typeof c.spot === 'number';
    p.sitDown(onChair ? RECEPTION_SPOTS.chairs[c.spot].y : null);
    p.arms = c.parcel ? 'carry' : null;
    if (moving) p.play('Walk', c.speed / WALK_CLIP_SPEED);
    else if (c.phase === 'farewell') p.play('Wave');
    else if (c.phase === 'take' || c.phase === 'pay') p.play('Interact');
    else p.play(c.phase === 'seated' ? 'Idle_Neutral' : 'Idle');
    p.update(dt);
    if (c.parcel) {
      const hands = p.handsCenter();
      c.parcel.position.set(0, hands.y - 0.12, hands.z + 0.05);
    }
  }

  // active: false, wenn der Spieler weit weg ist – dann laufen sie weiter, sparen aber die Animation
  function update(dt, active) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const dropoff = reception.waiting.find((o) => !byOrder(o.id, 'dropoff'));
      const rental = rentals?.requests.find((r) => !byRequest(r.id));
      const pickup = reception.duePickups.find((o) => !byOrder(o.id, 'pickup'));
      const next = dropoff ? [dropoff, 'dropoff'] : rental ? [rental, 'server'] : pickup ? [pickup, 'pickup'] : null;
      if (next) {
        spawn(...next);
        spawnTimer = SPAWN_GAP;
      }
    }
    for (const c of customers) updateCustomer(c, dt, active);
    // Wer den Gehweg verlassen hat, verschwindet
    for (let i = customers.length - 1; i >= 0; i--) {
      const c = customers[i];
      if (c.phase === 'leave' && !c.path.length) {
        group.remove(c.holder);
        customers.splice(i, 1);
      }
    }
  }

  // Kunde, der gerade am Tresen steht und auf die Annahme wartet
  const atCounter = () => customers.find((c) => c.kind === 'dropoff' && c.phase === 'counter') ?? null;
  // Server-Kunde, der am Tresen steht und auf die Annahme am PC wartet
  const serverAtCounter = () => customers.find((c) => c.kind === 'server' && c.phase === 'counter') ?? null;
  // Kunde, der nach dem Abholen gerade am Tresen bezahlt
  const paying = () => customers.find((c) => c.kind === 'pickup' && c.phase === 'pay' && !c.path.length) ?? null;
  // Positionen für die Haustür (öffnet sich, wenn jemand davorsteht)
  const positions = () => customers.map((c) => c.holder.position);

  // counterInteraction setzt world/reception.js – ein Klick auf den Kunden am Tresen wirkt wie einer auf den Tresen
  const api = { group, update, atCounter, serverAtCounter, paying, positions, carrying, counterInteraction: null };
  return api;
}
