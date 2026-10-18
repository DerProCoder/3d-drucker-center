// Drucker-Cam: Live-Bild eines aufgestellten Druckers für die PC-App, wie die Kamera im echten Gerät.
// Rendert die Szene aus einer Kamera schräg vor dem Druckbett in ein kleines Bild (10 Bilder pro Sekunde)
// und malt es mit Einblendungen (REC, Uhrzeit, Fortschritt) auf ein Canvas im PC-Fenster.
import * as THREE from 'three';
import { templateById } from './catalog.js';

const W = 480;
const H = 270;
const FPS = 10;

export function createPrinterCam({ renderer, scene, economy, workshop }) {
  const target = new THREE.WebGLRenderTarget(W, H);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.01, 30);
  const pixels = new Uint8Array(W * H * 4);
  const lookAt = new THREE.Vector3();
  let canvas = null;
  let ctx = null;
  let image = null;
  let printerId = null;
  let sinceFrame = 0;

  // Gewählter Drucker, falls er noch auf dem Tisch steht, sonst der erste aufgestellte
  function currentPrinter() {
    const placed = economy.printers.filter((p) => p.location === 'table');
    return placed.find((p) => p.id === printerId) ?? placed[0] ?? null;
  }

  function statusText(p) {
    const job = p.job;
    if (!job) return 'Bereit';
    const name = templateById(job.templateId).name;
    if (job.status === 'done') return `Fertig: ${name}`;
    const pct = Math.floor(job.progress * 100);
    return `${job.status === 'paused' ? 'Pausiert' : 'Druckt'}: ${name} · ${pct} %`;
  }

  function overlay(p) {
    const now = new Date();
    ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'top';
    // REC blinkt
    if (now.getMilliseconds() < 600) {
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(18, 18, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText('REC', 30, 11);
    ctx.textAlign = 'right';
    ctx.fillText(now.toLocaleTimeString('de-DE'), W - 10, 11);
    ctx.textAlign = 'left';
    ctx.fillText(`${p.model.name} · Platz ${p.slot + 1}`, 10, H - 44);
    ctx.fillText(statusText(p), 10, H - 24);
    ctx.shadowBlur = 0;
    if (p.job) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, H - 4, W, 4);
      ctx.fillStyle = '#00ae42';
      ctx.fillRect(0, H - 4, W * p.job.progress, 4);
    }
  }

  function noSignal() {
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { // Rauschen wie bei einer Kamera ohne Bild
      const v = Math.random() * 60;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    ctx.fillStyle = '#9aa1a9';
    ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Kein Signal – stell einen Drucker auf den Tisch', W / 2, H / 2);
    ctx.textAlign = 'left';
  }

  function renderFrame() {
    const p = currentPrinter();
    const model = p && workshop.modelOf(p.id);
    if (!model) {
      noSignal();
      return;
    }
    // Kamera schräg vorne links über dem Bett, Blick auf die Plattenmitte
    const rig = model.userData.printRig;
    lookAt.copy(rig.plateCenter);
    model.localToWorld(lookAt);
    lookAt.y += 0.04;
    camera.position.set(-0.13, 0.13, 0.3).add(lookAt);
    camera.lookAt(lookAt);

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    renderer.setRenderTarget(null);
    // WebGL liefert die Zeilen von unten nach oben
    for (let y = 0; y < H; y++) {
      image.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    }
    ctx.putImageData(image, 0, 0);
    overlay(p);
  }

  return {
    // HTML für die App: Umschalter pro Drucker und das Bild
    render() {
      const placed = economy.printers.filter((p) => p.location === 'table').sort((a, b) => a.slot - b.slot);
      const active = currentPrinter();
      const tabs = placed.map((p) => `
        <button class="cam-tab ${p === active ? 'active' : ''}" data-cam-printer="${p.id}">Platz ${p.slot + 1}: ${p.model.name}</button>`).join('');
      return `<div class="cam">
        <div class="cam-tabs">${tabs || '<span class="cam-empty">Noch kein Drucker aufgestellt</span>'}</div>
        <canvas class="cam-view" width="${W}" height="${H}" data-cam></canvas>
      </div>`;
    },
    // Nach dem Einfügen ins Fenster aufrufen
    attach(el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      image = ctx.createImageData(W, H);
      sinceFrame = Infinity; // sofort ein Bild
    },
    // Gibt true zurück, wenn neu gezeichnet werden muss
    handleClick(e) {
      const id = e.target.closest('[data-cam-printer]')?.dataset.camPrinter;
      if (!id) return false;
      printerId = Number(id);
      return true;
    },
    // Jedes Bild aus der Spielschleife: rendert nur, solange die App sichtbar ist
    update(dt) {
      if (!canvas?.isConnected || !canvas.offsetParent) return;
      sinceFrame += dt;
      if (sinceFrame < 1 / FPS) return;
      sinceFrame = 0;
      renderFrame();
    },
  };
}
