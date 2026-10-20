// Licht in der Halle: Lichtschalter an der Südwand neben der Lagertür. Licht aus schaltet die Deckenspots ab, lässt
// die Leuchten dunkel werden und dimmt Grund- und Umgebungslicht, solange man in der Halle steht – dann leuchten
// Glow-Drucke (siehe models/spool.js). Anbauten (Lager, Büro, Empfang) behalten ihr Licht.
// Lichter werden nur über intensity geschaltet, nie über visible: ändert sich die Zahl der Lichter, übersetzt
// three.js alle Shader neu und das Spiel stünde kurz still (siehe room-culling.js).
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { setGlowDark } from '../models/spool.js';

const DARK = 0.08;        // so viel Grund- und Umgebungslicht bleibt bei Licht aus (durch die Fenster kommt noch etwas)
const FADE_RATE = 6;      // wie schnell es dunkel bzw. hell wird (1/s)
const LAMP_OFF = new THREE.Color(0x2a2a28); // Diffusor einer ausgeschalteten Leuchte
const HALF = ROOM_SIZE / 2;
// Schalter rechts neben der Lagertür (von der Halle aus gesehen), auf Griffhöhe
const SWITCH_POS = new THREE.Vector3(STORAGE_DOOR.x - STORAGE_DOOR.w / 2 - 0.3, 1.2, HALF - 0.012);

function createSwitch() {
  const g = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.012), plastic));
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.012), plastic);
  rocker.position.z = 0.008;
  g.add(rocker);
  // Kleines Kontrolllicht: leuchtet bei Licht aus, damit man den Schalter im Dunkeln findet
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(0.004, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3) })
  );
  led.position.set(0, -0.016, 0.0145);
  g.add(led);
  g.rotation.y = Math.PI; // Südwand: Vorderseite zeigt in die Halle (-z)
  g.position.copy(SWITCH_POS);
  g.userData.rocker = rocker;
  g.userData.led = led;
  return g;
}

// room: Halle aus room.js (Deckenspots und Leuchten-Diffusoren), scene: Grund- und Umgebungslicht.
// Erst nach setupGraphics anlegen – die Grafikstufe stellt die Helligkeiten ein, die hier als „an“ gelten.
export function createHallLights({ room, scene }) {
  const spots = [];
  const diffusers = [];
  room.traverse((o) => {
    if (o.isSpotLight) spots.push({ light: o, on: o.intensity });
    // Leuchten-Diffusoren sind heller als Weiß (für den Bloom), daran erkennt man sie
    if (o.material?.isMeshBasicMaterial && o.material.color.r > 1.5) diffusers.push({ material: o.material, on: o.material.color.clone() });
  });
  const hemi = [];
  scene.traverse((o) => {
    if (o.isHemisphereLight) hemi.push({ light: o, on: o.intensity });
  });
  const environmentOn = scene.environmentIntensity;

  const group = new THREE.Group();
  const lightSwitch = createSwitch();
  group.add(lightSwitch);

  let on = true;
  let level = 1; // 1 = hell, DARK = dunkel (gleitet weich hin)

  function setOn(value) {
    on = value;
    for (const s of spots) s.light.intensity = on ? s.on : 0;
    for (const d of diffusers) d.material.color.copy(on ? d.on : LAMP_OFF);
    lightSwitch.userData.rocker.rotation.x = on ? -0.18 : 0.18;
    lightSwitch.userData.led.visible = !on;
  }
  setOn(true);

  lightSwitch.userData.interaction = {
    hint: () => (on ? 'Linksklick: Licht in der Halle ausschalten' : 'Linksklick: Licht in der Halle einschalten'),
    action: () => setOn(!on),
  };

  // player: Position der Spielfigur – gedimmt wird nur, solange sie in der Halle steht
  function update(dt, player) {
    const inHall = Math.abs(player.x) < HALF && Math.abs(player.z) < HALF;
    const target = !on && inHall ? DARK : 1;
    level += (target - level) * Math.min(1, FADE_RATE * dt);
    for (const h of hemi) h.light.intensity = h.on * level;
    scene.environmentIntensity = environmentOn * level;
    setGlowDark(level < 0.5, scene);
  }

  return { group, update, get on() { return on; } };
}
