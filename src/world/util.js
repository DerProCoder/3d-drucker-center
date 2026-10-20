// Kleine Helfer, die mehrere Module brauchen.

// Schatten für alle Meshes einer Gruppe einschalten (außer userData.noShadow). Lichter bleiben außen vor: Ein
// Punktlicht mit Schatten zeichnet die Szene in jedem Bild sechsmal zusätzlich (einmal pro Würfelseite) – ob
// Deckenlampen Schatten werfen, entscheidet die Grafikstufe (world/graphics.js).
export function enableShadows(object) {
  object.traverse((obj) => {
    if (obj.userData.noShadow || obj.isLight) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}
