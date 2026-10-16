import {APP_VERSION, SCHEMA_VERSION, validateBundle} from './domain.js';
import {buildIndex} from './rag.js';
const DB_NAME = 'quecomemos';
const DB_VERSION = 1;
const STORES = ['familia', 'recetas', 'fuentes', 'fragmentos', 'indice', 'menus', 'ajustes'];
export function defaults() {
  return {schemaVersion: SCHEMA_VERSION, kind: 'backup', appVersion: APP_VERSION, synthetic: false, family: {members: [], outsideMeals: []}, recipes: [], sources: [], chunks: [], menus: [], pantry: [], shopping: [], settings: {packages: []}};
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB no está disponible en este navegador.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cierra otras pestañas de QuéComemos para actualizar sus datos.'));
  });
}
export async function loadState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('ajustes', 'readonly');
    const request = transaction.objectStore('ajustes').get('snapshot');
    let result = null;
    request.onsuccess = () => { result = request.result ?? null; };
    transaction.oncomplete = () => { db.close(); if (result && validateBundle(result).length) reject(new Error('La copia local no pasa la validación. Exporta o restaura una copia válida.')); else resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
export async function saveState(bundle) {
  const errors = validateBundle(bundle);
  if (errors.length) throw new Error(`No se han guardado datos inválidos: ${errors.slice(0, 5).join(' ')}`);
  const snapshot = structuredClone({...bundle, kind: 'backup'});
  const index = buildIndex(snapshot.chunks);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES, 'readwrite');
    for (const name of STORES) transaction.objectStore(name).clear();
    transaction.objectStore('familia').put(snapshot.family, 'actual');
    for (const [key, store] of [['recipes', 'recetas'], ['sources', 'fuentes'], ['chunks', 'fragmentos'], ['menus', 'menus']]) for (const item of snapshot[key]) transaction.objectStore(store).put(item, item.id);
    transaction.objectStore('indice').put(index, 'bm25');
    transaction.objectStore('ajustes').put(snapshot, 'snapshot');
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('No se pudo guardar; se conserva la transacción anterior.')); };
  });
}
export async function clearState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES, 'readwrite');
    for (const name of STORES) transaction.objectStore(name).clear();
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}
