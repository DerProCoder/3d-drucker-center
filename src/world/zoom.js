// Zoom mit dem Mausrad: verengt bzw. weitet das Blickfeld der Kamera in festen Stufen (0,5× weit … 10× nah).
// Nah dran dreht die Maus entsprechend langsamer, damit man z. B. die Ports hinten im Serverschrank genau trifft.
// Die Stufe blendet sich beim Zoomen kurz neben dem Fadenkreuz ein (el) und verschwindet dann wieder ganz.
import * as THREE from 'three';

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const NOTCH = 50;        // so viel Raddrehung (Pixel) ist eine Stufe – Touchpads liefern viele kleine Schritte
const SHOW_MS = 1200;    // so lange bleibt die Stufe nach dem letzten Zoomen sichtbar

export function createZoom(camera, controls, el) {
  const baseFov = camera.fov;
  const baseSpeed = controls.pointerSpeed;
  let level = ZOOM_LEVELS.indexOf(1);
  let pending = 0;
  let hideTimer = null;

  function apply() {
    const zoom = ZOOM_LEVELS[level];
    const half = THREE.MathUtils.degToRad(baseFov / 2);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / zoom));
    camera.updateProjectionMatrix();
    controls.pointerSpeed = baseSpeed / Math.max(1, zoom);
    el.textContent = `${zoom.toLocaleString('de-DE')}×`;
    el.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove('visible'), SHOW_MS);
  }

  // Wheel-Ereignis: nach oben drehen zoomt hinein, nach unten heraus
  function wheel(e) {
    const delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 40 : 1); // Zeilen statt Pixel (Firefox)
    pending += delta;
    if (Math.abs(pending) < NOTCH) return;
    level = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, level - Math.sign(pending)));
    pending = 0; // eine Stufe je Rastung, auch wenn ein Ereignis mehr meldet
    apply();
  }

  function reset() {
    level = ZOOM_LEVELS.indexOf(1);
    pending = 0;
    apply();
  }

  return { wheel, reset, get zoom() { return ZOOM_LEVELS[level]; } };
}
