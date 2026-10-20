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
// hoch ≈ 2560 × 1440, mittel ≈ 1920 × 1080, niedrig ≈ 1440 × 810
const PIXEL_BUDGET = { hoch: 3.7e6, mittel: 2.1e6, niedrig: 1.2e6 };
const MAX_PIXEL_RATIO = { hoch: 2, mittel: 1.5, niedrig: 1 };

// Sonnenschatten je Stufe: Größe der Schattenkarte, Kantenlänge des Bereichs um die Spielfigur (m), wie oft die
// Karte pro Sekunde neu gezeichnet wird (0 = jedes Bild) und ob die Deckenlampen der Anbauten Schatten werfen.
const SHADOWS = {
  hoch: { mapSize: 2048, area: 40, rate: 0, lampShadows: true },
  mittel: { mapSize: 2048, area: 32, rate: 30, lampShadows: false },
  niedrig: { mapSize: 1024, area: 24, rate: 10, lampShadows: false },
};
// Kantenglättung (MSAA) im Puffer der Nachbearbeitung; „niedrig“ glättet direkt beim Zeichnen (siehe antialias)
const MSAA_SAMPLES = { hoch: 4, mittel: 2 };
export const antialias = (quality) => quality === 'niedrig';

// Automatische Auflösung: Liegt die Bildzeit über eine Sekunde gemittelt über SLOW_FRAME_MS, rechnet das Spiel
// mit weniger Pixeln (bis SCALE_MIN), bei genug Luft wieder mit mehr.
const SLOW_FRAME_MS = 1000 / 45;
const FAST_FRAME_MS = 1000 / 57;
const SCALE_MIN = 0.6;
const SCALE_STEP = 0.1;

function pixelRatioFor(quality, width, height, scale = 1) {
  const budget = Math.sqrt(PIXEL_BUDGET[quality] / (width * height));
  return Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO[quality], budget) * scale;
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

// Sonnenschatten folgen der Spielfigur: Statt Halle, Anbauten und Garten auf einmal deckt die Schattenkarte nur
// den Bereich um den Spieler ab – schärfer und mit weniger Objekten, die hineingezeichnet werden müssen.
// Der Mittelpunkt rastet auf ganze Texel ein, sonst flimmern die Schattenkanten beim Laufen.
function followSun(sun, area, mapSize) {
  const offset = sun.position.clone().sub(sun.target.position).setLength(60); // weit weg, damit nichts abgeschnitten wird
  const dir = offset.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const up = dir.clone().cross(right);
  const texel = area / mapSize;
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -area / 2;
  cam.right = cam.top = area / 2;
  cam.near = 1;
  cam.far = 120;
  cam.updateProjectionMatrix();
  const snapped = new THREE.Vector3();
  return (position) => {
    const a = Math.round(position.dot(right) / texel) * texel;
    const b = Math.round(position.dot(up) / texel) * texel;
    snapped.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(dir, position.dot(dir));
    sun.target.position.copy(snapped);
    sun.target.updateMatrixWorld();
    sun.position.copy(snapped).add(offset);
    sun.updateMatrixWorld();
  };
}

export function setupGraphics(renderer, scene, camera, quality) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  // Niedrig: harte Schatten und ohne die Deckenspots (jedes Licht kostet in jedem Pixel Rechenzeit) – dafür ist
  // das Himmelslicht heller.
  const low = quality === 'niedrig';
  const shadows = SHADOWS[quality];
  let scale = 1; // automatische Auflösung (1 = volles Pixelbudget)
  let width = window.innerWidth;
  let height = window.innerHeight;
  renderer.setPixelRatio(pixelRatioFor(quality, width, height));
  renderer.setSize(width, height);
  renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // Wann die Schattenkarten neu gezeichnet werden, entscheidet render() (Takt je Stufe)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  let sun = null;
  const lamps = [];
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow) sun = o;
    if (o.isPointLight) lamps.push(o);
    if (low && o.isSpotLight) o.visible = false;
    if (low && o.isHemisphereLight) o.intensity += 0.9;
  });
  // Deckenlampen in Lager, Büro und Empfang: Schatten nur auf „hoch“ und nur einmal gezeichnet (die Räume
  // bewegen sich nicht) – sonst zeichnet jede Lampe die Szene in jedem Bild sechsmal zusätzlich
  for (const lamp of lamps) {
    lamp.castShadow = shadows.lampShadows;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }
  let moveSun = null;
  if (sun) {
    sun.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
    moveSun = followSun(sun, shadows.area, shadows.mapSize);
    moveSun(camera.position);
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
  let gtao = null;
  if (!low) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: MSAA_SAMPLES[quality] });
    if (quality === 'hoch') target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (quality === 'hoch') {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      // Tiefe aus dem Hauptbild nehmen (die Normalen rekonstruiert GTAO daraus), statt die ganze Szene ein zweites
      // Mal für Normalen und Tiefe zu zeichnen. In welchem der beiden Puffer das Hauptbild landet, wechselt von
      // Bild zu Bild – render() setzt die Tiefe deshalb jedes Mal neu.
      gtao.setGBuffer(composer.readBuffer.depthTexture);
      // In halber Auflösung rechnen – das weiche Ergebnis wird beim Überblenden hochskaliert
      const setGtaoSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => setGtaoSize(Math.ceil(w / 2), Math.ceil(h / 2));
      gtao.setSize(size.x, size.y);
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

  function applySize() {
    renderer.setPixelRatio(pixelRatioFor(quality, width, height, scale));
    renderer.setSize(width, height);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(width, height); // passt auch alle Passes an
  }

  // Automatische Auflösung: Bildzeit über eine Sekunde mitteln, dann höchstens einen Schritt anpassen
  let sampleMs = 0;
  let sampleFrames = 0;
  let lastFrame = performance.now();
  function adaptResolution() {
    const now = performance.now();
    const ms = now - lastFrame;
    lastFrame = now;
    if (ms > 250 || document.hidden) return; // Pause, Ladeschluckauf, Tab im Hintergrund zählen nicht
    sampleMs += ms;
    sampleFrames++;
    if (sampleMs < 1000) return;
    const avg = sampleMs / sampleFrames;
    sampleMs = 0;
    sampleFrames = 0;
    let next = scale;
    if (avg > SLOW_FRAME_MS) next = Math.max(SCALE_MIN, scale - SCALE_STEP);
    else if (avg < FAST_FRAME_MS) next = Math.min(1, scale + SCALE_STEP / 2);
    if (Math.abs(next - scale) < 0.01) return;
    scale = next;
    applySize();
  }

  let time = 0;
  let shadowTimer = 0;
  return {
    render(dt) {
      time += dt;
      animateDust(dust, dt, time);
      adaptResolution();
      shadowTimer += dt;
      if (!shadows.rate || shadowTimer >= 1 / shadows.rate) {
        shadowTimer = 0;
        moveSun?.(camera.position);
        renderer.shadowMap.needsUpdate = true;
      }
      if (!composer) {
        renderer.render(scene, camera);
        return;
      }
      if (gtao) {
        gtao.gtaoMaterial.uniforms.tDepth.value = composer.readBuffer.depthTexture;
        gtao.pdMaterial.uniforms.tDepth.value = composer.readBuffer.depthTexture;
      }
      vignette.uniforms.time.value = time % 100;
      composer.render(dt);
    },
    setSize(w, h) {
      width = w;
      height = h;
      applySize();
    },
    // Lampenschatten neu zeichnen, wenn sich in den Räumen etwas geändert hat (z. B. Kartons im Lager)
    refreshStaticShadows() {
      for (const lamp of lamps) if (lamp.castShadow) lamp.shadow.needsUpdate = true;
    },
  };
}
