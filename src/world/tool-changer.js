// Düsenwechsel des H2C in der Halle: Braucht der Druck eine andere Farbe, fährt der Kopf nach rechts zum
// Düsenwechsler, hängt seine Düse in ihr Fach, holt die Düse der neuen Farbe und fährt zurück an die Stelle,
// an der er aufgehört hat. Jede Düse gehört zu einem AMS-Fach und trägt dessen Farbe.
// Reine Darstellung – Zeit und Filament des Wechsels rechnet core/two-color.js ab.
import { filamentById } from '../core/catalog.js';

const TRAVEL_SPEED = 0.22; // m/s – Eilgang zum Wechsler und zurück
const HOLD = 0.45;         // s – so lange dauert Ablegen bzw. Aufnehmen
const LANE_GAP = 0.05;     // m – so weit links vor dem Halter fährt der Kopf entlang, damit er an den Düsen vorbeikommt

// Fahrspur vor dem Halter (alle Wechselplätze liegen auf einer Linie von vorn nach hinten)
const laneX = (slots) => Math.min(...slots.map((s) => s.x)) - LANE_GAP;

// Weg zu einem Wechselplatz, ohne durch die anderen Düsen zu fahren: erst nach links vor den Halter, dort nach vorn
// bzw. hinten auf Höhe des Platzes, dann gerade hinein. from/to: Punkte { x, z }, to darf auch der Druckpunkt sein.
function routeVia(from, to, laneX) {
  const route = [];
  if (from.x > laneX) route.push({ x: laneX, z: from.z }); // aus dem Halter heraus
  if (to.x > laneX) {
    route.push({ x: Math.min(laneX, from.x), z: to.z });   // vor dem Halter entlang
    route.push({ x: to.x, z: to.z });                      // hinein
  } else {
    route.push({ x: to.x, z: to.z });
  }
  return route;
}

// Welche Düse (= welches AMS-Fach) gerade gebraucht wird: bei zwei- und mehrfarbigen Drucken je nach Farbe des
// Bahnpunkts
export function wantedNozzle(printer, point) {
  const job = printer.job;
  if (!job || (job.status !== 'printing' && job.status !== 'paused')) return null;
  if (job.slots) return job.slots[point?.color ?? 0] ?? job.slot;
  return point?.color === 1 && job.slot2 != null ? job.slot2 : job.slot;
}

// Farben der Socken an Kopf und Halter nach den eingelegten Spulen richten (nur wenn sich etwas geändert hat)
function syncColors(model, printer, state) {
  const hexes = printer.spools.map((s) => (s ? filamentById(s.filamentId).hex : null));
  const key = `${hexes.join(',')}|${state.current}`;
  if (state.colorKey === key) return;
  state.colorKey = key;
  const { rack } = model.userData.toolRack;
  hexes.forEach((hex, i) => rack.userData.setColor(i, hex));
  model.userData.printRig.head.userData.setHotendColor(hexes[state.current] ?? null);
}

// Nächster Schritt der Wechselbewegung. point: Bahnpunkt, an dem der Kopf gerade drucken will ({ x, z }).
// Gibt null zurück, wenn gedruckt werden kann, sonst die Position { x, z }, an die die Düse jetzt gehört.
export function updateToolChanger(model, printer, point, dt) {
  const rackInfo = model.userData.toolRack;
  const state = (model.userData.changer ??= { current: printer.activeSlot, phase: 'idle', pos: null, timer: 0, route: [] });
  const { slots, rack } = rackInfo;
  const want = wantedNozzle(printer, point);
  if (want == null && state.phase !== 'idle') {
    // Druck vorbei oder abgebrochen: Wechsel sofort abschließen, damit Kopf und Halter zusammenpassen
    if (state.phase !== 'drop') state.current = state.target;
    Object.assign(state, { phase: 'idle', timer: 0, colorKey: null });
  }

  if (state.phase === 'idle') {
    if (want == null || want === state.current || !point || !slots[want]) {
      syncColors(model, printer, state);
      slots.forEach((_, i) => rack.userData.setDocked(i, i !== state.current));
      return null;
    }
    // Wechsel beginnt: erst die eigene Düse in ihr Fach bringen
    const pos = { x: point.x, z: point.z };
    Object.assign(state, {
      phase: 'drop', target: want, pos, back: { ...pos }, route: routeVia(pos, slots[state.current], laneX(slots)),
    });
  }

  // Den Wegpunkten der Reihe nach folgen, auch über mehrere in einem Frame
  let stepLen = TRAVEL_SPEED * dt;
  while (state.route.length) {
    const goal = state.route[0];
    const dx = goal.x - state.pos.x;
    const dz = goal.z - state.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > stepLen) {
      state.pos.x += (dx / dist) * stepLen;
      state.pos.z += (dz / dist) * stepLen;
      return { ...state.pos };
    }
    state.pos.x = goal.x;
    state.pos.z = goal.z;
    stepLen -= dist;
    state.route.shift();
  }
  state.timer += dt;
  if (state.phase === 'drop' && state.timer >= HOLD) {
    rack.userData.setDocked(state.current, true); // Düse hängt wieder im Halter, Kopf ist leer
    model.userData.printRig.head.userData.setHotendColor(null);
    Object.assign(state, { phase: 'pick', timer: 0, route: routeVia(state.pos, slots[state.target], laneX(slots)) });
  } else if (state.phase === 'pick' && state.timer >= HOLD) {
    rack.userData.setDocked(state.target, false); // neue Düse sitzt im Kopf
    Object.assign(state, {
      phase: 'back', timer: 0, current: state.target, colorKey: null, route: routeVia(state.pos, state.back, laneX(slots)),
    });
    syncColors(model, printer, state);
  } else if (state.phase === 'back') {
    Object.assign(state, { phase: 'idle', timer: 0 });
    return null;
  }
  return { ...state.pos };
}

// Läuft gerade ein Wechsel? Dann wartet die Druckbahn.
export const isChangingTool = (model) => !!model.userData.changer && model.userData.changer.phase !== 'idle';
