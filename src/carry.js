// Was der Spieler gerade in der Hand hat: höchstens ein Gegenstand, vor der Kamera angezeigt.
// item: { kind: 'printer', printerId } | { kind: 'filament', filamentId, grams }
import { filamentById, filamentLabel } from './catalog.js';
import { createSpool } from './spool.js';
import { createPrinterBox } from './printer-box.js';

export class Carry {
  constructor(camera, economy, infoEl) {
    this.camera = camera;
    this.economy = economy;
    this.infoEl = infoEl;
    this.item = null;
    this.mesh = null;
  }

  holdPrinter(printer) {
    const box = createPrinterBox(printer.model);
    const { h, d } = box.userData.size;
    box.position.set(0, -0.32 - h, -0.42 - d / 2); // vor dem Bauch, Oberkante knapp unter dem Blickfeld
    this.hold({ kind: 'printer', printerId: printer.id }, box, `Karton: ${printer.model.name}`);
  }

  holdFilament(filamentId, grams) {
    const filament = filamentById(filamentId);
    const spool = createSpool(filament);
    spool.rotation.y = 0.4; // schräg, damit Wicklung und Seitenscheibe zu sehen sind
    spool.position.set(0.24, -0.3, -0.55);
    this.hold({ kind: 'filament', filamentId, grams }, spool, `Spule: ${filamentLabel(filament)} (${Math.round(grams)} g)`);
  }

  hold(item, mesh, label) {
    this.release();
    this.item = item;
    this.mesh = mesh;
    mesh.traverse((o) => { o.castShadow = false; });
    this.camera.add(mesh);
    this.infoEl.textContent = `In der Hand: ${label} · Q: zurück ins Lager`;
    this.infoEl.classList.remove('hidden');
  }

  release() {
    const item = this.item;
    if (this.mesh) this.camera.remove(this.mesh);
    this.item = null;
    this.mesh = null;
    this.infoEl.classList.add('hidden');
    return item;
  }

  // Q: Gegenstand wandert zurück in den Abstellraum
  returnToStorage() {
    const item = this.release();
    if (item?.kind === 'printer') this.economy.returnPrinterToStorage(item.printerId);
    else if (item?.kind === 'filament') this.economy.returnFilamentToStorage(item.filamentId, item.grams);
  }
}
