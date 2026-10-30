// Was der Spieler gerade in der Hand hat: entweder Kartons (Drucker oder Einrichtung wie Regale und Server-Hardware),
// bis zu MAX_SPOOLS Filamentspulen, eine Ersatzdüse oder bis zu MAX_SHEETS Holzplatten für den Laser (als Stapel,
// die oberste wird als Nächstes eingelegt). Bei mehreren Spulen wählt das Mausrad aus, welche als Nächstes eingelegt
// wird. Normal trägt man einen Karton; mit „Alles tragen“ (Entwicklermenü) bis zu CARRY_ALL_MAX Kartons, Spulen bzw.
// Platten – die Kartons als Stapel, aufgestellt wird immer der oberste.
// Spule: { filamentId, grams, moisture } · Holzplatte: { woodId } · Karton: { kind: 'printer' | 'furniture', id, unboxed }
import * as THREE from 'three';
import { SHEET_MM, filamentById, isWallFurniture, woodById } from '../core/catalog.js';
import { createSpool } from '../models/spool.js';
import { createPrinterBox } from '../models/printer-box.js';
import { createPrinterModel } from '../models/printer-model.js';
import { createNozzle, furnitureSize } from '../models/furniture.js';
import { CARRY_ALL_MAX, spoolLabel } from '../core/economy.js';
import { isServerHardware } from '../core/server-catalog.js';

export const MAX_SPOOLS = 5;
export const MAX_SHEETS = 5;

export class Carry {
  constructor(camera, economy, infoEl) {
    this.camera = camera;
    this.economy = economy;
    this.infoEl = infoEl;
    this.boxes = [];         // Kartons in der Hand, der letzte liegt oben (unboxed: Drucker ohne Karton, nur einzeln)
    this.nozzle = false;     // Ersatzdüse in der Hand
    this.sheets = [];        // Holzplatten in der Hand ({ woodId }), die letzte liegt oben
    this.spools = [];
    this.selected = 0;
    this.mesh = null;
    this.formatText = (text) => text; // Tastennamen fürs Tablet umschreiben
  }

  get isEmpty() {
    return !this.boxes.length && !this.nozzle && !this.sheets.length && !this.spools.length;
  }

  // Wie viel man auf einmal tragen darf (Entwicklermenü „Alles tragen“ hebt die Grenzen an)
  get maxBoxes() {
    return this.economy.carryAll ? CARRY_ALL_MAX : 1;
  }

  get maxSpools() {
    return this.economy.carryAll ? CARRY_ALL_MAX : MAX_SPOOLS;
  }

  get maxSheets() {
    return this.economy.carryAll ? CARRY_ALL_MAX : MAX_SHEETS;
  }

  get topBox() {
    return this.boxes[this.boxes.length - 1] ?? null;
  }

  // Oberster Drucker bzw. oberstes Einrichtungsstück im Kartonstapel (das wird als Nächstes aufgestellt) oder null
  get printer() {
    return this.topBox?.kind === 'printer' ? this.economy.printerById(this.topBox.id) : null;
  }

  get furniture() {
    return this.topBox?.kind === 'furniture' ? this.economy.furnitureById(this.topBox.id) : null;
  }

  // Oberster Drucker ohne Karton (vom Tisch oder Boden aufgehoben)
  get unboxed() {
    return !!this.topBox?.unboxed;
  }

  // Passt noch ein Karton obendrauf? Mit leeren Händen immer, sonst nur auf andere Kartons (bis maxBoxes)
  get canTakeBox() {
    if (this.isEmpty) return true;
    return this.boxes.length < this.maxBoxes && !this.nozzle && !this.sheets.length && !this.spools.length
      && !this.boxes.some((b) => b.unboxed);
  }

  get hasSpools() {
    return this.spools.length > 0;
  }

  get canTakeSpool() {
    return !this.boxes.length && !this.nozzle && !this.sheets.length && this.spools.length < this.maxSpools;
  }

  // Oberste Holzplatte in der Hand (die kommt als Nächstes in Laser oder Regal) oder null
  get sheet() {
    return this.sheets[this.sheets.length - 1] ?? null;
  }

  get canTakeSheet() {
    return !this.boxes.length && !this.nozzle && !this.spools.length && this.sheets.length < this.maxSheets;
  }

  get selectedSpool() {
    return this.spools[this.selected] ?? null;
  }

  // unboxed: der Drucker selbst statt seines Kartons (vom Tisch oder vom Boden aufgehoben) – nur mit leeren Händen
  holdPrinter(printer, { unboxed = false } = {}) {
    if (unboxed ? !this.isEmpty : !this.canTakeBox) return;
    this.boxes.push({ kind: 'printer', id: printer.id, unboxed });
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

  // Gibt den obersten Drucker aus der Hand (der Drucker selbst wird von economy umgesetzt)
  releasePrinter() {
    const printer = this.printer;
    if (printer) this.boxes.pop();
    this.refresh();
    return printer;
  }

  holdFurniture(item) {
    if (!this.canTakeBox) return;
    this.boxes.push({ kind: 'furniture', id: item.id, unboxed: false });
    this.refresh();
  }

  // Gibt das oberste Einrichtungsstück aus der Hand
  releaseFurniture() {
    const item = this.furniture;
    if (item) this.boxes.pop();
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

  // Platte oben auf den Stapel in der Hand legen
  holdSheet(sheet) {
    if (!this.canTakeSheet || !sheet) return false;
    this.sheets.push(sheet);
    this.refresh();
    return true;
  }

  // Oberste Platte aus der Hand nehmen
  releaseSheet() {
    const sheet = this.sheets.pop() ?? null;
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
    const boxes = this.boxes;
    this.boxes = [];
    for (const b of boxes) {
      if (b.kind === 'printer') this.economy.returnPrinterToStorage(b.id);
      else this.economy.returnFurnitureToStorage(b.id);
    }
    if (this.nozzle) {
      this.economy.returnNozzle();
      this.releaseNozzle();
    }
    const sheets = this.sheets;
    this.sheets = [];
    for (const sheet of sheets) this.economy.returnWoodSheet(sheet);
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
    if (this.boxes.length) {
      // Kartonstapel vor dem Bauch: der oberste mit der Oberkante knapp unter dem Blickfeld, die übrigen darunter
      const stack = new THREE.Group();
      let y = -0.32;
      for (let i = this.boxes.length - 1; i >= 0; i--) {
        const b = this.boxes[i];
        const item = b.kind === 'printer' ? this.economy.printerById(b.id) : this.economy.furnitureById(b.id);
        const crate = b.kind === 'printer'
          ? createPrinterBox(item.model)
          : createPrinterBox(item.type, furnitureSize(item.type), 'Einrichtung');
        const { h, d } = crate.userData.size;
        y -= h;
        crate.position.set(0, y, -0.42 - d / 2);
        stack.add(crate);
      }
      this.show(stack);
      const n = this.boxes.length;
      const count = n > 1 ? `${n}/${this.maxBoxes} Kartons, oben: ` : '';
      const back = n > 1 ? 'Q: alle zurück ins Lager' : 'Q: zurück ins Lager';
      if (printer) {
        this.setInfo(`In der Hand: ${count}Karton ${printer.model.name} · F: werfen · ${back}`);
        return;
      }
      const furniture = this.furniture;
      let todo = isWallFurniture(furniture.type) ? 'an einen freien Platz an der Südwand stellen' : 'auf einen freien Platz am Druckertisch stellen';
      if (isServerHardware(furniture.type)) {
        todo = furniture.type.kind === 'rack'
          ? 'im Serverraum (zweite Etage) oder im Daten-Bunker (Keller) an einer grünen Markierung aufstellen'
          : 'auf einen Serverschrank (zweite Etage oder Daten-Bunker) klicken, um es einzubauen';
        // Server lassen sich auch auf der Werkbank öffnen (world/workbench.js, Teile tauschen, auf- und abrüsten)
        if (furniture.type.kind === 'server') todo += ' – oder auf die Werkbank legen';
      }
      this.setInfo(`In der Hand: ${count}Karton ${furniture.type.name} – ${todo} · ${back}`);
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
    if (this.sheets.length) {
      // Stapel schräg vor dem Bauch, wie mit beiden Händen gehalten – die oberste Platte liegt oben
      const stack = new THREE.Group();
      const geometry = new THREE.BoxGeometry(SHEET_MM.x / 1000, 0.003, SHEET_MM.y / 1000);
      this.sheets.forEach((sheet, i) => {
        const plank = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: woodById(sheet.woodId).hex, roughness: 0.8 }));
        plank.position.y = i * 0.0045;
        stack.add(plank);
      });
      stack.position.set(0.05, -0.26, -0.45);
      stack.rotation.set(0.5, 0.3, 0);
      this.show(stack);
      const top = woodById(this.sheet.woodId).name;
      const n = this.sheets.length;
      this.setInfo(n === 1
        ? `In der Hand: ${top} – in den Laser R1 legen · Q: zurück auf den Stapel`
        : `In der Hand: ${n}/${this.maxSheets} Holzplatten · oben: ${top} · Q: alle zurück auf den Stapel`);
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
    const free = this.maxSpools - n;
    const room = free ? `noch ${free} frei` : 'Hände voll';
    const pick = n > 1 ? ` · Mausrad: Spule wählen` : '';
    this.setInfo(`In der Hand: ${n}/${this.maxSpools} Spulen (${room}) · Gewählt: ${spoolLabel(this.selectedSpool)}${pick} · Q: alle zurück ins Lager`);
  }

  show(mesh) {
    mesh.traverse((o) => { o.castShadow = false; });
    this.mesh = mesh;
    this.camera.add(mesh);
  }

  setInfo(text) {
    this.infoEl.textContent = this.formatText(text);
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
