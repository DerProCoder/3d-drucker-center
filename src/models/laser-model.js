// Bambu Lab R1: Laser für Holzplatten. Flaches, helles Gehäuse mit orange getöntem Sichtfenster im Deckel (schützt
// die Augen vor dem Laserlicht), darin ein Wabenbett für die Platte, ein Portal mit dem Laserkopf und hinten ein
// Abluftrohr. Ursprung unten mittig, Vorderseite +z – wie die Druckermodelle.
// userData.printRig: wie bei den Druckern (head, plateCenter, partParent, pose({ mode, x, z })), x/z relativ zur
// Bettmitte in Metern. userData.laser: { beam, glow, sheetTop } – den Strahl schaltet world/laser.js.
import * as THREE from 'three';
import { addFeet, box, createLabel, createTouchscreen, rbox } from './printer-parts.js';

const W = 0.56;        // Breite
const D = 0.46;        // Tiefe
const H = 0.21;        // Höhe bis zum Deckel
const FOOT = 0.008;
const WALL = 0.016;
const BED = { x: 0.34, z: 0.24 }; // Wabenbett, etwas größer als eine Holzplatte (300 × 200 mm)
const BED_TOP = 0.052;
const HEAD_Y = 0.14;   // Höhe der Laserlinse über dem Boden des Geräts

// Wabenmuster des Betts
let honeycombTexture = null;
function getHoneycombTexture() {
  if (honeycombTexture) return honeycombTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b4f55';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#8d939a';
  ctx.lineWidth = 2;
  const r = 9;
  for (let row = -1; row < 18; row++) {
    for (let col = -1; col < 18; col++) {
      const cx = col * r * 1.75 + (row % 2) * r * 0.875;
      const cy = row * r * 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  honeycombTexture = new THREE.CanvasTexture(canvas);
  honeycombTexture.colorSpace = THREE.SRGBColorSpace;
  honeycombTexture.wrapS = honeycombTexture.wrapT = THREE.RepeatWrapping;
  honeycombTexture.repeat.set(2, 1.4);
  return honeycombTexture;
}

export function buildLaserR1(g, m) {
  const body = new THREE.MeshPhysicalMaterial({ color: 0xe8e9eb, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.5 });
  // Laserschutzglas: orange getönt, durchsichtig
  const laserGlass = new THREE.MeshPhysicalMaterial({
    color: 0xff7a10, transparent: true, opacity: 0.38, roughness: 0.05, clearcoat: 1, depthWrite: false,
  });

  addFeet(g, W - 0.02, D - 0.02, FOOT, m);
  // Boden und vier Wände
  g.add(rbox(W, 0.03, D, 0.012, body, 0, FOOT + 0.015, 0));
  g.add(box(W - WALL * 2, 0.002, D - WALL * 2, trim, 0, FOOT + 0.031, 0)); // dunkler Innenboden
  const wallH = H - FOOT;
  g.add(rbox(W, wallH, WALL, 0.006, body, 0, FOOT + wallH / 2, -D / 2 + WALL / 2));
  for (const sx of [-1, 1]) g.add(rbox(WALL, wallH, D, 0.006, body, sx * (W / 2 - WALL / 2), FOOT + wallH / 2, 0));
  // Vorne niedriger: Bedienleiste mit Display, darüber reicht das Sichtfenster des Deckels nach vorn
  const frontH = 0.09;
  g.add(rbox(W, frontH, WALL * 2, 0.008, body, 0, FOOT + frontH / 2, D / 2 - WALL));
  const screen = createTouchscreen(0.07, 0.04, 'R1', m);
  screen.position.set(W / 2 - 0.07, FOOT + frontH / 2 + 0.005, D / 2 + 0.002);
  g.add(screen);
  const logo = createLabel('Bambu Lab R1', 0.012, '#3a3d42');
  logo.position.set(-W / 2 + 0.08, FOOT + frontH / 2 + 0.01, D / 2 + 0.002);
  g.add(logo);
  g.add(box(W - 0.04, 0.004, 0.002, orange, 0, FOOT + 0.012, D / 2 + 0.0015)); // orange Zierleiste
  // Not-Aus-Knopf
  const stop = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.01, 20), new THREE.MeshStandardMaterial({ color: 0xd8262b }));
  stop.rotation.x = Math.PI / 2;
  stop.position.set(-W / 2 + 0.04, FOOT + frontH / 2 - 0.012, D / 2 + 0.005);
  g.add(stop);

  // Deckel: Rahmen mit großem orange getöntem Fenster, vorne über die niedrige Front geschwungen
  const lidY = H;
  g.add(rbox(W, 0.014, 0.05, 0.006, body, 0, lidY, -D / 2 + 0.025)); // Scharnierleiste hinten
  for (const sx of [-1, 1]) g.add(rbox(0.035, 0.014, D, 0.006, body, sx * (W / 2 - 0.0175), lidY, 0));
  const top = box(W - 0.07, 0.004, D - 0.07, laserGlass, 0, lidY + 0.003, 0.01);
  top.userData.noShadow = true;
  g.add(top);
  const frontGlassH = lidY - (FOOT + frontH);
  const front = box(W - 0.07, frontGlassH, 0.004, laserGlass, 0, FOOT + frontH + frontGlassH / 2, D / 2 - 0.004);
  front.userData.noShadow = true;
  g.add(front);
  g.add(rbox(W, 0.012, 0.02, 0.005, body, 0, lidY, D / 2 - 0.01)); // vordere Deckelkante mit Griffmulde
  g.add(box(0.12, 0.004, 0.006, trim, 0, lidY - 0.006, D / 2 + 0.001));

  // Abluftrohr hinten
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 }));
  duct.rotation.x = Math.PI / 2;
  duct.position.set(W / 2 - 0.1, FOOT + 0.1, -D / 2 - 0.04);
  g.add(duct);
  g.add(rbox(0.09, 0.09, 0.01, 0.01, trim, W / 2 - 0.1, FOOT + 0.1, -D / 2 - 0.004));

  // Wabenbett, darauf liegt die Holzplatte
  const bed = new THREE.Group();
  bed.add(box(BED.x, 0.006, BED.z, new THREE.MeshStandardMaterial({ map: getHoneycombTexture(), metalness: 0.5, roughness: 0.5 }), 0, BED_TOP - 0.003, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bed.add(box(0.02, BED_TOP - 0.03, 0.02, trim, sx * (BED.x / 2 - 0.02), (BED_TOP + 0.03) / 2, sz * (BED.z / 2 - 0.02)));
  g.add(bed);

  // Portal: zwei Führungen links und rechts (vor/zurück), Querträger mit dem Laserkopf (links/rechts)
  const railX = W / 2 - WALL - 0.02;
  for (const sx of [-1, 1]) g.add(box(0.018, 0.018, D - WALL * 2 - 0.02, m.alu, sx * railX, HEAD_Y + 0.045, 0));
  const gantry = new THREE.Group();
  gantry.add(box(railX * 2, 0.02, 0.024, m.alu, 0, HEAD_Y + 0.045, 0));
  for (const sx of [-1, 1]) gantry.add(box(0.03, 0.03, 0.04, trim, sx * railX, HEAD_Y + 0.045, 0));
  const head = new THREE.Group();
  head.add(rbox(0.05, 0.065, 0.045, 0.006, trim, 0, HEAD_Y + 0.04, 0.02));
  head.add(box(0.05, 0.006, 0.0465, orange, 0, HEAD_Y + 0.055, 0.02));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.02, 20), m.black);
  lens.position.set(0, HEAD_Y + 0.0, 0.02);
  head.add(lens);
  gantry.add(head);
  g.add(gantry);
  g.userData.moving = [gantry]; // fährt vor und zurück – nicht mit dem Gehäuse verschmelzen

  // Laserstrahl und Lichtpunkt: leuchten heller als Weiß, damit der Bloom-Effekt sie strahlen lässt
  const sheetTop = BED_TOP + 0.003;
  const beamLen = HEAD_Y - 0.01 - sheetTop;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0012, 0.0012, beamLen, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aa8ff).multiplyScalar(3), transparent: true, opacity: 0.8 }),
  );
  beam.position.set(0, sheetTop + beamLen / 2, 0.02);
  beam.visible = false;
  beam.userData.noBounds = true;
  head.add(beam);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.004, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(6) }),
  );
  glow.position.set(0, sheetTop + 0.001, 0.02);
  glow.visible = false;
  glow.userData.noBounds = true;
  head.add(glow);

  // Kamera innen vorne links unter dem Deckel, Blick schräg aufs Bett (für die Drucker-Cam)
  const cam = rbox(0.022, 0.016, 0.014, 0.004, m.black, -W / 2 + 0.05, H - 0.03, D / 2 - 0.05);
  g.add(cam);
  g.userData.camMount = { position: new THREE.Vector3(-W / 2 + 0.05, H - 0.04, D / 2 - 0.06), target: new THREE.Vector3(0, BED_TOP, 0) };

  // Bewegung: Kopf links/rechts auf dem Querträger, Portal vor/zurück. Der Kopf sitzt um 0,02 vor dem Träger,
  // damit liegt die Linse genau über dem Bahnpunkt. Ohne Auftrag parkt er hinten links.
  const park = { x: -BED.x / 2, z: -BED.z / 2 };
  g.userData.printRig = {
    partParent: bed,
    head,
    plateCenter: new THREE.Vector3(0, sheetTop, 0),
    pose: ({ mode, x, z }) => {
      const at = mode === 'printing' ? { x, z } : park;
      head.position.x = THREE.MathUtils.clamp(at.x, -railX + 0.03, railX - 0.03);
      gantry.position.z = THREE.MathUtils.clamp(at.z, -D / 2 + 0.05, D / 2 - 0.08) - 0.02;
    },
  };
  g.userData.printRig.pose({ mode: 'idle' });
  g.userData.laser = { beam, glow, sheetTop, bedSize: BED };
}
