// 3D-Modelle der Drucker. Ursprung mittig am Boden, Vorderseite zeigt nach +z.
// Bambu-Modelle sind nach den echten Geräten modelliert (Maße in Metern).
import * as THREE from 'three';
import {
  createMaterials, rbox, box, createStepper, createLinearRail, createBelt, createBuildPlate,
  createToolhead, createTouchscreen, createTube, createSpoolHolder, addFeet,
} from './printer-parts.js';

// Was die Druck-Animation braucht: plateCenter (Mitte der Plattenoberfläche) und optional
// zAxis (fährt mit der Schichthöhe), head + headX (fährt seitlich hin und her), nozzleGap (Düsenabstand in Ruhe)
function setPrintRig(g, rig) {
  g.userData.printRig = rig;
}

// Schlauch/Kabel in Modellkoordinaten an den Druckkopf hängen, damit sie seiner Bewegung folgen
function attachToHead(head, object) {
  object.position.sub(head.position);
  head.add(object);
}

// ---------- Bambu Lab A1 mini: freitragender Arm an einer Säule hinten rechts ----------

function buildA1Mini(g) {
  const m = createMaterials();
  const FOOT = 0.006;
  const baseW = 0.27;
  const baseH = 0.055;
  const baseD = 0.315;
  const baseX = -0.02;
  const baseTop = FOOT + baseH;

  // Sockel mit Füßen und dunklem Zierstreifen
  const feet = new THREE.Group();
  addFeet(feet, baseW, baseD, FOOT, m);
  feet.position.x = baseX;
  g.add(feet);
  g.add(rbox(baseW, baseH, baseD, 0.014, m.shell, baseX, FOOT + baseH / 2, 0));
  g.add(box(baseW * 0.62, 0.006, 0.002, m.shellDark, baseX - 0.02, FOOT + baseH * 0.45, baseD / 2 + 0.001));

  // Y-Achse: Linearführung, Riemen, Motor hinten
  const rail = createLinearRail(baseD - 0.05, m);
  rail.position.set(baseX, baseTop, 0);
  g.add(rail);
  const belt = createBelt(baseD - 0.08, m);
  belt.position.set(baseX + 0.022, baseTop + 0.002, 0);
  g.add(belt);
  const yMotor = createStepper(m);
  yMotor.rotation.x = Math.PI / 2;
  yMotor.position.set(baseX + 0.03, baseTop + 0.021, -baseD / 2 + 0.03);
  g.add(yMotor);

  // Druckbett auf Träger – fährt beim Drucken vor und zurück (Y-Achse)
  const bedZ = 0.02;
  const carriageTop = baseTop + 0.015;
  const bedAxis = new THREE.Group();
  g.add(bedAxis);
  bedAxis.add(box(0.12, 0.004, 0.12, m.shellDark, baseX, carriageTop, bedZ));
  const plate = createBuildPlate(0.18, m);
  plate.position.set(baseX, carriageTop + 0.002, bedZ);
  bedAxis.add(plate);
  const plateTop = carriageTop + 0.002 + plate.userData.topY;

  // Druckkopf, Düse 6 cm über der Platte, mittig über dem Bett
  const head = createToolhead(m);
  const beamD = 0.035;
  const beamH = 0.03;
  const beamZ = bedZ - beamD / 2 - head.userData.depth / 2;
  const headX = baseX - 0.01;
  const nozzleGap = 0.06;
  const headY = plateTop + nozzleGap + head.userData.nozzleBelowCenter;
  const headZ = beamZ + beamD / 2 + head.userData.depth / 2;
  head.position.set(headX, headY, headZ);
  // Alles, was beim Drucken mit der Schichthöhe hoch- und runterfährt
  const zAxis = new THREE.Group();
  zAxis.add(head);
  g.add(zAxis);
  setPrintRig(g, { zAxis, bedAxis, head, headX, nozzleGap, plateCenter: new THREE.Vector3(baseX, plateTop, bedZ) });

  // Z-Säule hinten rechts mit eigenem Fuß und Führungsschlitz
  const colW = 0.05;
  const colD = 0.07;
  const colH = 0.365;
  const colX = 0.155;
  const colZ = beamZ - 0.012;
  g.add(rbox(0.075, 0.03, 0.11, 0.01, m.shell, colX - 0.005, FOOT + 0.015, colZ));
  g.add(rbox(colW, colH - FOOT, colD, 0.012, m.shell, colX, FOOT + (colH - FOOT) / 2, colZ));
  g.add(rbox(colW + 0.004, 0.022, colD + 0.004, 0.008, m.shellDark, colX, colH - 0.011, colZ));
  g.add(box(0.003, colH - 0.11, 0.02, m.shellDark, colX - colW / 2 - 0.0005, FOOT + 0.04 + (colH - 0.11) / 2, beamZ));

  // X-Arm: Schlitten an der Säule, Ausleger nach links, Endkappe
  const armRight = colX - colW / 2 - 0.03;
  const armLeft = baseX - baseW / 2 + 0.005;
  const armLen = armRight - armLeft;
  zAxis.add(rbox(0.03, 0.062, 0.062, 0.006, m.shellDark, colX - colW / 2 - 0.015, headY, beamZ));
  zAxis.add(rbox(armLen, beamH, beamD, 0.006, m.shell, armLeft + armLen / 2, headY, beamZ));
  zAxis.add(box(armLen - 0.02, 0.007, 0.002, m.shellDark, armLeft + armLen / 2, headY + 0.006, beamZ + beamD / 2 + 0.001));
  zAxis.add(rbox(0.012, beamH + 0.004, beamD + 0.004, 0.004, m.shellDark, armLeft, headY, beamZ));

  // Touchscreen vorne rechts, schräg gestellt
  const screen = createTouchscreen(0.055, 0.04, 'A1 mini', m);
  screen.rotation.x = -0.6;
  screen.position.set(baseX + baseW / 2 - 0.05, FOOT + baseH * 0.7, baseD / 2 + 0.012);
  g.add(screen);
  g.add(box(0.03, 0.02, 0.016, m.shellDark, baseX + baseW / 2 - 0.05, FOOT + baseH * 0.5, baseD / 2 + 0.004));

  // Spulenhalter oben auf der Säule, Stange nach links
  const holder = createSpoolHolder(0.09, m);
  holder.rotation.y = Math.PI;
  holder.position.set(colX, colH, colZ);
  g.add(holder);

  // PTFE-Schlauch vom Spulenhalter zum Druckkopf, Flachkabel von der Säule zum Druckkopf
  const headTop = headY + head.userData.topAboveCenter;
  attachToHead(head, createTube([
    [colX - 0.03, colH + 0.025, colZ],
    [colX - 0.08, colH + 0.06, colZ + 0.01],
    [headX + 0.03, headTop + 0.1, headZ - 0.01],
    [headX, headTop, headZ - 0.004],
  ], 0.0022, m.ptfe));
  attachToHead(head, createTube([
    [colX - colW / 2, colH - 0.05, colZ - 0.01],
    [colX - 0.09, colH + 0.005, colZ - 0.02],
    [headX + 0.025, headTop + 0.05, headZ - 0.03],
    [headX + 0.014, headTop - 0.006, headZ - 0.02],
  ], 0.003, m.black));

  g.userData.spoolAnchor = new THREE.Vector3(colX - 0.06, colH + 0.022, colZ);
}

// ---------- Bambu Lab A1: Portal aus zwei Säulen und Querstrebe ----------

function buildA1(g) {
  const m = createMaterials();
  const FOOT = 0.008;
  const baseW = 0.385;
  const baseH = 0.065;
  const baseD = 0.39;
  const baseTop = FOOT + baseH;
  const frameH = 0.458;

  addFeet(g, baseW, baseD, FOOT, m);
  g.add(rbox(baseW, baseH, baseD, 0.016, m.shell, 0, FOOT + baseH / 2, 0));
  g.add(box(baseW * 0.6, 0.007, 0.002, m.shellDark, -0.03, FOOT + baseH * 0.45, baseD / 2 + 0.001));

  // Y-Achse
  const rail = createLinearRail(baseD - 0.06, m);
  rail.position.set(0, baseTop, 0);
  g.add(rail);
  const belt = createBelt(baseD - 0.09, m);
  belt.position.set(0.025, baseTop + 0.002, 0);
  g.add(belt);
  const yMotor = createStepper(m);
  yMotor.rotation.x = Math.PI / 2;
  yMotor.position.set(0.035, baseTop + 0.021, -baseD / 2 + 0.03);
  g.add(yMotor);

  // Druckbett – fährt beim Drucken vor und zurück (Y-Achse)
  const bedZ = 0;
  const carriageTop = baseTop + 0.015;
  const bedAxis = new THREE.Group();
  g.add(bedAxis);
  bedAxis.add(box(0.18, 0.004, 0.18, m.shellDark, 0, carriageTop, bedZ));
  const plate = createBuildPlate(0.256, m);
  plate.position.set(0, carriageTop + 0.002, bedZ);
  bedAxis.add(plate);
  const plateTop = carriageTop + 0.002 + plate.userData.topY;

  // Druckkopf
  const head = createToolhead(m);
  const beamD = 0.03;
  const beamH = 0.028;
  const beamZ = bedZ - beamD / 2 - head.userData.depth / 2;
  const headX = 0.02;
  const nozzleGap = 0.09;
  const headY = plateTop + nozzleGap + head.userData.nozzleBelowCenter;
  const headZ = beamZ + beamD / 2 + head.userData.depth / 2;
  head.position.set(headX, headY, headZ);
  const zAxis = new THREE.Group();
  zAxis.add(head);
  g.add(zAxis);
  setPrintRig(g, { zAxis, bedAxis, head, headX, nozzleGap, plateCenter: new THREE.Vector3(0, plateTop, bedZ) });

  // Portal: zwei Säulen mit Führungsschlitzen innen, Querstrebe oben
  const upW = 0.035;
  const upD = 0.055;
  const upX = baseW / 2 - upW / 2;
  const upH = frameH - 0.03 - baseTop;
  const inner = upX - upW / 2;
  for (const sx of [-1, 1]) {
    g.add(rbox(upW, upH, upD, 0.01, m.shell, sx * upX, baseTop + upH / 2, beamZ));
    g.add(box(0.003, upH - 0.06, 0.018, m.shellDark, sx * (inner + 0.0005), baseTop + upH / 2, beamZ));
    // X-Schlitten an den Säulen
    zAxis.add(rbox(0.022, 0.056, upD - 0.008, 0.005, m.shellDark, sx * (inner - 0.011), headY, beamZ));
  }
  g.add(rbox(baseW, 0.03, upD, 0.012, m.shell, 0, frameH - 0.015, beamZ));
  g.add(box(baseW * 0.5, 0.006, 0.002, m.shellDark, 0, frameH - 0.015, beamZ + upD / 2 + 0.001));

  // X-Achse: Alu-Träger mit Riemen, Motor links hinten
  const beamLen = inner * 2 - 0.044;
  zAxis.add(rbox(beamLen, beamH, beamD, 0.004, m.alu, 0, headY, beamZ));
  const xBelt = createBelt(beamLen - 0.02, m);
  xBelt.rotation.y = Math.PI / 2;
  xBelt.position.set(0, headY + beamH / 2 + 0.001, beamZ);
  zAxis.add(xBelt);
  const xMotor = createStepper(m);
  xMotor.rotation.x = -Math.PI / 2;
  xMotor.position.set(-(inner - 0.032), headY, beamZ - beamD / 2 - 0.021);
  zAxis.add(xMotor);

  // Touchscreen vorne rechts
  const screen = createTouchscreen(0.075, 0.05, 'A1', m);
  screen.rotation.x = -0.6;
  screen.position.set(baseW / 2 - 0.07, FOOT + baseH * 0.7, baseD / 2 + 0.014);
  g.add(screen);
  g.add(box(0.04, 0.024, 0.018, m.shellDark, baseW / 2 - 0.07, FOOT + baseH * 0.5, baseD / 2 + 0.005));

  // Spulenhalter oben rechts, Stange nach hinten
  const holderX = 0.12;
  const holder = createSpoolHolder(0.09, m);
  holder.rotation.y = Math.PI / 2;
  holder.position.set(holderX, frameH, beamZ);
  g.add(holder);

  // PTFE-Schlauch und Flachkabel
  const headTop = headY + head.userData.topAboveCenter;
  attachToHead(head, createTube([
    [holderX, frameH + 0.025, beamZ - 0.02],
    [holderX - 0.02, frameH + 0.08, beamZ + 0.03],
    [headX + 0.03, headTop + 0.12, headZ],
    [headX, headTop, headZ - 0.004],
  ], 0.0022, m.ptfe));
  attachToHead(head, createTube([
    [-0.06, frameH - 0.03, beamZ - 0.01],
    [-0.04, frameH - 0.05, beamZ - 0.03],
    [headX - 0.01, headTop + 0.06, headZ - 0.035],
    [headX + 0.012, headTop - 0.006, headZ - 0.02],
  ], 0.003, m.black));

  g.userData.spoolAnchor = new THREE.Vector3(holderX, frameH + 0.022, beamZ - 0.06);
}

// ---------- Platzhalter: geschlossener Würfel (ForgeCube) ----------

function buildEnclosed(g, { w, h, d }, accent) {
  const m = {
    body: new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.35 }),
    bed: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.5, roughness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45 }),
    display: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.55) }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x223344, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false,
    }),
  };
  const baseH = 0.08;
  g.add(box(w, baseH, d, m.body, 0, baseH / 2, 0));
  g.add(box(0.095, 0.05, 0.014, m.body, w * 0.28, 0.045, d / 2 + 0.007));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.036), m.display);
  display.position.set(w * 0.28, 0.045, d / 2 + 0.0145);
  g.add(display);

  const postH = h - baseH - 0.03;
  const post = 0.025;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(post, postH, post, m.body, sx * (w / 2 - post / 2), baseH + postH / 2, sz * (d / 2 - post / 2)));
    }
  }
  g.add(box(w, 0.03, d, m.body, 0, h - 0.015, 0));
  g.add(box(w * 0.6, 0.008, 0.01, m.accent, 0, h - 0.015, d / 2 + 0.005));

  const glassY = baseH + postH / 2;
  const panels = [
    box(0.004, postH, d - post * 2, m.glass, -w / 2 + post / 2, glassY, 0),
    box(0.004, postH, d - post * 2, m.glass, w / 2 - post / 2, glassY, 0),
    box(w - post * 2, postH, 0.004, m.glass, 0, glassY, -d / 2 + post / 2),
    box(w - post * 2, postH, 0.004, m.glass, 0, glassY, d / 2 - post / 2),
  ];
  for (const p of panels) {
    p.userData.noShadow = true;
    g.add(p);
  }
  g.add(box(0.012, 0.12, 0.012, m.accent, w / 2 - post - 0.03, glassY, d / 2 + 0.004));

  g.add(box(w * 0.78, 0.012, d * 0.78, m.bed, 0, baseH + 0.06, 0));
  setPrintRig(g, { plateCenter: new THREE.Vector3(0, baseH + 0.066, 0) });
  const railY = h - 0.07;
  for (const sx of [-1, 1]) {
    g.add(box(0.02, 0.02, d - post * 2 - 0.02, m.alu, sx * (w / 2 - post - 0.02), railY, 0));
  }
  g.add(box(w - post * 2 - 0.04, 0.02, 0.02, m.alu, 0, railY, -0.03));
  g.add(box(0.06, 0.07, 0.05, m.accent, -0.05, railY - 0.04, -0.005));

  g.userData.spoolAnchor = new THREE.Vector3(w / 2 + 0.06, h * 0.6, 0);
}

const BUILDERS = {
  'a1-mini': (g) => buildA1Mini(g),
  a1: (g) => buildA1(g),
  enclosed: (g, model) => buildEnclosed(g, model.size, model.accent),
};

// Die Spule hängt am Spulenhalter: spoolAnchor = Mitte der Spule, spoolAxis = Richtung der Halterstange
const SPOOL_AXIS = { 'a1-mini': 'x', a1: 'z', enclosed: 'x' };

export function createPrinterModel(model) {
  const group = new THREE.Group();
  BUILDERS[model.style](group, model);
  group.userData.model = model;
  group.userData.spoolAxis = SPOOL_AXIS[model.style];
  return group;
}

const sizeCache = new Map();

// Abmessungen des fertigen Modells (Vector3 in Metern), z. B. für Karton und Stellplatz-Vorschau
export function printerSize(model) {
  if (!sizeCache.has(model.id)) {
    const box = new THREE.Box3().setFromObject(createPrinterModel(model));
    sizeCache.set(model.id, box.getSize(new THREE.Vector3()));
  }
  return sizeCache.get(model.id);
}
