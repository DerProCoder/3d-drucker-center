// Tablet in der Hand (#67): hängt an der Kamera, hebt sich beim Öffnen in etwa 0,3 s von unten vor das Auge und senkt
// sich beim Schließen wieder. Oben füllt der Bildschirm einen festen Anteil des Blickfelds; screen-Rechteck in
// Bildschirm-Pixeln liefert update(), damit das HTML-Fenster mit den Apps genau darüber liegt (ui/tablet.js).
// Was man sonst in der Hand hält (Spule, Karton), bleibt dabei unverändert an der Kamera.
// Gehäusefarbe (#68): folgt dem Aussehen aus core/tablet-style.js (style), sonst setColor.
import * as THREE from 'three';
import { createTabletModel, TABLET_SCREEN } from '../models/tablet.js';

const LIFT_SECONDS = 0.3;
// So viel vom Bild darf der Bildschirm oben höchstens einnehmen (Breite, Höhe) – das Spielbild bleibt rundherum sichtbar
const FILL_WIDTH = 0.94;
const FILL_HEIGHT = 0.86;
const LOWER_DROP = 0.32;   // m – so weit unterhalb der Blickmitte liegt das Tablet gesenkt
const LOWER_TILT = -1.15;  // rad – gesenkt zeigt der Bildschirm schräg nach oben

const ease = (t) => t * t * (3 - 2 * t);

// style: core/tablet-style.js (TabletStyle) oder null – dann bleibt das Tablet schwarz, bis setColor gerufen wird
export function createTabletHold({ camera, style = null }) {
  const model = createTabletModel(style ? { color: style.colorHex } : {});
  style?.subscribe(() => model.setColor(style.colorHex));
  const group = model.group;
  group.visible = false;
  group.renderOrder = 10; // vor allem anderen an der Kamera (Spulen, Kartons) zeichnen
  camera.add(group);

  let target = 0;  // 1: gehoben, 0: gesenkt
  let t = 0;       // aktueller Stand 0…1
  let portrait = false;
  let images = null; // { landscape, portrait } – Startbildschirm für das 3D-Modell
  const corner = new THREE.Vector3();

  function applyImage() {
    if (!images) return;
    model.setScreenImage(portrait ? images.portrait : images.landscape, { rotate: portrait });
  }

  // Abstand, bei dem der Bildschirm ins Blickfeld passt (Breite und Höhe begrenzt) – folgt Zoom und Fenstergröße
  function raisedDistance() {
    const perMeterH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const perMeterW = perMeterH * camera.aspect;
    const sw = portrait ? TABLET_SCREEN.height : TABLET_SCREEN.width;
    const sh = portrait ? TABLET_SCREEN.width : TABLET_SCREEN.height;
    return Math.max(sw / (FILL_WIDTH * perMeterW), sh / (FILL_HEIGHT * perMeterH));
  }

  function pose() {
    const d = raisedDistance();
    const k = ease(t);
    group.position.set(0, -LOWER_DROP * (1 - k) * (d / 0.12), -d * (1 + 0.6 * (1 - k)));
    group.rotation.set(LOWER_TILT * (1 - k), 0, portrait ? Math.PI / 2 : 0, 'XYZ');
    group.updateMatrix();
  }

  // Bildschirm-Rechteck in CSS-Pixeln (nur ganz gehoben), sonst null
  function screenRect() {
    if (t < 1) return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // Kamera-Raum (Tablet hängt direkt an der Kamera) → Bildschirmkoordinaten
      corner.set(sx * TABLET_SCREEN.width / 2, sy * TABLET_SCREEN.height / 2, 0.0006)
        .applyMatrix4(group.matrix).applyMatrix4(camera.projectionMatrix);
      const px = (corner.x + 1) / 2 * w;
      const py = (1 - corner.y) / 2 * h;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    const width = maxX - minX;
    return {
      left: minX, top: minY, width, height: maxY - minY, portrait,
      radius: (TABLET_SCREEN.radius / (portrait ? TABLET_SCREEN.height : TABLET_SCREEN.width)) * width,
    };
  }

  return {
    model,
    // Startbildschirm-Bilder fürs 3D-Modell (Canvas je Ausrichtung)
    setScreenImages(next) {
      images = next;
      applyImage();
    },
    setColor: (hex) => model.setColor(hex),
    raise() {
      target = 1;
      // Ausrichtung beim Heben festlegen: Hochformat, wenn das Fenster höher als breit ist
      const p = window.innerHeight > window.innerWidth;
      if (p !== portrait || t === 0) {
        portrait = p;
        applyImage();
      }
    },
    lower() { target = 0; },
    get raised() { return t >= 1; },
    get visible() { return group.visible; },
    // Jedes Bild: Heben/Senken über Delta-Zeit (s); gibt das Bildschirm-Rechteck zurück oder null
    update(dt) {
      if (target === 1 && t === 1) {
        // Fenster gedreht (Handy): Ausrichtung wechseln, solange es oben ist
        const p = window.innerHeight > window.innerWidth;
        if (p !== portrait) {
          portrait = p;
          applyImage();
        }
      }
      const step = dt / LIFT_SECONDS;
      // Nur auf das Ziel zu bewegen und dort stehen bleiben (sonst pendelt es oben zwischen 1 und 1 − step)
      if (t < target) t = Math.min(target, t + step);
      else if (t > target) t = Math.max(target, t - step);
      group.visible = t > 0;
      if (!group.visible) return null;
      pose();
      return screenRect();
    },
  };
}
