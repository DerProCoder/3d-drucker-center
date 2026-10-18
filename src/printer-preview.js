// Produktbilder für den Shop: rendert das echte 3D-Modell jedes Druckers einmalig in ein Bild.
import * as THREE from 'three';
import { createPrinterModel } from './printer-model.js';

const WIDTH = 400;
const HEIGHT = 300;

// Gibt eine Map Modell-ID → Bild-URL (PNG mit transparentem Hintergrund) zurück
export function renderPrinterPreviews(models) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
  const images = new Map();

  for (const model of models) {
    const printer = createPrinterModel(model);
    scene.add(printer);

    // Kamera schräg von vorne rechts oben, Abstand passend zur Modellgröße
    const box = new THREE.Box3().setFromObject(printer);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(center).add(new THREE.Vector3(0.55, 0.4, 1).normalize().multiplyScalar(distance));
    camera.lookAt(center);

    renderer.render(scene, camera);
    images.set(model.id, renderer.domElement.toDataURL('image/png'));
    scene.remove(printer);
  }

  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
