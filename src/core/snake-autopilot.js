// Auto-Modus für Filament-Snake: Die Schlange holt alle Spulen von selbst und stirbt nie, bis das Feld voll ist.
// Grundlage ist ein fester Rundweg über alle Felder (Hamilton-Kreis). Solange die Schlange ihm folgt, kann sie sich
// nicht einsperren. Abkürzungen Richtung Spule nimmt sie nur, wenn der Schwanz danach noch vor ihr auf dem Rundweg
// liegt – und gar nicht mehr, sobald sie die Hälfte des Felds füllt. Ohne DOM, gesteuert wird in ui/snake-app.js.
import { DIRECTIONS, GRID } from './snake.js';

const SAFETY = 3;             // so viele Felder Abstand zum Schwanz hält eine Abkürzung mindestens
const SHORTCUTS_UNTIL = 0.5;  // ab diesem Anteil belegter Felder nur noch stur dem Rundweg nach

// Rundweg über alle Felder bei gerader Zeilenzahl: Zeile 0 nach rechts, dann Schlangenlinien durch die Spalten ab 1
// nach unten, zuletzt in Spalte 0 wieder hoch zum Anfang.
function rowCycle(w, h) {
  const cells = [];
  for (let x = 0; x < w; x++) cells.push({ x, y: 0 });
  for (let y = 1; y < h; y++) {
    if (y % 2) for (let x = w - 1; x >= 1; x--) cells.push({ x, y });
    else for (let x = 1; x < w; x++) cells.push({ x, y });
  }
  for (let y = h - 1; y >= 1; y--) cells.push({ x: 0, y });
  return cells;
}

// Bei ungerader Zeilen-, aber gerader Spaltenzahl denselben Weg gespiegelt (x und y getauscht)
function buildCycle(w, h) {
  if (h % 2 === 0) return rowCycle(w, h);
  if (w % 2 === 0) return rowCycle(h, w).map(({ x, y }) => ({ x: y, y: x }));
  throw new Error('Snake-Autopilot braucht eine gerade Breite oder Höhe');
}

// Autopilot für eine frisch gestartete Runde (state aus createSnake). Die Richtung des Rundwegs wird so gewählt,
// dass der Körper hinter dem Kopf liegt. Gibt { next(state) } zurück: Name der nächsten Richtung aus DIRECTIONS.
export function createAutopilot(state) {
  const cells = buildCycle(GRID.w, GRID.h);
  const n = cells.length;
  const order = new Array(n);
  cells.forEach(({ x, y }, i) => { order[y * GRID.w + x] = i; });
  const at = ({ x, y }) => order[y * GRID.w + x];
  const [head, neck] = state.snake;
  const reversed = neck && at(neck) === (at(head) + 1) % n; // der Hals läge sonst vor dem Kopf
  const index = (cell) => (reversed ? n - 1 - at(cell) : at(cell));
  const ahead = (from, to) => (to - from + n) % n; // Schritte entlang des Rundwegs

  return {
    next({ snake, food }) {
      const h = index(snake[0]);
      const toTail = ahead(h, index(snake.at(-1)));
      const toFood = food ? ahead(h, index(food)) : 1;
      const shortcuts = snake.length < n * SHORTCUTS_UNTIL;
      let best = null;
      let bestSteps = 0;
      for (const [name, d] of Object.entries(DIRECTIONS)) {
        const x = snake[0].x + d.x;
        const y = snake[0].y + d.y;
        if (x < 0 || y < 0 || x >= GRID.w || y >= GRID.h) continue;
        if (snake.slice(0, -1).some((s) => s.x === x && s.y === y)) continue;
        const steps = ahead(h, index({ x, y }));
        // Der nächste Schritt auf dem Rundweg geht immer; weiter springen nur mit Abstand zum Schwanz und nicht
        // über die Spule hinaus
        const ok = steps === 1 || (shortcuts && steps <= toFood && steps < toTail - SAFETY);
        if (ok && steps > bestSteps) [best, bestSteps] = [name, steps];
      }
      return best;
    },
  };
}
