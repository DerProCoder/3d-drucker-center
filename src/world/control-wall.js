// Leitstand (#58) im Raum bei −10,5 m (world/control-room.js): Bildschirmwand mit 6 Live-Bildschirmen an der Südwand
// und das Pult davor. Ein Linksklick aufs Pult (oder einen der Stühle) öffnet das Overlay „Leitstand“ (onOpen).
//
// Was auf den Bildschirmen steht, malen die Maler aus ui/control-panel.js (screens: [{ id, draw(ctx, w, h) }]) – hier
// geht es nur um Modelle, Texturen und wann gezeichnet wird: Neu gemalt wird nur, solange die Kamera im Raum ist, und
// auch dann nur ein Bildschirm alle STEP Sekunden (jeder also etwa alle 3 s). Beim Betreten kommt je Bild einer dran,
// damit es nicht ruckelt. Der Warn-Bildschirm blinkt rot über die Materialfarbe (kein Neumalen nötig).
import * as THREE from 'three';
import { createControlDesk, createScreenWall, CONTROL_DESK } from '../models/control-desk.js';
import { createOfficeChair } from '../models/office-furniture.js';
import { mergeStatic } from '../models/merge-static.js';

const STEP = 0.5;          // s zwischen zwei neu gemalten Bildschirmen
const BLINK = 0.5;         // s je Blinkphase des Warn-Bildschirms
const TEX_HEIGHT = 320;    // px Höhe einer Bildschirm-Textur (Breite nach Seitenverhältnis)
const ALERT_TINT = new THREE.Color(1, 0.45, 0.45);
const WHITE = new THREE.Color(1, 1, 1);

// room: createControlRoom(…) · screens: Maler (ui/control-panel.js createWallScreens) · onOpen: Pult angeklickt
export function createLeitstand({ room, screens, onOpen }) {
  const { anchors } = room;
  const root = new THREE.Group();
  root.name = 'leitstand-einrichtung';

  // ---------- Bildschirmwand ----------
  const wa = anchors.screenWall;
  const wall = createScreenWall({ width: wa.width, height: wa.height, cols: 3, rows: 2 });
  const wallGroup = new THREE.Group();
  wallGroup.position.set(wa.x, wa.y, wa.z);
  wallGroup.rotation.y = wa.rotY;
  wallGroup.add(mergeStatic(wall.group));
  const panels = wall.slots.map((slot, i) => {
    const canvas = document.createElement('canvas');
    canvas.height = TEX_HEIGHT;
    canvas.width = Math.round((TEX_HEIGHT * slot.w) / slot.h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    // Bildschirme leuchten selbst: unbeleuchtetes Material wie der PC-Monitor in der Halle
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.h), material);
    mesh.position.set(slot.x, slot.y, slot.z);
    mesh.name = `leitstand-bildschirm-${screens[i]?.id ?? i}`;
    wallGroup.add(mesh);
    return { canvas, ctx, texture, material, mesh, screen: screens[i] ?? null, alert: false, busy: false };
  });
  root.add(wallGroup);

  // ---------- Pult und Stühle ----------
  const da = anchors.desk;
  const furniture = new THREE.Group();
  furniture.position.set(da.x, da.y, da.z);
  furniture.rotation.y = da.rotY;
  const desk = createControlDesk();
  furniture.add(desk);
  // Zwei Stühle auf der Bedienseite (+z im Pult), Blick übers Pult zur Wand
  for (const x of [-0.7, 0.7]) {
    const chair = createOfficeChair();
    chair.position.set(x, 0, CONTROL_DESK.d / 2 + 0.45);
    chair.rotation.y = Math.PI;
    furniture.add(chair);
  }
  // Nur Schatten empfangen: eigene Schatten kosteten je Deckenspot weitere Draw Calls in der Schattenkarte
  furniture.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  furniture.userData.interaction = {
    hint: () => 'Linksklick: Leitstand öffnen (Drucker, Serverraum, Geld, Warnungen, Strom)',
    action: () => onOpen?.(),
  };
  root.add(mergeStatic(furniture));
  room.leitstand.add(root);

  // Hindernis: das Pult (Welt-Koordinaten; gedreht um 0 bzw. π bleibt die Ausdehnung gleich)
  const turned = Math.abs(Math.sin(da.rotY)) > 0.5;
  const hw = (turned ? CONTROL_DESK.d : CONTROL_DESK.w) / 2;
  const hd = (turned ? CONTROL_DESK.w : CONTROL_DESK.d) / 2;
  room.addCollider({ minX: da.x - hw, maxX: da.x + hw, minZ: da.z - hd, maxZ: da.z + hd });

  // ---------- Zeichnen ----------
  let inside = false;
  let next = 0;        // nächster Bildschirm, der neu gemalt wird
  let pending = 0;     // nach dem Betreten: so viele Bildschirme noch je Bild einer
  let sinceStep = 0;
  let sinceBlink = 0;
  let blinkOn = false;

  function paint(panel) {
    if (!panel.screen || panel.busy) return;
    let result;
    try {
      result = panel.screen.draw(panel.ctx, panel.canvas.width, panel.canvas.height);
    } catch (err) {
      console.error(`Leitstand: Bildschirm ${panel.screen.id}`, err);
      return;
    }
    panel.texture.needsUpdate = true;
    if (result?.then) {
      panel.busy = true;
      result.then((r) => {
        panel.busy = false;
        panel.alert = !!r?.alert;
        panel.texture.needsUpdate = true;
      }, () => { panel.busy = false; });
    } else {
      panel.alert = !!result?.alert;
    }
  }

  // Jedes Bild (main.js): camera = Hauptkamera
  function update(dt, camera) {
    const now = room.group.visible && room.isInside(camera.position);
    if (!now) {
      inside = false;
      return;
    }
    if (!inside) {
      inside = true;
      pending = panels.length;
      next = 0;
    }
    if (pending > 0) {
      pending--;
      paint(panels[next]);
      next = (next + 1) % panels.length;
    } else {
      sinceStep += dt;
      if (sinceStep >= STEP) {
        sinceStep = 0;
        paint(panels[next]);
        next = (next + 1) % panels.length;
      }
    }
    sinceBlink += dt;
    if (sinceBlink >= BLINK) {
      sinceBlink = 0;
      blinkOn = !blinkOn;
    }
    for (const panel of panels) panel.material.color.copy(panel.alert && blinkOn ? ALERT_TINT : WHITE);
  }

  return {
    group: root,
    update,
    get active() { return inside; },
    // Für Tests: alle Bildschirme sofort neu malen
    paintAll() { panels.forEach(paint); },
    panels,
  };
}
