// Passanten auf den Gehwegen: echte Figuren (models/people.js), die in beide Richtungen spazieren oder joggen.
// Am Ende des Gehwegs drehen sie um und wechseln manchmal die Straßenseite. Steht der Spieler im Weg, weichen sie aus,
// und manche winken ihm kurz zu. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { SIDEWALK_LANES, SIDEWALK_END } from './outdoor.js';
import { createPerson, peopleFor } from '../models/people.js';

const COUNT = 6;
const WALK_CLIP_SPEED = 1.45;     // bei diesem Tempo passt die Laufanimation
const RUN_CLIP_SPEED = 3.6;
const DODGE = 0.7;                // so weit weichen sie seitlich aus (m)
const WAVE_DISTANCE = 3.5;        // so nah muss der Spieler sein, damit jemand winkt
const WAVE_SECONDS = 2.2;

export function createPedestrians() {
  const group = new THREE.Group();
  const walkers = [];
  const choices = peopleFor('passer');

  for (let i = 0; i < COUNT; i++) {
    const jogger = i === COUNT - 1;
    const w = {
      lane: i % 2,
      dir: i % 3 ? 1 : -1,
      z: -SIDEWALK_END + (i + 0.5) * (2 * SIDEWALK_END / COUNT),
      speed: jogger ? 3.2 : 1.1 + Math.random() * 0.45,
      jogger,
      offset: 0,          // seitliches Ausweichen
      waved: false,
      waving: 0,
      person: null,
      holder: new THREE.Group(),
    };
    group.add(w.holder);
    walkers.push(w);
    createPerson(choices[(i * 5 + 3) % choices.length].id).then((person) => {
      person.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      w.person = person;
      w.holder.add(person.object);
    }).catch((err) => console.warn('Passant konnte nicht geladen werden', err));
  }

  // player: Position des Spielers (x, z) · active: false, wenn der Spieler drinnen ist – dann sparen sie die Animation
  function update(dt, player, active) {
    for (const w of walkers) {
      const laneX = SIDEWALK_LANES[w.lane];
      const dx = player.x - laneX;
      const ahead = (player.z - w.z) * w.dir;
      // Spieler auf dem Gehweg vor ihnen: zur Straßen- bzw. Heckenseite ausweichen
      const blocking = Math.abs(dx) < 0.9 && ahead > -0.5 && ahead < 3;
      const target = blocking ? (dx > 0 ? -DODGE : DODGE) : 0;
      w.offset += (target - w.offset) * Math.min(1, dt * 3);

      const near = Math.hypot(dx, player.z - w.z) < WAVE_DISTANCE;
      if (near && !w.waved && !w.jogger && Math.random() < 0.4) w.waving = WAVE_SECONDS;
      if (near) w.waved = true;
      else if (Math.abs(player.z - w.z) > 10) w.waved = false;

      if (w.waving > 0) {
        w.waving -= dt;
      } else {
        w.z += w.dir * w.speed * dt;
        if (Math.abs(w.z) > SIDEWALK_END) {
          w.z = Math.sign(w.z) * SIDEWALK_END;
          w.dir = -w.dir;
          if (Math.random() < 0.5) w.lane = 1 - w.lane; // über die Straße zur anderen Seite
        }
      }
      w.holder.position.set(laneX + w.offset, 0.03, w.z);
      w.holder.rotation.y = w.waving > 0 ? Math.atan2(player.x - laneX, player.z - w.z) : (w.dir > 0 ? 0 : Math.PI);
      if (!w.person || !active) continue;
      if (w.waving > 0) w.person.play('Wave');
      else if (w.jogger) w.person.play('Run', w.speed / RUN_CLIP_SPEED);
      else w.person.play('Walk', w.speed / WALK_CLIP_SPEED);
      w.person.update(dt);
    }
  }

  return { group, update };
}
