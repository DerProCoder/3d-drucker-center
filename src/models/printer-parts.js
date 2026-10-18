// Detaillierte Einzelteile für Druckermodelle: Druckkopf, Druckplatte, Motoren, Schienen,
// Touchscreen, Schläuche. Maße in Metern, angelehnt an echte Bauteile.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Materialien ----------

let plateTexture = null;

// Strukturierte PEI-Platte: goldfarben mit feiner Körnung
function getPlateTexture() {
  if (plateTexture) return plateTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8915a';
  ctx.fillRect(0, 0, 512, 512);
  // Feine Körnung der strukturierten Oberfläche
  for (let i = 0; i < 120000; i++) {
    const light = Math.random() < 0.5;
    ctx.fillStyle = light ? `rgba(255,235,190,${Math.random() * 0.18})` : `rgba(60,40,10,${Math.random() * 0.18})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 0.8 + Math.random(), 0.8 + Math.random());
  }
  ctx.scale(2, 2); // Aufdruck unten in 256er-Koordinaten
  // Aufdruck wie auf der echten Platte: Rand, Mittelkreuz, Logo und Seitenkennung
  ctx.strokeStyle = 'rgba(70,45,10,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.beginPath();
  ctx.moveTo(122, 128); ctx.lineTo(134, 128);
  ctx.moveTo(128, 122); ctx.lineTo(128, 134);
  ctx.stroke();
  ctx.fillStyle = 'rgba(70,45,10,0.45)';
  ctx.font = '600 11px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Bambu Lab', 14, 240);
  ctx.textAlign = 'right';
  ctx.fillText('Textured PEI', 242, 240);
  plateTexture = new THREE.CanvasTexture(canvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  plateTexture.anisotropy = 8;
  return plateTexture;
}

export function createMaterials() {
  // Spritzguss-Kunststoff: matt mit leichtem Klarlack-Glanz, damit Kanten im Licht schimmern
  const plastic = (color, roughness = 0.5) => new THREE.MeshPhysicalMaterial({
    color, roughness, clearcoat: 0.3, clearcoatRoughness: 0.35,
  });
  return {
    shell: plastic(0xe4e6e9, 0.45),      // hellgraues Gehäuse
    shellDark: plastic(0x2c2e32, 0.55),  // dunkle Kunststoffteile
    shellMid: plastic(0x7d8288, 0.5),    // graue Abdeckungen
    black: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 0.9, roughness: 0.22 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 0.75, roughness: 0.35 }),
    bedAlu: new THREE.MeshStandardMaterial({ color: 0x3b3e43, metalness: 0.6, roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.25 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb4643a, metalness: 0.85, roughness: 0.3 }),
    plate: new THREE.MeshPhysicalMaterial({ map: getPlateTexture(), metalness: 0.35, roughness: 0.55, clearcoat: 0.15 }),
    ptfe: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.8, roughness: 0.2, clearcoat: 0.6 }),
    // Glas: dunkel getönt, spiegelt die Umgebung, wirft keine Schatten (Meshes mit userData.noShadow)
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x18222c, transparent: true, opacity: 0.32, roughness: 0.03, metalness: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false,
    }),
    led: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    // Heller als Weiß, damit der Bloom-Effekt die LED-Leisten glühen lässt
    ledStrip: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e2).multiplyScalar(4) }),
    statusGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ae42).multiplyScalar(2.5) }),
  };
}

// ---------- Grundformen ----------

export function rbox(w, h, d, radius, material, x = 0, y = 0, z = 0) {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(rTop, rBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Schriftzug als flache Fläche (z. B. „Bambu Lab“), Ursprung in der Mitte, zeigt nach +z.
// height: Schrifthöhe in Metern, die Breite ergibt sich aus dem Text.
const labelCache = new Map();
export function createLabel(text, height, color = '#ffffff', weight = 700) {
  const key = `${text}|${color}|${weight}`;
  if (!labelCache.has(key)) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = `${weight} 64px "Segoe UI", Arial, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 84;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 8, 44);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    labelCache.set(key, { texture, aspect: canvas.width / canvas.height });
  }
  const { texture, aspect } = labelCache.get(key);
  const h = height * (84 / 64);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(h * aspect, h),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.4, depthWrite: false })
  );
  mesh.userData.noShadow = true;
  return mesh;
}

// Lüftungsschlitze: Reihe abgerundeter, dunkler Schlitze auf einer Fläche, Ursprung in der Mitte, nach +z
export function createVents(count, slotW, slotH, gap, m) {
  const vents = new THREE.Group();
  const total = count * slotH + (count - 1) * gap;
  for (let i = 0; i < count; i++) {
    vents.add(rbox(slotW, slotH, 0.002, slotH / 2, m.black, 0, -total / 2 + slotH / 2 + i * (slotH + gap), 0));
  }
  return vents;
}

// Runder Lüfter mit Gitter (z. B. Abluft hinten im Bauraum), Ursprung in der Mitte, Luftseite nach +z
export function createFanGrille(size, m) {
  const fan = new THREE.Group();
  fan.add(rbox(size, size, 0.012, 0.004, m.black));
  const r = size * 0.44;
  const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.32, 20), m.shellDark);
  hub.position.z = 0.0065;
  fan.add(hub);
  for (const f of [0.55, 0.78, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * f, 0.0012, 6, 40), m.shellDark);
    ring.position.z = 0.0065;
    fan.add(ring);
  }
  for (let i = 0; i < 4; i++) {
    const spoke = box(r * 2, 0.0025, 0.002, m.shellDark, 0, 0, 0.0065);
    spoke.rotation.z = (i * Math.PI) / 4;
    fan.add(spoke);
  }
  return fan;
}

// ---------- Bauteile ----------

// NEMA-17-Schrittmotor, Achse entlang y, Ursprung in der Mitte
export function createStepper(m) {
  const motor = new THREE.Group();
  const s = 0.042;
  motor.add(box(s * 0.98, 0.026, s * 0.98, m.black, 0, 0, 0));
  motor.add(rbox(s, 0.008, s, 0.003, m.alu, 0, 0.017, 0));
  motor.add(rbox(s, 0.008, s, 0.003, m.alu, 0, -0.017, 0));
  motor.add(cylinder(0.011, 0.011, 0.002, 24, m.alu, 0, 0.022, 0));   // Zentrierbund
  motor.add(cylinder(0.0025, 0.0025, 0.016, 12, m.steel, 0, 0.029, 0)); // Welle
  // Schrauben in den Ecken
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      motor.add(cylinder(0.0025, 0.0025, 0.0015, 10, m.black, sx * 0.0155, 0.0215, sz * 0.0155));
    }
  }
  return motor;
}

// Linearführung entlang z mit Wagen, Unterseite bei y = 0
export function createLinearRail(length, m) {
  const rail = new THREE.Group();
  rail.add(box(0.012, 0.008, length, m.steel, 0, 0.004, 0));
  rail.add(box(0.026, 0.011, 0.04, m.steel, 0, 0.0095, 0));
  rail.add(box(0.027, 0.004, 0.006, m.black, 0, 0.0095, 0.023));  // Abstreifer vorne
  rail.add(box(0.027, 0.004, 0.006, m.black, 0, 0.0095, -0.023)); // Abstreifer hinten
  return rail;
}

// Zahnriemen als flaches Band entlang z
export function createBelt(length, m) {
  return box(0.006, 0.0015, length, m.rubber);
}

// Heizbett mit magnetischer, strukturierter PEI-Platte. Unterseite bei y = 0.
export function createBuildPlate(size, m) {
  const plate = new THREE.Group();
  const heater = new THREE.MeshStandardMaterial({ color: 0x7a1f12, roughness: 0.7 }); // Heizfolie unten
  plate.add(rbox(size - 0.01, 0.0015, size - 0.01, 0.004, heater, 0, 0.00075, 0));
  plate.add(rbox(size + 0.012, 0.007, size + 0.012, 0.004, m.bedAlu, 0, 0.005, 0));
  // Ausrichtungsstifte hinten
  for (const sx of [-1, 1]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 10), m.steel);
    pin.position.set(sx * (size / 2 - 0.02), 0.0105, -size / 2 - 0.003);
    plate.add(pin);
  }
  plate.add(rbox(size, 0.0015, size, 0.003, m.plate, 0, 0.0093, 0));
  // Griffzunge vorne an der Platte
  plate.add(rbox(0.05, 0.0015, 0.016, 0.004, m.plate, 0, 0.0093, size / 2 + 0.006));
  // Kabel zum Heizbett hinten
  plate.add(box(0.03, 0.004, 0.02, m.black, 0, 0.002, -size / 2 - 0.012));
  plate.userData.topY = 0.0101;
  return plate;
}

// Druckkopf, Ursprung in der Mitte des Gehäuses, Rückseite bei z = -depth/2.
// style 'a1': helle Frontabdeckung (A1-Serie) · 'p1': etwas breiter und ganz dunkel (P1/P2-Serie)
export function createToolhead(m, style = 'a1') {
  const head = new THREE.Group();
  const w = style === 'p1' ? 0.064 : 0.055;
  const h = 0.075;
  const d = 0.045;
  const front = style === 'p1' ? m.shellDark : m.shell; // P1-Kopf ist ganz dunkel

  head.add(rbox(w, h, d, 0.006, m.shellDark));
  // Frontabdeckung mit abgesetzter unterer Kante
  head.add(rbox(w + 0.003, h - 0.004, 0.01, 0.004, front, 0, 0.001, d / 2 + 0.003));
  head.add(rbox(w - 0.008, 0.012, 0.002, 0.003, m.shellDark, 0, -h / 2 + 0.012, d / 2 + 0.0085));
  // Schriftzug und Status-LED
  const logo = createLabel('Bambu Lab', 0.0055, style === 'p1' ? '#e8e8e8' : '#3a3d42');
  logo.position.set(0, 0.018, d / 2 + 0.0085);
  head.add(logo);
  head.add(box(0.012, 0.0015, 0.001, m.led, 0, -h / 2 + 0.012, d / 2 + 0.0098));

  // Lüfter links (Bauteilkühlung, groß) und rechts (Kühlkörper, klein): Rotor hinter einem Gitter aus Ringen.
  // Die Rotoren liegen in userData.fans und drehen sich beim Drucken (workshop.js).
  const fans = [];
  for (const [side, radius, y] of [[-1, 0.0185, -0.005], [1, 0.012, 0.012]]) {
    const fan = createFan(radius, m);
    fan.rotation.y = side * Math.PI / 2;
    fan.position.set(side * (w / 2 + 0.0008), y, 0.002);
    head.add(fan);
    fans.push(fan.userData.rotor);
  }
  head.userData.fans = fans;

  // Schneidhebel oben links, PTFE-Kupplung oben
  head.add(rbox(0.008, 0.012, 0.007, 0.002, m.shell, -w / 2 + 0.006, h / 2 + 0.004, d / 2 - 0.006));
  head.add(cylinder(0.0055, 0.0055, 0.009, 16, m.black, 0, h / 2 + 0.0045, -0.004));

  // Unterseite: Luftdüse, Heizblock, Düse
  head.add(rbox(0.042, 0.01, 0.014, 0.003, m.shellDark, 0, -h / 2 - 0.003, d / 2 - 0.004));
  head.add(box(0.016, 0.011, 0.018, m.alu, 0, -h / 2 - 0.0055, -0.002));
  head.add(cylinder(0.0045, 0.0045, 0.004, 6, m.brass, 0, -h / 2 - 0.013, -0.002));
  const tip = cylinder(0.0008, 0.0035, 0.005, 16, m.brass, 0, -h / 2 - 0.0175, -0.002);
  head.add(tip);

  head.userData.depth = d;
  head.userData.nozzleBelowCenter = h / 2 + 0.02;
  head.userData.topAboveCenter = h / 2 + 0.009;
  return head;
}

// Kleiner Axiallüfter: dunkler Rahmen, Rotor mit sieben Blättern, davor Gitterringe. Ursprung in der Mitte,
// Luftseite nach +z. userData.rotor dreht sich um seine z-Achse.
function createFan(radius, m) {
  const fan = new THREE.Group();
  fan.add(new THREE.Mesh(new THREE.CircleGeometry(radius, 32), m.black));
  const rotor = new THREE.Group();
  rotor.position.z = 0.0005;
  const blade = new THREE.BoxGeometry(radius * 0.32, radius * 0.78, 0.0006);
  for (let i = 0; i < 7; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 7) * Math.PI * 2;
    const mesh = new THREE.Mesh(blade, m.shellMid);
    mesh.position.y = radius * 0.5;
    mesh.rotation.y = 0.45; // angestellt wie ein echtes Lüfterblatt
    pivot.add(mesh);
    rotor.add(pivot);
  }
  fan.add(rotor);
  for (const f of [0.38, 0.65, 0.92]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * f, radius * 0.06, 6, 32), m.shellDark);
    ring.position.z = 0.0013;
    fan.add(ring);
  }
  const hub = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.25, 20), m.shellDark);
  hub.position.z = 0.0016;
  fan.add(hub);
  fan.userData.rotor = rotor;
  return fan;
}

// Touchscreen mit Bambu-ähnlicher Statusanzeige. Ursprung in der Mitte, Anzeige nach +z.
export function createTouchscreen(w, h, title, m) {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = Math.round(400 * (h / w));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b1e22');
  bg.addColorStop(1, '#101215');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Kopfzeile: Gerätename, WLAN
  ctx.fillStyle = '#23272c';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 12, 17);
  ctx.fillStyle = '#00ae42';
  [7, 11, 15].forEach((bh, i) => ctx.fillRect(W - 44 + i * 9, 25 - bh, 6, bh));
  // Fortschrittsring links, Status rechts
  const cy = 34 + (H - 34) * 0.48;
  const r = Math.min(H * 0.28, W * 0.16);
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = '#2c3137';
  ctx.beginPath();
  ctx.arc(W * 0.24, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#00ae42';
  ctx.beginPath();
  ctx.arc(W * 0.24, cy, r, -Math.PI / 2, Math.PI * 1.1);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(r * 0.6)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText('✓', W * 0.24, cy);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#00ae42';
  ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Bereit', W * 0.46, cy - 18);
  ctx.fillStyle = '#9aa1a9';
  ctx.font = '16px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Düse 25 °C', W * 0.46, cy + 12);
  ctx.fillText('Bett 25 °C', W * 0.46, cy + 34);
  // Leiste unten
  ctx.fillStyle = '#23272c';
  ctx.fillRect(0, H - 28, W, 28);
  ctx.fillStyle = '#6c737b';
  ['⌂', '⚙', '▤', '⏻'].forEach((icon, i) => {
    ctx.textAlign = 'center';
    ctx.font = '18px "Segoe UI Symbol", "Segoe UI", sans-serif';
    ctx.fillText(icon, W * (0.125 + i * 0.25), H - 14);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const screen = new THREE.Group();
  screen.add(rbox(w + 0.008, h + 0.008, 0.008, 0.003, m.shellDark));
  // Glasscheibe leicht vor der Anzeige spiegelt das Licht
  const display = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  display.position.z = 0.0041;
  screen.add(display);
  const cover = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.004, h + 0.004),
    new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false })
  );
  cover.position.z = 0.0043;
  screen.add(cover);
  return screen;
}

// Flexibler Schlauch/Kabel: Anfang fest am Gerät, Ende folgt dem Druckkopf.
// startDir/endDir geben an, in welche Richtung der Schlauch an den Enden herausläuft.
export function createFlexTube({ start, startDir, endOffset, endDir, radius, material }) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.userData.flex = {
    start: new THREE.Vector3(...start),
    startDir: new THREE.Vector3(...startDir).normalize(),
    endOffset: new THREE.Vector3(...endOffset), // Anschlusspunkt relativ zur Kopfmitte
    endDir: new THREE.Vector3(...endDir).normalize(),
    radius,
    lastEnd: new THREE.Vector3(Infinity, Infinity, Infinity),
  };
  return mesh;
}

const FLEX_MIN_MOVE_SQ = 0.0015 ** 2; // erst ab 1,5 mm Bewegung neu biegen – spart Arbeit in jedem Bild

// Biegt den Schlauch neu, wenn sich das Ende bewegt hat (end in Koordinaten des Elternobjekts).
// Die Geometrie wird nur beim ersten Mal angelegt, danach werden ihre Punkte überschrieben,
// statt jedes Bild eine neue Geometrie auf die Grafikkarte zu laden.
export function updateFlexTube(mesh, end) {
  const f = mesh.userData.flex;
  if (f.lastEnd.distanceToSquared(end) < FLEX_MIN_MOVE_SQ) return;
  f.lastEnd.copy(end);
  // Weiche Kurve: Griffe entlang der Austrittsrichtungen, länger bei größerem Abstand
  const handle = Math.max(0.05, f.start.distanceTo(end) * 0.55);
  const curve = new THREE.CubicBezierCurve3(
    f.start,
    f.start.clone().addScaledVector(f.startDir, handle),
    end.clone().addScaledVector(f.endDir, handle),
    end.clone()
  );
  const tube = new THREE.TubeGeometry(curve, 40, f.radius, 8, false);
  const old = mesh.geometry;
  if (!old.attributes.position) {
    old.dispose();
    mesh.geometry = tube;
    return;
  }
  for (const name of ['position', 'normal']) {
    old.attributes[name].array.set(tube.attributes[name].array);
    old.attributes[name].needsUpdate = true;
  }
  old.computeBoundingSphere();
  tube.dispose();
}

// Spulenhalter: Sockel mit Stange entlang +x
export function createSpoolHolder(length, m) {
  const holder = new THREE.Group();
  holder.add(rbox(0.03, 0.02, 0.03, 0.005, m.shellDark, 0, 0.01, 0));
  const rod = cylinder(0.008, 0.008, length, 20, m.shell, length / 2, 0.022, 0);
  rod.rotation.z = Math.PI / 2;
  holder.add(rod);
  const cap = cylinder(0.012, 0.012, 0.004, 20, m.shellDark, length, 0.022, 0);
  cap.rotation.z = Math.PI / 2;
  holder.add(cap);
  return holder;
}

// AMS (Automatic Material System): Box für 4 Spulen mit getöntem Klarsicht-Deckel.
// Ursprung unten mittig, Vorderseite +z. userData.slots: Spulenmitten – die Spulen stehen nebeneinander,
// Achse nach links/rechts (x), so dass man von vorne die Wicklung sieht.
// userData.outlet: Anschluss des Filamentschlauchs hinten.
export const AMS_SLOTS = 4;

// dark: AMS 2 Pro (dunkelgrau, P2S) statt des hellgrauen AMS
export function createAMS(m, { dark: darkBody = false } = {}) {
  const ams = new THREE.Group();
  const W = 0.36;
  const H = 0.245;
  const D = 0.285;
  const baseH = 0.03;
  const dark = darkBody ? m.shellDark : m.shell;
  const smoke = new THREE.MeshPhysicalMaterial({
    color: 0x3a3430, transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.1,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5, depthWrite: false,
  });

  // Wanne, Rückwand mit Zuführungen, Seitenwangen
  ams.add(rbox(W, baseH, D, 0.01, dark, 0, baseH / 2, 0));
  ams.add(rbox(W, H - baseH, 0.03, 0.008, dark, 0, baseH + (H - baseH) / 2, -D / 2 + 0.015));
  for (const sx of [-1, 1]) ams.add(box(0.012, H - baseH, D - 0.03, dark, sx * (W / 2 - 0.006), baseH + (H - baseH) / 2, 0.015));

  // Klarsicht-Deckel oben und vorne
  const lidTop = box(W - 0.024, 0.005, D - 0.03, smoke, 0, H - 0.0025, 0.015);
  const lidFront = box(W - 0.024, H - baseH - 0.005, 0.005, smoke, 0, baseH + (H - baseH) / 2, D / 2 - 0.0025);
  for (const lid of [lidTop, lidFront]) {
    lid.userData.noShadow = true;
    ams.add(lid);
  }
  ams.add(box(W, 0.012, 0.012, dark, 0, H - 0.006, D / 2 - 0.006)); // Deckelkante
  // Griffmulden an den Seiten und Schriftzug vorne
  for (const sx of [-1, 1]) ams.add(rbox(0.004, 0.02, 0.09, 0.002, m.black, sx * (W / 2 + 0.0005), baseH + 0.08, 0.02));
  const logo = createLabel('Bambu Lab', 0.006, darkBody ? '#d8d8d8' : '#3a3d42');
  logo.position.set(0, H - 0.006, D / 2 + 0.0006); // auf der Deckelkante
  ams.add(logo);

  // Pro Fach: zwei Laufrollen, Zuführung hinten, Status-LED vorne
  const slots = [];
  const spacing = 0.085;
  const led = m.ledStrip;
  for (let i = 0; i < AMS_SLOTS; i++) {
    const x = (i - (AMS_SLOTS - 1) / 2) * spacing;
    // Laufrollen parallel zur Spulenachse, die Spule liegt vorne und hinten darauf
    for (const dz of [-0.06, 0.06]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), m.steel);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(x, baseH + 0.005, 0.01 + dz);
      ams.add(roller);
    }
    ams.add(rbox(0.03, 0.04, 0.025, 0.004, m.black, x, baseH + 0.03, -D / 2 + 0.042));
    ams.add(box(0.012, 0.004, 0.002, led, x + 0.03, baseH * 0.5, D / 2 + 0.001));
    // Auswurftaste pro Fach
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 14), m.shellMid);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(x + 0.018, baseH * 0.5, D / 2 + 0.0015);
    ams.add(btn);
    slots.push(new THREE.Vector3(x, baseH + 0.091, 0.01)); // Spule liegt auf den Rollen
  }

  // Sammelstück hinten, aus dem der Schlauch zum Drucker kommt
  ams.add(cylinder(0.012, 0.012, 0.02, 16, m.black, 0, 0.05, -D / 2 - 0.008));
  ams.userData.slots = slots;
  ams.userData.outlet = new THREE.Vector3(0, 0.05, -D / 2 - 0.018);
  ams.userData.height = H;
  return ams;
}

// Gummifüße unter einer Grundfläche w × d, Oberseite bei y = height
export function addFeet(group, w, d, height, m) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(cylinder(0.012, 0.013, height, 16, m.rubber, sx * (w / 2 - 0.025), height / 2, sz * (d / 2 - 0.025)));
    }
  }
}
