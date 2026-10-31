// Notstrom im Technikraum (#59, #71, Logik in core/backup-power.js): Batterieschränke an der Ostwand und bis zu vier
// Dieselgeneratoren an Süd- und Nordwand des Technikraums im Raum bei −10,5 m (Plätze aus world/control-room.js
// CONTROL_ANCHORS). Trägt man einen Akku- bzw. Generatorkarton, zeigen grüne Markierungen die freien Plätze; ein
// Klick stellt ihn auf. Aufgestellte Akkus zeigen ihren Ladestand auf dem LED-Balken, jeder Generator hat die Größe
// seines Modells (models/generator.js, nach kW), vibriert im Betrieb und zeigt seinen eigenen Tank. Der Ton läuft
// nur einmal für alle (audio/sound.js, main.js reicht audioState() weiter: lauter mit mehr laufender Leistung). Ein
// Klick auf ein Gerät meldet seinen Zustand über onNotice.
//
// Alles hängt in controlRoom.technik (wird mit dem Raum ein- und ausgeblendet, anklickbar unter basement.group);
// Koordinaten sind Weltkoordinaten wie in CONTROL_ANCHORS. Hindernisse: collision.setDynamic('backup-power', …).
import * as THREE from 'three';
import { BATTERY, GENERATOR_MAX, generatorSpec, generatorStartText, isBatteryType, isGeneratorType } from '../core/backup-power.js';
import { createBatteryCabinet } from '../models/battery-cabinet.js';
import { createGenerator } from '../models/generator.js';
import { CONTROL_ANCHORS, CONTROL_LEVEL } from './control-room.js';

const VIBRATE = 0.004;                          // m – so stark wackelt die Haube im Betrieb
const MARKER_COLOR = 'rgba(75, 224, 138, ';
const kw = (v) => `${Math.round(Math.abs(v))} kW`;

// Gestrichelte grüne Bodenmarkierung (w × d, Vorderseite des Geräts nach +z der Markierung)
function createMarker(w, d) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = Math.max(32, Math.round((128 * d) / w));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `${MARKER_COLOR}0.18)`;
  ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.strokeStyle = `${MARKER_COLOR}0.95)`;
  ctx.lineWidth = 5;
  ctx.setLineDash([14, 9]);
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// Grundfläche (Welt-x/z) eines Geräts mit Mitte x/z – Drehungen sind Vielfache von 90°
function footprint(x, z, rotY, w, d, pad = 0.05) {
  const turned = Math.abs(Math.sin(rotY)) > 0.5;
  const hx = (turned ? d : w) / 2 + pad;
  const hz = (turned ? w : d) / 2 + pad;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, level: CONTROL_LEVEL };
}

// Mitte eines Geräts der Tiefe d auf einem Platz: mit dem Rücken an die hintere Kante des Platzes (an die Wand)
function backToWall(anchor, d) {
  const back = -Math.max(0, anchor.depth - d) / 2; // in Platz-Koordinaten (Vorderseite +z)
  return { x: anchor.x + back * Math.sin(anchor.rotY), z: anchor.z + back * Math.cos(anchor.rotY) };
}

// backup: core/backup-power.js · carry: world/carry.js · controlRoom: basement.controlRoom (world/control-room.js)
// collision: Kollision der Spielfigur (optional) · onNotice(text, tone): Meldung bei Klick auf ein Gerät (optional)
export function createBackupPowerWorld({ backup, carry, controlRoom, collision = null, onNotice = null }) {
  const root = new THREE.Group();
  root.name = 'backup-power';
  const markers = new THREE.Group();
  const devices = new THREE.Group();
  root.add(markers, devices);
  controlRoom.technik.add(root);

  const carried = () => carry.furniture;
  const carryingType = (test) => !!carried() && test(carried().type);

  // ---------- Markierungen ----------

  function markerFor(anchor, w, d, test, slot) {
    const g = new THREE.Group();
    g.position.set(anchor.x, anchor.y + 0.008, anchor.z);
    g.rotation.y = anchor.rotY;
    g.add(createMarker(w, d));
    g.userData.slot = slot;
    g.userData.test = test;
    g.userData.interaction = {
      hint: () => (carryingType(test) && !backup.slotUsed(carried().type, slot) ? `Linksklick: ${carried().type.name} hier aufstellen` : null),
      action: () => {
        const item = carried();
        if (item && test(item.type) && backup.place(item.id, slot)) carry.releaseFurniture();
      },
    };
    g.visible = false;
    markers.add(g);
    return g;
  }

  CONTROL_ANCHORS.batterySlots.slice(0, BATTERY.max).forEach((a, i) => markerFor(a, a.width, a.depth, isBatteryType, i));
  CONTROL_ANCHORS.generatorSlots.slice(0, GENERATOR_MAX).forEach((a, i) => markerFor(a, a.width, a.depth, isGeneratorType, i));

  // ---------- Geräte ----------

  let signature = '';
  let batteryModels = new Map();   // Furniture-ID → Modell
  let generatorModels = new Map(); // Furniture-ID → Modell

  function batteryHint(item) {
    const charge = backup.chargeOf(item);
    const pct = Math.round((charge / BATTERY.capacityKwh) * 100);
    const mode = backup.mode === 'charging' ? `lädt (${kw(backup.flowKw / Math.max(1, backup.batteries.length))})`
      : backup.mode === 'discharging' || (backup.mode === 'backup' && backup.flowKw < -0.01) ? `gibt ab (${kw(backup.flowKw / Math.max(1, backup.batteries.length))})`
        : backup.mode === 'backup' ? 'Notstrom bereit' : 'Ruhe';
    return `Batterieschrank ${item.slot + 1}: ${pct} % (${Math.round(charge)} / ${BATTERY.capacityKwh} kWh) · ${mode}`;
  }

  function generatorHint(item) {
    const spec = generatorSpec(item);
    const state = backup.generatorState(item);
    const text = state === 'running' ? `läuft (${kw(backup.outputs.get(item.id) ?? 0)})`
      : state === 'starting' ? generatorStartText(backup.generatorStartsInFor(item)) : state === 'empty' ? 'Tank leer' : 'Bereitschaft';
    return `${spec.name} (Platz ${item.slot + 1}): ${text} · Diesel ${Math.round(backup.dieselOf(item))} / ${spec.tankLiters} L`;
  }

  function rebuild() {
    for (const child of [...devices.children]) devices.remove(child);
    batteryModels = new Map();
    generatorModels = new Map();
    const boxes = [];
    for (const item of backup.batteries) {
      const a = CONTROL_ANCHORS.batterySlots[item.slot];
      if (!a) continue;
      const model = createBatteryCabinet();
      model.position.set(a.x, a.y, a.z);
      model.rotation.y = a.rotY;
      model.userData.interaction = {
        hint: () => (carried() ? null : `${batteryHint(item)} · Linksklick: Details`),
        action: () => onNotice?.(`🔋 ${batteryHint(item)} – alle Akkus: ${Math.round(backup.percent)} %`),
      };
      devices.add(model);
      batteryModels.set(item.id, model);
      boxes.push(footprint(a.x, a.z, a.rotY, model.userData.size.w, model.userData.size.d));
    }
    for (const item of backup.generators) {
      const a = CONTROL_ANCHORS.generatorSlots[item.slot];
      const spec = generatorSpec(item);
      if (!a || !spec) continue;
      const model = createGenerator({ exhaustHeight: a.exhaustTop, kw: spec.kw, tankLiters: spec.tankLiters });
      const { w, d } = model.userData.size;
      const p = backToWall(a, d);
      model.position.set(p.x, a.y, p.z);
      model.rotation.y = a.rotY;
      model.userData.interaction = {
        hint: () => (carried() ? null : `${generatorHint(item)} · Linksklick: Details`),
        action: () => onNotice?.(`⛽ ${generatorHint(item)} – Diesel im Server-Shop (Technik) nachkaufen`,
          backup.dieselOf(item) < spec.tankLiters * 0.15 ? 'bad' : undefined),
      };
      devices.add(model);
      generatorModels.set(item.id, model);
      boxes.push(footprint(p.x, p.z, a.rotY, w, d));
    }
    collision?.setDynamic('backup-power', boxes);
  }

  // ---------- Bild für Bild ----------

  let time = 0;
  let lastCarry = null;
  let lastCamera = null;
  // dt: echte Sekunden · cameraPosition: für den Abstand zum nächsten laufenden Generator (Ton)
  function update(dt = 0, cameraPosition = null) {
    time += dt;
    if (cameraPosition) lastCamera = cameraPosition;
    const sig = backup.items.filter((f) => f.location === 'technik').map((f) => `${f.type.id}:${f.id}:${f.slot}`).join('|');
    if (sig !== signature) {
      signature = sig;
      rebuild();
    }
    // Markierungen nur mit passendem Karton in der Hand und auf freien Plätzen
    const item = carried();
    const key = item ? `${item.id}|${sig}` : null;
    if (key !== lastCarry) {
      lastCarry = key;
      for (const m of markers.children) m.visible = !!item && m.userData.test(item.type) && !backup.slotUsed(item.type, m.userData.slot);
    }
    if (!controlRoom.group.visible) return;
    for (const b of backup.batteries) batteryModels.get(b.id)?.userData.setLevel(backup.chargeOf(b) / BATTERY.capacityKwh, backup.mode, time);
    for (const g of backup.generators) {
      const model = generatorModels.get(g.id);
      if (!model) continue;
      const state = backup.generatorState(g);
      const running = state === 'running';
      model.userData.setState({ running, starting: state === 'starting', diesel: backup.dieselOf(g) / backup.tankOf(g), time });
      const housing = model.userData.housing;
      if (running) {
        // Jeder Generator mit etwas anderem Takt (Platz als Versatz), damit sie nicht im Gleichschritt wackeln
        const t = time + g.slot * 0.37;
        housing.position.x = Math.sin(t * 97) * VIBRATE;
        housing.position.z = Math.cos(t * 83) * VIBRATE * 0.6;
        housing.rotation.z = Math.sin(t * 61) * VIBRATE * 0.4;
      } else if (housing.position.x || housing.position.z) {
        housing.position.x = 0;
        housing.position.z = 0;
        housing.rotation.z = 0;
      }
    }
  }

  // Für audio/sound.js updateGenerator(running, distance, kw): läuft mindestens ein Generator, wie weit ist die
  // Kamera vom nächsten laufenden weg (m) und wie viel Leistung läuft zusammen (kW, für die Lautstärke)?
  function audioState(cameraPosition = lastCamera) {
    const running = backup.generators.filter((g) => backup.isRunning(g));
    const totalKw = running.reduce((sum, g) => sum + (generatorSpec(g)?.kw ?? 0), 0);
    if (!running.length || !cameraPosition) return { running: running.length > 0, distance: Infinity, kw: totalKw, count: running.length };
    let distance = Infinity;
    for (const g of running) {
      const a = CONTROL_ANCHORS.generatorSlots[g.slot];
      if (!a) continue;
      distance = Math.min(distance, Math.hypot(cameraPosition.x - a.x, cameraPosition.y - (a.y + 1), cameraPosition.z - a.z));
    }
    return { running: true, distance, kw: totalKw, count: running.length };
  }

  update(0);
  return { group: root, update, audioState, markers, devices, generatorModels: () => generatorModels };
}
