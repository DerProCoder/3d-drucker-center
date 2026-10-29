// NAS (Netzwerkspeicher, #46): Server der Serie „NAS“ (core/server-catalog.js, nas: true) mit Festplatten-Schächten
// vorn. Die Ausstattung (feste 32-Core-CPU, RAM, Platten in den Schächten bay0 …) steckt wie bei allen Servern in den
// Bauteilen (core/server-parts.js, Steckplatz-Sätze 'nas-s'/'nas-l', Teileart 'disk') – hier stehen nur die
// NAS-Sonderfälle: Speicher (Summe der Platten), freie Schächte und das Einsetzen und Herausnehmen von Platten direkt
// im Schrank (Hot-Swap, Klick in world/ #48). RAM, CPU, Lüfter und Netzteil tauscht man an der Werkbank (#45).
// Sonst ist eine NAS ein ganz normaler Server: Strom, Netz, Kühlung, Defekte und VMs (auf ihre 32 Cores und ihren RAM).
//
// Vermieteter Speicher (#47) kommt über den Rückruf rentedStorageOf; eine Platte darf nur heraus, wenn er danach noch
// passt. Dieselbe Prüfung gilt über serverParts.extraShortage auch an der Werkbank.
// Eigener Spielstand ist nicht nötig: Die Platten je Schacht speichert serverParts mit. Ohne Three.js und DOM.
import { partById, slotId, slotSetOf, toSlot } from './server-parts.js';

// Speicher als Text: „512 GB“, „2 TB“, „2,5 TB“ (1 TB = 1024 GB, wie die Plattengrößen)
export function storageText(gb) {
  if (gb < 1024) return `${Math.round(gb)} GB`;
  return `${(gb / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} TB`;
}

// Zahl der Festplatten-Schächte eines Modells bzw. Geräts (0 = keine NAS)
export const bayCountOf = (typeOrDevice) => slotSetOf(typeOrDevice)?.slots.disk ?? 0;
// Ob das Modell bzw. Gerät eine NAS ist (hat Festplatten-Schächte)
export const isNas = (typeOrDevice) => bayCountOf(typeOrDevice) > 0;

// Schacht als Nummer: nimmt 3, 'bay3' oder { kind: 'disk', index: 3 }; null, wenn es kein Schacht ist
function bayIndex(bay) {
  if (Number.isInteger(bay)) return bay;
  const slot = toSlot(bay);
  return slot?.kind === 'disk' ? slot.index : null;
}

export class Nas {
  // parts: core/server-parts.js (ServerParts)
  constructor(parts) {
    this.parts = parts;
    this.economy = parts.economy;
    // (type, data) => void – 'disk-inserted' { device, bay, part }, 'disk-removed' { device, bay, part, scrapped }
    // (bay: Schacht-Nummer; scrapped: defekte Platte entsorgt statt ins Teilelager)
    this.onEvent = null;
    // Vermieteter Speicher einer NAS in GB (#47 setzt das, z. B. storageRentals.usedOn) – bis dahin 0
    this.rentedStorageOf = () => 0;
    // Ausbau und Tausch prüfen (auch an der Werkbank): vermieteter Speicher muss auf die übrigen Platten passen
    parts.extraShortage = (device, capacity) => {
      if (!isNas(device)) return null;
      const rented = this.rentedStorageOf(device) ?? 0;
      return rented > (capacity.storage ?? 0) ? `Belegt: ${storageText(rented)} vermietet` : null;
    };
  }

  // Gerät aus ID oder Objekt
  deviceOf(deviceOrId) {
    return typeof deviceOrId === 'object' ? deviceOrId : this.economy.furnitureById(deviceOrId) ?? null;
  }

  // Alle NAS (eingebaut oder nicht)
  get devices() {
    return this.economy.furniture.filter((f) => isNas(f));
  }

  // ---------- Speicher ----------

  // Speicher in GB: Summe der eingebauten Platten (auch defekte – eine NAS mit defekter Platte läuft ohnehin nicht)
  storageOf(device) {
    device = this.deviceOf(device);
    return isNas(device) ? this.parts.capacity(device).storage ?? 0 : 0;
  }

  // Vermieteter (belegter) Speicher in GB (#47)
  usedStorageOf(device) {
    device = this.deviceOf(device);
    return isNas(device) ? this.rentedStorageOf(device) ?? 0 : 0;
  }

  // Freier Speicher in GB (für #47: passt eine Speicher-Anfrage?)
  freeStorageOf(device) {
    return Math.max(0, this.storageOf(device) - this.usedStorageOf(device));
  }

  // Schächte für Anzeigen (Schrankfenster, 3D-Front #48): [{ index, id ('bay0' …), part (oder null), gb, broken }]
  baysOf(device) {
    device = this.deviceOf(device);
    if (!isNas(device)) return [];
    return this.parts.slotsOf(device).filter((s) => s.kind === 'disk')
      .map((s) => ({ index: s.index, id: s.id, part: s.part, gb: s.part?.gb ?? 0, broken: s.broken }));
  }

  // Zahl der Schächte
  bayCount(device) {
    return bayCountOf(this.deviceOf(device));
  }

  // Zahl der freien (leeren) Schächte
  freeBays(device) {
    return this.baysOf(device).filter((b) => !b.part).length;
  }

  // Zahl der belegten Schächte
  usedBays(device) {
    return this.baysOf(device).filter((b) => b.part).length;
  }

  // Übersicht für Schrankfenster und Server-Shop: { cores, ram, maxRam, storage, used, free, bays, usedBays }
  // (Zeile z. B. „32 Cores · 256 / 512 GB RAM · 2,5 TB Speicher · 2 / 4 Schächte“)
  summary(device) {
    device = this.deviceOf(device);
    if (!isNas(device)) return null;
    const cap = this.parts.capacity(device);
    return {
      cores: cap.cores,
      ram: cap.ram,
      maxRam: slotSetOf(device).max?.ram ?? cap.ram,
      storage: cap.storage ?? 0,
      used: this.usedStorageOf(device),
      free: this.freeStorageOf(device),
      bays: this.bayCount(device),
      usedBays: this.usedBays(device),
    };
  }

  // ---------- Platten im Teilelager ----------

  // Festplatten im Teilelager: [{ part, count }], größte zuerst
  get diskStock() {
    return this.parts.stockList.filter((s) => s.part.kind === 'disk').sort((a, b) => b.part.gb - a.part.gb);
  }

  // Größte Platte im Teilelager (die setzt ein Klick auf einen leeren Schacht ein, #48) oder null
  get bestDisk() {
    return this.diskStock[0]?.part ?? null;
  }

  // ---------- Einsetzen und Herausnehmen (im Schrank, Hot-Swap) ----------

  // Grund, warum keine Platte in den Schacht bay (Nummer, 'bay3' oder { kind, index }) passt, oder null.
  // partId: bestimmte Platte; ohne partId die größte aus dem Teilelager
  canInsertDisk(device, bay, partId = null) {
    device = this.deviceOf(device);
    if (!isNas(device)) return 'Dieses Gerät hat keine Festplatten-Schächte';
    const index = bayIndex(bay);
    if (index === null || index < 0 || index >= this.bayCount(device)) return 'Diesen Schacht gibt es nicht';
    if (this.parts.loadoutOf(device).slots.disk[index]) return 'Schacht belegt';
    const id = partId ?? this.bestDisk?.id;
    if (!id) return 'Keine Festplatte im Teilelager – im Teile-Shop kaufen';
    if (partById(id)?.kind !== 'disk') return 'Das ist keine Festplatte';
    return this.parts.installProblem(device, { kind: 'disk', index }, id);
  }

  // Platte aus dem Teilelager in den Schacht setzen: { ok: true, part } oder { ok: false, reason }
  insertDisk(deviceId, bay, partId = null) {
    const device = this.deviceOf(deviceId);
    const reason = this.canInsertDisk(device, bay, partId);
    if (reason) return { ok: false, reason };
    const index = bayIndex(bay);
    const part = partById(partId ?? this.bestDisk.id);
    if (!this.parts.install(device.id, { kind: 'disk', index }, part.id)) return { ok: false, reason: 'Einsetzen fehlgeschlagen' };
    this.onEvent?.('disk-inserted', { device, bay: index, part });
    return { ok: true, part };
  }

  // Grund, warum die Platte im Schacht nicht heraus darf, oder null (z. B. „Belegt: 3,5 TB vermietet“, #47)
  canRemoveDisk(device, bay) {
    device = this.deviceOf(device);
    if (!isNas(device)) return 'Dieses Gerät hat keine Festplatten-Schächte';
    const index = bayIndex(bay);
    if (index === null || index < 0 || index >= this.bayCount(device)) return 'Diesen Schacht gibt es nicht';
    if (!this.parts.loadoutOf(device).slots.disk[index]) return 'Schacht ist leer';
    return this.parts.removeProblem(device, { kind: 'disk', index });
  }

  // Platte herausnehmen: heil ins Teilelager, defekt wird entsorgt.
  // { ok: true, part, scrapped } oder { ok: false, reason }
  removeDisk(deviceId, bay) {
    const device = this.deviceOf(deviceId);
    const reason = this.canRemoveDisk(device, bay);
    if (reason) return { ok: false, reason };
    const index = bayIndex(bay);
    const slot = { kind: 'disk', index };
    const part = partById(this.parts.loadoutOf(device).slots.disk[index]);
    const scrapped = this.parts.loadoutOf(device).broken.has(slotId(slot));
    if (!this.parts.remove(device.id, slot)) return { ok: false, reason: 'Herausnehmen fehlgeschlagen' };
    this.onEvent?.('disk-removed', { device, bay: index, part, scrapped });
    return { ok: true, part, scrapped };
  }
}
