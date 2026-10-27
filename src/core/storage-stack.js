// Kartons im Abstellraum stapeln: BOX_COLUMNS Stapel nebeneinander in der Lieferzone, jeder bis unter die Decke.
// Reine Rechnung ohne 3D – die Höhen der Kartons kommen vom Aufrufer (world/storage-room.js). Gleich hohe Kartons
// landen der Reihe nach erst auf dem Boden (1–4), dann auf den ersten (5–8) und so weiter.

export const BOX_COLUMNS = 4;

// boxes: [{ h, … }] in Lieferreihenfolge. Rückgabe: { placed: [{ box, column, y }], overflow } – overflow zählt
// Kartons, die nicht mehr unter die Decke passen; sie liegen trotzdem oben auf dem niedrigsten Stapel, damit man
// sie noch erreicht (z. B. ältere Spielstände).
export function stackBoxes(boxes, ceiling, columns = BOX_COLUMNS) {
  const tops = Array(columns).fill(0);
  const placed = [];
  let overflow = 0;
  // Hohe Kartons zuerst auf den Boden, sonst nehmen kleine den großen Schränken die Plätze weg
  const order = boxes.map((box, i) => ({ box, i })).sort((a, b) => b.box.h - a.box.h || a.i - b.i);
  for (const { box } of order) {
    const lowest = tops.indexOf(Math.min(...tops));
    let column = -1;
    for (let c = 0; c < columns; c++) {
      if (tops[c] + box.h <= ceiling && (column === -1 || tops[c] < tops[column])) column = c;
    }
    if (column === -1) {
      overflow++;
      column = lowest;
    }
    placed.push({ box, column, y: tops[column] });
    tops[column] += box.h;
  }
  return { placed, overflow };
}
