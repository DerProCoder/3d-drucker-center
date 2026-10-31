// Hintergrundbilder des Tablet-Startbildschirms (#68): per Canvas gezeichnet, in jeder Größe füllend. „Blüte“ ist das
// Hintergrundbild des PCs (ui/desktop.js). Welche es gibt, steht in core/tablet-style.js (TABLET_WALLPAPERS).
// Genutzt vom HTML-Bildschirm und der Textur des 3D-Modells (ui/tablet.js) sowie den Vorschaubildern in der
// App „Einstellungen“ (ui/settings-app.js).
import { drawWallpaperCover } from './desktop.js';

// Fester Zufall, damit Sterne und Streifen bei jedem Zeichnen gleich liegen
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}

// Sonnenuntergang über dem Meer: Farbverlauf, Sonne, Spiegelung im Wasser
function drawSunset(ctx, w, h) {
  const horizon = h * 0.64;
  ctx.fillStyle = linear(ctx, 0, 0, 0, horizon, [[0, '#2a1b4d'], [0.45, '#b2416a'], [0.8, '#f3824a'], [1, '#ffc46b']]);
  ctx.fillRect(0, 0, w, horizon);
  const r = Math.min(w, h) * 0.16;
  const sx = w * 0.5;
  const glow = ctx.createRadialGradient(sx, horizon, 0, sx, horizon, r * 3.2);
  glow.addColorStop(0, 'rgba(255, 220, 140, 0.7)');
  glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe2a0';
  ctx.beginPath();
  ctx.arc(sx, horizon, r, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = linear(ctx, 0, horizon, 0, h, [[0, '#6a2f5c'], [1, '#1a1433']]);
  ctx.fillRect(0, horizon, w, h - horizon);
  // Glitzerstreifen der Sonne auf dem Wasser
  ctx.fillStyle = 'rgba(255, 214, 140, 0.55)';
  for (let i = 0; i < 9; i++) {
    const y = horizon + (h - horizon) * (0.06 + i * 0.1);
    const half = r * (1 - i * 0.08) * (0.6 + (i % 2) * 0.4);
    ctx.fillRect(sx - half, y, half * 2, Math.max(2, h * 0.006));
  }
}

// Berge im Morgenlicht: drei Bergketten hintereinander, vorne dunkler
function drawMountains(ctx, w, h) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, '#7fc4e8'], [0.55, '#d8eef2'], [1, '#f4e9d0']]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 248, 220, 0.9)';
  ctx.beginPath();
  ctx.arc(w * 0.76, h * 0.26, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const ranges = [
    { base: 0.62, peak: 0.3, color: '#8fb3c9', seed: 3 },
    { base: 0.74, peak: 0.24, color: '#4f7f94', seed: 7 },
    { base: 0.88, peak: 0.2, color: '#21485a', seed: 11 },
  ];
  for (const r of ranges) {
    const rnd = seeded(r.seed);
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const y = h * (r.base - (i % 2 ? r.peak * (0.6 + rnd() * 0.4) : r.peak * rnd() * 0.35));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

// Sternenhimmel: dunkelblauer Verlauf, Milchstraßen-Schimmer, Sterne und ein Hügel
function drawStars(ctx, w, h) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, '#050814'], [0.7, '#12204a'], [1, '#283a6e']]);
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.5);
  const band = ctx.createLinearGradient(0, -h * 0.2, 0, h * 0.2);
  band.addColorStop(0, 'rgba(150, 120, 255, 0)');
  band.addColorStop(0.5, 'rgba(170, 150, 255, 0.22)');
  band.addColorStop(1, 'rgba(150, 120, 255, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(-w, -h * 0.2, w * 2, h * 0.4);
  ctx.restore();
  const rnd = seeded(42);
  const count = Math.round((w * h) / 2600);
  for (let i = 0; i < count; i++) {
    const size = rnd() < 0.08 ? 2.2 : 1 + rnd();
    ctx.fillStyle = `rgba(255, 255, ${200 + Math.round(rnd() * 55)}, ${0.4 + rnd() * 0.6})`;
    ctx.fillRect(rnd() * w, rnd() * h * 0.85, size * (w / 1000 + 0.5), size * (w / 1000 + 0.5));
  }
  ctx.fillStyle = '#04060d';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.86);
  ctx.quadraticCurveTo(w * 0.35, h * 0.76, w * 0.62, h * 0.88);
  ctx.quadraticCurveTo(w * 0.85, h * 0.95, w, h * 0.84);
  ctx.lineTo(w, h);
  ctx.fill();
}

// Filament: bunte, geschwungene Bahnen wie Filamentstränge auf dunklem Grund
function drawFilament(ctx, w, h) {
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [[0, '#15161c'], [1, '#262833']]);
  ctx.fillRect(0, 0, w, h);
  const colors = ['#ff5d5d', '#ff9f3d', '#ffd84a', '#5fd36a', '#3ab0ff', '#7a6cff', '#e86cff'];
  const lw = Math.max(w, h) * 0.035;
  ctx.lineCap = 'round';
  colors.forEach((color, i) => {
    const y0 = h * (0.12 + i * 0.12);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-lw, y0);
    ctx.bezierCurveTo(w * 0.3, y0 - h * 0.18, w * 0.6, y0 + h * 0.22, w + lw, y0 - h * 0.05);
    ctx.stroke();
    // Glanzlinie auf jedem Strang
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = lw * 0.18;
    ctx.beginPath();
    ctx.moveTo(-lw, y0 - lw * 0.22);
    ctx.bezierCurveTo(w * 0.3, y0 - h * 0.18 - lw * 0.22, w * 0.6, y0 + h * 0.22 - lw * 0.22, w + lw, y0 - h * 0.05 - lw * 0.22);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// Schiefer: ruhiger dunkler Verlauf mit feinem Rautenmuster
function drawSlate(ctx, w, h) {
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [[0, '#2b3038'], [1, '#14171c']]);
  ctx.fillRect(0, 0, w, h);
  const step = Math.max(w, h) / 22;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = Math.max(1, step * 0.04);
  ctx.beginPath();
  for (let x = -h; x < w + h; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
  }
  ctx.stroke();
  const glow = ctx.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.3, h * 0.25, Math.max(w, h) * 0.6);
  glow.addColorStop(0, 'rgba(120, 160, 220, 0.18)');
  glow.addColorStop(1, 'rgba(120, 160, 220, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

const DRAW = {
  bloom: drawWallpaperCover,
  sunset: drawSunset,
  mountains: drawMountains,
  stars: drawStars,
  filament: drawFilament,
  slate: drawSlate,
};

// Hintergrundbild id füllend auf ctx zeichnen (unbekannte ID: „Blüte“)
export function drawTabletWallpaper(ctx, id, width, height) {
  ctx.save();
  (DRAW[id] ?? DRAW.bloom)(ctx, width, height);
  ctx.restore();
}

// Als Bild-URL (JPEG, klein genug für CSS-Hintergründe); Ergebnisse werden je ID und Größe gemerkt
const cache = new Map();
export function tabletWallpaperUrl(id, width, height) {
  const key = `${id}|${width}x${height}`;
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawTabletWallpaper(canvas.getContext('2d'), id, width, height);
    cache.set(key, canvas.toDataURL('image/jpeg', 0.88));
  }
  return cache.get(key);
}
