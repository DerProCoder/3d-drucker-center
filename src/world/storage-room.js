// Abstellraum hinter der Südwand: Keller-Look mit Betonboden, Kalksandsteinwänden, Leuchtstoffröhre.
// Gekaufte Spulen liegen im Schwerlastregal, Drucker stehen als Karton in der Lieferzone, Holzplatten für den Laser
// liegen auf einer Palette an der Rückwand.
import * as THREE from 'three';
import { box } from '../models/mesh-helpers.js';
import { SHEET_MM, WOODS, filamentById } from '../core/catalog.js';
import { WET, spoolLabel } from '../core/economy.js';
import { createSpool, createSpoolBatch } from '../models/spool.js';
import { createPrinterBox } from '../models/printer-box.js';
import { furnitureSize } from '../models/furniture.js';
import { SPOOLS_PER_SHELF_LEVEL } from '../core/upgrades.js';
import { stackBoxes } from '../core/storage-stack.js';
import {
  ROOM_SIZE, WALL_THICKNESS, STORAGE_DOOR, createWallGeometry,
} from './room.js';
import { canvasTexture, speckle, rand } from '../models/canvas-texture.js';
import { enableShadows } from './util.js';
import { mergeStatic } from '../models/merge-static.js';

// Innenmaße (Welt-Koordinaten)
const X0 = -8;
const X1 = -2;
const Z0 = ROOM_SIZE / 2 + WALL_THICKNESS; // Innenseite der gemeinsamen Wand
const Z1 = 14.7;
const HEIGHT = 2.6;
const CX = (X0 + X1) / 2;
const CZ = (Z0 + Z1) / 2;
const W = X1 - X0;
const D = Z1 - Z0;
export const STORAGE_ROOM = { x0: X0, x1: X1, z0: Z0, z1: Z1, height: HEIGHT }; // Innenmaße, z. B. für die Fassade

// Spulen stehen nebeneinander, farbige Wicklung zeigt in den Raum
const SHELF = {
  x0: -8, x1: -7.5, z0: 10.95, z1: 13.65,
  levels: [0.15, 0.62, 1.09, 1.56], perLevel: SPOOLS_PER_SHELF_LEVEL, spoolX: -7.66, firstZ: 11.08, spacing: 0.115,
};
export const SHELF_CAPACITY = SHELF.levels.length * SHELF.perLevel; // alle Ebenen ausgebaut (siehe upgrades.js)

// Trockenschrank zwischen Tür-Wand und Regal
const DRYER = {
  x: -7.76, z: 10.6, w: 0.42, d: 0.5, h: 0.95,
  collider: { minX: -7.97, maxX: -7.55, minZ: 10.35, maxZ: 10.85 },
};

// Holzpalette an der Rückwand: ein Stapel Holzplatten pro Holzart (aus dem Holzshop) nebeneinander
const WOOD_PALLET = {
  x: -5.4, z: 14.35, w: 1.15, d: 0.42, h: 0.12, spacing: 0.37, sheetH: 0.004,
  collider: { minX: -6.0, maxX: -4.8, minZ: 14.12, maxZ: 14.7 },
};

const ZONE = { x0: -3.1, x1: -2.05, z0: 10.55, z1: 14.2 };
const BOX_X = (ZONE.x0 + ZONE.x1) / 2;
// Ein Kartonstapel je Platz (core/storage-stack.js), jeder bis knapp unter das Rohr an der Decke (Unterkante 2,41 m)
const BOX_SPOTS_Z = [11.0, 11.9, 12.8, 13.7];
const BOX_CEILING = HEIGHT - 0.2;

// Karton für einen Drucker ({ model }) bzw. für Einrichtung ({ type }); die Höhe wird je Modell bzw. Typ gemerkt
// (auch für das Keller-Lager, world/basement-storage.js)
export const makeCrate = (entry) => (entry.model ? createPrinterBox(entry.model) : createPrinterBox(entry.type, furnitureSize(entry.type), 'Einrichtung'));
const crateHeights = new Map();
export function crateHeight(entry) {
  const key = entry.model ? `printer:${entry.model.id}` : `furniture:${entry.type.id}`;
  if (!crateHeights.has(key)) crateHeights.set(key, makeCrate(entry).userData.size.h);
  return crateHeights.get(key);
}
const stackCrates = (entries) => stackBoxes(entries.map((entry) => ({ entry, h: crateHeight(entry) })), BOX_CEILING, BOX_SPOTS_Z.length);

// ---------- Texturen ----------

function drawConcrete(base) {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Wolkige Flecken
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = rand(20, 90);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.6;
      g.addColorStop(0, dark ? 'rgba(40,40,40,0.08)' : 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, w, h, 12000, 0.08);
    // Haarrisse
    ctx.strokeStyle = 'rgba(30,30,30,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 12; s++) {
        x += rand(-12, 12);
        y += rand(4, 14);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
}

// Kalksandstein: 50 × 25 cm Steine im Halbverband (Textur = 2 × 2 m)
function drawBlocks(ctx, w, h) {
  ctx.fillStyle = '#a7a39b';
  ctx.fillRect(0, 0, w, h);
  const bw = w / 4;
  const bh = h / 8;
  const mortar = 3;
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const l = rand(74, 82);
      ctx.fillStyle = `hsl(40, 6%, ${l}%)`;
      ctx.fillRect(col * bw + offset + mortar / 2, row * bh + mortar / 2, bw - mortar, bh - mortar);
    }
  }
  speckle(ctx, w, h, 9000, 0.06);
}

// ---------- Einrichtung ----------

function createShelf() {
  const shelf = new THREE.Group();
  const upright = new THREE.MeshStandardMaterial({ color: 0x2d5fa8, roughness: 0.5, metalness: 0.3 });
  const beam = new THREE.MeshStandardMaterial({ color: 0xe0702a, roughness: 0.5, metalness: 0.3 });
  const board = new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.85 });
  const height = 1.95;
  const length = SHELF.z1 - SHELF.z0;
  const depth = SHELF.x1 - SHELF.x0;
  const cx = (SHELF.x0 + SHELF.x1) / 2;
  const cz = (SHELF.z0 + SHELF.z1) / 2;

  for (const z of [SHELF.z0 + 0.02, cz, SHELF.z1 - 0.02]) {
    for (const x of [SHELF.x0 + 0.02, SHELF.x1 - 0.02]) {
      shelf.add(box(0.04, height, 0.04, upright, x, height / 2, z));
    }
  }
  // Pro Ebene ein Boden mit zwei Traversen – nicht gekaufte Ebenen werden ausgeblendet
  shelf.userData.levels = SHELF.levels.map((level) => {
    const parts = new THREE.Group();
    parts.add(box(depth - 0.04, 0.02, length - 0.04, board, cx, level - 0.01, cz));
    for (const x of [SHELF.x0 + 0.02, SHELF.x1 - 0.02]) {
      parts.add(box(0.03, 0.06, length, beam, x, level - 0.04, cz));
    }
    shelf.add(parts);
    return parts;
  });
  return shelf;
}

// Filament-Trockenschrank: Metallschrank mit Glastür, Heizstab glüht orange, grüne Anzeige
function createDryer() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.45, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc6d8, roughness: 0.05, transparent: true, opacity: 0.35 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 2 });
  const display = new THREE.MeshStandardMaterial({ color: 0x55ff99, emissive: 0x33ff88, emissiveIntensity: 1.5 });
  const { w, d, h } = DRYER;
  // Rückwand, Seiten, Boden, Deckel – die Glastür zeigt in den Raum (+x)
  g.add(box(0.02, h, d, body, -w / 2 + 0.01, h / 2, 0));
  for (const side of [-1, 1]) g.add(box(w, h, 0.02, body, 0, h / 2, side * (d / 2 - 0.01)));
  g.add(box(w, 0.04, d, body, 0, 0.02, 0), box(w, 0.04, d, body, 0, h - 0.02, 0));
  g.add(box(0.01, h - 0.12, d - 0.06, glass, w / 2 - 0.005, h / 2, 0));
  g.add(box(0.012, 0.05, d, body, w / 2 - 0.006, h - 0.045, 0)); // Bedienleiste
  g.add(box(0.004, 0.022, 0.06, display, w / 2 + 0.002, h - 0.045, -0.1));
  g.add(box(0.3, 0.012, 0.012, glow, 0, 0.07, 0)); // Heizstab
  // Zwei Fachböden mit je einer Spule, damit man sieht, wofür er da ist
  for (const [y, id] of [[0.3, 'pla-grün'], [0.62, 'pla-rot']]) {
    g.add(box(w - 0.04, 0.01, d - 0.04, body, 0, y - 0.005, 0));
    const spool = createSpool(filamentById(id));
    spool.position.set(0, y + 0.1, 0);
    spool.rotation.y = Math.PI / 2;
    g.add(spool);
  }
  return g;
}

function createDoorLeaf() {
  const door = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8590, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.5 });
  const leafW = STORAGE_DOOR.w - 0.04;
  const leafH = STORAGE_DOOR.h - 0.05;
  // Offen um 90° in den Abstellraum geschwenkt: Scharnier an der Westseite der Öffnung
  door.add(box(0.045, leafH, leafW, steel, 0, leafH / 2 + 0.01, leafW / 2));
  door.add(box(0.05, 0.25, leafW - 0.06, dark, 0, 0.15, leafW / 2)); // Trittblech
  for (const side of [-1, 1]) {
    door.add(box(0.02, 0.02, 0.03, dark, side * 0.035, 1.05, leafW - 0.08));   // Drückerhals
    door.add(box(0.02, 0.02, 0.13, dark, side * 0.05, 1.05, leafW - 0.13));    // Drücker
  }
  door.position.set(STORAGE_DOOR.x - STORAGE_DOOR.w / 2 + 0.03, 0, Z0);
  return door;
}

function createFluorescentLamp() {
  const lamp = new THREE.Group();
  lamp.add(box(1.25, 0.05, 0.12, new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5 }), 0, -0.025, 0));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.18, 12), new THREE.MeshBasicMaterial({ color: 0xf4f8ff }));
  tube.rotation.z = Math.PI / 2;
  tube.position.y = -0.07;
  lamp.add(tube);
  const light = new THREE.PointLight(0xe6eeff, 5, 9, 2);
  light.position.y = -0.25;
  lamp.add(light);
  return lamp;
}

function floorText(text, width) {
  const texture = canvasTexture(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#e8c21e';
    ctx.font = '700 72px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
  const geo = new THREE.PlaneGeometry(width, width * 96 / 512);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(Math.PI); // lesbar, wenn man von der Tür aus hineinschaut
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8 }));
}

// Holzpalette: Bretter mit Klötzen dazwischen, Ursprung unten in der Mitte
function createPallet() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
  const { w, d, h } = WOOD_PALLET;
  for (const sx of [-1, 0, 1]) group.add(box(0.1, h - 0.04, d, wood, sx * (w / 2 - 0.05), (h - 0.04) / 2, 0));
  for (let i = 0; i < 5; i++) group.add(box(w, 0.02, 0.07, wood, 0, h - 0.01, -d / 2 + 0.035 + i * ((d - 0.07) / 4)));
  return group;
}

// Schild vor einem Holzstapel: Holzart und wie viele Platten noch da sind
function woodSign(wood, count) {
  const texture = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = wood.hex;
    ctx.fillRect(0, 0, 18, h);
    ctx.fillStyle = '#2a2a2a';
    ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(wood.color, 30, 32);
    ctx.font = '500 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${count} Platte${count === 1 ? '' : 'n'}`, 30, 70);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }));
  sign.rotation.set(-0.2, Math.PI, 0); // fast aufrecht, lesbar von der Tür aus
  return sign;
}

// ---------- Raum ----------

// upgrades: Ausbau-Stand – bestimmt, wie viele Regalebenen es gibt
export function createStorageRoom({ economy, carry, collision, upgrades }) {
  const group = new THREE.Group();
  // Kaufen geht nur, solange der neue Karton noch auf einen Stapel passt
  economy.storageFits = (entries) => stackCrates(entries).overflow === 0;
  // Kartons ohne Platz aus dem Spielstand (beim Speichern in der Hand, #64) einräumen, sobald der Aufbau fertig ist –
  // dann kennt auch das Keller-Lager die Kartonhöhen (world/basement-storage.js), falls der Abstellraum voll ist
  queueMicrotask(() => {
    if (economy.placeLooseBoxes()) economy.notify();
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 512, drawConcrete('#8e8c87'), W / 2, (D + WALL_THICKNESS) / 2),
    roughness: 0.85,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D + WALL_THICKNESS), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ - WALL_THICKNESS / 2); // reicht bis unter die Türschwelle
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, drawConcrete('#a3a19c'), W / 2, D / 2), roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(CX, HEIGHT, CZ);
  group.add(ceiling);

  // Wände: Kalksandstein, Tür in der Nordwand
  const wallMat = new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, drawBlocks), roughness: 0.95 });
  const walls = [
    { length: W, x: CX, z: Z0, rotY: 0, doors: [{ ...STORAGE_DOOR, x: STORAGE_DOOR.x - CX }] },
    { length: D, x: X0, z: CZ, rotY: Math.PI / 2 },
    { length: D, x: X1, z: CZ, rotY: -Math.PI / 2 },
    { length: W, x: CX, z: Z1, rotY: Math.PI },
  ];
  for (const w of walls) {
    const wall = new THREE.Mesh(createWallGeometry(w.length, HEIGHT, w.doors), wallMat);
    wall.position.set(w.x, 0, w.z);
    wall.rotation.y = w.rotY;
    group.add(wall);
  }

  // Stahlzarge auf der Lagerseite und offene Tür
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.5, metalness: 0.4 });
  const d = STORAGE_DOOR;
  for (const side of [-1, 1]) {
    group.add(box(0.05, d.h + 0.05, 0.03, frameMat, d.x + side * (d.w / 2 + 0.025), (d.h + 0.05) / 2, Z0 + 0.015));
  }
  group.add(box(d.w + 0.1, 0.05, 0.03, frameMat, d.x, d.h + 0.025, Z0 + 0.015));
  group.add(createDoorLeaf());

  // Lichtschalter, Sicherungskasten, Rohre an der Decke
  const plastic = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  group.add(box(0.08, 0.08, 0.015, plastic, d.x + d.w / 2 + 0.25, 1.05, Z0 + 0.008));
  group.add(box(0.1, 0.45, 0.35, new THREE.MeshStandardMaterial({ color: 0xb0b3b6, roughness: 0.6 }), X1 - 0.05, 1.6, Z0 + 0.7));
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.5, metalness: 0.4 });
  const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, D, 16), pipeMat);
  pipe1.rotation.x = Math.PI / 2;
  pipe1.position.set(X1 - 0.15, HEIGHT - 0.15, CZ);
  const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, W, 12), pipeMat);
  pipe2.rotation.z = Math.PI / 2;
  pipe2.position.set(CX, HEIGHT - 0.25, Z1 - 0.15);
  group.add(pipe1, pipe2);

  const lamp = createFluorescentLamp();
  lamp.position.set(CX, HEIGHT, CZ);
  group.add(lamp);

  // Regal für Filamentspulen: Klick mit Spulen in der Hand legt alle zurück
  const shelf = createShelf();
  shelf.userData.interaction = {
    hint: () => {
      if (!carry.hasSpools) return null;
      return carry.spools.length > 1 ? `Linksklick: alle ${carry.spools.length} Spulen ins Regal legen` : 'Linksklick: Spule ins Regal legen';
    },
    action: () => { if (carry.hasSpools) carry.returnToStorage(); },
  };
  group.add(shelf);

  // Holzpalette für die Platten aus dem Holzshop. Klick mit einer Platte in der Hand legt sie zurück.
  const pallet = createPallet();
  pallet.position.set(WOOD_PALLET.x, 0, WOOD_PALLET.z);
  pallet.userData.interaction = {
    hint: () => (carry.sheet ? `Linksklick: ${carry.sheets.length === 1 ? 'Holzplatte' : 'alle Holzplatten'} zurück auf den Stapel legen` : 'Holzpalette – Platten gibt es im Holzshop am PC'),
    action: () => { if (carry.sheet) carry.returnToStorage(); },
  };
  group.add(pallet);

  // Gerümpel in der Ecke: alte, leere Kartons
  const oldCardboard = new THREE.MeshStandardMaterial({ color: 0x9c7a4f, roughness: 0.95 });
  group.add(box(0.5, 0.4, 0.5, oldCardboard, X0 + 0.3, 0.2, Z1 - 0.35));
  const topBox = box(0.4, 0.3, 0.35, oldCardboard, X0 + 0.32, 0.55, Z1 - 0.38);
  topBox.rotation.y = 0.3;
  group.add(topBox);

  // Lieferzone: gelbe Bodenmarkierung, Klick mit Karton in der Hand stellt ihn ab
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8c21e, roughness: 0.7 });
  const zw = ZONE.x1 - ZONE.x0;
  const zd = ZONE.z1 - ZONE.z0;
  const zcz = (ZONE.z0 + ZONE.z1) / 2;
  const stripe = 0.06;
  group.add(
    box(zw, 0.004, stripe, yellow, BOX_X, 0.002, ZONE.z0),
    box(zw, 0.004, stripe, yellow, BOX_X, 0.002, ZONE.z1),
    box(stripe, 0.004, zd, yellow, ZONE.x0, 0.002, zcz),
    box(stripe, 0.004, zd, yellow, ZONE.x1, 0.002, zcz)
  );
  const label = floorText('LIEFERZONE', 0.8);
  label.position.set(BOX_X, 0.005, ZONE.z1 - 0.1); // hinter dem letzten Kartonplatz
  group.add(label);

  const zoneArea = new THREE.Mesh(new THREE.PlaneGeometry(zw, zd), new THREE.MeshBasicMaterial({ visible: false }));
  zoneArea.rotation.x = -Math.PI / 2;
  zoneArea.position.set(BOX_X, 0.01, zcz);
  zoneArea.userData.interaction = {
    hint: () => (carry.printer || carry.furniture ? 'Linksklick: Karton abstellen' : null),
    action: () => { if (carry.printer || carry.furniture) carry.returnToStorage(); },
  };
  group.add(zoneArea);

  enableShadows(group);
  floor.castShadow = false;
  // Decke und Wände halten das Sonnenlicht aus dem Keller fern
  ceiling.castShadow = true;
  mergeStatic(group, { cell: 3 }); // Wände, Regal, Rohre … pro Material zusammenfassen

  // Kollision: Wände, Regal, Tür, Gerümpel
  const t = WALL_THICKNESS;
  for (const b of [
    { minX: X0 - t, maxX: X0, minZ: Z0, maxZ: Z1 + t },
    { minX: X1, maxX: X1 + t, minZ: Z0, maxZ: Z1 + t },
    { minX: X0 - t, maxX: X1 + t, minZ: Z1, maxZ: Z1 + t },
    { minX: SHELF.x0, maxX: SHELF.x1, minZ: SHELF.z0, maxZ: SHELF.z1 },
    { minX: d.x - d.w / 2, maxX: d.x - d.w / 2 + 0.06, minZ: Z0, maxZ: Z0 + d.w },
    { minX: X0, maxX: X0 + 0.6, minZ: Z1 - 0.65, maxZ: Z1 },
    WOOD_PALLET.collider,
  ]) collision.addBox(b);

  // ---------- Inhalt: Spulen und Kartons, wird bei jeder Änderung neu aufgebaut ----------

  const contents = new THREE.Group();
  group.add(contents);

  // Trockenschrank (Zubehör), erscheint nach dem Kauf vor dem Regal
  const dryer = createDryer();
  dryer.position.set(DRYER.x, 0, DRYER.z);
  dryer.visible = false;
  mergeStatic(dryer);
  dryer.userData.interaction = {
    hint: () => (dryer.visible ? 'Trockenschrank läuft – Spulen im Regal bleiben trocken' : null),
  };
  group.add(dryer);

  // Spulen und Kartons haben feste Plätze: Es wird genau das genommen, was angeklickt wurde,
  // und nichts rutscht nach.
  function spoolInteraction(spool) {
    return {
      hint: () => {
        if (carry.printer || carry.furniture) return 'Hände voll – erst den Karton abstellen (Q)';
        if (carry.nozzle) return 'Hände voll – erst die Ersatzdüse zurücklegen (Q)';
        if (carry.sheet) return 'Hände voll – erst die Holzplatten zurücklegen (Q)';
        if (!carry.canTakeSpool) return `Hände voll – höchstens ${carry.maxSpools} Spulen (Q legt alle zurück)`;
        const wet = spool.moisture >= WET ? ' 💧 feucht – lieber erst trocknen' : '';
        const count = ` · danach ${carry.spools.length + 1}/${carry.maxSpools} in der Hand`;
        return `Linksklick: ${spoolLabel(spool)} nehmen${count}${wet}`;
      },
      action: () => {
        if (!carry.canTakeSpool) return;
        const taken = economy.takeSpoolFromShelf(spool.shelfSlot);
        if (taken) carry.addSpool(taken);
      },
    };
  }

  // Holzstapel: oberste Platte nehmen, oder die Platte aus der Hand zurücklegen
  function woodInteraction(wood) {
    return {
      hint: () => {
        if (carry.sheet && !carry.canTakeSheet) return `Hände voll – höchstens ${carry.maxSheets} Holzplatten (Q legt alle zurück)`;
        if (!carry.canTakeSheet) return 'Hände voll – Q legt alles zurück ins Lager';
        const count = economy.woodCount(wood.id);
        const inHand = carry.sheets.length ? ` · danach ${carry.sheets.length + 1}/${carry.maxSheets} in der Hand` : '';
        return count ? `Linksklick: ${wood.name} nehmen (${count} da)${inHand}` : `${wood.name} – leer, Nachschub im Holzshop`;
      },
      action: () => {
        if (!carry.canTakeSheet) return;
        const sheet = economy.takeWoodSheet(wood.id);
        if (sheet) carry.holdSheet(sheet);
      },
    };
  }

  function boxInteraction(printer) {
    return {
      hint: () => (carry.canTakeBox ? `Linksklick: ${printer.model.name} aufheben` : 'Hände voll – Q legt alles zurück ins Lager'),
      action: () => {
        if (carry.canTakeBox && economy.takePrinterFromStorage(printer.id)) carry.holdPrinter(printer);
      },
    };
  }

  function furnitureBoxInteraction(item) {
    return {
      hint: () => (carry.canTakeBox ? `Linksklick: Karton ${item.type.name} aufheben` : 'Hände voll – Q legt alles zurück ins Lager'),
      action: () => {
        if (carry.canTakeBox && economy.takeFurnitureFromStorage(item.id)) carry.holdFurniture(item);
      },
    };
  }

  // Neu aufgebaut wird nur, wenn sich im Lager etwas geändert hat – sync() kommt bei jeder Änderung im Spiel
  // (Druck fertig, Geld, Spule eingelegt …), und alles neu zu bauen ließe das Bild jedes Mal kurz stocken.
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (o) => {
    if (!ids.has(o)) ids.set(o, nextId++);
    return ids.get(o);
  };
  let lastKey = null;
  const contentKey = () => JSON.stringify([
    upgrades.shelfLevels, economy.hasDryer,
    economy.shelf.map((s) => [idOf(s), s.shelfSlot, s.filamentId]),
    WOODS.map((w) => economy.woodCount(w.id)),
    // Karton im Abstellraum auch ohne Platz anders als „in der Hand“, sonst bliebe beim Aufheben ein Geisterkarton (#64)
    [...economy.printers, ...economy.furniture].map((item) => [idOf(item), item.location === 'storage' ? `s${item.storageSpot}` : null]),
  ]);

  function sync() {
    const key = contentKey();
    if (key === lastKey) return;
    lastKey = key;
    contents.clear();
    shelf.userData.levels.forEach((parts, i) => { parts.visible = i < upgrades.shelfLevels; });
    dryer.visible = economy.hasDryer;

    // Alle Spulen im Regal als ein Satz InstancedMeshes – wenige Draw Calls, egal wie voll das Regal ist
    contents.add(createSpoolBatch(economy.shelf.filter((spool) => spool.shelfSlot < upgrades.shelfCapacity).map((spool) => ({
      filament: filamentById(spool.filamentId),
      rotationY: Math.PI / 2, // Achse entlang des Regals
      position: new THREE.Vector3(
        SHELF.spoolX,
        SHELF.levels[Math.floor(spool.shelfSlot / SHELF.perLevel)] + 0.1,
        SHELF.firstZ + (spool.shelfSlot % SHELF.perLevel) * SHELF.spacing,
      ),
      interaction: spoolInteraction(spool),
    }))));

    // Holzstapel auf der Palette: einer pro Holzart, so hoch wie Platten da sind, davor ein Schild
    WOODS.forEach((wood, i) => {
      const count = economy.woodCount(wood.id);
      const x = WOOD_PALLET.x + (i - (WOODS.length - 1) / 2) * WOOD_PALLET.spacing;
      const interaction = woodInteraction(wood);
      if (count) {
        const h = count * WOOD_PALLET.sheetH;
        const stack = box(SHEET_MM.x / 1000, h, SHEET_MM.y / 1000, new THREE.MeshStandardMaterial({ color: wood.hex, roughness: 0.85 }),
          x, WOOD_PALLET.h + h / 2, WOOD_PALLET.z + 0.04);
        stack.userData.interaction = interaction;
        contents.add(stack);
      }
      const sign = woodSign(wood, count);
      sign.position.set(x, WOOD_PALLET.h + 0.05, WOOD_PALLET.z - WOOD_PALLET.d / 2 - 0.012);
      sign.userData.interaction = interaction;
      contents.add(sign);
    });

    const boxColliders = [];
    // Kartons in der Lieferzone: Drucker und Einrichtung, in Lieferreihenfolge auf die Stapel verteilt
    const stored = [...economy.printers, ...economy.furniture]
      .filter((item) => item.location === 'storage')
      .sort((a, b) => (a.storageSpot ?? Infinity) - (b.storageSpot ?? Infinity));
    for (const { box: { entry: item }, column, y } of stackCrates(stored).placed) {
      const z = BOX_SPOTS_Z[column];
      const crate = makeCrate(item);
      crate.position.set(BOX_X, y, z);
      crate.userData.interaction = item.model ? boxInteraction(item) : furnitureBoxInteraction(item);
      contents.add(crate);
      if (y > 0) continue; // nur die unterste Lage braucht eine Kollision
      const { w, d: depth } = crate.userData.size;
      boxColliders.push({ minX: BOX_X - w / 2, maxX: BOX_X + w / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
    }
    if (economy.hasDryer) boxColliders.push(DRYER.collider);
    collision.setDynamic('storage-boxes', boxColliders);
    enableShadows(contents);
  }

  upgrades.subscribe(sync); // neue Regalebene sofort zeigen
  return { group, sync };
}
