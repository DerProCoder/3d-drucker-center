// Wörterbuch Spanisch: sammelt die Teildateien. Jede Teildatei gehört einem Bereich des Spiels (siehe i18n.js):
// base.js – Start-/Pausenbildschirm, HUD, Touch-Knöpfe, Fadenkreuz-Hinweise, Abblenden (#69)
// apps.js – PC-/Tablet-Apps und Fenster · catalog.js – Katalognamen, Kunden, Erfolge
// messages.js – Meldungen aus main.js und core/ · world.js – 3D-Schilder, Canvas-Texturen, Hinweise in world/ (#70)
import { mergeParts } from '../merge.js';
import base from './base.js';
import apps from './apps.js';
import catalog from './catalog.js';
import messages from './messages.js';
import world from './world.js';

export default mergeParts('es', { 'base.js': base, 'apps.js': apps, 'catalog.js': catalog, 'messages.js': messages, 'world.js': world });
