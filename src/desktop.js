// Bildschirminhalt des PCs: Windows-ähnlicher Desktop nach dem Einloggen.
// Wird per Canvas gezeichnet; die Uhr in der Taskleiste läuft mit der echten Uhrzeit mit.
import * as THREE from 'three';

const W = 1120;
const H = 640;
const TASKBAR_H = 52;

function drawWallpaper(ctx) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1d3a');
  bg.addColorStop(0.5, '#123a78');
  bg.addColorStop(1, '#0a1a33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Abstrakte Blüte aus überlagerten, transparenten Blättern
  const cx = W * 0.55;
  const cy = H * 0.58;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const petals = 9;
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI * 0.95 + (i / (petals - 1)) * Math.PI * 0.9);
    const grad = ctx.createLinearGradient(0, 0, 330, 0);
    grad.addColorStop(0, 'rgba(120,200,255,0.05)');
    grad.addColorStop(0.6, `rgba(${60 + i * 12},${140 + i * 8},255,0.45)`);
    grad.addColorStop(1, 'rgba(200,235,255,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(110, -95, 270, -70, 340, 0);
    ctx.bezierCurveTo(270, 70, 110, 95, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Sanftes Leuchten in der Mitte
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260);
  glow.addColorStop(0, 'rgba(150,210,255,0.35)');
  glow.addColorStop(1, 'rgba(150,210,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// --- Symbole ---

function iconStart(ctx, x, y, s) {
  const g = s * 0.08;
  const q = (s - g) / 2;
  ctx.fillStyle = '#3aa0ff';
  for (const [dx, dy] of [[0, 0], [q + g, 0], [0, q + g], [q + g, q + g]]) {
    ctx.fillRect(x + dx, y + dy, q, q);
  }
}

function iconSearch(ctx, x, y, s) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.12;
  ctx.beginPath();
  ctx.arc(x + s * 0.42, y + s * 0.42, s * 0.28, 0, Math.PI * 2);
  ctx.moveTo(x + s * 0.63, y + s * 0.63);
  ctx.lineTo(x + s * 0.92, y + s * 0.92);
  ctx.stroke();
}

function iconFolder(ctx, x, y, s) {
  ctx.fillStyle = '#e8a923';
  roundRect(ctx, x, y + s * 0.12, s * 0.45, s * 0.2, s * 0.05);
  ctx.fill();
  ctx.fillStyle = '#ffc83d';
  roundRect(ctx, x, y + s * 0.22, s, s * 0.68, s * 0.08);
  ctx.fill();
}

function iconBrowser(ctx, x, y, s) {
  const r = s / 2;
  const grad = ctx.createLinearGradient(x, y, x + s, y + s);
  grad.addColorStop(0, '#36c3f0');
  grad.addColorStop(1, '#1f6fd6');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6ee07a';
  ctx.beginPath();
  ctx.arc(x + r * 0.9, y + r * 1.15, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function iconStore(ctx, x, y, s) {
  ctx.fillStyle = '#f2f2f2';
  roundRect(ctx, x, y + s * 0.25, s, s * 0.72, s * 0.1);
  ctx.fill();
  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s * 0.28, s * 0.2, Math.PI, 0);
  ctx.stroke();
  iconStart(ctx, x + s * 0.3, y + s * 0.42, s * 0.4);
}

function iconPrinter(ctx, x, y, s) {
  ctx.fillStyle = '#ff8a3d';
  roundRect(ctx, x, y, s, s, s * 0.12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.12);
  ctx.fillRect(x + s * 0.46, y + s * 0.32, s * 0.08, s * 0.25);
  ctx.fillRect(x + s * 0.25, y + s * 0.7, s * 0.5, s * 0.1);
}

function iconTrash(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(220,235,255,0.9)';
  ctx.fillRect(x + s * 0.15, y + s * 0.12, s * 0.7, s * 0.08);
  ctx.fillStyle = 'rgba(200,220,245,0.75)';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.25);
  ctx.lineTo(x + s * 0.8, y + s * 0.25);
  ctx.lineTo(x + s * 0.72, y + s * 0.95);
  ctx.lineTo(x + s * 0.28, y + s * 0.95);
  ctx.fill();
}

function iconPc(ctx, x, y, s) {
  ctx.fillStyle = '#4fb3ff';
  roundRect(ctx, x, y + s * 0.1, s, s * 0.6, s * 0.06);
  ctx.fill();
  ctx.fillStyle = '#cfe8ff';
  ctx.fillRect(x + s * 0.35, y + s * 0.72, s * 0.3, s * 0.12);
  ctx.fillRect(x + s * 0.2, y + s * 0.84, s * 0.6, s * 0.06);
}

function iconSpool(ctx, x, y, s) {
  const r = s / 2;
  ctx.fillStyle = '#2fb34a';
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = s * 0.04;
  for (const f of [0.75, 0.6]) {
    ctx.beginPath();
    ctx.arc(x + r, y + r, r * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3d44';
  ctx.beginPath();
  ctx.arc(x + r, y + r, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8dbe0';
  ctx.beginPath();
  ctx.arc(x + r, y + r, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function iconOrders(ctx, x, y, s) {
  ctx.fillStyle = '#c98a4b';
  roundRect(ctx, x + s * 0.12, y + s * 0.08, s * 0.76, s * 0.9, s * 0.08);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.7);
  ctx.fillStyle = '#8a8d91';
  roundRect(ctx, x + s * 0.34, y + s * 0.02, s * 0.32, s * 0.14, s * 0.04);
  ctx.fill();
  ctx.fillStyle = '#2f8f4a';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + s * 0.27, y + s * (0.32 + i * 0.18), s * 0.08, s * 0.08);
  ctx.fillStyle = '#9aa0a8';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + s * 0.42, y + s * (0.33 + i * 0.18), s * 0.32, s * 0.06);
}

function iconNotes(ctx, x, y, s) {
  ctx.fillStyle = '#ffe066';
  roundRect(ctx, x + s * 0.1, y + s * 0.05, s * 0.8, s * 0.9, s * 0.06);
  ctx.fill();
  ctx.fillStyle = '#e0b400';
  ctx.fillRect(x + s * 0.1, y + s * 0.05, s * 0.8, s * 0.14);
  ctx.fillStyle = 'rgba(90,70,0,0.55)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + s * 0.22, y + s * (0.32 + i * 0.15), s * (i === 3 ? 0.35 : 0.56), s * 0.05);
}

function iconCalc(ctx, x, y, s) {
  ctx.fillStyle = '#3a3f4b';
  roundRect(ctx, x + s * 0.12, y, s * 0.76, s, s * 0.1);
  ctx.fill();
  ctx.fillStyle = '#9fe3b0';
  ctx.fillRect(x + s * 0.22, y + s * 0.1, s * 0.56, s * 0.2);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = c === 2 ? '#ff8a3d' : '#d8dbe0';
      ctx.fillRect(x + s * (0.22 + c * 0.2), y + s * (0.4 + r * 0.19), s * 0.14, s * 0.13);
    }
  }
}

const ICONS = {
  start: iconStart, folder: iconFolder, printer: iconPrinter, spool: iconSpool,
  orders: iconOrders, notes: iconNotes, calc: iconCalc, trash: iconTrash, pc: iconPc,
};

// Symbol als Bild-URL für das HTML-Desktop-Fenster (doppelte Auflösung für scharfe Kanten)
export function iconDataUrl(name, size = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * 2;
  ICONS[name](canvas.getContext('2d'), 0, 0, size * 2);
  return canvas.toDataURL();
}

// Nur das Hintergrundbild, z. B. für den Desktop im PC-Fenster
export function wallpaperDataUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawWallpaper(canvas.getContext('2d'));
  return canvas.toDataURL();
}

function drawDesktopIcons(ctx) {
  const icons = [
    ['Papierkorb', iconTrash],
    ['Dieser PC', iconPc],
    ['Druckershop', iconPrinter],
    ['Aufträge', iconOrders],
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  icons.forEach(([label, draw], i) => {
    const x = 22;
    const y = 18 + i * 96;
    draw(ctx, x + 14, y, 44);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(label, x + 37, y + 55);  // Textschatten
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + 36, y + 54);
  });
}

function drawTaskbar(ctx, now) {
  const y = H - TASKBAR_H;
  ctx.fillStyle = 'rgba(28,32,44,0.85)';
  ctx.fillRect(0, y, W, TASKBAR_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, y, W, 1);

  // Zentrierte App-Symbole
  const icons = [iconStart, iconSearch, iconFolder, iconBrowser, iconStore, iconPrinter];
  const size = 28;
  const step = 50;
  const startX = W / 2 - ((icons.length - 1) * step) / 2 - size / 2;
  icons.forEach((draw, i) => {
    const ix = startX + i * step;
    if (i === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, ix - 8, y + 6, size + 16, TASKBAR_H - 12, 6);
      ctx.fill();
    }
    draw(ctx, ix, y + (TASKBAR_H - size) / 2, size);
  });
  // Laufende App (Explorer) mit Indikator
  ctx.fillStyle = '#7cc4ff';
  roundRect(ctx, startX + 2 * step + size / 2 - 7, y + TASKBAR_H - 6, 14, 3, 2);
  ctx.fill();

  // Infobereich rechts: WLAN, Lautsprecher, Uhrzeit, Datum
  const rx = W - 16;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  ctx.fillText(now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), rx, y + 17);
  ctx.fillText(now.toLocaleDateString('de-DE'), rx, y + 36);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  const wx = rx - 112;
  const wy = y + 34;
  for (const r of [6, 11, 16]) {
    ctx.beginPath();
    ctx.arc(wx, wy, r, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }
  const sx = rx - 90;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx, y + 22, 5, 8);
  ctx.beginPath();
  ctx.moveTo(sx + 5, y + 22);
  ctx.lineTo(sx + 11, y + 17);
  ctx.lineTo(sx + 11, y + 35);
  ctx.lineTo(sx + 5, y + 30);
  ctx.fill();
}

export function createDesktopScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  function redraw() {
    drawWallpaper(ctx);
    drawDesktopIcons(ctx);
    drawTaskbar(ctx, new Date());
    texture.needsUpdate = true;
  }
  redraw();
  setInterval(redraw, 15000); // Uhr aktuell halten

  return { texture, canvas, redraw };
}
