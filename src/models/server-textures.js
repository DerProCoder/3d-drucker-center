// Texturen der Server-Geräte (models/server-hardware.js): Frontblende, Rückwand und Gehäuseblech je Gerätetyp, im
// Canvas gezeichnet – Farbe mit Pulverlack-Körnung, Relief (Bump-Map: Löcher tief, Griffe erhaben) und selbst
// leuchtende LEDs (Emissive-Map, damit der Bloom-Effekt sie strahlen lässt). Jede Textur wird einmal je Typ gebaut.
// Zeichenmaße in Metern, Ursprung oben links auf der Fläche.
import * as THREE from 'three';

const PX = 2100;             // Pixel je Meter
const EAR = 0.02;            // Breite der Befestigungsohren links und rechts
const HOLE_ROWS = [0.143, 0.857]; // obere und untere Bohrung je Höheneinheit (Anteil von oben)
const FONT = '"Segoe UI", Arial, sans-serif';
const GREEN = '#3bf07a';
const AMBER = '#ffb020';
const BLUE = '#3d8bff';

// Status-LED der Server (eigenes Mesh, grün/rot je nach Online-Zustand): Mitte, gemessen von der linken oberen Ecke
// der Frontplatte
export const STATUS_LED = { x: 0.031, y: 0.0085 };

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
const gray = (v) => `rgb(${v},${v},${v})`;
// Farbe abdunkeln (f < 1) oder aufhellen (f > 1)
function shade(color, f) {
  const c = new THREE.Color(color);
  return `#${(f < 1 ? c.multiplyScalar(f) : c.lerp(new THREE.Color(1, 1, 1), f - 1)).getHexString()}`;
}

// Dunkle Farbe? (Helligkeit im sRGB-Farbraum unter 30 %)
function isDark(color) {
  return new THREE.Color(color).getHSL({}, THREE.SRGBColorSpace).l < 0.3;
}

// ---------- Zeichenfläche mit drei Ebenen: Farbe, Höhe (128 = Blech) und Leuchten ----------

function surface(w, h) {
  const width = Math.ceil(w * PX);
  const height = Math.max(8, Math.ceil(h * PX));
  const layer = (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
    return ctx;
  };
  // fans: wo Lüfter gezeichnet wurden ({ x, y, r }, Flächenkoordinaten) – dort setzt models/server-fans.js drehende Rotoren drauf
  // grilles: Lochgitter vor solchen Lüftern ({ x, y, w, h, holes, color }) – davor kommt eine Gitterplatte (grilleMaterial)
  return { w, h, sx: width / w, sy: height / h, color: layer('#000'), bump: layer(gray(128)), glow: layer('#000'), lit: false, fans: [], grilles: [] };
}

// Fläche in Farbe und Höhe (0 = tief, 128 = Blech, 255 = erhaben; null = Höhe unverändert)
function fill(s, x, y, w, h, color, height = null, r = 0) {
  for (const [ctx, style] of [[s.color, color], [s.bump, height == null ? null : gray(height)]]) {
    if (!style) continue;
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
}

function circle(ctx, x, y, r, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Lichtkante oben/links und Schattenkante unten/rechts: wirkt erhaben (raised) bzw. eingelassen
function edge(s, x, y, w, h, raised = true) {
  const ctx = s.color;
  const t = 0.0005;
  const light = 'rgba(255,255,255,0.16)';
  const dark = 'rgba(0,0,0,0.5)';
  ctx.fillStyle = raised ? light : dark;
  ctx.fillRect(x, y, w, t);
  ctx.fillRect(x, y, t, h);
  ctx.fillStyle = raised ? dark : light;
  ctx.fillRect(x, y + h - t, w, t);
  ctx.fillRect(x + w - t, y, t, h);
}

// Pulverlack bzw. Blech: feines Rauschen über die ganze Farbebene (streak: zusätzlich waagerechte Schleifspuren)
function grain(ctx, amount, streak = 0) {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let y = 0; y < height; y++) {
    const row = (Math.random() - 0.5) * streak;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const n = (Math.random() - 0.5) * amount + row;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Lochmuster im Rechteck als Pfad (für perforate und die Gitterplatte vor drehenden Lüftern, grilleMaterial)
function holePath(x, y, w, h, { shape = 'round', size = 0.0011, pitch = 0.003 } = {}) {
  const path = new Path2D();
  const rowH = shape === 'slot' ? size * 2.4 : pitch * 0.866;
  const half = shape === 'slot' ? size * 1.8 : size;
  let row = 0;
  for (let cy = y + size; cy <= y + h - size; cy += rowH, row++) {
    for (let cx = x + half + (row % 2) * pitch / 2; cx <= x + w - half; cx += pitch) {
      if (shape === 'hex') {
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          path[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * size, cy + Math.sin(a) * size);
        }
        path.closePath();
      } else if (shape === 'slot') {
        path.roundRect(cx - half, cy - size / 2, half * 2, size, size / 2);
      } else {
        path.moveTo(cx + size, cy);
        path.arc(cx, cy, size, 0, Math.PI * 2);
      }
    }
  }
  return path;
}

// Lochblech im Rechteck: shape 'hex' (Wabengitter), 'round' oder 'slot' (Langlöcher). behind: Farbe oder
// Zeichenfunktion für das, was durch die Löcher zu sehen ist (z. B. Lüfter)
function perforate(s, x, y, w, h, { shape = 'round', size = 0.0011, pitch = 0.003, behind = '#08090a' } = {}) {
  const path = holePath(x, y, w, h, { shape, size, pitch });
  const ctx = s.color;
  ctx.save();
  ctx.clip(path);
  if (typeof behind === 'function') behind(ctx);
  else {
    ctx.fillStyle = behind;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  s.bump.fillStyle = gray(20);
  s.bump.fill(path);
}

// LED mit Linse: lit leuchtet (Emissive-Ebene), sonst dunkle Linse
function led(s, x, y, r, color, lit = true) {
  circle(s.color, x, y, r * 1.35, '#0b0c0e');
  circle(s.color, x, y, r, lit ? color : shade(color, 0.18));
  circle(s.color, x - r * 0.3, y - r * 0.3, r * 0.35, 'rgba(255,255,255,0.35)');
  circle(s.bump, x, y, r, gray(175));
  if (lit) {
    circle(s.glow, x, y, r, color);
    s.lit = true;
  }
}

// Aufdruck (size: Schrifthöhe in Metern); ohne Skalierung gezeichnet, damit kleine Schrift sauber bleibt
function text(s, str, x, y, size, color, { align = 'left', weight = 700, rotate = 0, glow = false } = {}) {
  for (const ctx of glow ? [s.color, s.glow] : [s.color]) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, x * s.sx, y * s.sy);
    ctx.rotate(rotate);
    ctx.font = `${weight} ${Math.round(size * s.sy)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  if (glow) s.lit = true;
}

// Kreuzschlitzschraube
function screw(s, x, y, r = 0.0034) {
  const g = s.color.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#e4e7eb');
  g.addColorStop(1, '#6b7078');
  circle(s.color, x, y, r, g);
  s.color.fillStyle = '#2a2d31';
  s.color.fillRect(x - r * 0.6, y - r * 0.12, r * 1.2, r * 0.24);
  s.color.fillRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 1.2);
  circle(s.bump, x, y, r, gray(200));
  s.bump.fillStyle = gray(90);
  s.bump.fillRect(x - r * 0.6, y - r * 0.12, r * 1.2, r * 0.24);
  s.bump.fillRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 1.2);
}

// Lüfter hinter einem Gitter: Rahmen, sieben gebogene Flügel, Nabe mit Aufkleber
function fan(ctx, x, y, r) {
  circle(ctx, x, y, r, '#141619');
  ctx.fillStyle = '#3b4048';
  for (let i = 0; i < 7; i++) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((i * Math.PI * 2) / 7);
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.5, r * 0.93, -r * 0.12);
    ctx.quadraticCurveTo(r * 0.62, r * 0.05, r * 0.3, r * 0.14);
    ctx.fill();
    ctx.restore();
  }
  circle(ctx, x, y, r * 0.3, '#0f1012');
  circle(ctx, x, y, r * 0.17, '#3a3f46');
}

// Lüfter mit Drahtgitter (Netzteil, Switch-Rückseite)
function fanGuard(s, x, y, r) {
  s.fans.push({ x, y, r });
  circle(s.bump, x, y, r, gray(30));
  fan(s.color, x, y, r);
  for (const ctx of [s.color, s.bump]) {
    ctx.strokeStyle = ctx === s.color ? '#9aa0a8' : gray(210);
    ctx.lineWidth = r * 0.06;
    for (const f of [0.35, 0.62, 0.9]) {
      ctx.beginPath();
      ctx.arc(x, y, r * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y);
    ctx.lineTo(x + r * 0.9, y);
    ctx.moveTo(x, y - r * 0.9);
    ctx.lineTo(x, y + r * 0.9);
    ctx.stroke();
  }
}

// Schild mit Gerätename
function badge(s, x, y, w, h, str, plate = '#15171a', color = '#d6dae0') {
  fill(s, x, y, w, h, plate, 140, 0.0008);
  edge(s, x, y, w, h, true);
  text(s, str, x + w / 2, y + h / 2, Math.min(h * 0.55, 0.0065), color, { align: 'center' });
}

// Kaltgeräteeingang (C14) mit drei Kontakten
function powerInlet(s, x, y) {
  fill(s, x, y, 0.016, 0.012, '#0d0e10', 40, 0.002);
  for (const [px, py] of [[0.004, 0.0045], [0.008, 0.0045], [0.012, 0.0045]]) fill(s, x + px - 0.0006, y + py, 0.0012, 0.003, '#b8bcc2', 150);
}

// Befestigungsohren mit Langlöchern; oben und unten ist das Gerät festgeschraubt
function ears(s, unitH, units, base) {
  for (const x0 of [0, s.w - EAR]) {
    fill(s, x0, 0, EAR, s.h, shade(base, 1.06), 135);
    for (let u = 0; u < units; u++) {
      for (const f of HOLE_ROWS) {
        const cx = x0 + EAR / 2;
        const cy = (u + f) * unitH - 0.001;
        fill(s, cx - 0.0036, cy - 0.0024, 0.0072, 0.0048, '#0b0c0e', 20, 0.0024);
        if ((u === 0 && f < 0.5) || (u === units - 1 && f > 0.5)) screw(s, cx, cy);
      }
    }
  }
  for (const x of [EAR, s.w - EAR]) fill(s, x - 0.0004, 0, 0.0008, s.h, 'rgba(0,0,0,0.6)', 60);
}

// ---------- Frontblenden ----------

// Laufwerksschacht mit Rahmen, Wabengitter, Entriegelung (accent) und zwei LEDs. vertical: 2,5-Zoll hochkant
function driveBay(s, x, y, w, h, vertical, { tray, accent }, lit) {
  fill(s, x, y, w, h, '#0a0b0d', 30);
  const cx = x + 0.0006;
  const cy = y + 0.0006;
  const cw = w - 0.0012;
  const ch = h - 0.0012;
  fill(s, cx, cy, cw, ch, tray, 150, 0.0006);
  edge(s, cx, cy, cw, ch, true);
  const hex = { shape: 'hex', size: 0.001, pitch: 0.0028 };
  if (vertical) {
    perforate(s, cx + 0.0028, cy + 0.0075, cw - 0.0056, ch * 0.5, hex);
    const ly = cy + ch * 0.66;
    fill(s, cx + 0.0022, ly, cw - 0.0044, ch - (ly - cy) - 0.0022, accent, 185, 0.0007);
    edge(s, cx + 0.0022, ly, cw - 0.0044, ch - (ly - cy) - 0.0022, true);
    for (let i = 1; i < 4; i++) fill(s, cx + 0.004, ly + i * 0.0022, cw - 0.008, 0.0005, 'rgba(0,0,0,0.35)');
    led(s, cx + 0.0042, cy + 0.0038, 0.001, GREEN, lit);
    led(s, cx + 0.0084, cy + 0.0038, 0.001, BLUE, false);
  } else {
    const hw = cw * 0.2;
    fill(s, cx + 0.0018, cy + 0.0018, hw, ch - 0.0036, accent, 185, 0.0008);
    edge(s, cx + 0.0018, cy + 0.0018, hw, ch - 0.0036, true);
    fill(s, cx + hw - 0.002, cy + ch * 0.3, 0.0012, ch * 0.4, 'rgba(0,0,0,0.45)', 100);
    perforate(s, cx + hw + 0.004, cy + 0.0025, cw - hw - 0.012, ch - 0.005, hex);
    led(s, cx + cw - 0.0035, cy + ch * 0.32, 0.001, GREEN, lit);
    led(s, cx + cw - 0.0035, cy + ch * 0.68, 0.001, BLUE, false);
  }
}

// Bedienfeld links: Fassung für die Status-LED, Einschaltknopf, USB-Buchse
function controls(s) {
  circle(s.color, STATUS_LED.x, STATUS_LED.y, 0.0042, '#0b0c0e');
  circle(s.bump, STATUS_LED.x, STATUS_LED.y, 0.0042, gray(50));
  const by = Math.min(0.024, s.h - 0.009);
  const g = s.color.createRadialGradient(STATUS_LED.x - 0.0015, by - 0.0015, 0.0005, STATUS_LED.x, by, 0.0042);
  g.addColorStop(0, '#d9dde2');
  g.addColorStop(1, '#7c828a');
  circle(s.color, STATUS_LED.x, by, 0.0042, g);
  circle(s.bump, STATUS_LED.x, by, 0.0042, gray(205));
  // Einschaltsymbol
  const ctx = s.color;
  ctx.strokeStyle = '#25282c';
  ctx.lineWidth = 0.0005;
  ctx.beginPath();
  ctx.arc(STATUS_LED.x, by, 0.0019, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + Math.PI * 2);
  ctx.moveTo(STATUS_LED.x, by - 0.0024);
  ctx.lineTo(STATUS_LED.x, by - 0.0008);
  ctx.stroke();
  // USB hochkant
  fill(s, 0.0405, 0.0055, 0.0048, 0.0125, '#a7adb5', 150, 0.0005);
  fill(s, 0.0412, 0.0062, 0.0034, 0.0111, '#0b0c0e', 20);
  fill(s, 0.0422, 0.0068, 0.0014, 0.0099, '#2e6fd8');
}

// ---------- NAS (#48): Festplatten-Schächte vorn ----------

// Lage der Festplatten-Schächte einer NAS (type.bays: 4 bzw. 12) auf der Frontplatte w × h, Flächenkoordinaten (oben
// links): [{ x, y, w, h }], Reihenfolge wie die Schächte bay0 … (Reihen von oben nach unten, je Reihe von links –
// wie im offenen Server auf der Werkbank, models/server-parts.js). 4 Spalten, je Reihe 4 Schächte; alle Schächte gleich
// groß, damit die Platten (models/nas-front.js) überall gleich aussehen.
export const NAS_BAY = { x0: 0.052, pitch: 0.085, w: 0.0842, h: 0.04 };
export function nasBayRects(type, w, h) {
  const n = type.bays ?? 0;
  const cols = Math.min(4, n);
  const rows = cols ? Math.ceil(n / cols) : 0;
  const rowH = (h - 0.008) / Math.max(1, rows);
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { x: NAS_BAY.x0 + col * NAS_BAY.pitch, y: 0.004 + row * rowH + (rowH - NAS_BAY.h) / 2, w: NAS_BAY.w, h: NAS_BAY.h };
  });
}

// Leerer Schacht: dunkle Öffnung mit Führungsschienen oben und unten, hinten der Stecker der Rückwandplatine, links
// klein die Schachtnummer. Eine eingesetzte Platte (eigenes Mesh) deckt die Öffnung ab.
function emptyBay(s, r, number) {
  fill(s, r.x, r.y, r.w, r.h, '#07080a', 25, 0.0008);
  edge(s, r.x, r.y, r.w, r.h, false);
  for (const y of [r.y + 0.0012, r.y + r.h - 0.0032]) fill(s, r.x + 0.002, y, r.w - 0.004, 0.002, '#3a3e45', 70);
  fill(s, r.x + r.w / 2 - 0.009, r.y + r.h / 2 - 0.003, 0.018, 0.006, '#1b1d21', 45, 0.0005);
  fill(s, r.x + r.w / 2 - 0.0075, r.y + r.h / 2 - 0.0012, 0.015, 0.0024, '#7c6a2e', 50); // Kontakte
  text(s, String(number), r.x + 0.0035, r.y + r.h / 2, 0.0042, '#6d737b', { align: 'center' });
}

// NAS: helles Orange, links Bedienfeld, 4 Spalten Festplatten-Schächte (leer gezeichnet), rechts Lüftung und Typenschild
function nasFront(s, type, unitH) {
  const base = css(type.color ?? 0xffb366);
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, 7);
  ears(s, unitH, type.units, base);
  controls(s);
  const rects = nasBayRects(type, s.w, s.h);
  // Schachtkäfig: etwas dunklerer Rahmen um alle Schächte
  const left = rects[0].x - 0.0025;
  const top = Math.min(...rects.map((r) => r.y)) - 0.0025;
  const right = Math.max(...rects.map((r) => r.x + r.w)) + 0.0025;
  const bottom = Math.max(...rects.map((r) => r.y + r.h)) + 0.0025;
  fill(s, left, top, right - left, bottom - top, shade(base, 0.82), 110, 0.0015);
  edge(s, left, top, right - left, bottom - top, false);
  rects.forEach((r, i) => emptyBay(s, r, i + 1));
  // Rechts: Lüftungslöcher, Typenschild und darunter die Zahl der Schächte
  const vx = right + 0.005;
  const end = s.w - EAR - 0.003;
  const bw = Math.min(0.05, end - vx);
  const bh = Math.min(0.012, s.h * 0.32);
  const vw = end - vx - bw - 0.004;
  if (vw > 0.01) {
    fill(s, vx, 0.004, vw, s.h - 0.008, shade(base, 0.85), 110, 0.001);
    perforate(s, vx + 0.0015, 0.0055, vw - 0.003, s.h - 0.011, { shape: 'round', size: 0.0011, pitch: 0.0032 });
  }
  badge(s, end - bw, s.h / 2 - bh / 2, bw, bh, type.name.toUpperCase(), '#17181b', base);
  text(s, `${type.bays} × 3,5"`, end - bw / 2, s.h / 2 + bh / 2 + 0.005, 0.0036, shade(base, 0.45), { align: 'center' });
}

// Server: Laufwerke links, rechts Lüftungsgitter und Typenschild; GPU-Server (type.gpu, auch der KI-GPU-Server in
// Serienfarbe) mit großem Lüftergitter. NAS (type.bays) haben eine eigene Front mit Festplatten-Schächten.
function serverFront(s, type, unitH) {
  if (type.bays) {
    nasFront(s, type, unitH);
    return;
  }
  const base = type.color ? css(type.color) : '#2a2d33';
  const colors = type.color ? { tray: '#1e2024', accent: '#2c2f34' } : { tray: '#3a3e45', accent: '#3d86d8' };
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, type.color ? 7 : 10);
  ears(s, unitH, type.units, base);
  controls(s);
  const x0 = 0.052;
  const right = s.w - EAR - 0.003;
  let bayEnd;
  if (type.gpu) {
    // Oben 8 Laufwerke und Typenschild, darunter das Gitter vor drei großen Lüftern
    for (let i = 0; i < 8; i++) driveBay(s, x0 + i * 0.03, 0.003, 0.0292, 0.036, true, colors, i < 6);
    const bx = x0 + 8 * 0.03 + 0.008;
    fill(s, bx, 0.006, right - bx, 0.03, '#141619', 140, 0.001);
    edge(s, bx, 0.006, right - bx, 0.03, true);
    text(s, type.name.toUpperCase(), bx + 0.006, 0.016, 0.0085, '#e2e5ea');
    fill(s, bx + 0.006, 0.0245, 0.05, 0.0016, type.color ? shade(base, 1.35) : colors.accent); // Zierleiste in Serienfarbe
    for (let i = 0; i < 4; i++) {
      led(s, bx + 0.012 + i * 0.022, 0.0305, 0.0011, GREEN);
      text(s, `GPU${i + 1}`, bx + 0.015 + i * 0.022, 0.0305, 0.0028, '#8d939b');
    }
    const gy = 0.044;
    const gh = s.h - gy - 0.004;
    const gx = EAR + 0.004;
    const gw = s.w - 2 * EAR - 0.008;
    fill(s, gx, gy, gw, gh, shade(base, 1.12), 140, 0.0015);
    edge(s, gx, gy, gw, gh, false);
    const r = Math.min(gh * 0.46, 0.066);
    // Drehende Lüfter ohne eigenes Schutzgitter, davor dasselbe Wabengitter als Platte mit echten Löchern
    for (let i = 0; i < 3; i++) s.fans.push({ x: gx + gw * (i + 0.5) / 3, y: gy + gh / 2, r, guard: false });
    const holes = { shape: 'hex', size: 0.0031, pitch: 0.0072 };
    s.grilles.push({ x: gx + 0.003, y: gy + 0.003, w: gw - 0.006, h: gh - 0.006, holes, color: shade(base, 1.12) });
    perforate(s, gx + 0.003, gy + 0.003, gw - 0.006, gh - 0.006, {
      shape: 'hex', size: 0.0031, pitch: 0.0072,
      behind: (ctx) => {
        ctx.fillStyle = '#060708';
        ctx.fillRect(gx, gy, gw, gh);
        for (let i = 0; i < 3; i++) fan(ctx, gx + gw * (i + 0.5) / 3, gy + gh / 2, r);
      },
    });
    return;
  }
  if (type.web) {
    // Website-Server (#54): zwei 3,5-Zoll-Laufwerke, daneben ein dunkles Schild „WWW“ mit Leuchten für HTTP, SSL, DNS
    const rh = s.h - 0.006;
    for (let c = 0; c < 2; c++) driveBay(s, x0 + c * 0.085, 0.003, 0.0842, rh - 0.0008, false, colors, c === 0);
    const px = x0 + 2 * 0.085 + 0.006;
    const pw = 0.1;
    const py = 0.004;
    const ph = s.h - 0.008;
    fill(s, px, py, pw, ph, '#0d1620', 140, 0.0015);
    edge(s, px, py, pw, ph, false);
    text(s, 'WWW', px + 0.006, py + ph / 2, Math.min(ph * 0.55, 0.011), '#7fd3ff', { glow: true, weight: 800 });
    for (const [i, [name, color]] of [['HTTP', GREEN], ['SSL', GREEN], ['DNS', BLUE]].entries()) {
      const lx = px + 0.052 + i * 0.016;
      led(s, lx, py + ph * 0.36, 0.0011, color);
      text(s, name, lx, py + ph * 0.74, Math.min(ph * 0.22, 0.0028), '#8d939b', { align: 'center' });
    }
    bayEnd = px + pw;
  } else if (type.drives === 'small' || (type.units === 1 && !type.color)) {
    // 8 × 2,5 Zoll hochkant, eine Reihe je Höheneinheit
    const rows = type.units;
    const rh = (s.h - 0.006) / rows;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < 8; i++) driveBay(s, x0 + i * 0.03, 0.003 + r * rh, 0.0292, rh - 0.0008, true, colors, (i + r) % 3 !== 2);
    }
    bayEnd = x0 + 8 * 0.03;
  } else {
    // 3,5 Zoll quer: 4 Spalten, bei 2 HE drei Reihen
    const rows = type.units >= 2 ? 3 : 1;
    const rh = (s.h - 0.006) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 4; c++) driveBay(s, x0 + c * 0.085, 0.003 + r * rh, 0.0842, rh - 0.0008, false, colors, (r + c) % 3 !== 1);
    }
    bayEnd = x0 + 4 * 0.085;
  }
  // Rechts: Lüftungslöcher und Typenschild
  const vx = bayEnd + 0.005;
  const bw = Math.min(0.05, right - vx);
  const bh = Math.min(0.012, s.h * 0.32);
  const vw = right - vx - bw - 0.004;
  if (vw > 0.01) {
    fill(s, vx, 0.004, vw, s.h - 0.008, shade(base, 0.85), 110, 0.001);
    perforate(s, vx + 0.0015, 0.0055, vw - 0.003, s.h - 0.011, { shape: 'round', size: 0.0011, pitch: 0.0032 });
  }
  // Schrift in der Reihenfarbe; bei dunklen Reihenfarben (z. B. RISC nachtblau) stark aufgehellt, sonst unlesbar
  const label = !type.color ? '#d6dae0' : isDark(base) ? shade(base, 1.8) : base;
  badge(s, right - bw, s.h / 2 - bh / 2, bw, bh, type.name.toUpperCase(), type.color ? '#17181b' : '#15171a', label);
}

// Switch: Name, Systemleuchten, Konsolenbuchse, Statusleuchten je Port (die Buchsen selbst sind hinten), Lüftung
function switchFront(s, type, unitH) {
  const base = '#1c1e22';
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, 9);
  ears(s, unitH, type.units, base);
  text(s, type.name.toUpperCase(), 0.026, 0.0095, 0.0048, '#c9cdd3');
  for (const [i, name] of ['PWR', 'SYS'].entries()) {
    led(s, 0.03 + i * 0.016, 0.022, 0.0013, GREEN);
    text(s, name, 0.03 + i * 0.016, 0.029, 0.0028, '#80868e', { align: 'center' });
  }
  fill(s, 0.064, 0.016, 0.014, 0.011, '#5f8fc6', 150, 0.001);
  fill(s, 0.0655, 0.0172, 0.011, 0.0086, '#0b0c0e', 20);
  text(s, 'CONSOLE', 0.071, 0.0335, 0.0026, '#80868e', { align: 'center' });
  const rows = type.ports > 12 ? 2 : 1;
  const cols = Math.ceil(type.ports / rows);
  const px = 0.09;
  const pitch = 0.0135;
  fill(s, px - 0.003, 0.004, cols * pitch + 0.004, s.h - 0.008, '#121316', 110, 0.001);
  for (let i = 0; i < type.ports; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = px + c * pitch;
    const y = rows === 2 ? 0.0085 + r * 0.019 : s.h / 2 - 0.004;
    text(s, `${i + 1}`, x + 0.0035, y, 0.0028, '#8d939b', { align: 'center' });
    led(s, x + 0.0015, y + 0.006, 0.0011, GREEN, false);
    led(s, x + 0.0055, y + 0.006, 0.0011, AMBER, false);
  }
  const vx = px + cols * pitch + 0.008;
  const vw = s.w - EAR - 0.004 - vx;
  fill(s, vx, 0.005, vw, s.h - 0.01, shade(base, 0.8), 110, 0.001);
  perforate(s, vx + 0.0015, 0.0065, vw - 0.003, s.h - 0.013, { shape: 'round', size: 0.0011, pitch: 0.0032 });
}

// Firewall: rote Blende, Name mit Portzahl, Leuchten, Display mit Tasten, Port-LEDs, Lüftungsschlitze
function firewallFront(s, type, unitH) {
  const base = '#a8291f';
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, 8);
  ears(s, unitH, type.units, base);
  const ix = EAR + 0.004;
  const iw = s.w - 2 * EAR - 0.008;
  fill(s, ix, 0.004, iw, s.h - 0.008, '#1a1b1e', 120, 0.0015);
  edge(s, ix, 0.004, iw, s.h - 0.008, false);
  // Groß nur „FIREWALL“, die Portzahl aus dem Namen klein rechts daneben (der volle Typname wäre zu lang für den Platz
  // vor dem Display). portsLabel statt ports: die 8er hat 9 Buchsen (1 × WAN + 8 × LAN), heißt aber „8 Ports“
  text(s, 'FIREWALL', ix + 0.006, 0.0135, 0.0075, '#f2f2f0');
  text(s, `${type.portsLabel ?? type.ports} PORTS`, ix + 0.076, 0.0152, 0.0038, '#c9cdd3', { align: 'right' });
  fill(s, ix + 0.006, 0.0195, 0.07, 0.0014, base);
  for (const [i, [name, color]] of [['PWR', GREEN], ['ALARM', AMBER], ['HA', GREEN]].entries()) {
    led(s, ix + 0.009 + i * 0.017, 0.0275, 0.0012, color, i < 2);
    text(s, name, ix + 0.009 + i * 0.017, 0.034, 0.0026, '#8d939b', { align: 'center' });
  }
  // Display
  const dx = ix + 0.09;
  fill(s, dx - 0.002, 0.008, 0.074, 0.0265, '#0b0c0e', 70, 0.001);
  fill(s, dx, 0.01, 0.07, 0.0225, '#062b28', 100);
  for (const ctx of [s.glow]) {
    ctx.fillStyle = '#04201d';
    ctx.fillRect(dx, 0.01, 0.07, 0.0225);
  }
  text(s, 'SECURE', dx + 0.004, 0.0165, 0.0062, '#5ff2d8', { glow: true });
  text(s, 'WAN ▲ 1.2G', dx + 0.004, 0.0265, 0.0042, '#3cc8b2', { glow: true, weight: 600 });
  for (let i = 0; i < 4; i++) {
    fill(s, dx + 0.08 + (i % 2) * 0.008, 0.0105 + Math.floor(i / 2) * 0.0115, 0.0065, 0.0085, '#3a3e45', 190, 0.001);
    edge(s, dx + 0.08 + (i % 2) * 0.008, 0.0105 + Math.floor(i / 2) * 0.0115, 0.0065, 0.0085, true);
  }
  // Je Port eine Status-LED mit Beschriftung (WAN, dann LAN 1 …)
  const px = dx + 0.104;
  const pitch = 0.009;
  fill(s, px - 0.002, 0.006, type.ports * pitch + 0.004, s.h - 0.012, '#121316', 110, 0.001);
  for (let i = 0; i < type.ports; i++) {
    const x = px + i * pitch + pitch / 2;
    text(s, i ? `${i}` : 'WAN', x, 0.0135, 0.0026, '#8d939b', { align: 'center' });
    led(s, x, 0.0215, 0.0011, i ? GREEN : BLUE, false);
  }
  const vx = px + type.ports * pitch + 0.008;
  perforate(s, vx, 0.008, ix + iw - 0.004 - vx, s.h - 0.016, { shape: 'slot', size: 0.0016, pitch: 0.0085 });
}

// Patchpanel: geschlossene Blende – die Buchsen sitzen nur hinten (dort wird verkabelt). Vorn Name, Beschriftungsfeld
// mit den Portnummern in Sechsergruppen und der Hinweis, dass die Anschlüsse hinten sind
function patchFront(s, type, unitH) {
  const base = '#17191c';
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, 9);
  ears(s, unitH, type.units, base);
  text(s, type.name.toUpperCase(), EAR + 0.006, s.h / 2, 0.0048, '#c9cdd3');
  // Eingelassenes Feld in der Mitte mit Lochblech
  const fx = EAR + 0.08;
  const fw = s.w - 2 * EAR - 0.16;
  fill(s, fx, 0.004, fw, s.h - 0.008, shade(base, 0.8), 110, 0.001);
  edge(s, fx, 0.004, fw, s.h - 0.008, false);
  perforate(s, fx + 0.002, s.h * 0.55, fw - 0.004, s.h * 0.45 - 0.006, { shape: 'round', size: 0.0009, pitch: 0.0028 });
  const pitch = Math.min(0.0162, (fw - 0.01) / (type.ports + Math.ceil(type.ports / 6)));
  const gap = pitch;
  const groups = Math.ceil(type.ports / 6);
  const total = type.ports * pitch + (groups - 1) * gap;
  const x0 = fx + fw / 2 - total / 2;
  for (let g = 0; g < groups; g++) {
    const gx = x0 + g * (6 * pitch + gap);
    fill(s, gx - 0.0008, 0.008, 6 * pitch - 0.0004, 0.0085, '#e9e8e2', 132, 0.0005); // Beschriftungsfeld
  }
  for (let i = 0; i < type.ports; i++) {
    const x = x0 + i * pitch + Math.floor(i / 6) * gap;
    text(s, `${i + 1}`, x + pitch / 2 - 0.001, 0.0123, 0.0036, '#2a2c30', { align: 'center' });
  }
  text(s, 'ANSCHLÜSSE HINTEN ↻', s.w - EAR - 0.006, s.h / 2, 0.0036, '#8d939b', { align: 'right' });
}

// ---------- Rückwände ----------

// Netzteil mit Lüfter, Kaltgerätebuchse, Leuchte und Griff
function psu(s, x, y, w, h) {
  fill(s, x, y, w, h, '#24272b', 150, 0.001);
  edge(s, x, y, w, h, true);
  const r = Math.min(h * 0.4, 0.016);
  fanGuard(s, x + r + 0.004, y + h / 2, r);
  powerInlet(s, x + 2 * r + 0.009, y + h / 2 - 0.006);
  led(s, x + 2 * r + 0.031, y + 0.005, 0.0011, GREEN);
  fill(s, x + w - 0.007, y + 0.003, 0.004, h - 0.006, '#6d737b', 200, 0.0015);
  edge(s, x + w - 0.007, y + 0.003, 0.004, h - 0.006, true);
}

// PCIe-Blende; gpu: mit Bildschirmausgängen
function slotCover(s, x, y, w, h, gpu) {
  fill(s, x, y, w, h, '#5c626a', 160);
  edge(s, x, y, w, h, true);
  fill(s, x - 0.001, y, w + 0.002, 0.004, '#6a7078', 175);
  if (gpu) {
    for (let i = 0; i < 3; i++) fill(s, x + w / 2 - 0.0035, y + 0.008 + i * 0.012, 0.007, 0.0085, '#0b0c0e', 25, 0.0008);
    perforate(s, x + 0.003, y + 0.045, w - 0.006, h - 0.05, { shape: 'hex', size: 0.0014, pitch: 0.0036 });
  } else {
    perforate(s, x + 0.003, y + 0.007, w - 0.006, h - 0.012, { shape: 'slot', size: 0.0012, pitch: 0.0072 });
  }
}

// Rückwand: Port-Umrandung (die Buchsen selbst sind Meshes), je nach Gerät Netzteile, Erweiterungskarten, Lüfter
function backPanel(s, type, ports, unitH) {
  const base = '#33373d';
  fill(s, 0, 0, s.w, s.h, base, 128);
  grain(s.color, 10);
  const rows = type.ports > 12 ? 2 : 1;
  for (const [i, p] of ports.entries()) {
    fill(s, p.x - 0.0085, p.y - 0.0072, 0.017, 0.0144, '#17191c', 100, 0.0008);
    if (rows === 1 && p.y - 0.011 > 0.002) {
      const name = type.kind === 'firewall' ? (i ? `LAN${i}` : 'WAN') : `${i + 1}`;
      text(s, name, p.x, p.y - 0.0105, 0.0032, '#aab0b8', { align: 'center' });
    }
  }
  const portsEnd = Math.max(...ports.map((p) => p.x)) + 0.012;
  const vents = (x, y, w, h) => w > 0.008 && h > 0.006 && perforate(s, x, y, w, h, { shape: 'round', size: 0.0011, pitch: 0.0032 });
  if (type.kind === 'server') {
    const py = ports[0].y;
    // USB und VGA neben den Netzwerkbuchsen
    for (let i = 0; i < 2; i++) {
      fill(s, portsEnd + 0.002, py - 0.006 + i * 0.0068, 0.0125, 0.0052, '#a7adb5', 150, 0.0005);
      fill(s, portsEnd + 0.0028, py - 0.0053 + i * 0.0068, 0.0109, 0.0038, '#0b0c0e', 20);
    }
    fill(s, portsEnd + 0.018, py - 0.0045, 0.017, 0.009, '#2a55a8', 150, 0.002);
    fill(s, portsEnd + 0.0195, py - 0.003, 0.014, 0.006, '#0b0c0e', 20, 0.002);
    const psuW = 0.068;
    const psuH = Math.min(s.h - 0.006, 0.038);
    const psuLeft = s.w - 0.004 - 2 * psuW - 0.003;
    for (let i = 0; i < 2; i++) psu(s, s.w - 0.004 - (i + 1) * psuW - i * 0.003, s.h - 0.003 - psuH, psuW, psuH);
    vents(psuLeft, 0.003, s.w - 0.004 - psuLeft, s.h - psuH - 0.009);
    // Erweiterungskarten über bzw. neben den Anschlüssen
    const gpu = !!type.gpu;
    const n = gpu ? 8 : type.units >= 2 ? 4 : 2;
    const cx = portsEnd + 0.04;
    const cy = 0.003;
    const ch = type.units >= 2 ? s.h - unitH - 0.004 : s.h - 0.006;
    for (let i = 0; i < n; i++) slotCover(s, cx + i * 0.021, cy, 0.019, ch, gpu);
    vents(cx + n * 0.021 + 0.003, 0.004, psuLeft - cx - n * 0.021 - 0.008, s.h - 0.008);
    if (type.units >= 2) vents(0.004, 0.004, cx - 0.008, py - 0.011);
  } else if (type.kind === 'patch') {
    fill(s, portsEnd + 0.01, s.h / 2 - 0.0015, s.w - portsEnd - 0.02, 0.003, '#6d737b', 190, 0.0015); // Kabelbinderleiste
  } else {
    // Switch und Firewall: Netzteilbuchse, zwei Lüfter, dazwischen Lüftungslöcher
    const r = Math.min(s.h * 0.38, 0.016);
    powerInlet(s, s.w - 0.024, s.h / 2 - 0.006);
    for (let i = 0; i < 2; i++) fanGuard(s, s.w - 0.04 - r - i * (2 * r + 0.006), s.h / 2, r);
    const vx = portsEnd + 0.008;
    vents(vx, 0.005, s.w - 0.046 - 4 * r - 0.006 - vx, s.h - 0.01);
  }
}

// ---------- Materialien ----------

function material(s, options) {
  const texture = (ctx, srgb) => {
    const t = new THREE.CanvasTexture(ctx.canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const result = new THREE.MeshStandardMaterial({
    map: texture(s.color, true),
    bumpMap: texture(s.bump, false),
    bumpScale: 1.5,
    emissive: s.lit ? 0xffffff : 0x000000,
    emissiveMap: s.lit ? texture(s.glow, true) : null,
    emissiveIntensity: 2.5,
    roughness: 0.55,
    metalness: 0.3,
    ...options,
  });
  result.userData.fans = s.fans; // für die drehenden Lüfter (models/server-hardware.js)
  result.userData.grilles = s.grilles;
  return result;
}

const FRONTS = { server: serverFront, switch: switchFront, firewall: firewallFront, patch: patchFront };
const fronts = new Map();
const backs = new Map();
const bodies = new Map();

// Frontplatte (w × h, mit Ohren) eines Gerätetyps; unitH: Höhe einer HE
export function deviceFrontMaterial(type, w, h, unitH) {
  if (!fronts.has(type.id)) {
    const s = surface(w, h);
    (FRONTS[type.kind] ?? serverFront)(s, type, unitH);
    fronts.set(type.id, material(s));
  }
  return fronts.get(type.id);
}

// Rückwand (w × h); ports: Mitte der Buchsen in Flächenkoordinaten (von hinten gesehen, oben links)
export function deviceBackMaterial(type, w, h, unitH, ports) {
  if (!backs.has(type.id)) {
    const s = surface(w, h);
    backPanel(s, type, ports, unitH);
    backs.set(type.id, material(s, { metalness: 0.4 }));
  }
  return backs.get(type.id);
}

// Gehäuseblech (Deckel, Boden, Seiten) in color, mit feinen Schleifspuren: blank verzinkt bzw. lackiert (painted)
let sheetTexture = null;
export function chassisMaterial(color, painted = false) {
  if (!sheetTexture) {
    const ctx = surface(0.25, 0.25).color;
    ctx.fillStyle = gray(225);
    ctx.fillRect(0, 0, 0.25, 0.25);
    grain(ctx, 26, 14);
    sheetTexture = new THREE.CanvasTexture(ctx.canvas);
    sheetTexture.colorSpace = THREE.SRGBColorSpace;
    sheetTexture.anisotropy = 8;
  }
  const key = `${color}|${painted}`;
  if (!bodies.has(key)) {
    bodies.set(key, new THREE.MeshStandardMaterial({
      color, map: sheetTexture, bumpMap: sheetTexture, bumpScale: 0.4, roughness: painted ? 0.6 : 0.45, metalness: painted ? 0.15 : 0.6,
    }));
  }
  return bodies.get(key);
}

// Gitterplatte vor drehenden Lüftern: Fläche in der Farbe des Gitters, Löcher durchsichtig – genau dort, wo sie auch
// auf der Frontblende sitzen. Ursprung der Fläche oben links bei (grille.x, grille.y).
const grilles = new Map();
export function grilleMaterial(grille) {
  const key = JSON.stringify(grille);
  if (!grilles.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(grille.w * PX);
    canvas.height = Math.ceil(grille.h * PX);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = grille.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    grain(ctx, 10);
    ctx.setTransform(canvas.width / grille.w, 0, 0, canvas.height / grille.h, 0, 0);
    ctx.translate(-grille.x, -grille.y);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(holePath(grille.x, grille.y, grille.w, grille.h, grille.holes));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    grilles.set(key, new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.55, metalness: 0.3 }));
  }
  return grilles.get(key);
}
