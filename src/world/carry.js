// Was der Spieler gerade in der Hand hat: entweder einen Karton (Drucker oder Regal), bis zu MAX_SPOOLS
// Filamentspulen, eine Ersatzdüse oder eine Holzplatte für den Laser. Bei mehreren Spulen wählt das Mausrad aus,
// welche als Nächstes eingelegt wird.
// Spule: { filamentId, grams, moisture } · Holzplatte: { woodId }
import * as THREE from 'three';
import { SHEET_MM, filamentById, woodById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { createPrinterBox } from '../models/printer-box.js';
import { createPrinterModel } from '../models/printer-model.js';
import { createNozzle, furnitureSize } from '../models/furniture.js';
import { spoolLabel } from '../core/economy.js';

export const MAX_SPOOLS = 5;

export class Carry {
  constructor(camera, economy, infoEl) {
    this.camera = camera;
    this.economy = economy;
    this.infoEl = infoEl;
    this.printerId = null;
    this.unboxed = false;    // Drucker ohne Karton (vom Tisch oder Boden aufgehoben)
    this.furnitureId = null; // Regalkarton
    this.nozzle = false;     // Ersatzdüse in der Hand
    this.sheet = null;       // Holzplatte in der Hand ({ woodId })
    this.spools = [];
    this.selected = 0;
    this.mesh = null;
  }

  get isEmpty() {
    return this.printerId === null && this.furnitureId === null && !this.nozzle && !this.sheet && !this.spools.length;
  }

  get printer() {
    return this.printerId === null ? null : this.economy.printerById(this.printerId);
  }

  get furniture() {
    return this.furnitureId === null ? null : this.economy.furnitureById(this.furnitureId);
  }

  get hasSpools() {
    return this.spools.length > 0;
  }

  get canTakeSpool() {
    return this.printerId === null && this.furnitureId === null && !this.nozzle && !this.sheet && this.spools.length < MAX_SPOOLS;
  }

  get selectedSpool() {
    return this.spools[this.selected] ?? null;
  }

  // unboxed: der Drucker selbst statt seines Kartons (vom Tisch oder vom Boden aufgehoben)
  holdPrinter(printer, { unboxed = false } = {}) {
    if (!this.isEmpty) return;
    this.printerId = printer.id;
    this.unboxed = unboxed;
    this.refresh();
  }

  addSpool(spool) {
    if (!this.canTakeSpool) return false;
    this.spools.push(spool);
    this.selected = this.spools.length - 1; // die zuletzt genommene ist gewählt
    this.refresh();
    return true;
  }

  // Nimmt eine Spule aus der Hand (Standard: die gewählte)
  takeSpool(index = this.selected) {
    const [spool] = this.spools.splice(index, 1);
    this.selected = Math.min(this.selected, Math.max(0, this.spools.length - 1));
    this.refresh();
    return spool ?? null;
  }

  // Gibt den Karton aus der Hand (der Drucker selbst wird von economy umgesetzt)
  releasePrinter() {
    const printer = this.printer;
    this.printerId = null;
    this.unboxed = false;
    this.refresh();
    return printer;
  }

  holdFurniture(item) {
    if (!this.isEmpty) return;
    this.furnitureId = item.id;
    this.refresh();
  }

  releaseFurniture() {
    const item = this.furniture;
    this.furnitureId = null;
    this.refresh();
    return item;
  }

  holdNozzle() {
    if (!this.isEmpty) return false;
    this.nozzle = true;
    this.refresh();
    return true;
  }

  releaseNozzle() {
    this.nozzle = false;
    this.refresh();
  }

  holdSheet(sheet) {
    if (!this.isEmpty || !sheet) return false;
    this.sheet = sheet;
    this.refresh();
    return true;
  }

  releaseSheet() {
    const sheet = this.sheet;
    this.sheet = null;
    this.refresh();
    return sheet;
  }

  // Mausrad: nächste/vorige Spule wählen
  cycle(direction) {
    if (this.spools.length < 2) return;
    this.selected = (this.selected + direction + this.spools.length) % this.spools.length;
    this.refresh();
  }

  // Q oder Klick aufs Regal: alles wandert zurück in den Abstellraum
  returnToStorage() {
    if (this.printerId !== null) this.economy.returnPrinterToStorage(this.releasePrinter().id);
    if (this.furnitureId !== null) this.economy.returnFurnitureToStorage(this.releaseFurniture().id);
    if (this.nozzle) {
      this.economy.returnNozzle();
      this.releaseNozzle();
    }
    if (this.sheet) this.economy.returnWoodSheet(this.releaseSheet());
    const spools = this.spools;
    this.spools = [];
    this.selected = 0;
    for (const spool of spools) this.economy.returnFilamentToStorage(spool);
    this.refresh();
  }

  // Modell vor der Kamera und Infozeile neu aufbauen
  refresh() {
    if (this.mesh) this.camera.remove(this.mesh);
    this.mesh = null;
    const printer = this.printer;
    if (printer && this.unboxed) {
      const model = createPrinterModel(printer.model);
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.position.set(0, -0.3 - size.y, -0.4 - size.z / 2); // vor dem Bauch, Oberkante knapp unter dem Blickfeld
      this.show(model);
      this.setInfo(`In der Hand: ${printer.model.name} · auf einen freien Platz stellen · F: werfen · Q: zurück ins Lager`);
      return;
    }
    if (printer) {
      const box = createPrinterBox(printer.model);
      const { h, d } = box.userData.size;
      box.position.set(0, -0.32 - h, -0.42 - d / 2); // vor dem Bauch, Oberkante knapp unter dem Blickfeld
      this.show(box);
      this.setInfo(`In der Hand: Karton ${printer.model.name} · F: werfen · Q: zurück ins Lager`);
      return;
    }
    const furniture = this.furniture;
    if (furniture) {
      const box = createPrinterBox(furniture.type, furnitureSize(furniture.type), 'Einrichtung');
      const { h, d } = box.userData.size;
      box.position.set(0, -0.32 - h, -0.42 - d / 2);
      this.show(box);
      this.setInfo(`In der Hand: Karton ${furniture.type.name} – auf einen freien Platz am Druckertisch stellen · Q: zurück ins Lager`);
      return;
    }
    if (this.nozzle) {
      const nozzle = createNozzle(4); // vergrößert, damit man sie in der Hand erkennt
      nozzle.position.set(0.16, -0.18, -0.4);
      nozzle.rotation.set(0.3, 0, -0.4);
      this.show(nozzle);
      this.setInfo('In der Hand: Ersatzdüse – auf einen Drucker klicken, um die Düse zu tauschen · Q: zurück ins Regal');
      return;
    }
    if (this.sheet) {
      const wood = woodById(this.sheet.woodId);
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(SHEET_MM.x / 1000, 0.003, SHEET_MM.y / 1000),
        new THREE.MeshStandardMaterial({ color: wood.hex, roughness: 0.8 }),
      );
      plank.position.set(0.05, -0.26, -0.45);
      plank.rotation.set(0.5, 0.3, 0); // schräg vor dem Bauch, wie mit beiden Händen gehalten
      this.show(plank);
      this.setInfo(`In der Hand: ${wood.name} – in den Laser R1 legen · Q: zurück auf den Stapel`);
      return;
    }
    if (!this.spools.length) {
      this.infoEl.classList.add('hidden');
      return;
    }
    // Spulen als Stapel rechts unten, die gewählte ragt etwas heraus
    const stack = createSpoolStack(this.spools, this.selected);
    this.show(stack);
    const n = this.spools.length;
    const free = MAX_SPOOLS - n;
    const room = free ? `noch ${free} frei` : 'Hände voll';
    const pick = n > 1 ? ` · Mausrad: Spule wählen` : '';
    this.setInfo(`In der Hand: ${n}/${MAX_SPOOLS} Spulen (${room}) · Gewählt: ${spoolLabel(this.selectedSpool)}${pick} · Q: alle zurück ins Lager`);
  }

  show(mesh) {
    mesh.traverse((o) => { o.castShadow = false; });
    this.mesh = mesh;
    this.camera.add(mesh);
  }

  setInfo(text) {
    this.infoEl.textContent = text;
    this.infoEl.classList.remove('hidden');
  }
}

// Spulen nebeneinander auf der Achse aufgereiht (wie auf einem Stab), die gewählte ragt etwas nach oben
function createSpoolStack(spools, selected) {
  const group = new THREE.Group();
  group.position.set(0.2, -0.3, -0.55);
  group.rotation.y = 0.4; // schräg, damit Wicklung und Seitenscheiben zu sehen sind
  spools.forEach((spool, i) => {
    const mesh = createSpool(filamentById(spool.filamentId));
    mesh.position.set((i - (spools.length - 1) / 2) * 0.075, i === selected ? 0.035 : 0, 0);
    group.add(mesh);
  });
  return group;
}
