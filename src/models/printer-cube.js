// 3D-Modelle der CoreXY-Würfeldrucker (P1P bis H2C) samt Spülrutsche (Weiche und gemeinsame Teile in printer-model.js).
import * as THREE from 'three';
import {
  createMaterials, rbox, box, createStepper, createBelt, createBuildPlate, createToolhead, createTouchscreen,
  addFeet, createAMS, createVents, createFanGrille, createDualToolhead,
} from './printer-parts.js';
import { createChangerToolhead, createLedStrip, createNozzleRack } from './nozzle-changer.js';
import { addLogo, addFlexTube, addChamberCamera } from './printer-model-helpers.js';

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
export const CUBE_VARIANTS = {
  p1p: { title: 'P1P', w: 0.386, d: 0.389, h: 0.458, enclosed: false, screen: [0.06, 0.036], buttons: true, fascia: 0.03, color: 0x232427, darkAms: true, railDrop: 0.015 },
  p1s: { title: 'P1S', w: 0.389, d: 0.389, h: 0.458, enclosed: true, screen: [0.06, 0.036], buttons: true, fascia: 0.03, color: 0x2a2b2f, darkAms: true, railDrop: 0.015 },
  p2s: { title: 'P2S', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.105, 0.064], buttons: false, fascia: 0.05, color: 0x34363b, darkAms: true,
    bigFan: true, railDrop: 0.04 }, // großer Lüfter vorne wie beim X2D
  // X2D: wie der P1S aufgebaut, dazu Seitenfenster rechts, großes Display, Kamera und Dual-Nozzle-Kopf
  x2d: {
    title: 'X2D', w: 0.392, d: 0.406, h: 0.505, enclosed: true, screen: [0.13, 0.078], buttons: false, fascia: 0.07,
    color: 0x2a2b2f, darkAms: true, sideWindow: true, dualHead: true,
    railDrop: 0.06, // Mechanik tiefer, damit Lüfter und Logo am Kopf unter der hohen Frontleiste sichtbar sind
  },
  // X1 Carbon: Gehäuse wie der P1S ohne Seitenfenster, aber mit 5-Zoll-Touchscreen statt Tasten
  x1c: {
    title: 'X1 Carbon', w: 0.389, d: 0.389, h: 0.457, enclosed: true, screen: [0.11, 0.066], buttons: false, fascia: 0.05,
    color: 0x26272b, darkAms: true, railDrop: 0.03,
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

export function buildBambuCube(g, variant) {
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
  g.userData.moving = [gantry]; // fährt vor und zurück – nicht mit dem Gehäuse verschmelzen

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
  // Drucker mit einer Düse und AMS (P1P, P1S, P2S, X1 Carbon, H2S) spülen beim Farbwechsel die alte Farbe aus: hinten links
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
