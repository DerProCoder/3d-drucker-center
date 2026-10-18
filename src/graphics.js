// Bildqualität: Tone-Mapping, Spiegelungen per Umgebungslicht, Nachbearbeitung (Umgebungsverdeckung,
// Leuchten/Bloom, Vignette) und schwebender Staub im Licht. main.js ruft nur setupGraphics() auf.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Grafikstufen: 'hoch' mit Umgebungsverdeckung, 'mittel' nur Bloom, 'niedrig' ohne Nachbearbeitung
export const QUALITY_LEVELS = ['hoch', 'mittel', 'niedrig'];
const QUALITY_KEY = 'druckercenter-grafik';

export function loadQuality() {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    return QUALITY_LEVELS.includes(q) ? q : 'hoch';
  } catch {
    return 'hoch';
  }
}

// Welche Grafikkarte WebGL benutzt. software: true, wenn der Browser ohne Grafikkarte rendert
// (SwiftShader, „Microsoft Basic Render Driver“, llvmpipe) – dann ruckelt alles stark.
export function gpuInfo(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const software = /swiftshader|basic render|llvmpipe|software/i.test(name);
  // „ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x…) Direct3D11 …)“ → „NVIDIA GeForce RTX 3060“
  const short = name.replace(/^ANGLE \([^,]*,\s*/, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/\s*Direct3D.*$/i, '').replace(/\)$/, '');
  return { name: short || name, software };
}

// Höchstens so viele Pixel pro Bild (Megapixel) je Grafikstufe. Auf großen oder sehr breiten Monitoren
// (z. B. 5120 × 1440) rechnet das Spiel intern mit weniger Pixeln und skaliert hoch – sonst kommt besonders eine
// integrierte Grafik nicht hinterher, Bilder stauen sich und Eingaben kommen erst Sekunden später an.
const PIXEL_BUDGET = { hoch: 8e6, mittel: 4e6, niedrig: 2e6 };
const MAX_PIXEL_RATIO = { hoch: 2, mittel: 1.5, niedrig: 1 };

export function fitPixelRatio(renderer, quality, width, height) {
  const budget = Math.sqrt(PIXEL_BUDGET[quality] / (width * height));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO[quality], budget));
}

export function saveQuality(quality) {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch { /* ohne localStorage bleibt es bei der Voreinstellung */ }
}

// Dunkle Ränder und ein Hauch Filmkorn – wirkt sofort „filmischer“
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    strength: { value: 0.35 },
    grain: { value: 0.025 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float strength;
    uniform float grain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      color.rgb *= 1.0 - strength * smoothstep(0.25, 0.8, dot(d, d) * 2.2);
      color.rgb += (hash(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = color;
    }`,
};

// Feine Staubpartikel, die langsam durch die Halle treiben und im Licht glitzern
function createDust(count = 900) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 19;
    positions[i * 3 + 1] = Math.random() * 3.3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 19;
    speeds[i] = 0.02 + Math.random() * 0.05;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const ctx = sprite.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,248,230,1)');
  g.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.025,
    map: new THREE.CanvasTexture(sprite),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  dust.raycast = () => {}; // darf den Klickstrahl nicht abfangen
  dust.userData.speeds = speeds;
  return dust;
}

function animateDust(dust, dt, time) {
  const pos = dust.geometry.attributes.position;
  const speeds = dust.userData.speeds;
  for (let i = 0; i < speeds.length; i++) {
    let y = pos.getY(i) - speeds[i] * dt * 0.3;
    if (y < 0) y += 3.3;
    pos.setY(i, y);
    pos.setX(i, pos.getX(i) + Math.sin(time * 0.3 + i) * speeds[i] * dt * 0.2);
  }
  pos.needsUpdate = true;
}

export function setupGraphics(renderer, scene, camera, quality) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  // Niedrig: harte Schatten mit kleinerer Schattenkarte, die nur 10× pro Sekunde neu berechnet wird, und ohne
  // die Deckenspots (jedes Licht kostet in jedem Pixel Rechenzeit) – dafür ist das Himmelslicht heller.
  const low = quality === 'niedrig';
  fitPixelRatio(renderer, quality, window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (low) {
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      if (o.isLight && o.castShadow) o.shadow.mapSize.set(1024, 1024);
      if (o.isSpotLight) o.visible = false;
      if (o.isHemisphereLight) o.intensity += 0.9;
    });
  }

  // Umgebung für Spiegelungen auf Metall, Lack und dem Boden
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  const dust = createDust(low ? 300 : 900);
  scene.add(dust);

  let composer = null;
  let vignette = null;
  if (quality !== 'niedrig') {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (quality === 'hoch') {
      const gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.35, distanceFallOff: 1, thickness: 1, scale: 1 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
    }
    // Nur sehr helle Flächen (Deckenleuchten, LEDs) leuchten nach
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.35, 1.8));
    vignette = new ShaderPass(VignetteShader);
    composer.addPass(vignette);
    composer.addPass(new OutputPass());
  }

  let time = 0;
  let shadowTimer = 0;
  return {
    render(dt) {
      time += dt;
      animateDust(dust, dt, time);
      if (low && (shadowTimer += dt) >= 0.1) {
        shadowTimer = 0;
        renderer.shadowMap.needsUpdate = true;
      }
      if (!composer) {
        renderer.render(scene, camera);
        return;
      }
      vignette.uniforms.time.value = time % 100;
      composer.render(dt);
    },
    setSize(w, h) {
      fitPixelRatio(renderer, quality, w, h);
      renderer.setSize(w, h);
      composer?.setPixelRatio(renderer.getPixelRatio());
      composer?.setSize(w, h); // passt auch alle Passes an
    },
  };
}
