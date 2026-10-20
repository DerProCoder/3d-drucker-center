// Linksklick-Interaktion: Strahl aus der Bildmitte, das erste getroffene Objekt zählt (Wände verdecken).
// Auf dem Tablet wirkt Antippen genauso, nur mit dem Strahl durch die angetippte Stelle (clickAt).
// Ein Objekt wird interaktiv, indem es (oder ein Elternobjekt) userData.interaction bekommt:
//   hint(hit)   → Text unter dem Fadenkreuz oder null (gerade nicht interaktiv)
//   action(hit) → wird beim Linksklick ausgeführt
//   hover(hit) / unhover() → optional, z. B. für Vorschauen
import * as THREE from 'three';

// Wie raycaster.intersectObjects, aber ausgeblendete Objekte (z. B. der Außenbereich, solange man drinnen ist)
// samt allem darin überspringen – die lassen sich ohnehin nicht anklicken und kosten sonst in jedem Bild Zeit
function raycastVisible(object, raycaster, hits) {
  if (!object.visible) return;
  if (object.layers.test(raycaster.layers)) object.raycast(raycaster, hits);
  for (const child of object.children) raycastVisible(child, raycaster, hits);
}

export class Interaction {
  constructor({ camera, distance, hintEl, targets }) {
    this.camera = camera;
    this.hintEl = hintEl;
    this.targets = targets;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = distance;
    this.center = new THREE.Vector2(0, 0);
    this.current = null; // { owner, hit, text }
    this.formatText = (text) => text; // z. B. „Linksklick“ → „Tippen“ auf dem Tablet
  }

  // Erstes interaktive Objekt unter dem Strahl durch point (−1…1, Bildmitte = 0,0) oder null
  pick(point) {
    this.raycaster.setFromCamera(point, this.camera);
    const hits = [];
    for (const target of this.targets) raycastVisible(target, this.raycaster, hits);
    hits.sort((a, b) => a.distance - b.distance);
    const hit = hits[0];
    let owner = hit?.object;
    while (owner && !owner.userData.interaction) owner = owner.parent;
    return owner ? { owner, hit } : null;
  }

  update(active) {
    let found = null;
    if (active) {
      const picked = this.pick(this.center);
      const text = picked?.owner.userData.interaction.hint(picked.hit);
      if (text) found = { ...picked, text };
    }

    if (this.current && this.current.owner !== found?.owner) {
      this.current.owner.userData.interaction.unhover?.();
    }
    this.current = found;
    found?.owner.userData.interaction.hover?.(found.hit);

    this.hintEl.textContent = found ? this.formatText(found.text) : '';
    this.hintEl.classList.toggle('hidden', !found);
  }

  click() {
    const c = this.current;
    c?.owner.userData.interaction.action?.(c.hit);
  }

  // Antippen auf dem Tablet: das Objekt an dieser Stelle benutzen. Gibt true zurück, wenn dort etwas war.
  clickAt(point) {
    const picked = this.pick(point);
    if (!picked) return false;
    const { owner, hit } = picked;
    if (this.current && this.current.owner !== owner) this.current.owner.userData.interaction.unhover?.();
    owner.userData.interaction.hover?.(hit); // manche Aktionen merken sich beim Zielen, wohin genau
    const text = owner.userData.interaction.hint(hit);
    this.current = { owner, hit, text };
    if (!text) return false;
    owner.userData.interaction.action?.(hit);
    return true;
  }
}
