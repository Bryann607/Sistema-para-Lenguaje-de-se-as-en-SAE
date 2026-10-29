// Almacén local (IndexedDB) de las muestras que se graban en el navegador.

const DB_NAME = 'lsp-upsjb-datos';
const STORE = 'muestras';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('label', 'label');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  async add(sample) { return tx('readwrite', (s) => wrap(s.add(sample))); },
  async addMany(samples) { return tx('readwrite', (s) => Promise.all(samples.map((x) => wrap(s.add(x))))); },
  async all() { return tx('readonly', (s) => wrap(s.getAll())); },
  async count() { return tx('readonly', (s) => wrap(s.count())); },
  async counts() {
    const all = await this.all();
    const c = {};
    for (const m of all) c[m.label] = (c[m.label] || 0) + 1;
    return c;
  },
  async removeLast() {
    return tx('readwrite', (s) => new Promise((res, rej) => {
      const req = s.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return res(null);
        const label = cur.value.label;
        cur.delete();
        res(label);
      };
      req.onerror = () => rej(req.error);
    }));
  },
  async clear() { return tx('readwrite', (s) => wrap(s.clear())); },
};
