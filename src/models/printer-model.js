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
  createLabel, createVents, createFanGrille, createDualToolhead,
} from './printer-parts.js';
import { createChangerToolhead, createLedStrip, createNozzleRack } from './nozzle-changer.js';

// Lüftungsschlitze an beiden Seiten eines Sockels (Mitte bei x, Seitenflächen bei x ± w/2)
function addSideVents(g, m, x, w, y, z, count, length) {
  for (const sx of [-1, 1]) {
    const vents = createVents(count, length, 0.004, 0.004, m);
    vents.rotation.y = sx * Math.PI / 2;
    vents.position.set(x + sx * (w / 2 + 0.0008), y, z);
    g.add(vents);
  }
}

// Schriftzug „Bambu Lab <Modell>“ an einer Vorderseite
function addLogo(parent, title, height, color, x, y, z) {
  const logo = createLabel(`Bambu Lab ${title}`, height, color);
  logo.position.set(x, y, z);
  parent.add(logo);
}

// Flexibler Schlauch/Kabel vom Gerät zum Druckkopf (Anfang in Modellkoordinaten)
function addFlexTube(g, options) {
  const tube = createFlexTube(options);
  g.add(tube);
  (g.userData.flexTubes ??= []).push(tube);
}

// Eingebaute Kamera: kleines Gehäuse mit Linse, das auf target zeigt (Modellkoordinaten).
// userData.camMount sagt der Drucker-Cam, von wo sie filmt: knapp vor der Linse, damit das Gehäuse nicht im Bild ist.
function addChamberCamera(g, m, position, target) {
  const cam = new THREE.Group();
  cam.add(rbox(0.022, 0.016, 0.014, 0.004, m.black));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 20), m.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(-0.003, 0, 0.0075);
  cam.add(lens);
  cam.add(box(0.002, 0.002, 0.001, m.statusGreen, 0.007, 0.004, 0.0072)); // Aufnahme-LED
  cam.position.set(...position);
  cam.lookAt(...target); // Linse (+z) zeigt aufs Bett – das Modell steht beim Bauen noch im Ursprung
  cam.updateMatrixWorld(true);
  g.add(cam);
  const lensPos = cam.localToWorld(new THREE.Vector3(-0.003, 0, 0.012));
  g.userData.camMount = { position: lensPos, target: new THREE.Vector3(...target) };
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

// Bettschubser (A1-Serie): Kopf fährt X, Bett fährt Y (vor/zurück), Portal fährt Z (hoch).
// Gesteuert wird die Düsenspitze (head.userData.tip), nicht die Kopfmitte – so trifft sie die Bahn genau.
function bedSlingerPose({ zAxis, bedAxis, head, headX, plateX, plateZ, nozzleGap }) {
  const tip = head.userData.tip.position;
  return ({ mode, x, z, layerY, partHeight }) => {
    if (mode === 'printing') {
      zAxis.position.y = layerY - nozzleGap + 0.0002; // Düse sitzt 0,2 mm über der aktuellen Schicht
      head.position.x = plateX + x - tip.x;
      bedAxis.position.z = head.position.z + tip.z - plateZ - z; // Bett fährt so, dass der Bahnpunkt unter der Düse liegt
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
  addLogo(g, 'A1 mini', 0.008, '#4a4e55', baseX - baseW / 2 + 0.05, FOOT + baseH * 0.75, baseD / 2 + 0.0012);
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
  const head = createToolhead(m, 'a1', { title: 'A1 mini' });
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
    pose: bedSlingerPose({ zAxis, bedAxis, head, headX, plateX: baseX, plateZ: bedZ, nozzleGap }),
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
  addLogo(zAxis, 'A1 mini', 0.0045, '#ffffff', armLeft + 0.045, headY + 0.006, beamZ + beamD / 2 + 0.0016);
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
  // Kamera vorne an der Säule, Blick schräg runter aufs Bett
  addChamberCamera(g, m, [colX - 0.01, colH - 0.1, colZ + colD / 2 + 0.008], [baseX, plateTop + 0.03, bedZ]);

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

// ---------- Bambu Lab A1 / A2L: Portal aus zwei Säulen und Querstrebe ----------
// A2L: wie der A1, nur größer – Sockel, Druckbett und Portal wachsen mit dem Bauraum mit

const A1_VARIANTS = {
  a1: { title: 'A1', plate: 0.256, baseW: 0.385, baseD: 0.39, frameH: 0.458 },
  a2l: { title: 'A2L', plate: 0.325, baseW: 0.455, baseD: 0.49, frameH: 0.53 },
};

function buildA1(g, variant) {
  const { title, plate: plateSize, baseW, baseD, frameH } = variant;
  const m = createMaterials();
  const FOOT = 0.008;
  const baseH = 0.065;
  const baseTop = FOOT + baseH;

  addFeet(g, baseW, baseD, FOOT, m);
  g.add(rbox(baseW, baseH, baseD, 0.016, m.shell, 0, FOOT + baseH / 2, 0));
  g.add(box(baseW * 0.6, 0.007, 0.002, m.shellDark, -0.03, FOOT + baseH * 0.45, baseD / 2 + 0.001));
  addLogo(g, title, 0.009, '#4a4e55', -baseW / 2 + 0.06, FOOT + baseH * 0.75, baseD / 2 + 0.0012);
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
  bedAxis.add(box(plateSize * 0.7, 0.004, plateSize * 0.7, m.shellDark, 0, carriageTop, bedZ));
  const plate = createBuildPlate(plateSize, m);
  plate.position.set(0, carriageTop + 0.002, bedZ);
  bedAxis.add(plate);
  const plateTop = carriageTop + 0.002 + plate.userData.topY;

  // Druckkopf
  const head = createToolhead(m, 'a1', { title });
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
    pose: bedSlingerPose({ zAxis, bedAxis, head, headX, plateX: 0, plateZ: bedZ, nozzleGap }),
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
  addLogo(g, title, 0.0075, '#ffffff', 0, frameH - 0.015, beamZ + upD / 2 + 0.0024);

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
  const screen = createTouchscreen(0.075, 0.05, title, m);
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
  // Kamera vorne an der rechten Säule, Blick schräg runter aufs Bett
  addChamberCamera(g, m, [upX, frameH - 0.12, beamZ + upD / 2 + 0.008], [0, plateTop + 0.03, bedZ]);

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

// Spültrichter mit Rutsche und Mülleimer hinter dem Drucker (Drucker mit einer Düse und AMS).
// spot: Spülstelle (x, z), tipY: Höhe der Düsenspitze, backZ: Außenseite der Rückwand,
// wall: Dicke der Rückwand (0 = offenes Gerüst ohne Rückwand, dann braucht es keine Öffnung).
// Gibt { spot, tipY, funnelDepth, chuteDir, chuteStart, chuteEnd, bin } zurück; bin ist die Gruppe des Eimers mit
// userData { w, d, h } – dort bleiben die Spülreste liegen (siehe world/purge.js).
function addPurgeChute(g, { spot, tipY, backZ, wall, frame }) {
  const bin = new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.6 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xb4b9c1, roughness: 0.4, metalness: 0.3 }); // heller Rand
  // Spülfeld: großer offener Trichter knapp unter der Düse mit hellem Rand, damit man ihn hinten im Drucker sieht.
  // Der Boden fällt nach hinten zur Rutsche ab.
  const funnelTop = tipY - 0.004;
  const funnel = new THREE.Group();
  const fw = 0.06;  // Breite (x)
  const fd = 0.045; // Tiefe (z)
  const fh = 0.016;
  for (const [sx, sz, w, d] of [[0, -1, fw, 0.003], [0, 1, fw, 0.003], [-1, 0, 0.003, fd], [1, 0, 0.003, fd]]) {
    funnel.add(box(w, fh, d, rim, sx * (fw / 2 - 0.0015), 0, sz * (fd / 2 - 0.0015)));
  }
  const floor = box(fw - 0.006, 0.002, fd - 0.008, frame, 0, -fh / 2 + 0.005, 0);
  floor.rotation.x = -0.2; // hinten tiefer
  funnel.add(floor);
  funnel.position.set(spot.x, funnelTop - fh / 2, spot.z);
  g.add(funnel);

  // Mülleimer hängt hinten außen an der Rückwand, knapp unter dem Ende der schrägen Rutsche
  const binW = 0.075;
  const binD = 0.065;
  const binH = 0.055;
  const binZ = backZ - binD / 2 - 0.004;
  const binTop = funnelTop - fh - (spot.z - binZ) * 0.8 - 0.01;
  const binGroup = new THREE.Group();
  binGroup.add(box(binW * 0.6, 0.012, 0.012, frame, 0, binH + 0.004, binD / 2 + 0.004)); // Haken an der Rückwand
  binGroup.add(box(binW, 0.003, binD, bin, 0, 0.0015, 0)); // Boden
  for (const sx of [-1, 1]) binGroup.add(box(0.003, binH, binD, bin, sx * (binW / 2 - 0.0015), binH / 2, 0));
  for (const sz of [-1, 1]) binGroup.add(box(binW, binH, 0.003, bin, 0, binH / 2, sz * (binD / 2 - 0.0015)));
  binGroup.position.set(spot.x, binTop - binH, binZ);
  binGroup.userData = { w: binW, d: binD, h: binH };
  g.add(binGroup);

  // Rutsche vom hinteren Ende des Trichters schräg nach hinten unten durch die Rückwand in den Eimer,
  // mit Seitenwänden, damit nichts herunterfällt
  const from = new THREE.Vector3(spot.x, funnelTop - fh, spot.z - fd / 2 + 0.006);
  const to = new THREE.Vector3(spot.x, binTop + 0.006, binZ);
  const length = from.distanceTo(to);
  const chute = new THREE.Group();
  chute.add(box(0.03, 0.003, length, frame, 0, 0, 0));
  for (const sx of [-1, 1]) chute.add(box(0.002, 0.01, length, rim, sx * 0.015, 0.005, 0));
  chute.position.copy(from).add(to).multiplyScalar(0.5);
  chute.lookAt(to);
  g.add(chute);

  // Öffnung in der Rückwand, durch die die Rutsche nach draußen führt: ein dunkler Durchlass durch die ganze
  // Wanddicke (von innen und außen als Loch zu sehen) mit hellem Rahmen auf beiden Seiten
  if (wall) {
    const midZ = backZ + wall / 2;
    const at = from.clone().lerp(to, (midZ - from.z) / (to.z - from.z)); // wo die Rutsche die Wand kreuzt
    const holeW = 0.042;
    const holeH = 0.034;
    const dark = new THREE.MeshBasicMaterial({ color: 0x050506 });
    g.add(box(holeW, holeH, wall + 0.003, dark, at.x, at.y, midZ));
    const ring = 0.004;
    for (const z of [backZ - 0.001, backZ + wall + 0.001]) {
      for (const sy of [-1, 1]) g.add(box(holeW + ring * 2, ring, 0.003, rim, at.x, at.y + sy * (holeH / 2 + ring / 2), z));
      for (const sx of [-1, 1]) g.add(box(ring, holeH, 0.003, rim, at.x + sx * (holeW / 2 + ring / 2), at.y, z));
    }
  }
  // chuteDir: Richtung der Rutsche, damit der Spülstrang ihr folgt; funnelDepth: so tief fällt er erst senkrecht
  return {
    spot, tipY, funnelDepth: tipY - (funnelTop - fh), chuteDir: to.clone().sub(from).normalize(),
    chuteStart: from, chuteEnd: to, bin: binGroup,
  };
}

// ---------- Bambu Lab P1P / P1S / P2S: CoreXY-Würfel mit AMS auf dem Dach ----------
// Kopf fährt X und Y (vor/zurück) unter der Decke, das Bett fährt nach unten (Z).
// P1P: offenes Gerüst ohne Wände und Tür. P1S/P2S: geschlossenes Gehäuse, Glastür vorne, Glasdeckel oben.

// Gehäuse wie bei den echten Geräten: ein abgerundeter, geschlossener Würfel. Seitenwände laufen vom Boden
// bis oben durch, vorne eine große Glastür mit schwarzem Siebdruckrand, darüber die Frontleiste mit Display,
// oben ein Glasdeckel im Rahmen. Der P1P ist das offene Gerüst: Sockel, vier runde Eckstreben, oberer Rahmen.
const CUBE_VARIANTS = {
  p1p: { title: 'P1P', w: 0.386, d: 0.389, h: 0.458, enclosed: false, screen: [0.06, 0.036], buttons: true, fascia: 0.03, color: 0x232427, railDrop: 0.015 },
  p1s: { title: 'P1S', w: 0.389, d: 0.389, h: 0.458, enclosed: true, screen: [0.06, 0.036], buttons: true, fascia: 0.03, color: 0x2a2b2f, railDrop: 0.015 },
  p2s: { title: 'P2S', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.105, 0.064], buttons: false, fascia: 0.05, color: 0x34363b, darkAms: true,
    bigFan: true, railDrop: 0.04 }, // großer Lüfter vorne wie beim X2D
  // X2D: wie der P1S aufgebaut, dazu Seitenfenster rechts, großes Display, Kamera und Dual-Nozzle-Kopf
  x2d: {
    title: 'X2D', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.13, 0.078], buttons: false, fascia: 0.07,
    color: 0x2a2b2f, darkAms: true, sideWindow: true, dualHead: true,
    railDrop: 0.06, // Mechanik tiefer, damit Lüfter und Logo am Kopf unter der hohen Frontleiste sichtbar sind
  },
  // H2D: deutlich größer, Seitenfenster so groß wie die Tür, Glasdach mit Rahmen (AMS nach hinten gerückt,
  // damit man von oben hineinsieht), sehr großes Touch-Display und Dual-Nozzle-Kopf
  h2d: {
    title: 'H2D', w: 0.492, d: 0.514, h: 0.585, enclosed: true, screen: [0.17, 0.096], buttons: false, fascia: 0.11,
    color: 0x2a2b2f, darkAms: true, sideWindow: 'large', topWindow: true, dualHead: true,
    plate: 0.325, railDrop: 0.135,
  },
  // X1E: Gehäuse wie der X2D (Seitenfenster, großes Display, Dual-Nozzle-Kopf), etwas dunkler
  x1e: {
    title: 'X1E', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.13, 0.078], buttons: false, fascia: 0.07,
    color: 0x1d1e21, darkAms: true, sideWindow: true, dualHead: true, railDrop: 0.06,
  },
  // H2D Pro: genau wie der H2D, nur mit eigenem Schriftzug
  'h2d-pro': {
    title: 'H2D Pro', w: 0.492, d: 0.514, h: 0.585, enclosed: true, screen: [0.17, 0.096], buttons: false, fascia: 0.11,
    color: 0x2a2b2f, darkAms: true, sideWindow: 'large', topWindow: true, dualHead: true,
    plate: 0.325, railDrop: 0.135,
  },
  // H2S: Gehäuse wie der H2D, etwas hellgrau, mit Einzeldüsen-Kopf und großem Bauteillüfter vorne
  h2s: {
    title: 'H2S', w: 0.492, d: 0.514, h: 0.585, enclosed: true, screen: [0.17, 0.096], buttons: false, fascia: 0.11,
    color: 0x3b3e44, darkAms: true, sideWindow: 'large', topWindow: true, bigFan: true,
    plate: 0.325, railDrop: 0.135,
  },
  // H2C: Gehäuse wie der H2D, dazu Düsenwechsler rechts im Bauraum (8 Düsen), zwei AMS übereinander
  // und eine LED-Leiste unten am Sockel
  h2c: {
    title: 'H2C', w: 0.492, d: 0.514, h: 0.585, enclosed: true, screen: [0.17, 0.096], buttons: false, fascia: 0.11,
    color: 0x2a2b2f, darkAms: true, sideWindow: 'large', topWindow: true, nozzleChanger: true, amsCount: 2,
    ledStrip: true, plate: 0.325, railDrop: 0.135,
  },
};

function buildBambuCube(g, variant) {
  const { title, w, d, h, enclosed } = variant;
  const m = createMaterials();
  // Gehäuse: dunkler Kunststoff mit leichtem Glanz; Rahmenteile innen etwas dunkler
  const body = new THREE.MeshPhysicalMaterial({ color: variant.color, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.55, metalness: 0.2 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.7 }); // Innenwände
  const frit = new THREE.MeshBasicMaterial({ color: 0x050505 });                   // schwarzer Siebdruck am Glas
  const glass = m.glass;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.3 });
  const FOOT = 0.008;
  const baseH = 0.055;
  const baseTop = FOOT + baseH;
  const post = 0.03;   // Wandstärke bzw. Breite der Eckstreben – innen beginnt der Bauraum
  const topH = 0.026;  // oberer Rahmen
  const R = 0.016;     // Eckenradius des Gehäuses
  const fasciaH = variant.fascia; // Frontleiste unter dem Rahmen (Platz fürs Display)
  const bandH = fasciaH + topH;

  addFeet(g, w - 0.02, d - 0.02, FOOT, m);
  // Sockel mit abgerundeten Kanten und einer Schattenfuge zum Bauraum
  g.add(rbox(w, baseH, d, R, body, 0, FOOT + baseH / 2, 0));
  g.add(box(w - 0.01, 0.003, 0.002, frame, 0, baseTop - 0.004, d / 2 + 0.0005));

  if (enclosed) {
    // Seitenwände durchgehend vom Sockel bis oben, Rückwand dazwischen
    const sideH = h - FOOT;
    const wallH = h - baseTop;
    for (const sx of [-1, 1]) {
      const wx = sx * (w / 2 - 0.011);
      if (variant.sideWindow && sx === 1) {
        // Rechte Wand mit Fenster: Rahmen aus vier Teilen um eine Glasscheibe ('large': fast so groß wie die Tür)
        const large = variant.sideWindow === 'large';
        const winH = large ? h - baseTop - bandH - 0.04 : 0.17;
        const winD = large ? d - 0.08 : 0.22;
        const winY = baseTop + (h - baseTop - bandH) / 2;
        const bottom = winY - winH / 2 - FOOT;
        const top = h - (winY + winH / 2);
        g.add(rbox(0.022, bottom, d, R, body, wx, FOOT + bottom / 2, 0));
        g.add(rbox(0.022, top, d, R, body, wx, h - top / 2, 0));
        const stripD = (d - winD) / 2;
        for (const sz of [-1, 1]) g.add(rbox(0.022, winH + 0.01, stripD, 0.006, body, wx, winY, sz * (winD / 2 + stripD / 2)));
        const pane = box(0.004, winH, winD, glass, wx, winY, 0);
        pane.userData.noShadow = true;
        g.add(pane);
        // Schwarzer Siebdruckrand außen am Fenster
        for (const [bh, bd, by, bz] of [
          [0.008, winD, winY + winH / 2 - 0.004, 0], [0.008, winD, winY - winH / 2 + 0.004, 0],
          [winH, 0.008, winY, winD / 2 - 0.004], [winH, 0.008, winY, -winD / 2 + 0.004],
        ]) {
          const strip = box(0.0005, bh, bd, frit, wx + 0.0025, by, bz);
          strip.userData.noShadow = true;
          g.add(strip);
        }
      } else {
        g.add(rbox(0.022, sideH, d, R, body, wx, FOOT + sideH / 2, 0));
        // Innen dunkle Verkleidung
        g.add(box(0.002, wallH - topH, d - 0.04, panel, sx * (w / 2 - 0.0225), baseTop + (wallH - topH) / 2, 0));
      }
    }
    g.add(rbox(w - 0.03, wallH, 0.016, 0.006, body, 0, baseTop + wallH / 2, -d / 2 + 0.008));
    g.add(box(w - 0.046, wallH - topH, 0.002, panel, 0, baseTop + (wallH - topH) / 2, -d / 2 + 0.017));
    const fan = createFanGrille(0.075, m);
    fan.position.set(w / 4, baseTop + (wallH - topH) * 0.55, -d / 2 + 0.024);
    g.add(fan);

    // Oberer Rahmen mit Glasdeckel
    g.add(rbox(w - 0.03, topH, 0.03, 0.006, body, 0, h - topH / 2, -d / 2 + 0.015));
    const lid = box(w - 0.05, 0.004, d - 0.05 - 0.024, glass, 0, h - 0.004, -0.012 + 0.012);
    lid.userData.noShadow = true;
    g.add(lid);
    const lidFrit = box(w - 0.05, 0.001, 0.012, frit, 0, h - 0.0015, -d / 2 + 0.031);
    g.add(lidFrit);
    if (variant.topWindow) {
      // Großes Dachfenster: Rahmen ringsum und schwarzer Siebdruckrand, damit man es als Fenster erkennt
      const lidD = d - 0.074;
      for (const sx of [-1, 1]) g.add(rbox(0.016, 0.006, lidD, 0.003, body, sx * (w / 2 - 0.03), h - 0.003, 0));
      g.add(rbox(w - 0.044, 0.006, 0.014, 0.003, body, 0, h - 0.003, d / 2 - 0.044));
      for (const [fw, fd, fx, fz] of [
        [w - 0.08, 0.01, 0, d / 2 - 0.056], [0.01, lidD - 0.03, -(w / 2 - 0.043), 0], [0.01, lidD - 0.03, w / 2 - 0.043, 0],
      ]) {
        const strip = box(fw, 0.001, fd, frit, fx, h - 0.0015, fz);
        strip.userData.noShadow = true;
        g.add(strip);
      }
    }

    // Glastür: fast die ganze Front, schwarzer Rand innen, Griffmulde rechts, kleine Scharniere links
    const doorW = w - 0.026;
    const doorH = h - baseTop - bandH - 0.002;
    const doorY = baseTop + doorH / 2 + 0.001;
    const door = rbox(doorW, doorH, 0.004, 0.006, glass, 0, doorY, d / 2 - 0.002);
    door.userData.noShadow = true;
    g.add(door);
    const fw = 0.014; // Breite des Siebdruckrands
    for (const [bw, bh, bx, by] of [
      [doorW, fw, 0, doorY + doorH / 2 - fw / 2], [doorW, fw, 0, doorY - doorH / 2 + fw / 2],
      [fw, doorH, -doorW / 2 + fw / 2, doorY], [fw, doorH, doorW / 2 - fw / 2, doorY],
    ]) {
      const strip = box(bw, bh, 0.0005, frit, bx, by, d / 2 - 0.0045);
      strip.userData.noShadow = true;
      g.add(strip);
    }
    g.add(rbox(0.01, 0.12, 0.012, 0.004, frame, doorW / 2 - 0.018, doorY, d / 2 + 0.006)); // Griff
    for (const fy of [-0.42, 0.42]) g.add(rbox(0.008, 0.024, 0.008, 0.002, frame, -doorW / 2 + 0.006, doorY + doorH * fy, d / 2 + 0.002));
  } else {
    // P1P: vier abgerundete Eckstreben und ein umlaufender oberer Rahmen
    const postH = h - baseTop - topH;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(rbox(post, postH + 0.01, post, 0.01, body, sx * (w / 2 - post / 2), baseTop + postH / 2, sz * (d / 2 - post / 2)));
      }
      g.add(rbox(post, topH, d, 0.008, body, sx * (w / 2 - post / 2), h - topH / 2, 0));
    }
    g.add(rbox(w, topH, post, 0.008, body, 0, h - topH / 2, -d / 2 + post / 2));
  }

  // Frontleiste mit Display, Tasten und Schriftzug
  g.add(rbox(w - (enclosed ? 0.02 : 0), bandH, 0.024, 0.008, body, 0, h - bandH / 2, d / 2 - 0.012));
  addLogo(g, title, 0.011, '#d6d8dc', w / 2 - 0.085, h - bandH / 2, d / 2 + 0.0006);
  const [sw, sh] = variant.screen;
  const screenX = -w / 2 + 0.035 + sw / 2;
  const screenY = h - bandH / 2;
  const screen = createTouchscreen(sw, sh, title, m);
  screen.position.set(screenX, screenY, d / 2 + 0.002);
  g.add(screen);
  if (variant.buttons) {
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12), m.shellMid);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(screenX + sw / 2 + 0.014 + (i % 2) * 0.012, screenY + (i < 2 ? 0.007 : -0.007), d / 2 + 0.002);
      g.add(btn);
    }
  }
  // Innenbeleuchtung unter der Frontleiste
  const light = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.008), m.ledStrip);
  light.rotation.x = Math.PI / 2;
  light.position.set(0, h - bandH - 0.001, d / 2 - 0.03);
  g.add(light);

  // Bauraum: dunkle Bodenplatte, Abfallschacht hinten links, Lüftungsschlitze hinten am Sockel
  g.add(box(w - post * 2, 0.004, d - post * 2, panel, 0, baseTop + 0.002, 0));
  const chute = rbox(0.045, 0.06, 0.05, 0.004, m.black, -w / 2 + post + 0.03, baseTop + 0.03, -d / 2 + post + 0.03);
  chute.rotation.x = -0.25;
  g.add(chute);
  const rearVents = createVents(3, 0.16, 0.005, 0.005, m);
  rearVents.rotation.y = Math.PI;
  rearVents.position.set(0.06, FOOT + baseH / 2, -d / 2 - 0.0008);
  g.add(rearVents);

  // CoreXY-Mechanik unter der Decke: Y-Führungen links/rechts, X-Brücke mit Kopf fährt vor/zurück
  const railY = h - topH - 0.018 - (variant.railDrop ?? 0);
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

  let head;
  if (variant.nozzleChanger) head = createChangerToolhead(m, title);
  else if (variant.dualHead) head = createDualToolhead(m, title);
  else head = createToolhead(m, 'p1', { bigFan: !!variant.bigFan, title });
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

  // Druckbett auf Z-Träger, fährt nach unten; drei Gewindespindeln (zwei vorne an den Seiten, eine hinten mittig)
  const nozzleY = headY - head.userData.nozzleBelowCenter;
  const nozzleGap = 0.12;
  const plateTop = nozzleY - nozzleGap;
  const bedAxis = new THREE.Group();
  const plateSize = variant.plate ?? 0.256;
  const plate = createBuildPlate(plateSize, m);
  plate.position.set(0, plateTop - plate.userData.topY, 0);
  bedAxis.add(plate);
  const bedX = plateSize / 2 + 0.002; // Seitenträger und Spindeln an den Plattenkanten
  const backZ = -plateSize / 2 - 0.042;
  bedAxis.add(box(plateSize + 0.034, 0.012, 0.05, frame, 0, plateTop - plate.userData.topY - 0.008, backZ + 0.01)); // Träger hinten
  for (const sx of [-1, 1]) bedAxis.add(box(0.03, 0.012, plateSize + 0.044, frame, sx * bedX, plateTop - plate.userData.topY - 0.008, -0.02));
  g.add(bedAxis);
  // Drucker mit einer Düse und AMS (P1P, P1S, P2S, H2S) spülen beim Farbwechsel die alte Farbe aus: hinten links
  // hinter dem Bett sitzt ein Trichter auf Düsenhöhe, eine Rutsche führt durch die Rückwand in einen kleinen
  // Mülleimer hinter dem Drucker. purge.spot: wo die Düse zum Spülen steht (relativ zur Plattenmitte wie die
  // Druckbahn), tipY: Höhe der Düsenspitze. Die Bewegung dazu steckt in world/purge.js.
  if (!variant.dualHead && !variant.nozzleChanger) {
    g.userData.purge = addPurgeChute(g, {
      spot: { x: -plateSize / 2 + 0.045, z: -plateSize / 2 - 0.03 }, tipY: nozzleY, backZ: -d / 2, wall: enclosed ? 0.018 : 0, frame,
    });
  }

  // Vorne laufen die Spindeln durch die Seitenträger, hinten durch den Träger hinten. Unten sitzen sie in einem
  // Lagerflansch auf dem Sockel (der Motor steckt im Sockel), oben in einem Lagerblock, den ein Halter mit der
  // nächsten Wand verbindet – vorne mit der Seitenwand, hinten mit der Rückwand. Der Halter bleibt unter den
  // Gleitschuhen der X-Brücke, damit die beim Fahren darüber hinweggleiten.
  const frontZ = plateSize / 2 - 0.012;
  const screwTop = railY - 0.03;
  const blockY = screwTop - 0.006;
  const innerX = w / 2 - post;
  const innerBackZ = -d / 2 + post;
  for (const [x, z] of [[-bedX, frontZ], [bedX, frontZ], [0, backZ]]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, screwTop - baseTop, 10), m.steel);
    screw.position.set(x, baseTop + (screwTop - baseTop) / 2, z);
    g.add(screw);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.007, 16), frame);
    flange.position.set(x, baseTop + 0.0035, z);
    g.add(flange);
    g.add(rbox(0.022, 0.012, 0.022, 0.003, frame, x, blockY, z)); // Lagerblock oben
    if (x) {
      const len = innerX - Math.abs(x);
      g.add(box(len + 0.004, 0.008, 0.014, frame, Math.sign(x) * (Math.abs(x) + len / 2), blockY, z));
    } else {
      const len = z - innerBackZ;
      g.add(box(0.014, 0.008, len + 0.004, frame, 0, blockY, innerBackZ + len / 2));
    }
  }
  const lowestPlate = baseTop + 0.012;

  g.userData.printRig = {
    partParent: bedAxis, // gedruckte Teile liegen auf dem Bett und fahren mit
    head,
    plateCenter: new THREE.Vector3(0, plateTop, 0),
    pose: ({ mode, x, z, layerY, partHeight }) => {
      if (mode === 'printing') {
        bedAxis.position.y = nozzleGap - layerY - 0.0002; // Bett hebt die aktuelle Schicht an die Düse
        head.position.x = x - head.userData.tip.position.x; // Düsenspitze, nicht Kopfmitte, auf den Bahnpunkt
        gantry.position.z = z - head.userData.tip.position.z;
      } else {
        // Fertig: Bett so weit absenken, dass das Teil frei unter der Düse steht
        const down = mode === 'done' ? nozzleGap - partHeight - 0.03 : 0;
        bedAxis.position.y = Math.max(Math.min(0, down), lowestPlate - plateTop);
        head.position.x = 0;
        gantry.position.z = 0;
      }
    },
  };

  // Kamera innen vorne links in der Ecke, knapp unter den Y-Führungen, halb hinter dem Türrand versteckt
  addChamberCamera(g, m, [-w / 2 + 0.036, railY - 0.035, d / 2 - 0.026], [0, plateTop + 0.075, 0]); // etwas über der Platte: beim Drucken hebt sich das Bett bis an die Düse

  // Düsenwechsler (H2C): Halter an der rechten Innenwand, eine Düse pro AMS-Fach. Die Düsenspitzen hängen auf
  // Druckhöhe, so weit rechts, dass der Kopf zum Wechseln gerade noch hinkommt. toolRack.slots: Wechselplätze
  // relativ zur Plattenmitte (wie die Druckbahn), dort fährt die Düsenspitze zum Ablegen und Aufnehmen hin.
  if (variant.nozzleChanger) {
    const innerWall = w / 2 - 0.022;
    const rackX = innerWall - 0.036;
    const rack = createNozzleRack(m, 8, 0.034, innerWall - rackX - 0.003);
    rack.position.set(rackX, nozzleY, -0.02);
    g.add(rack);
    g.userData.toolRack = {
      rack,
      slots: rack.userData.slotZ.map((z) => ({ x: rackX, z: z - 0.02 })),
    };
  }

  // LED-Leiste unten am Sockel (H2C), Farbe kommt aus dem Druckermenü
  if (variant.ledStrip) {
    const strip = createLedStrip(w, d, FOOT + 0.007);
    g.add(strip);
    g.userData.setLedColor = strip.userData.setColor;
  }

  // AMS auf dem Dach (beim H2C zwei übereinander), Schlauch hinten heraus und von oben zum Kopf, Kabelkette innen
  const top = head.userData.topAboveCenter;
  g.userData.spoolSlots = [];
  let amsY = h;
  for (let i = 0; i < (variant.amsCount ?? 1); i++) {
    const ams = createAMS(m, { dark: !!variant.darkAms });
    // Mit Dachfenster sitzt das AMS hinten, damit vorne der Blick durchs Glas frei bleibt
    ams.position.set(0, amsY, variant.topWindow ? -d / 2 + 0.165 : -0.01);
    g.add(ams);
    amsY = new THREE.Box3().setFromObject(ams).max.y; // das nächste AMS steht obendrauf
    g.userData.spoolSlots.push(...ams.userData.slots.map((p) => ({ position: p.clone().add(ams.position), axis: 'x' })));
    const outlet = ams.userData.outlet.clone().add(ams.position);
    addFlexTube(g, {
      start: outlet.toArray(), startDir: [0, -0.4, -1],
      endOffset: [0, top, -0.004], endDir: [0, 1, 0], radius: 0.0022, material: m.ptfe,
    });
  }
  addFlexTube(g, {
    start: [0, railY + 0.01, -d / 2 + post + 0.01], startDir: [0, 0, 1],
    endOffset: [0.012, top - 0.006, -0.02], endDir: [0, 1, -0.6], radius: 0.003, material: m.black,
  });
}

const BUILDERS = {
  'a1-mini': (g) => buildA1Mini(g),
  a1: (g) => buildA1(g, A1_VARIANTS.a1),
  a2l: (g) => buildA1(g, A1_VARIANTS.a2l),
  p1p: (g) => buildBambuCube(g, CUBE_VARIANTS.p1p),
  p1s: (g) => buildBambuCube(g, CUBE_VARIANTS.p1s),
  p2s: (g) => buildBambuCube(g, CUBE_VARIANTS.p2s),
  x2d: (g) => buildBambuCube(g, CUBE_VARIANTS.x2d),
  x1e: (g) => buildBambuCube(g, CUBE_VARIANTS.x1e),
  h2d: (g) => buildBambuCube(g, CUBE_VARIANTS.h2d),
  h2s: (g) => buildBambuCube(g, CUBE_VARIANTS.h2s),
  'h2d-pro': (g) => buildBambuCube(g, CUBE_VARIANTS['h2d-pro']),
  h2c: (g) => buildBambuCube(g, CUBE_VARIANTS.h2c),
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
    // Lichtschein u. Ä. (userData.noBounds) zählt nicht mit
    const printer = createPrinterModel(model);
    printer.updateMatrixWorld(true);
    const box = new THREE.Box3();
    printer.traverse((o) => {
      if (o.isMesh && !o.userData.noBounds) box.expandByObject(o, false);
    });
    sizeCache.set(model.id, box.getSize(new THREE.Vector3()));
  }
  return sizeCache.get(model.id);
}
