// Empfangskraft als Figur hinter dem Tresen (falls in der Personal-App eingestellt): winkt jedem Kunden zu, der zum
// Abgeben an den Tresen kommt, tippt den Auftrag kurz in den Rechner und nimmt ihn an. Beim Abholen kassiert sie.
// Wer wann was darf, steht in core/staff.js und core/reception.js – hier nur Figur, Zeitablauf und Blickrichtung.
import * as THREE from 'three';
import { RECEPTION_WAGE } from '../core/staff.js';
import { createPerson } from '../models/people.js';
import { RECEPTION_SPOTS } from './reception.js';
import { createNameTag } from '../models/name-tag.js';

const GREET_SECONDS = 1.6;   // winken
const TYPE_SECONDS = 1.8;    // Auftrag in den Rechner tippen, dann ist er angenommen
const TURN_SPEED = 6;
const LOOKS = { Nina: 'suit-woman', Jan: 'business-man' };

const hitboxGeometry = new THREE.BoxGeometry(0.5, 1.8, 0.4).translate(0, 0.9, 0);
const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

// staff: core/staff.js (wer eingestellt ist) · reception: core/reception.js · customers: world/customers.js
export function createReceptionist({ staff, reception, customers }) {
  const group = new THREE.Group();
  const spot = RECEPTION_SPOTS.staff;
  let current = null; // { name, holder, person }
  let serving = null; // Kunde, der gerade bedient wird
  let phase = 'idle'; // 'idle' | 'greet' | 'type'
  let timer = 0;

  function statusText() {
    if (phase === 'greet') return `begrüßt ${serving.customer}`;
    if (phase === 'type') return `nimmt den Auftrag von ${serving.customer} an`;
    if (customers.paying()) return 'kassiert gerade';
    return 'wartet auf Kunden';
  }

  function add(receptionist) {
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(hitboxGeometry, hitboxMaterial));
    const tag = createNameTag(`Empfang ${receptionist.name}`);
    tag.position.y = 2.05;
    holder.add(tag);
    holder.position.set(spot.x, 0, spot.z);
    holder.rotation.y = spot.heading;
    holder.userData.interaction = { hint: () => `${receptionist.name} am Empfang ${statusText()} · Lohn ${RECEPTION_WAGE} €/h` };
    group.add(holder);
    const entry = { name: receptionist.name, holder, person: null };
    current = entry;
    createPerson(LOOKS[receptionist.name] ?? 'casual-woman').then((person) => {
      if (current !== entry) return; // inzwischen entlassen
      person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      entry.person = person;
      holder.add(person.object);
    }).catch((err) => console.warn('Empfangskraft konnte nicht geladen werden', err));
  }

  function remove() {
    group.remove(current.holder);
    current = null;
    serving = null;
    phase = 'idle';
  }

  function turnTowards(target, dt) {
    const pos = current.holder.position;
    const want = target ? Math.atan2(target.x - pos.x, target.z - pos.z) : spot.heading;
    const a = current.holder.rotation.y;
    const diff = Math.atan2(Math.sin(want - a), Math.cos(want - a));
    current.holder.rotation.y = a + diff * Math.min(1, TURN_SPEED * dt);
  }

  // active: false, wenn der Spieler weit weg ist – dann läuft der Ablauf weiter, nur ohne Animation
  function update(dt, active) {
    const wanted = staff.receptionist;
    if (current && current.name !== wanted?.name) remove();
    if (!current && wanted) add(wanted);
    if (!current) return;

    // Neuer Kunde am Tresen: begrüßen, dann den Auftrag eintippen und annehmen
    const atCounter = customers.atCounter();
    if (serving && serving !== atCounter) {
      serving = null; // Spieler hat schon angenommen oder der Kunde ist gegangen
      phase = 'idle';
    }
    if (!serving && atCounter) {
      serving = atCounter;
      phase = 'greet';
      timer = GREET_SECONDS;
    }
    if (serving) {
      timer -= dt;
      if (timer <= 0 && phase === 'greet') {
        phase = 'type';
        timer = TYPE_SECONDS;
      } else if (timer <= 0 && phase === 'type') {
        reception.accept(serving.orderId);
        serving = null;
        phase = 'idle';
      }
    }

    const paying = customers.paying();
    const lookAt = phase === 'greet' ? serving.holder.position : paying?.holder.position ?? null;
    turnTowards(lookAt, dt);

    const p = current.person;
    if (!p || !active) return;
    if (phase === 'greet') p.play('Wave');
    else if (phase === 'type' || paying) p.play('Interact');
    else p.play('Idle');
    p.update(dt);
  }

  return { group, update, statusText };
}
