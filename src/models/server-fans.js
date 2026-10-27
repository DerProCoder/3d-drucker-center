// Drehende Lüfter für Server-Geräte und Serverschränke: Rotor mit sieben gebogenen Flügeln, davor ein festes
// Drahtgitter (oder keins, wenn ein Lochgitter davor sitzt – GPU-Server, models/server-hardware.js). Liegt in der
// xy-Ebene und zeigt nach +z. Der Rotor steht in group.userData.rotor; world/server-room.js dreht ihn um seine
// z-Achse, so schnell, wie der Lüfter eingestellt ist (core/server-climate.js).
import * as THREE from 'three';

export const MAX_FAN_SPEED = 14; // Bogenmaß pro Sekunde bei 100 % (schneller flimmert es bei 60 Bildern pro Sekunde)

const SIZE = 128;

function fanTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.translate(SIZE / 2, SIZE / 2);
  draw(ctx, SIZE / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Rotor: dunkles Gehäuse, Flügel, Nabe mit Aufkleber (wie die aufgemalten Lüfter in models/server-textures.js)
let rotorMaterial = null;
function getRotorMaterial() {
  rotorMaterial ??= new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.2,
    map: fanTexture((ctx, r) => {
      ctx.fillStyle = '#141619';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b4048';
      for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / 7);
        ctx.beginPath();
        ctx.moveTo(r * 0.3, -r * 0.05);
        ctx.quadraticCurveTo(r * 0.7, -r * 0.5, r * 0.93, -r * 0.12);
        ctx.quadraticCurveTo(r * 0.62, r * 0.05, r * 0.3, r * 0.14);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#0f1012';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3f46';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9099';
      ctx.fillRect(-r * 0.03, -r * 0.15, r * 0.06, r * 0.08); // Markierung, damit man das Drehen auch langsam sieht
    }),
  });
  return rotorMaterial;
}

// Schutzgitter: Ringe und Kreuzstreben, dazwischen durchsichtig (alphaTest statt Sortierung)
let guardMaterial = null;
function getGuardMaterial() {
  guardMaterial ??= new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.7,
    alphaTest: 0.5,
    map: fanTexture((ctx, r) => {
      ctx.strokeStyle = '#a3a9b1';
      ctx.lineWidth = r * 0.05;
      for (const f of [0.35, 0.62, 0.9]) {
        ctx.beginPath();
        ctx.arc(0, 0, r * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, 0);
      ctx.lineTo(r * 0.92, 0);
      ctx.moveTo(0, -r * 0.92);
      ctx.lineTo(0, r * 0.92);
      ctx.stroke();
    }),
  });
  return guardMaterial;
}

// Lüfter mit Radius r; guard: Drahtgitter davor. Startwinkel zufällig, damit nicht alle Rotoren im Gleichschritt laufen
export function createFan(r, { guard = true } = {}) {
  const g = new THREE.Group();
  const rotor = new THREE.Mesh(new THREE.CircleGeometry(r, 24), getRotorMaterial());
  rotor.position.z = Math.min(0.0006, r * 0.02);
  rotor.rotation.z = Math.random() * Math.PI * 2;
  g.add(rotor);
  if (guard) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 24), getGuardMaterial());
    mesh.position.z = rotor.position.z * 2;
    g.add(mesh);
  }
  g.userData.rotor = rotor;
  return g;
}
