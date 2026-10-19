// Farbwechsel bei Druckern mit einer Düse und AMS (P1P, P1S, P2S, H2S) in der Halle: Braucht der Druck eine andere
// Farbe, fährt der Kopf zum Spültrichter hinten links, drückt Filament heraus – erst die alte Farbe, dann langsam
// die neue –, streift die Düse mit einem schnellen Ruck nach rechts ab (der Strang fällt in die Rutsche) und fährt
// zurück an die Stelle, an der er aufgehört hat.
// Reine Darstellung – Zeit und Spülabfall des Farbwechsels rechnet core/two-color.js ab.
import * as THREE from 'three';
import { filamentById } from '../core/catalog.js';
import { wantedNozzle } from './tool-changer.js';

const TRAVEL_SPEED = 0.22; // m/s – Eilgang zum Trichter und zurück
const WIPE_SPEED = 0.4;    // m/s – Abstreifen geht ruckartig
const WIPE_DISTANCE = 0.05; // m nach rechts
const PURGE_TIME = 2.2;    // s – so lange läuft Filament heraus
const SEGMENT_EVERY = 0.07; // s – alle so viele Sekunden kommt ein Stück Strang dazu
const SEGMENT_STEP = 0.0026; // m – so weit rutscht der Strang pro Stück nach unten
const FALL_SPEED = 0.5;    // m/s – abgestreifter Strang fällt in die Rutsche
const FALL_TIME = 0.3;     // s

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
  updateFalling(model, state, dt);

  const want = wantedNozzle(printer, point);
  if (want == null) {
    // Kein Druck mehr: Wechsel abbrechen, Strang fällt weg
    if (state.phase !== 'idle') dropBlob(state);
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
    dropBlob(state);
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

// Strang legen: das neueste Stück sitzt an der Düse, ältere rutschen erst senkrecht in den Trichter und dann
// die Rutsche hinunter
function layoutStrand(blob, { funnelDepth, chuteDir }) {
  const n = blob.children.length;
  blob.children.forEach((segment, i) => {
    const s = 0.003 + (n - 1 - i) * SEGMENT_STEP; // Abstand von der Düse entlang des Strangs
    const down = Math.min(s, funnelDepth);
    segment.position.set(0, -down, 0).addScaledVector(chuteDir, Math.max(0, s - funnelDepth)).add(segment.userData.jitter);
  });
}

// Strang von der Düse lösen: er fällt kurz nach unten in die Rutsche und verschwindet
function dropBlob(state) {
  if (!state.blob) return;
  (state.falling ??= []).push({ blob: state.blob, time: 0 });
  state.blob = null;
}

function updateFalling(model, state, dt) {
  if (!state.falling?.length) return;
  for (const f of state.falling) {
    f.time += dt;
    f.blob.position.y -= FALL_SPEED * dt;
  }
  for (const f of state.falling.filter((x) => x.time >= FALL_TIME)) {
    model.remove(f.blob);
    for (const s of f.blob.children) s.material.dispose();
  }
  state.falling = state.falling.filter((x) => x.time < FALL_TIME);
}
