// 3D-Modelle der Drucker. Ursprung mittig am Boden, Vorderseite zeigt nach +z.
// Bambu-Modelle sind nach den echten Geräten modelliert (Maße in Metern).
//
// Jedes Modell legt in userData ab:
//   printRig: { partParent, plateCenter, head, pose(state) } – partParent trägt das gedruckte Teil (das Bett),
//             pose stellt die Achsen für einen Druckzustand ein:
//             state = { mode: 'idle' | 'printing' | 'done', x, z (Düse relativ zur Plattenmitte), layerY, partHeight }
//   spoolSlots: [{ position, axis }] – wo eingelegte Spulen sitzen (1 Spulenhalter oder 4 AMS-Fächer)
//   flexTubes: Schläuche/Kabel, die dem Druckkopf folgen
import * as THREE from 'three';
import {
  createMaterials, rbox, box, createStepper, createLinearRail, createBelt, createBuildPlate,
  createToolhead, createTouchscreen, createFlexTube, updateFlexTube, createSpoolHolder, addFeet, createAMS,
  createLabel, createVents, createFanGrille,
} from './printer-parts.js';

// Lüftungsschlitze an beiden Seiten eines Sockels (Mitte bei x, Seitenflächen bei x ± w/2)
function addSideVents(g, m, x, w, y, z, count, length) {
  for (const sx of [-1, 1]) {
    const vents = createVents(count, length, 0.004, 0.004, m);
    vents.rotation.y = sx * Math.PI / 2;
    vents.position.set(x + sx * (w / 2 + 0.0008), y, z);
    g.add(vents);
  }
}

// Schriftzug „Bambu Lab“ an einer Vorderseite
function addLogo(parent, height, color, x, y, z) {
  const logo = createLabel('Bambu Lab', height, color);
  logo.position.set(x, y, z);
  parent.add(logo);
}

// Flexibler Schlauch/Kabel vom Gerät zum Druckkopf (Anfang in Modellkoordinaten)
function addFlexTube(g, options) {
  const tube = createFlexTube(options);
  g.add(tube);
  (g.userData.flexTubes ??= []).push(tube);
}

const tubeEnd = new THREE.Vector3();

// Biegt alle Schläuche passend zur aktuellen Kopfposition. Aufrufen, nachdem sich die Achsen bewegt haben.
export function updatePrinterTubes(model) {
  const tubes = model.userData.flexTubes;
  const head = model.userData.printRig?.head;
  if (!tubes || !head) return;
  model.updateMatrixWorld(true);
  for (const tube of tubes) {
    tubeEnd.copy(tube.userData.flex.endOffset);
    head.localToWorld(tubeEnd);
    model.worldToLocal(tubeEnd);
    updateFlexTube(tube, tubeEnd);
  }
}

// Bettschubser (A1-Serie): Kopf fährt X, Bett fährt Y (vor/zurück), Portal fährt Z (hoch)
function bedSlingerPose({ zAxis, bedAxis, head, headX, plateX, nozzleGap }) {
  return ({ mode, x, z, layerY, partHeight }) => {
    if (mode === 'printing') {
      zAxis.position.y = layerY - nozzleGap + 0.0005; // Düse sitzt auf der aktuellen Schicht
      head.position.x = plateX + x;
      bedAxis.position.z = -z; // Bett fährt entgegen, damit die Düse relativ zur Platte wandert
    } else {
      zAxis.position.y = mode === 'done' ? Math.max(0, partHeight - nozzleGap + 0.02) : 0; // geparkt über dem Teil
      head.position.x = headX;
      bedAxis.position.z = 0;
    }
  };
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
  addLogo(g, 0.008, '#4a4e55', baseX - baseW / 2 + 0.05, FOOT + baseH * 0.75, baseD / 2 + 0.0012);
  addSideVents(g, m, baseX, baseW, FOOT + baseH * 0.5, -0.04, 4, 0.08);
  // Abdeckung der Y-Führung hinten und Netzschalter
  g.add(rbox(0.05, 0.012, 0.04, 0.004, m.shellMid, baseX, baseTop + 0.006, -baseD / 2 + 0.03));
  g.add(rbox(0.012, 0.018, 0.004, 0.002, m.black, baseX + baseW / 2 - 0.04, FOOT + baseH / 2, -baseD / 2 - 0.002));

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

  // Druckbett auf Träger – fährt beim Drucken vor und zurück
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
  const zAxis = new THREE.Group(); // alles, was mit der Schichthöhe hoch- und runterfährt
  zAxis.add(head);
  g.add(zAxis);
  g.userData.printRig = {
    partParent: bedAxis, // gedruckte Teile liegen auf dem Bett und fahren mit
    head,
    plateCenter: new THREE.Vector3(baseX, plateTop, bedZ),
    pose: bedSlingerPose({ zAxis, bedAxis, head, headX, plateX: baseX, nozzleGap }),
  };

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
  addLogo(zAxis, 0.0045, '#ffffff', armLeft + 0.045, headY + 0.006, beamZ + beamD / 2 + 0.0016);
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
  g.userData.spoolSlots = [{ position: new THREE.Vector3(colX - 0.06, colH + 0.022, colZ), axis: 'x' }];

  // PTFE-Schlauch vom Spulenhalter zum Druckkopf, Flachkabel von der Säule zum Druckkopf
  const top = head.userData.topAboveCenter;
  addFlexTube(g, {
    start: [colX - 0.03, colH + 0.025, colZ], startDir: [-0.6, 1, 0.1],
    endOffset: [0, top, -0.004], endDir: [0, 1, 0], radius: 0.0022, material: m.ptfe,
  });
  addFlexTube(g, {
    start: [colX - colW / 2, colH - 0.05, colZ - 0.01], startDir: [-1, 0.4, 0],
    endOffset: [0.014, top - 0.006, -0.02], endDir: [0.2, 1, -0.3], radius: 0.003, material: m.black,
  });
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
  addLogo(g, 0.009, '#4a4e55', -baseW / 2 + 0.06, FOOT + baseH * 0.75, baseD / 2 + 0.0012);
  addSideVents(g, m, 0, baseW, FOOT + baseH * 0.5, -0.05, 5, 0.1);
  g.add(rbox(0.06, 0.014, 0.045, 0.004, m.shellMid, 0, baseTop + 0.007, -baseD / 2 + 0.035)); // Abdeckung hinten
  g.add(rbox(0.014, 0.02, 0.004, 0.002, m.black, baseW / 2 - 0.05, FOOT + baseH / 2, -baseD / 2 - 0.002)); // Netzschalter

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

  // Druckbett – fährt beim Drucken vor und zurück
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
  g.userData.printRig = {
    partParent: bedAxis, // gedruckte Teile liegen auf dem Bett und fahren mit
    head,
    plateCenter: new THREE.Vector3(0, plateTop, bedZ),
    pose: bedSlingerPose({ zAxis, bedAxis, head, headX, plateX: 0, nozzleGap }),
  };

  // Portal: zwei Säulen mit Führungsschlitzen innen, Querstrebe oben
  const upW = 0.035;
  const upD = 0.055;
  const upX = baseW / 2 - upW / 2;
  const upH = frameH - 0.03 - baseTop;
  const inner = upX - upW / 2;
  for (const sx of [-1, 1]) {
    g.add(rbox(upW, upH, upD, 0.01, m.shell, sx * upX, baseTop + upH / 2, beamZ));
    g.add(box(0.003, upH - 0.06, 0.018, m.shellDark, sx * (inner + 0.0005), baseTop + upH / 2, beamZ));
    zAxis.add(rbox(0.022, 0.056, upD - 0.008, 0.005, m.shellDark, sx * (inner - 0.011), headY, beamZ)); // X-Schlitten
  }
  g.add(rbox(baseW, 0.03, upD, 0.012, m.shell, 0, frameH - 0.015, beamZ));
  g.add(box(baseW * 0.5, 0.012, 0.002, m.shellDark, 0, frameH - 0.015, beamZ + upD / 2 + 0.001));
  addLogo(g, 0.0075, '#ffffff', 0, frameH - 0.015, beamZ + upD / 2 + 0.0024);

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
  g.userData.spoolSlots = [{ position: new THREE.Vector3(holderX, frameH + 0.022, beamZ - 0.06), axis: 'z' }];

  // PTFE-Schlauch und Flachkabel
  const top = head.userData.topAboveCenter;
  addFlexTube(g, {
    start: [holderX, frameH + 0.025, beamZ - 0.02], startDir: [-0.2, 1, 0.5],
    endOffset: [0, top, -0.004], endDir: [0, 1, 0], radius: 0.0022, material: m.ptfe,
  });
  addFlexTube(g, {
    start: [-0.06, frameH - 0.03, beamZ - 0.035], startDir: [0.2, -0.3, -1],
    endOffset: [0.012, top - 0.006, -0.02], endDir: [0, 1, -0.6], radius: 0.003, material: m.black,
  });
}

// ---------- Bambu Lab P1P / P1S / P2S: CoreXY-Würfel mit AMS auf dem Dach ----------
// Kopf fährt X und Y (vor/zurück) unter der Decke, das Bett fährt nach unten (Z).
// P1P: offenes Gerüst ohne Wände und Tür. P1S/P2S: Seitenwände, Glastür vorne, Glasdeckel oben.

const CUBE_VARIANTS = {
  p1p: { title: 'P1P', w: 0.386, d: 0.389, h: 0.458, enclosed: false, screen: [0.06, 0.036], buttons: true, fascia: 0.03 },
  p1s: { title: 'P1S', w: 0.389, d: 0.389, h: 0.458, enclosed: true, screen: [0.06, 0.036], buttons: true, fascia: 0.03 },
  p2s: { title: 'P2S', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.105, 0.064], buttons: false, fascia: 0.045 },
};

function buildBambuCube(g, variant) {
  const { title, w, d, h, enclosed } = variant;
  const m = createMaterials();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.55, metalness: 0.2 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.6 });
  const glass = m.glass;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.3 });
  const FOOT = 0.01;
  const baseH = 0.07;
  const baseTop = FOOT + baseH;
  const post = 0.03;
  const topH = 0.03;

  // Unterbau und Gerüst: Eckpfosten und oberer Rahmen
  addFeet(g, w, d, FOOT, m);
  g.add(rbox(w, baseH, d, 0.012, frame, 0, FOOT + baseH / 2, 0));
  const postH = h - baseTop - topH;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(rbox(post, postH, post, 0.004, frame, sx * (w / 2 - post / 2), baseTop + postH / 2, sz * (d / 2 - post / 2)));
    }
    g.add(rbox(post, topH, d, 0.006, frame, sx * (w / 2 - post / 2), h - topH / 2, 0)); // Rahmen links/rechts
  }
  g.add(rbox(w, topH, post, 0.006, frame, 0, h - topH / 2, -d / 2 + post / 2));    // Rahmen hinten
  // Vorderes Display-Paneel unter dem oberen Rahmen
  const fasciaH = variant.fascia; // Höhe des vorderen Paneels unter dem Rahmen (Platz fürs Display)
  g.add(rbox(w, fasciaH + topH, 0.022, 0.006, frame, 0, h - (fasciaH + topH) / 2, d / 2 - 0.011));
  addLogo(g, 0.011, '#d6d8dc', w / 2 - 0.085, h - (fasciaH + topH) / 2, d / 2 + 0.0006);

  // Bauraum: dunkle Bodenplatte, Abfallschacht hinten links
  g.add(box(w - post * 2, 0.004, d - post * 2, panel, 0, baseTop + 0.002, 0));
  const chute = rbox(0.045, 0.06, 0.05, 0.004, m.black, -w / 2 + post + 0.03, baseTop + 0.03, -d / 2 + post + 0.03);
  chute.rotation.x = -0.25;
  g.add(chute);
  addSideVents(g, m, 0, w, FOOT + baseH * 0.5, -0.06, 4, 0.12);

  if (enclosed) {
    // Seitenwände und Rückwand, Glasdeckel oben, Glastür vorne mit Rahmen und Griff
    const wallH = h - baseTop - topH;
    for (const sx of [-1, 1]) g.add(box(0.006, wallH, d - post * 2, panel, sx * (w / 2 - 0.004), baseTop + wallH / 2, 0));
    g.add(box(w - post * 2, wallH, 0.006, panel, 0, baseTop + wallH / 2, -d / 2 + 0.004));
    // Abluftlüfter innen an der Rückwand
    const fan = createFanGrille(0.075, m);
    fan.position.set(w / 4, baseTop + wallH * 0.55, -d / 2 + 0.013);
    g.add(fan);
    // Glasdeckel zwischen hinterem Rahmen und vorderem Paneel
    const lid = box(w - post * 2, 0.005, d - post - 0.022, glass, 0, h - 0.0025, (post - 0.022) / 2);
    lid.userData.noShadow = true;
    g.add(lid);
    const doorH = h - baseTop - topH - fasciaH;
    const door = box(w - post * 2, doorH, 0.005, glass, 0, baseTop + doorH / 2, d / 2 - 0.003);
    door.userData.noShadow = true;
    g.add(door);
    g.add(box(w - post * 2, 0.012, 0.008, frame, 0, baseTop + 0.006, d / 2 - 0.002)); // Türunterkante
    g.add(rbox(0.014, 0.16, 0.022, 0.005, frame, w / 2 - post - 0.03, baseTop + doorH * 0.55, d / 2 + 0.01)); // Griff
    for (const fy of [0.15, 0.85]) g.add(rbox(0.012, 0.03, 0.012, 0.003, m.steel, -w / 2 + post - 0.002, baseTop + doorH * fy, d / 2 - 0.001)); // Scharniere
  } else {
    // P1P: offen, nur Querstreben oben vorne für das AMS
    g.add(rbox(w, topH, post, 0.006, frame, 0, h - topH / 2, d / 2 - post / 2));
  }

  // Bildschirm (P2S größer, Touch) – P1-Serie mit Tasten daneben
  const [sw, sh] = variant.screen;
  const screenX = -w / 2 + 0.035 + sw / 2;
  const screenY = h - (fasciaH + topH) / 2; // mittig im vorderen Paneel
  const screen = createTouchscreen(sw, sh, title, m);
  screen.position.set(screenX, screenY, d / 2 + 0.002);
  g.add(screen);
  if (variant.buttons) {
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12), m.shell);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(screenX + sw / 2 + 0.014 + (i % 2) * 0.012, screenY + (i < 2 ? 0.007 : -0.007), d / 2 + 0.002);
      g.add(btn);
    }
  }
  // Innenbeleuchtung unter dem vorderen Paneel
  const light = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.008), m.ledStrip);
  light.rotation.x = Math.PI / 2;
  light.position.set(0, h - topH - fasciaH - 0.001, d / 2 - 0.03);
  g.add(light);

  // CoreXY-Mechanik unter der Decke: Y-Führungen links/rechts, X-Brücke mit Kopf fährt vor/zurück
  const railY = h - topH - 0.018;
  const railX = w / 2 - post - 0.012;
  for (const sx of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, d - post * 2, 12), m.steel);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(sx * railX, railY, 0);
    g.add(rod);
    const belt = createBelt(d - post * 2 - 0.02, m);
    belt.position.set(sx * (railX - 0.012), railY + 0.008, 0);
    g.add(belt);
    // Motoren hinten oben in den Ecken
    const motor = createStepper(m);
    motor.position.set(sx * (railX - 0.02), railY + 0.004, -d / 2 + post + 0.024);
    g.add(motor);
  }

  const head = createToolhead(m, 'p1');
  const headY = railY - 0.026; // etwas tiefer, damit der Kopf unter dem vorderen Paneel zu sehen ist
  head.position.set(0, headY, 0);
  const gantry = new THREE.Group(); // X-Brücke, fährt in Y-Richtung (vor/zurück)
  gantry.add(head);
  for (const dy of [0.008, -0.012]) {
    const xRod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, railX * 2, 12), carbon);
    xRod.rotation.z = Math.PI / 2;
    xRod.position.set(0, railY + dy, -head.userData.depth / 2 - 0.006);
    gantry.add(xRod);
  }
  for (const sx of [-1, 1]) gantry.add(rbox(0.03, 0.04, 0.045, 0.005, frame, sx * railX, railY, -0.012)); // Gleitschuhe
  g.add(gantry);

  // Druckbett auf Z-Träger, fährt nach unten; drei Gewindespindeln
  const nozzleY = headY - head.userData.nozzleBelowCenter;
  const nozzleGap = 0.12;
  const plateTop = nozzleY - nozzleGap;
  const bedAxis = new THREE.Group();
  const plate = createBuildPlate(0.256, m);
  plate.position.set(0, plateTop - plate.userData.topY, 0);
  bedAxis.add(plate);
  bedAxis.add(box(0.29, 0.012, 0.05, frame, 0, plateTop - plate.userData.topY - 0.008, -0.16)); // Träger hinten
  for (const sx of [-1, 1]) bedAxis.add(box(0.03, 0.012, 0.3, frame, sx * 0.13, plateTop - plate.userData.topY - 0.008, -0.02));
  g.add(bedAxis);
  for (const sx of [-1, 0, 1]) { // drei Gewindespindeln hinten, damit der Blick durch die Tür frei bleibt
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, railY - baseTop - 0.03, 10), m.steel);
    screw.position.set(sx * 0.13, baseTop + (railY - baseTop - 0.03) / 2, -0.17);
    g.add(screw);
  }
  const lowestPlate = baseTop + 0.012;

  g.userData.printRig = {
    partParent: bedAxis, // gedruckte Teile liegen auf dem Bett und fahren mit
    head,
    plateCenter: new THREE.Vector3(0, plateTop, 0),
    pose: ({ mode, x, z, layerY, partHeight }) => {
      if (mode === 'printing') {
        bedAxis.position.y = nozzleGap - layerY - 0.0005; // Bett hebt die aktuelle Schicht an die Düse
        head.position.x = x;
        gantry.position.z = z;
      } else {
        // Fertig: Bett so weit absenken, dass das Teil frei unter der Düse steht
        const down = mode === 'done' ? nozzleGap - partHeight - 0.03 : 0;
        bedAxis.position.y = Math.max(Math.min(0, down), lowestPlate - plateTop);
        head.position.x = 0;
        gantry.position.z = 0;
      }
    },
  };

  // AMS auf dem Dach, Schlauch hinten heraus und von oben zum Kopf, Kabelkette innen
  const ams = createAMS(m, { dark: variant === CUBE_VARIANTS.p2s });
  ams.position.set(0, h, -0.01);
  g.add(ams);
  g.userData.spoolSlots = ams.userData.slots.map((p) => ({ position: p.clone().add(ams.position), axis: 'x' }));
  const outlet = ams.userData.outlet.clone().add(ams.position);
  const top = head.userData.topAboveCenter;
  addFlexTube(g, {
    start: outlet.toArray(), startDir: [0, -0.4, -1],
    endOffset: [0, top, -0.004], endDir: [0, 1, 0], radius: 0.0022, material: m.ptfe,
  });
  addFlexTube(g, {
    start: [0, railY + 0.01, -d / 2 + post + 0.01], startDir: [0, 0, 1],
    endOffset: [0.012, top - 0.006, -0.02], endDir: [0, 1, -0.6], radius: 0.003, material: m.black,
  });
}

const BUILDERS = {
  'a1-mini': (g) => buildA1Mini(g),
  a1: (g) => buildA1(g),
  p1p: (g) => buildBambuCube(g, CUBE_VARIANTS.p1p),
  p1s: (g) => buildBambuCube(g, CUBE_VARIANTS.p1s),
  p2s: (g) => buildBambuCube(g, CUBE_VARIANTS.p2s),
};

export function createPrinterModel(model) {
  const group = new THREE.Group();
  BUILDERS[model.style](group, model);
  updatePrinterTubes(group); // Schläuche in Ruheposition biegen
  group.userData.model = model;
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
