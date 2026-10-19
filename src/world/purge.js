// Farbwechsel bei Druckern mit einer Düse und AMS (P1P, P1S, P2S, H2S) in der Halle: Braucht der Druck eine andere
// Farbe, fährt der Kopf zum Spültrichter hinten links, drückt Filament heraus – erst die alte Farbe, dann langsam
// die neue –, streift die Düse mit einem schnellen Ruck nach rechts ab und fährt
// zurück an die Stelle, an der er aufgehört hat. Der Strang knüllt sich zusammen, rutscht die Rutsche hinunter
// und bleibt im Mülleimer liegen.
// Reine Darstellung – Zeit und Spülabfall des Farbwechsels rechnet core/two-color.js ab.
import * as THREE from 'three';
import { filamentById } from '../core/catalog.js';
import { WASTE_BIN_GRAMS } from '../core/economy.js';
import { wantedNozzle } from './tool-changer.js';

const TRAVEL_SPEED = 0.22; // m/s – Eilgang zum Trichter und zurück
const WIPE_SPEED = 0.4;    // m/s – Abstreifen geht ruckartig
const WIPE_DISTANCE = 0.05; // m nach rechts
const PURGE_TIME = 2.2;    // s – so lange läuft Filament heraus
const SEGMENT_EVERY = 0.07; // s – alle so viele Sekunden kommt ein Stück Strang dazu
const SEGMENT_STEP = 0.0026; // m – so weit rutscht der Strang pro Stück nach unten
const CLUMP_TIME = 0.25;    // s – so lange knüllt sich der abgestreifte Strang zusammen
const CLUMP_RADIUS = 0.006; // m
const SLIDE_SPEEDS = [0.12, 0.3, 0.45]; // m/s – über den Boden zur Rutsche, die Rutsche hinunter, in den Eimer
const MAX_PILE = 20;       // so viele Klumpen liegen in einem vollen Eimer

const segmentGeometry = new THREE.SphereGeometry(0.0034, 8, 6);
const GRAY = '#8a8d93';

// Farbe der Spule in einem Fach (grau, wenn das Fach gerade leer ist)
function slotColor(printer, slot) {
  const spool = printer.spools[slot];
  return new THREE.Color(spool ? filamentById(spool.filamentId).hex : GRAY);
}

// Nächster Schritt des Farbwechsels. point: Bahnpunkt, an dem der Kopf gerade drucken will ({ x, z, color }).
// Gibt null zurück, wenn gedruckt werden kann, sonst die Position { x, z }, an die die Düse jetzt gehört.
export function updatePurge(model, printer, point, dt) {
  const { spot, tipY } = model.userData.purge;
  const state = (model.userData.purgeState ??= { current: null, phase: 'idle', timer: 0, pos: null, blob: null });
  syncPile(model, printer, state);
  updateFalling(model, state, dt);

  const want = wantedNozzle(printer, point);
  if (want == null) {
    // Kein Druck mehr: Wechsel abbrechen, Strang fällt weg
    if (state.phase !== 'idle') dropBlob(model, state);
    Object.assign(state, { current: null, phase: 'idle', timer: 0 });
    return null;
  }

  if (state.phase === 'idle') {
    if (state.current == null) state.current = want; // erster Bahnpunkt: mit dieser Farbe ist er geladen
    if (want === state.current || !point) return null;
    // Gleiche Sorte aus einem anderen Fach (AMS füllt nach): kein Spülen nötig
    const a = printer.spools[state.current];
    const b = printer.spools[want];
    if (!a || !b || a.filamentId === b.filamentId) {
      state.current = want;
      return null;
    }
    Object.assign(state, {
      phase: 'travel', target: want, timer: 0, pos: { x: point.x, z: point.z }, back: { x: point.x, z: point.z },
      oldColor: slotColor(printer, state.current), newColor: slotColor(printer, want),
    });
  }

  if (state.phase === 'travel') {
    if (!moveTo(state, spot, TRAVEL_SPEED * dt)) return { ...state.pos };
    // Am Trichter: Strang beginnt
    state.blob = new THREE.Group();
    state.blob.position.set(spot.x, tipY, spot.z);
    model.add(state.blob);
    Object.assign(state, { phase: 'purge', timer: 0, nextSegment: 0 });
  }

  if (state.phase === 'purge') {
    state.timer += dt;
    while (state.nextSegment <= state.timer && state.nextSegment <= PURGE_TIME) {
      // Erst kommt noch die alte Farbe, dann mischt sich langsam die neue hinein
      const t = Math.min(1, state.nextSegment / PURGE_TIME);
      const color = state.oldColor.clone().lerp(state.newColor, THREE.MathUtils.smoothstep(t, 0.25, 0.85));
      const segment = new THREE.Mesh(segmentGeometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      segment.userData.jitter = new THREE.Vector3((Math.random() - 0.5) * 0.0012, 0, (Math.random() - 0.5) * 0.0012);
      state.blob.add(segment);
      layoutStrand(state.blob, model.userData.purge);
      state.nextSegment += SEGMENT_EVERY;
    }
    if (state.timer < PURGE_TIME) return { ...state.pos };
    state.current = state.target;
    dropBlob(model, state);
    Object.assign(state, { phase: 'wipe', wipeTo: { x: spot.x + WIPE_DISTANCE, z: spot.z } });
  }

  if (state.phase === 'wipe') {
    if (!moveTo(state, state.wipeTo, WIPE_SPEED * dt)) return { ...state.pos };
    state.phase = 'back';
  }

  if (state.phase === 'back') {
    if (!moveTo(state, state.back, TRAVEL_SPEED * dt)) return { ...state.pos };
    state.phase = 'idle';
    return null;
  }
  return null;
}

// Läuft gerade ein Farbwechsel? Dann wartet die Druckbahn.
export const isPurging = (model) => !!model.userData.purgeState && model.userData.purgeState.phase !== 'idle';

// Ein Stück weiter auf goal zu. true, wenn angekommen.
function moveTo(state, goal, stepLen) {
  const dx = goal.x - state.pos.x;
  const dz = goal.z - state.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > stepLen) {
    state.pos.x += (dx / dist) * stepLen;
    state.pos.z += (dz / dist) * stepLen;
    return false;
  }
  state.pos.x = goal.x;
  state.pos.z = goal.z;
  return true;
}

// Strang legen: das neueste Stück sitzt an der Düse, ältere fallen senkrecht auf den Boden des Spülfelds und
// schieben sich dort nach hinten zur Rutsche und sie hinunter
function layoutStrand(blob, purge) {
  const n = blob.children.length;
  const path = strandPath(purge);
  blob.children.forEach((segment, i) => {
    const s = 0.003 + (n - 1 - i) * SEGMENT_STEP; // Abstand von der Düse entlang des Strangs
    pointAlong(path, s, segment.position).add(segment.userData.jitter);
  });
}

// Weg des Strangs relativ zur Düsenspitze: runter auf den Boden, nach hinten zur Rutsche, dann die Rutsche hinab
function strandPath({ spot, tipY, funnelDepth, chuteStart, chuteDir }) {
  const floor = new THREE.Vector3(0, -funnelDepth + 0.006, 0);
  const start = new THREE.Vector3(chuteStart.x - spot.x, chuteStart.y - tipY + 0.005, chuteStart.z - spot.z);
  return [new THREE.Vector3(), floor, start, start.clone().addScaledVector(chuteDir, 1)];
}

// Punkt im Abstand s entlang eines Linienzugs (über das Ende hinaus auf der letzten Strecke weiter)
function pointAlong(path, s, target) {
  for (let i = 1; i < path.length; i++) {
    const len = path[i].distanceTo(path[i - 1]);
    if (s <= len || i === path.length - 1) return target.copy(path[i - 1]).lerp(path[i], len ? s / len : 0);
    s -= len;
  }
  return target.copy(path.at(-1));
}

// Strang von der Düse lösen: er knüllt sich zu einem Klumpen auf dem Boden des Spülfelds zusammen, rutscht zur
// Rutsche, sie hinunter und fällt in den Mülleimer, wo er liegen bleibt
function dropBlob(model, state) {
  const blob = state.blob;
  if (!blob) return;
  state.blob = null;
  const { spot, tipY, funnelDepth, chuteStart, chuteEnd, bin } = model.userData.purge;
  const lift = new THREE.Vector3(0, 0.006, 0);
  const local = pileSpot(bin);
  const waypoints = [
    new THREE.Vector3(spot.x, tipY - funnelDepth + 0.006, spot.z),
    chuteStart.clone().add(lift),
    chuteEnd.clone().add(lift),
    bin.position.clone().add(local),
  ];
  // Stücke beim Zusammenknüllen von ihrer Lage im Strang zu einem Klumpen um die Gruppenmitte ziehen
  const offset = new THREE.Vector3(spot.x, tipY, spot.z).sub(waypoints[0]);
  blob.position.copy(waypoints[0]);
  for (const segment of blob.children) {
    segment.userData.from = segment.position.clone().add(offset);
    segment.userData.to = clumpOffset();
    segment.position.copy(segment.userData.from);
  }
  (state.falling ??= []).push({ blob, time: 0, waypoints, leg: 1, local, bin });
}

// Klumpen weiterbewegen: erst zusammenknüllen, dann den Wegpunkten folgen, am Ende in den Eimer legen
function updateFalling(model, state, dt) {
  if (!state.falling?.length) return;
  for (const f of state.falling) {
    f.time += dt;
    if (f.time < CLUMP_TIME) {
      const t = THREE.MathUtils.smoothstep(f.time / CLUMP_TIME, 0, 1);
      for (const s of f.blob.children) s.position.lerpVectors(s.userData.from, s.userData.to, t);
      continue;
    }
    // Auf dem Boden des Spülfelds langsam, die Rutsche hinunter schneller, in den Eimer fallen am schnellsten
    let step = SLIDE_SPEEDS[f.leg - 1] * dt;
    while (f.leg < f.waypoints.length && step > 0) {
      const goal = f.waypoints[f.leg];
      const dist = f.blob.position.distanceTo(goal);
      if (dist > step) {
        f.blob.position.lerp(goal, step / dist);
        step = 0;
      } else {
        f.blob.position.copy(goal);
        step -= dist;
        f.leg++;
      }
    }
    f.blob.rotation.x += dt * 6; // kullert
    if (f.leg >= f.waypoints.length) {
      // Liegt im Eimer: dort bleibt er, statt eines älteren, wenn der Eimer schon so voll aussieht wie er ist
      for (const s of f.blob.children) s.position.copy(s.userData.to);
      model.remove(f.blob);
      addToPile(f.bin, f.blob, f.local);
      trimPile(f.bin, Math.max(1, state.wanted ?? MAX_PILE));
      f.done = true;
    }
  }
  state.falling = state.falling.filter((f) => !f.done);
}

// ---------- Inhalt des Mülleimers ----------
// Wie viele Klumpen im Eimer liegen, richtet sich nach dem Füllstand im Spielstand (printer.waste): leer nach dem
// Leeren, nach dem Laden eines Spielstands mit vollem Eimer gleich wieder gefüllt.

const PILE_COLORS = ['#d62f2f', '#f2f2f2', '#2f6fd6', '#1c1c1c', '#f2c419', '#2fb34a', '#f2802f'];

function syncPile(model, printer, state) {
  const { bin } = model.userData.purge;
  const pile = (bin.userData.pile ??= []);
  const waste = printer.waste ?? 0;
  state.wanted = Math.min(MAX_PILE, Math.ceil((waste / WASTE_BIN_GRAMS) * MAX_PILE));
  if (waste <= 0) {
    trimPile(bin, 0);
    return;
  }
  // Fehlende Klumpen (z. B. nach dem Laden) sofort hineinlegen – nicht die, die gerade unterwegs sind
  const coming = (state.falling?.length ?? 0) + (state.blob ? 1 : 0);
  while (pile.length + coming < state.wanted) {
    const color = new THREE.Color(PILE_COLORS[Math.floor(Math.random() * PILE_COLORS.length)]);
    const clump = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const segment = new THREE.Mesh(segmentGeometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      segment.position.copy(clumpOffset());
      clump.add(segment);
    }
    addToPile(bin, clump, pileSpot(bin));
  }
}

// Zufälliger Platz im Eimer, auf den Klumpen, die schon drin liegen
function pileSpot(bin) {
  const { w, d, h, pile = [] } = bin.userData;
  return new THREE.Vector3(
    (Math.random() - 0.5) * (w - 0.026), Math.min(h - 0.015, 0.012 + pile.length * 0.002), (Math.random() - 0.5) * (d - 0.026),
  );
}

const clumpOffset = () => new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * CLUMP_RADIUS);

function addToPile(bin, clump, local) {
  clump.position.copy(local);
  clump.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  bin.add(clump);
  (bin.userData.pile ??= []).push(clump);
}

// Älteste Klumpen entfernen, bis höchstens max übrig sind
function trimPile(bin, max) {
  const pile = bin.userData.pile ?? [];
  while (pile.length > max) {
    const old = pile.shift();
    bin.remove(old);
    for (const s of old.children) s.material.dispose();
  }
}
