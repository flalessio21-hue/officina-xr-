import { ALL_ITEMS } from './catalog.js';
import { LIBRARY } from './library.js';

/**
 * Comprensione dei comandi in italiano, tollerante agli errori della trascrizione vocale:
 * sinonimi, plurali, parole storpiate (distanza di modifica), numeri, colori, misure e posizione.
 */
export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** La parola [w] corrisponde alla parola chiave [k]? strict = senza errori di trascrizione */
export function wordMatch(w, k, strict = false) {
  if (w === k) return true;
  if (k.length >= 4 && w.length >= 4 && w.slice(0, -1) === k.slice(0, -1)) return true; // pizza/pizze, cane/cani
  if (k.length >= 4 && (w.startsWith(k) && w.length - k.length <= 3)) return true; // maialino, gattino
  if (strict) return false;
  const tol = k.length >= 8 ? 2 : k.length >= 5 ? 1 : 0;
  return tol > 0 && lev(w, k) <= tol;
}

/** Cerca una parola chiave (anche di più parole) nella frase. */
export function hasKeyword(text, k, strict = false) {
  const t = ` ${text} `;
  if (k.includes(' ')) return t.includes(` ${k} `);
  return text.split(' ').some((w) => wordMatch(w, k, strict));
}

const NUM = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, venti: 20, dozzina: 12 };
export function countIn(t) {
  const m = t.match(/\b(\d{1,2})\b(?!\s*(mm|cm|m\b|metr|centim|millim|grad))/);
  if (m) return Math.min(30, parseInt(m[1], 10));
  for (const w of t.split(' ')) if (NUM[w] && NUM[w] > 1) return NUM[w];
  return 1;
}

export const COLORS = {
  ross: 0xff4a3d, blu: 0x4f8cff, azzurr: 0x7fc8ff, verd: 0x45d483, giall: 0xffc845, viola: 0xb57bff, bianc: 0xf2f2f2,
  ner: 0x1d1f24, grigi: 0x9aa0a8, arancion: 0xff8a2a, rosa: 0xff6fb0, oro: 0xd4af37, dorat: 0xd4af37, argent: 0xc9ced6,
  rame: 0xb87333, marron: 0x7a4a2a,
};
export function colorIn(t) {
  for (const w of t.split(' ')) for (const [k, v] of Object.entries(COLORS)) if (w.startsWith(k) && w.length - k.length <= 3) return v;
  return null;
}

/** Misura richiesta: auto | mini | real | giant */
export function sizeIn(t) {
  if (/\b(gigant|enorm|colossal|grandissim|immens|maxi)\w*|\w*gante\b|\bgigan\w*/.test(t)) return 'giant';
  if (/\b(ver[oaie]|real[ei]|grandezza (naturale|reale)|dimensioni? (reali|vere|naturali)|a grandezza|in scala reale|grande come)\b/.test(t)) return 'real';
  if (/\b(piccol|mini|miniatur|minuscol|modellin|in scala ridotta)\w*/.test(t)) return 'mini';
  return 'auto';
}

/** Dove: desk (scrivania) | front (davanti a me) | above (dal cielo, sopra di me) */
export function whereIn(t) {
  if (/(sopra di me|su di me|dal cielo|sulla (mia )?testa|addosso|qui sopra)/.test(t)) return 'above';
  if (/(davanti a me|accanto a me|vicino a me|per terra|sul pavimento|qui davanti|di fronte)/.test(t)) return 'front';
  if (/(sulla scrivania|sul tavolo|sul tappetino)/.test(t)) return 'desk';
  return null;
}

/** Trova l'oggetto del catalogo (o della libreria) nominato nella frase. */
export function findItem(t) {
  const lib = LIBRARY.map((it) => ({ ...it, words: [it.label.toLowerCase(), ...(LIB_WORDS[it.id] || [])], fromLibrary: true }));
  const all = [...ALL_ITEMS, ...lib];
  // prima le espressioni di più parole, poi le parole singole più lunghe
  const entries = [];
  for (const it of all) for (const w of it.words) entries.push([norm(w), it]);
  entries.sort((a, b) => (b[0].includes(' ') - a[0].includes(' ')) || b[0].length - a[0].length);
  // prima le corrispondenze esatte (o plurali), solo dopo quelle "storpiate" dalla voce
  for (const [k, it] of entries) if (hasKeyword(t, k, true)) return it;
  for (const [k, it] of entries) if (hasKeyword(t, k)) return it;
  return null;
}

const LIB_WORDS = {
  drone: ['drone', 'quadricottero'], engine: ['motore', 'pistone'], gearbox: ['riduttore', 'cambio', 'scatola ingranaggi'],
  robot: ['braccio robotico', 'braccio meccanico'], fan: ['ventilatore', 'pala'], rocket: ['razzo', 'missile', 'navicella'],
  car: ['automobilina', 'macchinina', 'modellino auto'], clock: ['orologio', 'sveglia'], keyboard: ['tastiera'],
  satellite: ['satellite'], house: ['casetta'], camera: ['fotocamera', 'macchina fotografica'], chair: ['sedia', 'sedia da ufficio'],
  bulb: ['lampadina'], screwnut: ['vite e dado', 'bullone'], screw: ['vite'],
};

/** Verbi che indicano "togli/elimina" (per non creare per sbaglio). */
export const REMOVE = /\b(elimina|cancella|togli|rimuovi|butta|distruggi|leva|fai sparire|via)\b/;
