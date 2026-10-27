// 3D-Modelle der Bettschubser Bambu Lab A1 mini, A1 und A2L (Weiche und gemeinsame Teile in printer-model.js).
import * as THREE from 'three';
import {
  createMaterials, rbox, box, createStepper, createLinearRail, createBelt, createBuildPlate,
  createToolhead, createTouchscreen, createSpoolHolder, addFeet, createVents,
} from './printer-parts.js';
import { addLogo, addFlexTube, addChamberCamera } from './printer-model-helpers.js';

// Lüftungsschlitze an beiden Seiten eines Sockels (Mitte bei x, Seitenflächen bei x ± w/2)
function addSideVents(g, m, x, w, y, z, count, length) {
  for (const sx of [-1, 1]) {
    const vents = createVents(count, length, 0.004, 0.004, m);
    vents.rotation.y = sx * Math.PI / 2;
    vents.position.set(x + sx * (w / 2 + 0.0008), y, z);
    g.add(vents);
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

export function buildA1Mini(g) {
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
  g.userData.moving = [zAxis]; // fährt mit der Schichthöhe – nicht mit dem Gehäuse verschmelzen
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

export const A1_VARIANTS = {
  a1: { title: 'A1', plate: 0.256, baseW: 0.385, baseD: 0.39, frameH: 0.458 },
  a2l: { title: 'A2L', plate: 0.325, baseW: 0.455, baseD: 0.49, frameH: 0.53 },
};

export function buildA1(g, variant) {
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
  g.userData.moving = [zAxis]; // fährt mit der Schichthöhe – nicht mit dem Gehäuse verschmelzen
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
