// Linksklick-Interaktion: Strahl aus der Bildmitte, das erste getroffene Objekt zählt (Wände verdecken).
// Ein Objekt wird interaktiv, indem es (oder ein Elternobjekt) userData.interaction bekommt:
//   hint(hit)   → Text unter dem Fadenkreuz oder null (gerade nicht interaktiv)
//   action(hit) → wird beim Linksklick ausgeführt
//   hover(hit) / unhover() → optional, z. B. für Vorschauen
import * as THREE from 'three';

export class Interaction {
  constructor({ camera, distance, hintEl, targets }) {
    this.camera = camera;
    this.hintEl = hintEl;
    this.targets = targets;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = distance;
    this.center = new THREE.Vector2(0, 0);
    this.current = null; // { owner, hit, text }
  }

  update(active) {
    let found = null;
    if (active) {
      this.raycaster.setFromCamera(this.center, this.camera);
      const hit = this.raycaster.intersectObjects(this.targets, true)[0];
      let owner = hit?.object;
      while (owner && !owner.userData.interaction) owner = owner.parent;
      const text = owner?.userData.interaction.hint(hit);
      if (text) found = { owner, hit, text };
    }

    if (this.current && this.current.owner !== found?.owner) {
      this.current.owner.userData.interaction.unhover?.();
    }
    this.current = found;
    found?.owner.userData.interaction.hover?.(found.hit);

    this.hintEl.textContent = found?.text ?? '';
    this.hintEl.classList.toggle('hidden', !found);
  }

  click() {
    const c = this.current;
    c?.owner.userData.interaction.action?.(c.hit);
  }
}
