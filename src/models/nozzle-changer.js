// Düsenwechsler des H2C: ein Druckkopf mit Schnellwechsel-Düse und ein Halter rechts im Bauraum mit Platz für
// acht Düsen – eine steckt im Kopf, sieben warten im Halter. Jede Düse gehört zu einem AMS-Fach und trägt
// dessen Farbe als Silikonsocke. Dazu die LED-Leiste unten am Sockel mit Lichtschein auf dem Tisch.
// Die Bewegung beim Wechseln steuert world/tool-changer.js.
import * as THREE from 'three';
import { box, createToolhead, rbox } from './printer-parts.js';

const EMPTY_COLOR = 0x3a3d42; // Socke ohne Spule im Fach

// Wechseldüse: Schnellkupplung oben, Heizblock mit farbiger Socke, Messingdüse mit 0,4-mm-Spitze.
// Ursprung an der Düsenspitze. userData.sock: Material der Socke (Farbe des AMS-Fachs).
function createHotend(m) {
  const hotend = new THREE.Group();
  const sock = new THREE.MeshStandardMaterial({ color: EMPTY_COLOR, roughness: 0.6 });
  hotend.add(rbox(0.02, 0.012, 0.02, 0.003, m.shellDark, 0, 0.03, 0));  // Kupplung
  hotend.add(box(0.016, 0.011, 0.018, m.alu, 0, 0.0185, 0));            // Heizblock
  hotend.add(rbox(0.019, 0.007, 0.021, 0.002, sock, 0, 0.0145, 0));      // Silikonsocke
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 6), m.brass);
  hex.position.y = 0.0075;
  hotend.add(hex);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0002, 0.005, 16), m.brass);
  tip.position.y = 0.0025;
  hotend.add(tip);
  hotend.userData.sock = sock;
  return hotend;
}

// Druckkopf des H2C: wie der P2S-Kopf mit großem Lüfter, darunter die Wechseldüse.
// userData.setHotendColor(hex | null) färbt die Socke der Düse, die gerade im Kopf steckt.
export function createChangerToolhead(m, title) {
  const head = createToolhead(m, 'p1', { bigFan: true, title });
  const tip = head.userData.tip;
  const hotend = createHotend(m);
  hotend.position.set(tip.position.x, tip.position.y - 0.0025, tip.position.z);
  head.add(hotend);
  head.userData.setHotendColor = (hex) => hotend.userData.sock.color.set(hex ?? EMPTY_COLOR);
  return head;
}

// Halter an der rechten Innenwand: Schiene mit count Gabeln, in jeder hängt eine Düse (Spitze bei y = 0).
// Ursprung: Mitte der Düsenreihe auf Höhe der Düsenspitzen. Die Düsen liegen bei x = 0, z = slotZ(i).
// userData.slotZ: z-Positionen der Fächer · setDocked(i, sichtbar) · setColor(i, hex | null)
export function createNozzleRack(m, count, spacing, wallGap) {
  const rack = new THREE.Group();
  const length = spacing * count + 0.02;
  // Schiene an der Wand und Gabeln, in die die Kupplungen der Düsen greifen
  rack.add(rbox(0.006, 0.014, length, 0.002, m.shellDark, wallGap, 0.043, 0)); // schmal, damit man die Düsen sieht
  rack.add(rbox(wallGap + 0.002, 0.004, length, 0.0015, m.shellMid, wallGap / 2, 0.038, 0));
  const slotZ = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
  const hotends = slotZ.map((z) => {
    for (const sz of [-1, 1]) rack.add(box(0.012, 0.003, 0.003, m.shellMid, 0.004, 0.0355, z + sz * 0.0115));
    const hotend = createHotend(m);
    hotend.position.z = z;
    rack.add(hotend);
    return hotend;
  });
  rack.userData.slotZ = slotZ;
  rack.userData.setDocked = (i, docked) => { hotends[i].visible = docked; };
  rack.userData.setColor = (i, hex) => hotends[i].userData.sock.color.set(hex ?? EMPTY_COLOR);
  return rack;
}

// Weicher runder Lichtfleck (für den Schein der LED-Leiste auf dem Tisch)
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

// LED-Leiste rundum unten am Sockel (Höhe y) und ein Lichtschein auf der Stellfläche darunter.
// userData.setColor(hex) färbt beides.
export function createLedStrip(w, d, y) {
  const strip = new THREE.Group();
  const light = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glow = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
  });
  for (const [sw, sd, x, z] of [
    [w - 0.03, 0.002, 0, d / 2 + 0.0008], [w - 0.03, 0.002, 0, -d / 2 - 0.0008],
    [0.002, d - 0.03, w / 2 + 0.0008, 0], [0.002, d - 0.03, -w / 2 - 0.0008, 0],
  ]) {
    const bar = box(sw, 0.004, sd, light, x, y, z);
    bar.userData.noShadow = true;
    strip.add(bar);
  }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.16, d + 0.16), glow);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.0015;
  pool.userData.noShadow = true;
  pool.userData.noBounds = true; // Lichtschein zählt nicht zur Gerätegröße (Karton, Stellplatz)
  strip.add(pool);
  strip.userData.setColor = (hex) => {
    const c = new THREE.Color(hex);
    light.color.copy(c).multiplyScalar(2.2); // leuchtet über das Tonemapping hinaus
    glow.color.copy(c);
  };
  strip.userData.setColor(0xa347ff);
  return strip;
}
