// Produktbilder für den Shop (echte 3D-Modelle der Drucker) und Vorschau von Druckteilen in gewählten Farben.
import * as THREE from 'three';
import { createPrinterModel } from '../models/printer-model.js';
import { getPrintShape } from '../models/print-shapes.js';

const WIDTH = 400;
const HEIGHT = 300;

// Gibt eine Map Modell-ID → Bild-URL (PNG mit transparentem Hintergrund) zurück. Klappt das Rendern nicht
// (z. B. kein weiterer WebGL-Kontext frei), fehlen die Bilder – der Shop zeigt die Drucker dann ohne Bild.
export function renderPrinterPreviews(models) {
  const images = new Map();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (err) {
    console.warn('Druckerbilder für den Shop konnten nicht erzeugt werden:', err);
    return images;
  }
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.01, 20);

  for (const model of models) {
    try {
      renderPreview(model);
    } catch (err) {
      console.warn(`Druckerbild für ${model.name} konnte nicht erzeugt werden:`, err);
    }
  }

  function renderPreview(model) {
    const printer = createPrinterModel(model);
    scene.add(printer);

    // Kamera schräg von vorne rechts oben, Abstand passend zur Modellgröße
    const box = new THREE.Box3().setFromObject(printer);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(center).add(new THREE.Vector3(0.55, 0.4, 1).normalize().multiplyScalar(distance));
    camera.lookAt(center);

    try {
      renderer.render(scene, camera);
      images.set(model.id, renderer.domElement.toDataURL('image/png'));
    } finally {
      scene.remove(printer);
    }
  }

  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}

// ---------- Vorschau eines Druckteils in gewählten Farben (Farbwahl im Druckermenü) ----------

const PART_WIDTH = 240;
const PART_HEIGHT = 180;
let partRenderer = null; // einmal angelegt und wiederverwendet, die Vorschau ändert sich bei jedem Klick
let partRendererFailed = false;
const partImages = new Map(); // `${templateId}|${hexes}` → Bild-URL

// Bild-URL des Teils, jede Geometrie-Gruppe in ihrer Farbe (hexes: eine Farbe pro Teil der Vorlage, null = fehlt).
// null, wenn kein WebGL verfügbar ist – das Menü zeigt dann nur die Farbknöpfe.
export function renderPartPreview(template, hexes) {
  const key = `${template.id}|${hexes.join(',')}`;
  if (partImages.has(key)) return partImages.get(key);
  if (partRendererFailed) return null;
  try {
    if (!partRenderer) {
      partRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      partRenderer.setSize(PART_WIDTH, PART_HEIGHT);
      partRenderer.setClearColor(0x000000, 0);
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(1, 2, 1.5);
    scene.add(light);
    const materials = hexes.map((hex) => new THREE.MeshStandardMaterial({ color: hex ?? '#6b6f76', roughness: 0.5 }));
    const { geometry } = getPrintShape(template);
    const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
    scene.add(mesh);

    // Schräg von vorne oben, flache Teile eher von oben, damit Schrift und Logos zu sehen sind
    const camera = new THREE.PerspectiveCamera(30, PART_WIDTH / PART_HEIGHT, 0.001, 5);
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const flat = size.y < Math.max(size.x, size.z) * 0.3;
    const dir = flat ? new THREE.Vector3(0.25, 1, 0.75) : new THREE.Vector3(0.55, 0.45, 1);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.95;
    camera.position.copy(center).add(dir.normalize().multiplyScalar(distance));
    camera.lookAt(center);

    partRenderer.render(scene, camera);
    const url = partRenderer.domElement.toDataURL('image/png');
    for (const mat of materials) mat.dispose();
    partImages.set(key, url);
    return url;
  } catch (err) {
    console.warn('Vorschau des Druckteils konnte nicht erzeugt werden:', err);
    partRendererFailed = true;
    return null;
  }
}
