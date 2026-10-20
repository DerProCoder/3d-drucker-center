// Tablet-Steuerung: links ein Joystick zum Laufen (erscheint dort, wo der Daumen aufsetzt), rechts wischen zum
// Umschauen, Antippen benutzt das angetippte Objekt (wie ein Linksklick darauf). Knöpfe rechts ersetzen die Tasten:
// Aufheben (E), Werfen (F), Ins Lager (Q), Spule wechseln (Mausrad), Schleichen (C) und Pause (Esc).
// Außerdem: welches Gerät der Spieler gewählt hat (PC oder Tablet), gespeichert im Browser.
import * as THREE from 'three';

const DEVICE_KEY = 'druckercenter-device';
const STICK_RADIUS = 56;     // px – so weit lässt sich der Knauf ziehen
const STICK_ZONE = 0.42;     // linker Anteil des Bildschirms, in dem ein Daumen den Joystick startet
const DEAD_ZONE = 0.12;
const LOOK_SPEED = 0.0055;   // rad pro Pixel Wischen
const TAP_MOVE = 12;         // px – weniger Bewegung gilt als Antippen
const TAP_MS = 350;
const MAX_PITCH = Math.PI / 2 - 0.05;

// 'pc' | 'tablet' | null (noch nicht gefragt)
export function loadDevice() {
  try {
    const d = localStorage.getItem(DEVICE_KEY);
    return d === 'pc' || d === 'tablet' ? d : null;
  } catch {
    return null;
  }
}

export function saveDevice(device) {
  try {
    localStorage.setItem(DEVICE_KEY, device);
  } catch { /* dann wird beim nächsten Mal wieder gefragt */ }
}

// Vorschlag fürs erste Fragen: Touchscreen ohne Maus → Tablet
export const suggestedDevice = () => (matchMedia('(pointer: coarse)').matches ? 'tablet' : 'pc');

// Hinweistexte, die von Maus und Tasten sprechen, für das Tablet umschreiben
export function tabletText(text) {
  return text
    .replace(/Linksklick/g, 'Tippen')
    .replace(/\bF: werfen/g, '🤾 Werfen')
    .replace(/\bE: hochheben/g, '✋ Aufheben')
    .replace(/\bQ: /g, '↩ ')
    .replace(/Mausrad: Spule wählen/g, '🔄 Spule wechseln');
}

const BUTTONS = [
  { id: 'take', label: '✋', title: 'Aufheben' },
  { id: 'throw', label: '🤾', title: 'Werfen' },
  { id: 'return', label: '↩', title: 'Ins Lager' },
  { id: 'cycle', label: '🔄', title: 'Spule' },
  { id: 'sneak', label: '🧎', title: 'Schleichen' },
];

// canvas: Spielbild (dort landen die Berührungen) · camera: wird beim Umschauen gedreht
// onTap(ndc): angetippte Stelle (−1…1) benutzen · onButton(id): Knopf gedrückt · onPause()
export function createTouchControls({ canvas, camera, onTap, onButton, onPause }) {
  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="touch-stick hidden"><div class="touch-knob"></div></div>
    <button class="touch-pause" data-touch="pause" aria-label="Pause">⏸</button>
    <div class="touch-buttons">
      ${BUTTONS.map((b) => `<button class="touch-btn hidden" data-touch="${b.id}"><span>${b.label}</span><small>${b.title}</small></button>`).join('')}
    </div>`;
  document.body.appendChild(root);
  const stickEl = root.querySelector('.touch-stick');
  const knobEl = root.querySelector('.touch-knob');
  const buttons = Object.fromEntries(BUTTONS.map((b) => [b.id, root.querySelector(`[data-touch="${b.id}"]`)]));

  const move = { x: 0, y: 0 }; // x: rechts, y: vorwärts (−1…1)
  let active = false;
  let sneak = false;
  let stick = null;              // { id, x0, y0 }
  let look = null;               // { id, x, y }
  const taps = new Map();        // Touch-ID → { x, y, t, moved }
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    dx *= k;
    dy *= k;
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.hypot(dx, dy) / STICK_RADIUS;
    const scale = mag < DEAD_ZONE ? 0 : (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / (mag || 1);
    move.x = (dx / STICK_RADIUS) * scale;
    move.y = (-dy / STICK_RADIUS) * scale;
  }

  function releaseStick() {
    stick = null;
    move.x = 0;
    move.y = 0;
    stickEl.classList.add('hidden');
  }

  function turn(dx, dy) {
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SPEED;
    euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x - dy * LOOK_SPEED));
    camera.quaternion.setFromEuler(euler);
  }

  canvas.addEventListener('touchstart', (e) => {
    if (!active) return;
    e.preventDefault(); // kein Scrollen, Zoomen oder Doppeltipp-Zoom
    for (const t of e.changedTouches) {
      taps.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), moved: false });
      if (!stick && t.clientX < innerWidth * STICK_ZONE) {
        stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
        stickEl.style.left = `${t.clientX}px`;
        stickEl.style.top = `${t.clientY}px`;
        stickEl.classList.remove('hidden');
        setStick(0, 0);
      } else if (!look) {
        look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!active) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tap = taps.get(t.identifier);
      if (tap && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_MOVE) tap.moved = true;
      if (stick?.id === t.identifier) setStick(t.clientX - stick.x0, t.clientY - stick.y0);
      else if (look?.id === t.identifier) {
        turn(t.clientX - look.x, t.clientY - look.y);
        look.x = t.clientX;
        look.y = t.clientY;
      }
    }
  }, { passive: false });

  function end(e) {
    for (const t of e.changedTouches) {
      const tap = taps.get(t.identifier);
      taps.delete(t.identifier);
      if (stick?.id === t.identifier) releaseStick();
      if (look?.id === t.identifier) look = null;
      if (active && e.type === 'touchend' && tap && !tap.moved && performance.now() - tap.t < TAP_MS) {
        onTap(new THREE.Vector2((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1));
      }
    }
  }
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);

  root.addEventListener('click', (e) => {
    const id = e.target.closest('[data-touch]')?.dataset.touch;
    if (!id || !active) return;
    if (id === 'pause') onPause();
    else if (id === 'sneak') {
      sneak = !sneak;
      buttons.sneak.classList.toggle('on', sneak);
    } else onButton(id);
  });

  return {
    move,
    get sneak() { return sneak; },
    get active() { return active; },
    // Steuerung einblenden und Berührungen annehmen (beim Spielen) bzw. ausblenden (Pause, PC-Fenster)
    setActive(on) {
      active = on;
      root.classList.toggle('hidden', !on);
      if (!on) {
        releaseStick();
        look = null;
        taps.clear();
      }
    },
    // Welche Knöpfe gerade Sinn ergeben: { take, throw, return, cycle } – Schleichen gibt es immer
    update(state) {
      for (const id of ['take', 'throw', 'return', 'cycle']) buttons[id].classList.toggle('hidden', !state[id]);
      buttons.sneak.classList.remove('hidden');
    },
  };
}
