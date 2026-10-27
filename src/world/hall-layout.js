// Hallen-Maße: wo die Drucktische stehen und wo darauf Drucker und Regale ihren Platz haben.
// Gemeinsam genutzt von Halle, Druckertisch, Kater und Mitarbeitern.
import { RACKS_PER_TABLE, SLOTS_PER_TABLE } from '../core/upgrades.js';

export const PRINTER_SLOTS_X = [-2.1, -0.7, 0.7, 2.1]; // Stellplätze auf einem Drucktisch (Welt-x)
export const RACK_SLOTS_X = [-1.4, 0, 1.4];            // Regalplätze in den Lücken zwischen den Druckern
export const TABLE_ROWS_Z = [0, -2.6, -5.2, -7.8];      // Drucktische hintereinander (Welt-z), der erste vorne

// Weltposition eines Drucker- bzw. Regalplatzes. Plätze sind über alle Tische durchnummeriert.
export const slotX = (slot) => PRINTER_SLOTS_X[slot % SLOTS_PER_TABLE];
export const slotZ = (slot) => TABLE_ROWS_Z[Math.floor(slot / SLOTS_PER_TABLE)];
export const rackX = (slot) => RACK_SLOTS_X[slot % RACKS_PER_TABLE];
export const rackZ = (slot) => TABLE_ROWS_Z[Math.floor(slot / RACKS_PER_TABLE)];
