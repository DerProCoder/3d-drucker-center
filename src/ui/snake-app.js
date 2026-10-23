// PC-App „Snake“: Filament-Snake (Regeln in core/snake.js) auf einem Canvas. Steuerung mit Pfeiltasten/WASD,
// auf Touch-Geräten per Wischen über das Spielfeld oder mit dem Steuerkreuz darunter. Leertaste bzw. Tippen startet
// und pausiert. Der Rekord bleibt im Browser gespeichert. Schließt man das Fenster, pausiert die Runde.
// Umschalter oben: Survival (selbst spielen) oder Auto – dort steuert sich die Schlange selbst
// (core/snake-autopilot.js), bis das Feld voll ist; zählt nicht für den Rekord.
import { GRID, createSnake, step, turn } from '../core/snake.js';
import { createAutopilot } from '../core/snake-autopilot.js';

const BEST_KEY = 'druckercenter-snake-best';
const SWIPE_PX = 24; // so weit muss man wischen, damit es als Richtung zählt
const AUTO_MS = 30;  // Schrittdauer im Auto-Modus – flott, damit das Feld in ein paar Minuten voll wird
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const COLORS = { field: '#13261b', grid: 'rgba(255, 255, 255, 0.035)', head: '#e8ecef', eye: '#14171c' };

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch { /* dann eben nur für diese Sitzung */ }
}

export function createSnakeApp() {
  let game = createSnake();
  let mode = 'ready';  // 'ready' | 'running' | 'paused' | 'over'
  let best = loadBest();
  let canvas = null;
  let ctx = null;
  let frame = null;
  let last = 0;
  let acc = 0;
  let swipe = null;
  let autopilot = null; // gesetzt, solange der Auto-Modus läuft

  const el = (name) => canvas?.closest('.snake')?.querySelector(`[data-snake-${name}]`);

  function overlayText() {
    if (mode === 'ready') return '<b>Filament-Snake</b>Friss Spulen, jede färbt ein Stück der Schlange.<small>Start: Leertaste oder Tippen · Auto: spielt von selbst</small>';
    if (mode === 'paused') return '<b>Pause</b><small>Weiter: Leertaste oder Tippen</small>';
    if (mode === 'over' && !game.food) return `<b>Feld voll!</b>Alle ${game.score} Spulen geholt.<small>Nochmal: Leertaste oder Tippen</small>`;
    if (mode === 'over') {
      return `<b>Game Over</b>${game.score} ${game.score === 1 ? 'Spule' : 'Spulen'}${game.score > 0 && game.score >= best ? ' – neuer Rekord! 🏆' : ''}<small>Nochmal: Leertaste oder Tippen</small>`;
    }
    return '';
  }

  function updateHud() {
    if (!canvas) return;
    el('score').textContent = game.score;
    el('best').textContent = best;
    const overlay = el('overlay');
    overlay.innerHTML = overlayText();
    overlay.hidden = mode === 'running';
    for (const button of canvas.closest('.snake').querySelectorAll('[data-snake-mode]')) {
      button.classList.toggle('active', (button.dataset.snakeMode === 'auto') === !!autopilot);
    }
  }

  // Leertaste/Tippen: starten, pausieren, fortsetzen oder neu beginnen
  function toggle() {
    if (mode === 'running') mode = 'paused';
    else {
      if (mode === 'over') newRound();
      mode = 'running';
      acc = 0;
    }
    updateHud();
  }

  // Neue Runde, im Auto-Modus gleich mit frischem Autopiloten
  function newRound(auto = !!autopilot) {
    game = createSnake();
    autopilot = auto ? createAutopilot(game) : null;
  }

  // Umschalter: Auto (neue Runde, läuft sofort) oder Survival (neue Runde zum Selberspielen)
  function setAuto(auto) {
    if (auto === !!autopilot) return;
    newRound(auto);
    mode = autopilot ? 'running' : 'ready';
    acc = 0;
    updateHud();
  }

  function steer(name) {
    if (autopilot) return; // im Auto-Modus lenkt die Schlange selbst
    if (mode === 'ready' || mode === 'over') toggle(); // erste Richtung startet gleich die Runde
    if (mode === 'paused') toggle();
    turn(game, name);
  }

  function resize() {
    const stage = canvas.parentElement;
    const cell = Math.max(8, Math.floor(Math.min(stage.clientWidth / GRID.w, stage.clientHeight / GRID.h)));
    const ratio = window.devicePixelRatio || 1;
    const w = cell * GRID.w;
    const h = cell * GRID.h;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    return { cell, ratio };
  }

  function draw() {
    const { cell, ratio } = resize();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(0, 0, cell * GRID.w, cell * GRID.h);
    ctx.fillStyle = COLORS.grid;
    for (let y = 0; y < GRID.h; y++) {
      for (let x = (y % 2); x < GRID.w; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    // Futter: Filamentspule von vorne (Farbring mit Nabe)
    if (game.food) {
      const cx = (game.food.x + 0.5) * cell;
      const cy = (game.food.y + 0.5) * cell;
      ctx.fillStyle = '#3a3d42';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = game.food.color;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2c30';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Schlange: abgerundete Glieder, Kopf hell mit Augen in Laufrichtung
    const pad = cell * 0.08;
    game.snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? COLORS.head : s.color;
      ctx.beginPath();
      ctx.roundRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * (i === 0 ? 0.35 : 0.25));
      ctx.fill();
    });
    const head = game.snake[0];
    const { x: dx, y: dy } = game.dir;
    ctx.fillStyle = COLORS.eye;
    for (const side of [-1, 1]) {
      const ex = (head.x + 0.5 + dx * 0.18 - dy * side * 0.2) * cell;
      const ey = (head.y + 0.5 + dy * 0.18 + dx * side * 0.2) * cell;
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(now) {
    // Fenster zu oder neu gezeichnet: Schleife endet, eine laufende Runde pausiert
    if (!canvas?.isConnected) {
      frame = null;
      if (mode === 'running') mode = 'paused';
      return;
    }
    if (mode === 'running') {
      acc += Math.min(now - last, 250); // nach einem Hänger keine Schritte nachholen
      const stepMs = autopilot ? AUTO_MS : game.stepMs;
      while (acc >= stepMs && mode === 'running') {
        acc -= stepMs;
        if (autopilot) {
          const dir = autopilot.next(game);
          if (dir) turn(game, dir);
        }
        const result = step(game);
        if (result === 'eat') updateHud();
        if (result === 'die' || result === 'full') {
          mode = 'over';
          if (!autopilot && game.score > best) {
            best = game.score;
            saveBest(best);
          }
          updateHud();
        }
      }
    }
    last = now;
    draw();
    frame = requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', (e) => {
    if (!canvas?.isConnected || !canvas.offsetParent) return; // App nicht sichtbar
    if (KEYS[e.code]) {
      e.preventDefault();
      steer(KEYS[e.code]);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) toggle();
    }
  });

  return {
    render: () => `
      <div class="snake">
        <div class="snake-bar">
          <span>🧵 Spulen: <b data-snake-score>0</b></span>
          <span>🏆 Rekord: <b data-snake-best>0</b></span>
          <div class="snake-modes" role="group" aria-label="Spielmodus">
            <button class="secondary" data-snake-mode="survival" title="Selbst steuern">Survival</button>
            <button class="secondary" data-snake-mode="auto" title="Die Schlange spielt von selbst, bis das Feld voll ist">🤖 Auto</button>
          </div>
          <button class="secondary" data-snake-toggle>⏯</button>
        </div>
        <div class="snake-stage">
          <canvas data-snake></canvas>
          <div class="snake-overlay" data-snake-overlay></div>
        </div>
        <div class="snake-pad">
          <button data-snake-dir="up" aria-label="Hoch">▲</button>
          <button data-snake-dir="left" aria-label="Links">◀</button>
          <button data-snake-dir="down" aria-label="Runter">▼</button>
          <button data-snake-dir="right" aria-label="Rechts">▶</button>
        </div>
      </div>`,

    // Nach dem Zeichnen des Fensters: Canvas übernehmen und die Spielschleife starten
    attach(el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      canvas.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        swipe = { x: t.clientX, y: t.clientY };
      }, { passive: true });
      canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // kein Scrollen
      canvas.addEventListener('touchend', (e) => {
        if (!swipe) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - swipe.x;
        const dy = t.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) toggle();
        else if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 'right' : 'left');
        else steer(dy > 0 ? 'down' : 'up');
      });
      updateHud();
      last = performance.now();
      if (!frame) frame = requestAnimationFrame(loop);
    },

    // Klick in der App (Steuerkreuz, Start/Pause, Overlay). Gibt nie „neu zeichnen“ zurück – das Canvas bleibt.
    handleClick(e) {
      const dir = e.target.closest('[data-snake-dir]')?.dataset.snakeDir;
      if (dir) steer(dir);
      else if (e.target.closest('[data-snake-mode]')) setAuto(e.target.closest('[data-snake-mode]').dataset.snakeMode === 'auto');
      else if (e.target.closest('[data-snake-toggle], [data-snake-overlay]')) toggle();
      else if (e.target.closest('[data-snake]') && !matchMedia('(pointer: coarse)').matches) toggle(); // Maus: Klick aufs Feld
      return false;
    },

    // Zustand zum Nachsehen (Tests, Konsole)
    get game() { return game; },
    get mode() { return mode; },
  };
}
