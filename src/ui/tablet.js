// Tablet (#67): HTML-Bildschirm des Tablets in der Hand. Er liegt genau über dem Bildschirm des 3D-Modells
// (world/tablet-hold.js liefert dafür das Rechteck) und zeigt die PC-Apps – dieselbe Fassung wie am PC (ui/shop.js),
// nur in den Tablet-Bildschirm eingehängt. Oben eine Statusleiste mit Uhr, Startbildschirm- und Weglegen-Knopf,
// unten ein Home-Balken. Die Randfarbe kommt aus der CSS-Variable --tablet-frame (setFrameColor, z. B. für #68).
import { drawIcon, drawWallpaperCover } from './desktop.js';

// shop: PC-Fenster aus ui/shop.js (open({ host, mode }), close(), home(), apps)
export function createTablet({ shop }) {
  const root = document.createElement('div');
  root.id = 'tablet';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="tablet-status">
      <span class="tablet-clock"></span>
      <span class="tablet-name">📱 Tablet</span>
      <button class="tablet-home" title="Startbildschirm" aria-label="Startbildschirm">⌂</button>
      <button class="tablet-close" title="Tablet weglegen (G oder Esc)">✕<span class="tablet-close-text"> Weglegen</span></button>
    </div>
    <div class="tablet-apps"></div>
    <button class="tablet-homebar" aria-label="Startbildschirm"></button>
  `;
  document.body.appendChild(root);
  const appsEl = root.querySelector('.tablet-apps');
  const clockEl = root.querySelector('.tablet-clock');
  let open = false;

  root.querySelector('.tablet-home').addEventListener('click', () => shop.home());
  root.querySelector('.tablet-homebar').addEventListener('click', () => shop.home());
  // Weglegen geht über shop.close() – das ruft dessen onClose('tablet'), dort senkt main.js das Tablet und spielt weiter
  root.querySelector('.tablet-close').addEventListener('click', () => shop.close());

  function updateClock() {
    clockEl.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  setInterval(() => { if (open) updateClock(); }, 1000);

  return {
    isOpen: () => open,
    // Apps einhängen; sichtbar wird der Bildschirm erst, wenn das Tablet oben ist (place)
    open() {
      open = true;
      document.body.classList.add('tablet-open'); // HUD ausblenden, Meldungen über dem Tablet (css/tablet.css)
      updateClock();
      root.classList.remove('hidden');
      root.classList.remove('shown');
      shop.open({ host: appsEl, mode: 'tablet' });
    },
    // Nach shop.close(): Bildschirm ausblenden (das Senken übernimmt world/tablet-hold.js)
    hide() {
      open = false;
      document.body.classList.remove('tablet-open');
      root.classList.add('hidden');
      root.classList.remove('shown');
    },
    // rect: Bildschirm des 3D-Modells in CSS-Pixeln (oder null, solange es sich hebt bzw. senkt)
    place(rect) {
      if (!open) return;
      if (!rect) {
        root.classList.remove('shown');
        return;
      }
      // Auf ganze Pixel runden: scharfe Schrift, keine halben Pixel am Rand
      const left = Math.round(rect.left);
      const top = Math.round(rect.top);
      const s = root.style;
      s.left = `${left}px`;
      s.top = `${top}px`;
      s.width = `${Math.round(rect.left + rect.width) - left}px`;
      s.height = `${Math.round(rect.top + rect.height) - top}px`;
      s.setProperty('--tablet-radius', `${rect.radius.toFixed(1)}px`);
      root.classList.toggle('portrait', rect.portrait);
      root.classList.add('shown');
    },
    // Randfarbe (CSS-Wert, z. B. '#23262d') – das 3D-Gehäuse färbt world/tablet-hold.js (setColor)
    setFrameColor(color) {
      root.style.setProperty('--tablet-frame', color);
    },
    // Startbildschirm als Bild für den Bildschirm des 3D-Modells (sieht man beim Heben und Senken)
    homeImages() {
      return { landscape: homeCanvas(1024, 640, shop.apps), portrait: homeCanvas(640, 1024, shop.apps) };
    },
  };
}

// Hintergrund, Statusleiste und App-Symbole im Raster wie im HTML-Startbildschirm
function homeCanvas(width, height, apps) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawWallpaperCover(ctx, width, height);
  ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
  ctx.fillRect(0, 0, width, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), 16, 17);
  const cell = 112;
  const cols = Math.max(1, Math.floor((width - 24) / cell));
  const x0 = (width - cols * cell) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  apps.forEach((a, i) => {
    const x = x0 + (i % cols) * cell;
    const y = 52 + Math.floor(i / cols) * (cell + 4);
    if (y + cell > height) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.roundRect(x + 24, y, 64, 64, 16);
    ctx.fill();
    drawIcon(ctx, a.icon, x + 34, y + 10, 44);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(a.name, x + cell / 2, y + 70, cell - 6);
  });
  return canvas;
}
