// Kleine Helfer, die mehrere Module brauchen.

// Schatten für alle Meshes einer Gruppe einschalten (außer userData.noShadow)
export function enableShadows(object) {
  object.traverse((obj) => {
    if (obj.userData.noShadow) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}
