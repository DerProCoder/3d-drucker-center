// Leistungsanzeige (F3): Bilder pro Sekunde, Bildzeit, Rechenzeit der Spielschleife, Draw Calls, Dreiecke,
// Auflösung. Mit ?perf in der Adresse ist sie gleich offen und schreibt alle 60 Bilder eine Zeile „PERF …“ in die
// Konsole – inklusive Draw Calls je Szenenbereich, damit man sieht, was am meisten kostet.
import * as THREE from 'three';

const LOG_FRAMES = 60; // in Bildern statt Sekunden – klappt so auch im Headless-Browser mit virtueller Zeit

export function createPerfOverlay({ renderer, scene }) {
  const params = new URLSearchParams(location.search);
  const logging = params.has('perf');
  const el = document.createElement('div');
  el.id = 'perf-overlay';
  el.classList.toggle('hidden', !logging);
  document.body.appendChild(el);

  // Zum Prüfen von außen (z. B. Kamera an eine bestimmte Stelle setzen)
  if (logging) window.druckercenterDebug = { renderer, scene };

  // Mehrere Durchläufe pro Bild (Schatten, Nachbearbeitung, Drucker-Cam) zusammenzählen
  renderer.info.autoReset = false;

  let frames = 0;
  let frameMs = 0;
  let worstMs = 0;
  let cpuMs = 0;
  let elapsed = 0;
  let totalFrames = 0;
  let last = performance.now();
  let loopStart = 0;
  let stats = { calls: 0, triangles: 0 };
  const size = new THREE.Vector2();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      el.classList.toggle('hidden');
    }
  });

  // Draw Calls je oberster Szenengruppe (nur sichtbare Meshes, Mehrfachmaterialien zählen einzeln)
  function breakdown() {
    const parts = [];
    for (const child of scene.children) {
      let n = 0;
      child.traverseVisible((o) => {
        if (o.isMesh || o.isPoints || o.isSprite || o.isLine) n += Array.isArray(o.material) ? o.material.length : 1;
      });
      if (n) parts.push(`${child.name || child.type}:${n}`);
    }
    return parts.join(' ');
  }

  return {
    // Am Anfang jedes Bildes aufrufen
    begin() {
      loopStart = performance.now();
      renderer.info.reset();
    },
    // Nach dem Zeichnen aufrufen
    end(dt) {
      const now = performance.now();
      cpuMs += now - loopStart;
      const ms = now - last;
      last = now;
      frames++;
      frameMs += ms;
      worstMs = Math.max(worstMs, ms);
      stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      elapsed += dt;
      if (logging && (++totalFrames % LOG_FRAMES === 0 || totalFrames === 10)) {
        console.log(`PERF Bild ${totalFrames} | Draw Calls ${stats.calls} · Dreiecke ${(stats.triangles / 1000).toFixed(0)} k | `
          + `Shader ${renderer.info.programs.length} | ${breakdown()}`);
      }
      if (elapsed < 0.5) return;

      renderer.getDrawingBufferSize(size);
      const avg = frameMs / frames;
      const text = [
        `${Math.round(1000 / avg)} FPS · ${avg.toFixed(1)} ms (max ${worstMs.toFixed(0)})`,
        `Spielschleife ${(cpuMs / frames).toFixed(1)} ms`,
        `Draw Calls ${stats.calls} · Dreiecke ${(stats.triangles / 1000).toFixed(0)} k`,
        `Geometrien ${renderer.info.memory.geometries} · Texturen ${renderer.info.memory.textures} · Shader ${renderer.info.programs.length}`,
        `${size.x} × ${size.y} px (${(size.x * size.y / 1e6).toFixed(1)} MP)`,
      ];
      el.textContent = text.join('\n');
      frames = 0;
      frameMs = 0;
      worstMs = 0;
      cpuMs = 0;
      elapsed = 0;
    },
  };
}
