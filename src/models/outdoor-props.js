// 3D-Modelle für draußen: Auto, Wohnhaus, Parkbank, Straßenlaterne, Briefkasten, Himmelskuppel. Bäume, Büsche und
// Blumen gibt es als Instanzen (viele gleiche Objekte in einem Zeichenaufruf) – wichtig für schwache Grafikkarten.
// Ursprung jeweils mittig am Boden, Vorderseite nach +z.
import * as THREE from 'three';

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let mats = null;
function materials() {
  mats ??= {
    tire: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }),
    window: new THREE.MeshStandardMaterial({ color: 0x1d2630, metalness: 0.4, roughness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dadd, metalness: 0.9, roughness: 0.2 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.8 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0xb01010, emissive: 0x900000, emissiveIntensity: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.8 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2d3136, metalness: 0.6, roughness: 0.5 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe9b8, emissiveIntensity: 0.6 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.5 }),
  };
  return mats;
}

// ---------- Auto ----------

// Kleinwagen/Kombi: Karosserie, Kabine mit Scheiben, vier Räder (userData.wheels drehen sich beim Fahren)
export function createCar(color, length = 4.2) {
  const m = materials();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const car = new THREE.Group();
  const w = 1.78;
  car.add(box(w, 0.62, length, paint, 0, 0.55, 0));                         // Unterteil
  const cabinLen = length * 0.52;
  const cabin = box(w - 0.12, 0.55, cabinLen, paint, 0, 1.12, -length * 0.06);
  car.add(cabin);
  // Scheiben rundum (etwas größer als die Kabine, dunkel getönt)
  car.add(box(w - 0.1, 0.42, cabinLen - 0.25, m.window, 0, 1.13, -length * 0.06));
  const windshield = box(w - 0.16, 0.5, 0.05, m.window, 0, 1.1, -length * 0.06 + cabinLen / 2 + 0.01);
  windshield.rotation.x = -0.35;
  car.add(windshield);
  car.add(box(w + 0.02, 0.12, length + 0.04, m.darkMetal, 0, 0.3, 0));       // Schweller und Stoßstangen
  for (const side of [-1, 1]) {
    car.add(box(0.36, 0.14, 0.05, m.headlight, side * 0.6, 0.66, length / 2 + 0.005));
    car.add(box(0.34, 0.12, 0.05, m.taillight, side * 0.62, 0.7, -length / 2 - 0.005));
    car.add(box(0.06, 0.06, 0.16, paint, side * (w / 2 + 0.05), 0.98, length * 0.18)); // Außenspiegel
  }
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(tireGeo, m.tire), new THREE.Mesh(rimGeo, m.rim));
      wheel.position.set(sx * (w / 2 - 0.08), 0.33, sz * length * 0.32);
      car.add(wheel);
      wheels.push(wheel);
    }
  }
  car.userData.wheels = wheels;
  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return car;
}

// ---------- Wohnhaus ----------

function drawFacade(color) {
  return (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  };
}

// Fenster mit hellem Rahmen, Sprosse und Spiegelung; lit = Licht brennt drinnen
function drawWindow(lit) {
  return (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, lit ? '#f6d9a0' : '#5f7d97');
    g.addColorStop(1, lit ? '#d9a95c' : '#22313f');
    ctx.fillStyle = g;
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(w / 2 - 3, 8, 6, h - 16);
    ctx.fillRect(8, h * 0.35, w - 16, 5);
  };
}

const houseWindowMats = [false, true].map((lit) => new THREE.MeshStandardMaterial({
  map: canvasTexture(64, 96, drawWindow(lit)), roughness: 0.3,
}));

// Einfamilienhaus mit Satteldach. w: Breite (entlang x), d: Tiefe, h: Traufhöhe
export function createHouse({ w = 10, d = 9, h = 6, wall = '#e8dcc8', roof = 0x8c3b2a }) {
  const house = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawFacade(wall)), roughness: 0.95 });
  house.add(box(w, h, d, wallMat, 0, h / 2, 0));
  house.add(box(w + 0.1, 0.5, d + 0.1, new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9 }), 0, 0.25, 0)); // Sockel
  // Satteldach: Prisma entlang x
  const roofH = d * 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.4, 0);
  shape.lineTo(0, roofH);
  shape.lineTo(d / 2 + 0.4, 0);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false });
  roofGeo.translate(0, 0, -(w + 0.6) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: roof, roughness: 0.75 }));
  roofMesh.position.y = h;
  house.add(roofMesh);
  // Giebeldreiecke in Wandfarbe
  const gable = new THREE.ShapeGeometry(shape);
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(gable, wallMat);
    g.rotation.y = side * Math.PI / 2;
    g.position.set(side * (w / 2 + 0.005), h, 0);
    house.add(g);
  }
  // Fenster vorn und hinten, Haustür vorn
  const cols = Math.max(2, Math.floor(w / 2.6));
  for (const face of [1, -1]) {
    for (let floor = 0; floor < 2; floor++) {
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + (c + 0.5) * (w / cols);
        if (face === 1 && floor === 0 && c === Math.floor(cols / 2)) continue; // dort ist die Tür
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), houseWindowMats[Math.random() < 0.25 ? 1 : 0]);
        win.position.set(x, 1.6 + floor * 2.8, face * (d / 2 + 0.01));
        if (face === -1) win.rotation.y = Math.PI;
        house.add(win);
      }
    }
  }
  const doorX = -w / 2 + (Math.floor(cols / 2) + 0.5) * (w / cols);
  house.add(box(1.1, 2.1, 0.08, new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: 0.6 }), doorX, 1.05 + 0.25, d / 2 + 0.04));
  house.add(box(1.6, 0.12, 1.0, new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: 0.9 }), doorX, 0.06, d / 2 + 0.5));
  house.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return house;
}

// ---------- Kleinteile ----------

export function createBench() {
  const m = materials();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(box(1.6, 0.04, 0.11, m.wood, 0, 0.45, -0.15 + i * 0.13)); // Sitzlatten
  for (let i = 0; i < 2; i++) {
    const slat = box(1.6, 0.11, 0.04, m.wood, 0, 0.62 + i * 0.15, -0.24);
    slat.rotation.x = -0.15;
    g.add(slat);
  }
  for (const sx of [-0.7, 0.7]) {
    g.add(box(0.06, 0.45, 0.06, m.darkMetal, sx, 0.225, 0.12));
    g.add(box(0.06, 0.85, 0.06, m.darkMetal, sx, 0.425, -0.24));
    g.add(box(0.06, 0.04, 0.42, m.darkMetal, sx, 0.62, -0.04)); // Armlehne
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Straßenlaterne: Mast mit ausladendem Arm, Leuchte zeigt nach +z
export function createStreetLamp() {
  const m = materials();
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5, 10), m.darkMetal);
  pole.position.y = 2.5;
  g.add(pole);
  g.add(box(0.08, 0.08, 1.1, m.darkMetal, 0, 4.95, 0.5));
  g.add(box(0.32, 0.12, 0.55, m.darkMetal, 0, 4.9, 1.05));
  g.add(box(0.26, 0.03, 0.45, m.lampGlow, 0, 4.83, 1.05));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Gartenleuchte: kurzer Pfosten mit leuchtendem Kopf
export function createGardenLight() {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(0.1, 0.7, 0.1, m.darkMetal, 0, 0.35, 0));
  g.add(box(0.16, 0.12, 0.16, m.lampGlow, 0, 0.76, 0));
  g.add(box(0.2, 0.03, 0.2, m.darkMetal, 0, 0.835, 0));
  return g;
}

// Briefkasten auf Pfosten, gelb wie bei der Post
export function createMailbox() {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(0.08, 1.0, 0.08, m.darkMetal, 0, 0.5, 0));
  g.add(box(0.36, 0.3, 0.24, m.yellow, 0, 1.12, 0));
  g.add(box(0.2, 0.02, 0.01, m.darkMetal, 0, 1.2, 0.125)); // Einwurfschlitz
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Himmelskuppel mit Farbverlauf (folgt der Kamera, ignoriert Nebel)
export function createSky(radius, top = '#4f8fd8', horizon = '#d3e6f3') {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const colors = [];
  const cTop = new THREE.Color(top);
  const cHorizon = new THREE.Color(horizon);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / radius, 0, 1) ** 0.6;
    const c = cHorizon.clone().lerp(cTop, t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.raycast = () => {};
  return sky;
}

// ---------- Pflanzen als Instanzen ----------

// Laubbäume: Stämme und Kronen (je drei Kugeln) als zwei InstancedMeshes. trees: [{ x, z, scale }]
export function createTrees(trees) {
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 8).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.95 }), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), trees.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  trees.forEach((t, i) => {
    const k = t.scale ?? 1;
    const height = 3.2 * k; // Kronenansatz über Kopfhöhe
    trunks.setMatrixAt(i, m.compose(p.set(t.x, 0, t.z), q.identity(), s.set(k, height, k)));
    for (let c = 0; c < 3; c++) {
      const a = c * 2.1 + i;
      const r = (1.1 + (c === 0 ? 0.35 : 0)) * k;
      p.set(t.x + Math.cos(a) * 0.55 * k * (c ? 1 : 0), height + (c === 0 ? 1.2 : 0.7) * k, t.z + Math.sin(a) * 0.55 * k * (c ? 1 : 0));
      q.setFromEuler(new THREE.Euler(0, a, 0));
      crowns.setMatrixAt(i * 3 + c, m.compose(p, q, s.set(r, r * 0.9, r)));
      crowns.setColorAt(i * 3 + c, color.setHSL(0.27 + Math.random() * 0.06, 0.45, 0.28 + Math.random() * 0.08));
    }
  });
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  const group = new THREE.Group();
  group.add(trunks, crowns);
  return group;
}

// Büsche (flache, grüne Kugeln) und Blumen (kleine bunte Kugeln) als Instanzen. items: [{ x, z, y?, size?, color? }]
export function createBlobs(items, baseColor, flat = 0.7) {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
    items.length
  );
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  items.forEach((b, i) => {
    const r = b.size ?? 0.5;
    m.compose(new THREE.Vector3(b.x, b.y ?? r * flat * 0.8, b.z), new THREE.Quaternion(), new THREE.Vector3(r, r * flat, r));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.set(b.color ?? baseColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
