// Licht in der Halle: Lichtschalter an der Südwand neben der Lagertür. Licht aus schaltet die Deckenspots ab, lässt
// die Leuchten dunkel werden und dimmt Grund- und Umgebungslicht, solange man in der Halle steht – dann leuchten
// Glow-Drucke (siehe models/spool.js). Die Lampen der Anbauten (Lager, Büro, Empfang) werden dabei mit gedimmt:
// ohne Schatten (Grafikstufe mittel/niedrig) scheinen sie durch die Wände und spiegeln sich im lackierten
// Hallenboden. Betritt man einen Anbau, sind sie sofort wieder hell.
// Bei einem Stromausfall (#57) gibt es überall nur Notbeleuchtung: schwache Deckenspots, gedimmte Lampen.
// Lichter werden nur über intensity geschaltet, nie über visible: ändert sich die Zahl der Lichter, übersetzt
// three.js alle Shader neu und das Spiel stünde kurz still (siehe room-culling.js).
import * as THREE from 'three';
import { ROOM_SIZE, STORAGE_DOOR } from './room.js';
import { setGlowDark } from '../models/spool.js';

const DARK = 0.08;        // so viel Licht der Anbau-Lampen bleibt bei Licht aus
const HEMI_DARK = 0.35;   // so viel Grundlicht bleibt – es spiegelt sich nicht, man findet sich aber noch zurecht
const FADE_RATE = 6;      // wie schnell es dunkel bzw. hell wird (1/s)
const EMERGENCY = 0.3;       // Stromausfall (#57): so hell bleibt es mit der Notbeleuchtung
const EMERGENCY_SPOT = 0.12; // so viel Licht geben die Deckenspots als Notbeleuchtung
const LAMP_OFF =new THREE.Color(0x2a2a28); // Diffusor einer ausgeschalteten Leuchte
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
  const dimmed = []; // Grundlicht und Lampen der Anbauten, floor: wie viel bei Licht aus bleibt
  scene.traverse((o) => {
    if (o.isHemisphereLight) dimmed.push({ light: o, on: o.intensity, floor: HEMI_DARK });
    if (o.isPointLight) dimmed.push({ light: o, on: o.intensity, floor: DARK });
  });
  const environmentOn = scene.environmentIntensity;

  const group = new THREE.Group();
  const lightSwitch = createSwitch();
  group.add(lightSwitch);

  let on = true;
  let level = 1; // 1 = hell, DARK = dunkel (gleitet weich hin)
  let wasInHall = true;
  let emergency = false; // Stromausfall: nur Notbeleuchtung (#57)

  // Deckenspots und Leuchten nach Schalter und Strom: aus, Notbeleuchtung (schwach) oder voll
  function applyLamps() {
    const spot = !on ? 0 : emergency ? EMERGENCY_SPOT : 1;
    for (const s of spots) s.light.intensity = s.on * spot;
    for (const d of diffusers) d.material.color.copy(on && !emergency ? d.on : LAMP_OFF);
  }

  function setOn(value) {
    on = value;
    applyLamps();
    lightSwitch.userData.rocker.rotation.x = on ? -0.18 : 0.18;
    lightSwitch.userData.led.visible = !on;
  }
  setOn(true);

  lightSwitch.userData.interaction = {
    hint: () => (on ? 'Linksklick: Licht in der Halle ausschalten' : 'Linksklick: Licht in der Halle einschalten'),
    action: () => setOn(!on),
  };

  // player: Position der Spielfigur – gedimmt wird nur, solange sie in der Halle steht
  // outage: Stromausfall (#57, Gruppe 'lights' ohne Notstrom) – überall nur Notbeleuchtung, auch in den Anbauten
  function update(dt, player, outage = false) {
    if (outage !== emergency) {
      emergency = outage;
      applyLamps();
    }
    const inHall = Math.abs(player.x) < HALF && Math.abs(player.z) < HALF;
    const normal = !on && inHall ? DARK : 1;
    const target = emergency ? Math.min(EMERGENCY, normal) : normal;
    // Vom Anbau in die Halle (und zurück) sofort umschalten, sonst sieht man das Licht beim Durchgehen nachglimmen
    if (inHall !== wasInHall) level = target;
    wasInHall = inHall;
    level += (target - level) * Math.min(1, FADE_RATE * dt);
    const dark = Math.max(0, (level - DARK) / (1 - DARK)); // 1 = hell, 0 = ganz dunkel
    for (const d of dimmed) d.light.intensity = d.on * (d.floor + (1 - d.floor) * dark);
    // Spiegelungen der Umgebung ganz aus: der Klarlack des Bodens zeigte sonst helle Flecken der Umgebungslichter
    scene.environmentIntensity = environmentOn * dark;
    setGlowDark(level < 0.5, scene);
  }

  return { group, update, get on() { return on; }, get emergency() { return emergency; } };
}
