// Mini-Spiel Snake für den PC in der Halle („Filament-Snake“): Die Schlange frisst Filamentspulen, jedes neue
// Stück hat die Farbe der gefressenen Spule. Wand oder eigener Schwanz beenden die Runde. Ohne DOM – gezeichnet
// und gesteuert wird in ui/snake-app.js.
import { FILAMENTS } from './catalog.js';

export const GRID = { w: 20, h: 14 };
const START_LENGTH = 3;
const START_MS = 150;  // so lange dauert ein Schritt am Anfang
const MIN_MS = 70;     // schneller wird es nicht
const SPEEDUP_MS = 4;  // pro gefressener Spule
const MAX_QUEUED_TURNS = 2; // schnelle Doppel-Tipper (z. B. hoch, dann links) gehen nicht verloren

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// Futterfarben: kräftige Filamente – nicht zu dunkel fürs dunkle Spielfeld, keine fast weißen oder durchsichtigen
const brightness = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const FOOD_COLORS = [...new Set(FILAMENTS
  .filter((f) => !f.translucent && brightness(f.hex) > 0.25 && brightness(f.hex) < 0.92)
  .map((f) => f.hex.toUpperCase()))];
const START_COLOR = '#00AE42'; // Bambu-Grün

// random: Zufallszahl 0…1 (für Tests austauschbar)
export function createSnake(random = Math.random) {
  const y = Math.floor(GRID.h / 2);
  const state = {
    snake: Array.from({ length: START_LENGTH }, (_, i) => ({ x: 4 - i, y, color: START_COLOR })), // [0] = Kopf
    dir: DIRECTIONS.right,
    turns: [],
    food: null,
    score: 0,
    alive: true,
    stepMs: START_MS,
    random,
  };
  placeFood(state);
  return state;
}

// Richtung wechseln (Name aus DIRECTIONS). Umkehren in den eigenen Hals wird ignoriert.
export function turn(state, name) {
  const next = DIRECTIONS[name];
  const last = state.turns.at(-1) ?? state.dir;
  if (!next || state.turns.length >= MAX_QUEUED_TURNS) return;
  if (next.x === -last.x && next.y === -last.y) return; // genau entgegengesetzt
  if (next === last) return;
  state.turns.push(next);
}

// Ein Schritt. Rückgabe: 'eat' (Spule gefressen), 'die' (Runde vorbei) oder null
export function step(state) {
  if (!state.alive) return null;
  if (state.turns.length) state.dir = state.turns.shift();
  const head = state.snake[0];
  const x = head.x + state.dir.x;
  const y = head.y + state.dir.y;
  const eats = state.food && x === state.food.x && y === state.food.y;
  // Der Schwanz rückt im selben Schritt weiter – dorthin darf der Kopf, außer die Schlange wächst gerade
  const body = eats ? state.snake : state.snake.slice(0, -1);
  if (x < 0 || y < 0 || x >= GRID.w || y >= GRID.h || body.some((s) => s.x === x && s.y === y)) {
    state.alive = false;
    return 'die';
  }
  // Farben wandern mit: der Kopf bleibt grün, jedes Stück dahinter übernimmt die Farbe seines Vordermanns
  const colors = state.snake.map((s) => s.color);
  state.snake.unshift({ x, y, color: head.color });
  if (eats) {
    colors.splice(1, 0, state.food.color); // das neue Stück direkt hinter dem Kopf trägt die Farbe der Spule
    state.snake.forEach((s, i) => { s.color = colors[i] ?? s.color; });
    state.score++;
    state.stepMs = Math.max(MIN_MS, state.stepMs - SPEEDUP_MS);
    placeFood(state);
    return 'eat';
  }
  state.snake.pop();
  state.snake.forEach((s, i) => { s.color = colors[i]; });
  return null;
}

// Neue Spule auf ein freies Feld legen (null, wenn das ganze Feld voll Schlange ist)
function placeFood(state) {
  const free = [];
  for (let y = 0; y < GRID.h; y++) {
    for (let x = 0; x < GRID.w; x++) {
      if (!state.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  const spot = free[Math.floor(state.random() * free.length)];
  state.food = spot ? { ...spot, color: FOOD_COLORS[Math.floor(state.random() * FOOD_COLORS.length)] } : null;
}
