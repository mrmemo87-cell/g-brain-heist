type CachedPreviews = { key: string; savedAt: number; crops: Record<string, string> };
const previewKey = (userId: string, assignmentId: string, sheetId: string, hash: string) =>
  `${userId}:${assignmentId}:${sheetId}:${hash}`;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bh-paper-previews-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("previews", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveRowPreviews(userId: string, assignmentId: string, sheetId: string, hash: string, crops: Record<string, string>) {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction("previews", "readwrite");
      const store = tx.objectStore("previews");
      // Bound on-device storage and expire old review photographs.
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = (all.result as CachedPreviews[]).sort((a, b) => b.savedAt - a.savedAt);
        rows.forEach((row, index) => { if (index >= 99 || row.savedAt < Date.now() - 7 * 86400000) store.delete(row.key); });
        store.put({ key: previewKey(userId, assignmentId, sheetId, hash), savedAt: Date.now(), crops });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
  finally { db?.close(); }
}
export async function loadRowPreviews(userId: string, assignmentId: string, sheetId: string, hash: string): Promise<Record<string, string> | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    return await new Promise((resolve, reject) => {
      const tx = db!.transaction("previews", "readonly");
      const request = tx.objectStore("previews").get(previewKey(userId, assignmentId, sheetId, hash));
      request.onsuccess = () => {
        const row = request.result as CachedPreviews | undefined;
        resolve(row && row.savedAt >= Date.now() - 7 * 86400000 ? row.crops : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
  finally { db?.close(); }
}
