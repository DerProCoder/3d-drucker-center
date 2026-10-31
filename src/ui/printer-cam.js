// Drucker-Cam: Live-Bild eines aufgestellten Druckers für die PC-App, wie die Kamera im echten Gerät.
// Rendert die Szene aus der eingebauten Kamera des Druckers (vorne links in der Ecke) in ein kleines Bild (10 Bilder pro Sekunde)
// und malt es mit Einblendungen (REC, Uhrzeit, Fortschritt) auf ein Canvas im PC-Fenster.
// Drucker mit KI-Kamera (X2D) liefern ein schärferes Bild, die anderen sind etwas weicher.
// Der Leitstand (#58) nutzt dieselbe Kamera: im Reiter „Drucker“ (render/attach wie die PC-App) und auf der
// Bildschirmwand (still: einzelnes Standbild in ein beliebiges Canvas, nur alle paar Sekunden).
import * as THREE from 'three';
import { templateById } from '../core/catalog.js';
import { laserJobLabel } from '../core/laser.js';

const W = 480;
const H = 270;
const FPS = 10;
// Ebene, über die world/room-culling.js gerade nicht sichtbare Räume ausblendet. Die Gerätekamera sieht sie trotzdem –
// sonst wäre das Bild aus dem Leitstand unter der Erde (Halle ausgeblendet) leer. Lichter bleiben auf Ebene 0, die Zahl
// der Lichter (und damit die Shader) ändert sich dadurch nicht.
const CULLED_LAYER = 31;

export function createPrinterCam({ renderer, scene, economy, workshop }) {
  const target = new THREE.WebGLRenderTarget(W, H);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  // Weitwinkel wie die echte Gerätekamera. Sie sieht nur ins Gerät und auf die Nachbarn – weiter weg muss nichts
  // gezeichnet werden.
  const camera = new THREE.PerspectiveCamera(72, W / H, 0.005, 4);
  camera.layers.enable(CULLED_LAYER);
  const pixels = new Uint8Array(W * H * 4);
  const lookAt = new THREE.Vector3();
  let canvas = null;
  let ctx = null;
  let image = null;
  let printerId = null;
  let sinceFrame = 0;
  let reading = false; // Bild wird gerade von der Grafikkarte geholt
  let stillCanvas = null; // Zwischenbild für Standbilder (still), erst bei Bedarf angelegt

  const placedPrinters = () => economy.printers.filter((p) => p.location === 'table').sort((a, b) => a.slot - b.slot);

  // Gewählter Drucker, falls er noch auf dem Tisch steht, sonst der erste aufgestellte
  function currentPrinter() {
    const placed = placedPrinters();
    return placed.find((p) => p.id === printerId) ?? placed[0] ?? null;
  }

  function statusText(p) {
    const job = p.job;
    if (!job) return 'Bereit';
    const name = job.laser ? laserJobLabel(job) : `${(job.count ?? 1) > 1 ? `${job.count} × ` : ''}${templateById(job.templateId).name}`;
    if (job.status === 'done') return `Fertig: ${name}`;
    if (job.status === 'failed') return `Fehldruck: ${name}!`;
    const pct = Math.floor(job.progress * 100);
    return `${job.status === 'paused' ? 'Pausiert' : job.laser ? 'Lasert' : 'Druckt'}: ${name} · ${pct} %`;
  }

  function overlay(c, p) {
    const now = new Date();
    c.font = '600 14px "Segoe UI", Arial, sans-serif';
    c.textBaseline = 'top';
    // REC blinkt
    if (now.getMilliseconds() < 600) {
      c.fillStyle = '#ff3b3b';
      c.beginPath();
      c.arc(18, 18, 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ffffff';
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 4;
    c.fillText('REC', 30, 11);
    if (p.model.aiCamera) {
      c.fillStyle = '#ff9a4a';
      c.fillText('HD · KI-Erkennung aktiv', 70, 11);
      c.fillStyle = '#ffffff';
    }
    c.textAlign = 'right';
    c.fillText(now.toLocaleTimeString('de-DE'), W - 10, 11);
    c.textAlign = 'left';
    c.fillText(`${p.model.name} · Platz ${p.slot + 1}`, 10, H - 44);
    c.fillText(statusText(p), 10, H - 24);
    c.shadowBlur = 0;
    if (p.job) {
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.fillRect(0, H - 4, W, 4);
      c.fillStyle = '#00ae42';
      c.fillRect(0, H - 4, W * p.job.progress, 4);
    }
  }

  function noSignal(c) {
    c.fillStyle = '#0d0f12';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { // Rauschen wie bei einer Kamera ohne Bild
      const v = Math.random() * 60;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    c.fillStyle = '#9aa1a9';
    c.font = '600 18px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Kein Signal – stell einen Drucker auf den Tisch', W / 2, H / 2);
    c.textAlign = 'left';
  }

  // Bild aus der Gerätekamera von p rendern und asynchron auslesen; draw(c) malt es danach mit Einblendungen auf das
  // W × H große Canvas c. Gibt ein Promise zurück (true: Bild ist da) oder null, wenn kein Bild möglich ist.
  function shoot(p, c) {
    const model = p && workshop.modelOf(p.id);
    if (!model?.userData.camMount) return null;
    // Filmt aus der eingebauten Kamera vorne links in der Ecke, Blick aufs Bett
    const mount = model.userData.camMount;
    model.updateMatrixWorld(true);
    model.localToWorld(camera.position.copy(mount.position));
    model.localToWorld(lookAt.copy(mount.target));
    camera.lookAt(lookAt);

    // Die Schatten aus dem Hauptbild weiterverwenden, statt sie für die Kamera neu zu zeichnen
    const shadowUpdate = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.needsUpdate = shadowUpdate;
    // Asynchron auslesen: Das Spiel wartet nicht, bis die Grafikkarte das Bild fertig hat
    reading = true;
    return renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H, pixels).then(() => {
      reading = false;
      if (!c.canvas.isConnected && c.canvas !== stillCanvas) return false;
      const img = c === ctx ? image : c.createImageData(W, H);
      // WebGL liefert die Zeilen von unten nach oben
      for (let y = 0; y < H; y++) {
        img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      }
      c.putImageData(img, 0, 0);
      if (!p.model.aiCamera) { // einfache Kamera: leicht unscharf
        c.filter = 'blur(0.8px)';
        c.drawImage(c.canvas, 0, 0);
        c.filter = 'none';
      }
      overlay(c, p);
      return true;
    }, () => {
      reading = false;
      return false;
    });
  }

  function renderFrame() {
    const p = currentPrinter();
    if (!shoot(p, ctx)) noSignal(ctx);
  }

  return {
    // HTML für die App: Umschalter pro Drucker und das Bild
    render() {
      const placed = placedPrinters();
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
    // Aufgestellte Drucker (nach Platz), z. B. damit die Bildschirmwand im Leitstand reihum filmen kann
    printers: placedPrinters,
    // Standbild für die Bildschirmwand im Leitstand: Drucker p (oder der in der App gewählte) wird einmal gefilmt
    // und mit Einblendungen in das Rechteck (x, y, w, h) von out (2D-Kontext) gemalt. Promise<boolean> – false, wenn
    // kein Drucker filmbar ist oder die Kamera gerade beschäftigt ist (dann malt der Aufrufer selbst etwas).
    still(out, x, y, w, h, p = currentPrinter()) {
      if (reading) return Promise.resolve(false);
      if (!stillCanvas) {
        stillCanvas = document.createElement('canvas');
        stillCanvas.width = W;
        stillCanvas.height = H;
      }
      const c = stillCanvas.getContext('2d');
      const shot = shoot(p, c);
      if (!shot) return Promise.resolve(false);
      return shot.then((ok) => {
        if (ok) out.drawImage(stillCanvas, x, y, w, h);
        return ok;
      });
    },
    // Jedes Bild aus der Spielschleife: rendert nur, solange die App sichtbar ist
    update(dt) {
      if (!canvas?.isConnected || !canvas.offsetParent) return;
      sinceFrame += dt;
      if (sinceFrame < 1 / FPS || reading) return;
      sinceFrame = 0;
      renderFrame();
    },
  };
}
