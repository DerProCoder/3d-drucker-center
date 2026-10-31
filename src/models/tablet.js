// Tablet der Spielfigur (#67): flaches Gerät mit abgerundeten Ecken, schmalem Rand, Kamera-Punkt oben im Rand und
// selbstleuchtendem Bildschirm. Im Querformat gebaut, Mitte des Bildschirms im Ursprung, der Bildschirm zeigt nach +z.
// Die Gehäusefarbe lässt sich von außen setzen (setColor, Farbwahl in der App „Einstellungen“, #68): Sie färbt das
// Gehäuse und – etwas dunkler – den Rand um den Bildschirm (bezelColor), damit man die Farbe auch von vorn sieht.
import * as THREE from 'three';
import { mat } from './mesh-helpers.js';

// Maße in Metern: Bildschirm 16:10, Rand rundherum gleich breit
export const TABLET_SCREEN = { width: 0.24, height: 0.15, radius: 0.006 };
const BEZEL = 0.011;
const BODY = { width: TABLET_SCREEN.width + 2 * BEZEL, height: TABLET_SCREEN.height + 2 * BEZEL, depth: 0.006, radius: 0.016 };
const BEVEL = 0.0012;
export const DEFAULT_TABLET_COLOR = 0x23262d; // entspricht „Schwarz“ in core/tablet-style.js
const GLASS_COLOR = 0x0a0b0d; // Rand um den Bildschirm beim schwarzen Standard-Tablet

// Farbe des Rands um den Bildschirm zur Gehäusefarbe: beim Standard schwarzes Glas, sonst die Gehäusefarbe leicht
// abgedunkelt (für das 3D-Modell und den Saum des HTML-Bildschirms, ui/tablet.js)
export function bezelColor(hex) {
  if (hex === DEFAULT_TABLET_COLOR) return GLASS_COLOR;
  return new THREE.Color(GLASS_COLOR).lerp(new THREE.Color(hex), 0.85).getHex();
}

// Rechteck mit abgerundeten Ecken, Mitte im Ursprung
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Fläche mit abgerundeten Ecken, UV von 0 bis 1 über die ganze Fläche (für das Bild auf dem Bildschirm)
function roundedPlane(w, h, r) {
  const geo = new THREE.ShapeGeometry(roundedRect(w, h, r), 6);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

export function createTabletModel({ color = DEFAULT_TABLET_COLOR } = {}) {
  const group = new THREE.Group();
  group.name = 'tablet';

  // Gehäuse: abgerundete Platte mit leicht gebrochenen Kanten
  const bodyMat = mat(color, 0.45, 0.35);
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(BODY.width - 2 * BEVEL, BODY.height - 2 * BEVEL, BODY.radius), {
    depth: BODY.depth - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 8,
  });
  bodyGeo.translate(0, 0, -BODY.depth + BEVEL); // Vorderseite knapp hinter z = 0
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Glasfläche über der Vorderseite (der Rand um den Bildschirm), Farbe passend zum Gehäuse (bezelColor)
  const glassMat = new THREE.MeshStandardMaterial({ color: bezelColor(color), roughness: 0.15, metalness: 0.1 });
  const glass = new THREE.Mesh(roundedPlane(BODY.width - 0.003, BODY.height - 0.003, BODY.radius - 0.0015), glassMat);
  glass.position.z = 0.0003;
  group.add(glass);

  // Bildschirm: leuchtet selbst, zeigt den Startbildschirm (setScreenImage)
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0b1d3a });
  const screen = new THREE.Mesh(roundedPlane(TABLET_SCREEN.width, TABLET_SCREEN.height, TABLET_SCREEN.radius), screenMat);
  screen.position.z = 0.0006;
  group.add(screen);

  // Kamera-Punkt mittig im oberen Rand (Querformat), mit hellem Glanzpunkt
  const camDot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.2 }));
  camDot.position.set(0, TABLET_SCREEN.height / 2 + BEZEL / 2, 0.0006);
  const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0007, 10), new THREE.MeshBasicMaterial({ color: 0x3a4a66 }));
  glint.position.set(0.0006, 0.0006, 0.0001);
  camDot.add(glint);
  group.add(camDot);

  // Hinten: Kamera-Insel in Gehäusefarbe (sieht man beim Heben und Senken)
  const bump = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(0.03, 0.03, 0.008), { depth: 0.0015, bevelEnabled: false }), bodyMat);
  bump.position.set(-BODY.width / 2 + 0.03, BODY.height / 2 - 0.03, -BODY.depth - 0.0015);
  group.add(bump);

  // Das Tablet hängt an der Kamera dicht vor dem Auge – Schatten würfe es nur auf sich selbst
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });

  let texture = null;
  return {
    group,
    // Gehäusefarbe, z. B. 0x23262d – der Rand um den Bildschirm folgt (bezelColor)
    setColor(hex) {
      bodyMat.color.set(hex);
      glassMat.color.set(bezelColor(hex));
    },
    // Bild auf dem Bildschirm (Canvas). rotate: true dreht es für das Hochformat (Gerät um 90° gedreht)
    setScreenImage(canvas, { rotate = false } = {}) {
      texture?.dispose();
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.center.set(0.5, 0.5);
      texture.rotation = rotate ? -Math.PI / 2 : 0;
      screenMat.map = texture;
      screenMat.color.set(0xffffff);
      screenMat.needsUpdate = true;
    },
  };
}
