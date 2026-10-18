// Was der Spieler gerade in der Hand hat: entweder ein Druckerkarton oder bis zu MAX_SPOOLS Filamentspulen.
// Bei mehreren Spulen wählt das Mausrad aus, welche als Nächstes eingelegt wird.
// Spule: { filamentId, grams, moisture }
import * as THREE from 'three';
import { filamentById } from './catalog.js';
import { createSpool } from './spool.js';
import { createPrinterBox } from './printer-box.js';
import { spoolLabel } from './economy.js';

export const MAX_SPOOLS = 5;

export class Carry {
  constructor(camera, economy, infoEl) {
    this.camera = camera;
    this.economy = economy;
    this.infoEl = infoEl;
    this.printerId = null;
    this.spools = [];
    this.selected = 0;
    this.mesh = null;
  }

  get isEmpty() {
    return this.printerId === null && !this.spools.length;
  }

  get printer() {
    return this.printerId === null ? null : this.economy.printerById(this.printerId);
  }

  get hasSpools() {
    return this.spools.length > 0;
  }

  get canTakeSpool() {
    return this.printerId === null && this.spools.length < MAX_SPOOLS;
  }

  get selectedSpool() {
    return this.spools[this.selected] ?? null;
  }

  holdPrinter(printer) {
    if (!this.isEmpty) return;
    this.printerId = printer.id;
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
    this.refresh();
    return printer;
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
    if (printer) {
      const box = createPrinterBox(printer.model);
      const { h, d } = box.userData.size;
      box.position.set(0, -0.32 - h, -0.42 - d / 2); // vor dem Bauch, Oberkante knapp unter dem Blickfeld
      this.show(box);
      this.setInfo(`In der Hand: Karton ${printer.model.name} · Q: zurück ins Lager`);
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
