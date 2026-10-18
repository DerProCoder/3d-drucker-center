// Was der Spieler gerade in der Hand hat: entweder ein Druckerkarton oder bis zu MAX_SPOOLS Spulen,
// vor der Kamera angezeigt. item beschreibt, was ein Klick als Nächstes benutzt:
//   { kind: 'printer', printerId } | { kind: 'filament', filamentId, grams } (die oberste Spule) | null
import { filamentById, filamentLabel } from './catalog.js';
import { createSpool } from './spool.js';
import { createPrinterBox } from './printer-box.js';

export const MAX_SPOOLS = 5;
const SPOOL_SPACING = 0.078; // Abstand der Spulen nebeneinander in der Hand (Spule ist 7 cm breit)

export class Carry {
  constructor(camera, economy, infoEl) {
    this.camera = camera;
    this.economy = economy;
    this.infoEl = infoEl;
    this.printerId = null;
    this.spools = []; // { filamentId, grams, mesh } – die letzte ist die oberste
    this.boxMesh = null;
  }

  get item() {
    if (this.printerId !== null) return { kind: 'printer', printerId: this.printerId };
    const top = this.spools.at(-1);
    return top ? { kind: 'filament', filamentId: top.filamentId, grams: top.grams } : null;
  }

  // Noch Platz für eine Spule? (nicht mit Karton in der Hand)
  get canTakeSpool() {
    return this.printerId === null && this.spools.length < MAX_SPOOLS;
  }

  holdPrinter(printer) {
    this.returnToStorage();
    const box = createPrinterBox(printer.model);
    const { h, d } = box.userData.size;
    box.position.set(0, -0.32 - h, -0.42 - d / 2); // vor dem Bauch, Oberkante knapp unter dem Blickfeld
    box.traverse((o) => { o.castShadow = false; });
    this.camera.add(box);
    this.boxMesh = box;
    this.printerId = printer.id;
    this.updateInfo();
  }

  // Legt eine Spule oben auf den Stapel. Gibt false zurück, wenn kein Platz ist.
  holdFilament(filamentId, grams) {
    if (!this.canTakeSpool) return false;
    const spool = createSpool(filamentById(filamentId));
    spool.traverse((o) => { o.castShadow = false; });
    this.camera.add(spool);
    this.spools.push({ filamentId, grams, mesh: spool });
    this.layoutSpools();
    this.updateInfo();
    return true;
  }

  // Nimmt den obersten Gegenstand aus der Hand und gibt ihn zurück (wie item) oder null
  takeTop() {
    const item = this.item;
    if (item?.kind === 'printer') {
      this.camera.remove(this.boxMesh);
      this.boxMesh = null;
      this.printerId = null;
    } else if (item) {
      this.camera.remove(this.spools.pop().mesh);
      this.layoutSpools();
    }
    this.updateInfo();
    return item;
  }

  // Q oder Regal: alles Getragene wandert zurück in den Abstellraum
  returnToStorage() {
    if (this.printerId !== null) this.economy.returnPrinterToStorage(this.takeTop().printerId);
    while (this.spools.length) {
      const { filamentId, grams } = this.takeTop();
      this.economy.returnFilamentToStorage(filamentId, grams);
    }
  }

  // Spulen nebeneinander unten rechts im Blickfeld, die oberste ganz rechts und leicht angehoben
  layoutSpools() {
    const n = this.spools.length;
    this.spools.forEach(({ mesh }, i) => {
      const top = i === n - 1;
      mesh.rotation.set(0, 0.4, 0); // schräg, damit Wicklung und Seitenscheibe zu sehen sind
      mesh.position.set(0.24 - (n - 1 - i) * SPOOL_SPACING, top ? -0.3 : -0.33, -0.55 - (n - 1 - i) * 0.03);
    });
  }

  updateInfo() {
    let text = null;
    if (this.printerId !== null) {
      text = `In der Hand: Karton ${this.economy.printerById(this.printerId).model.name} · Q: zurück ins Lager`;
    } else if (this.spools.length) {
      const top = this.spools.at(-1);
      const label = `${filamentLabel(filamentById(top.filamentId))} (${Math.round(top.grams)} g)`;
      text = this.spools.length === 1
        ? `In der Hand: Spule ${label} · Q: zurück ins Lager`
        : `In der Hand: ${this.spools.length}/${MAX_SPOOLS} Spulen · als Nächstes: ${label} · Q: alle zurück ins Lager`;
    }
    this.infoEl.textContent = text ?? '';
    this.infoEl.classList.toggle('hidden', !text);
  }
}
