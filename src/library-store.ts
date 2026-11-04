import type { Library } from './catalog-types';
import { normalizeLibrary } from './library-model';

export type StoredFile = { file: Blob; name: string; lastModified: number };
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open('hold-my-brief-library', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('state');
        request.result.createObjectStore('files');
      };
      request.onerror = () => reject(request.error ?? Error('Browser library storage is unavailable.'));
      request.onblocked = () => {
        blocked = true;
        reject(Error('Close other Hold My Brief tabs to update browser library storage.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

export async function getBrowserLibrary(): Promise<Library> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readonly');
    const request = transaction.objectStore('state').get('library');
    request.onsuccess = () => {
      try { result = normalizeLibrary(request.result); }
      catch (error) { failure = error; transaction.abort(); }
    };
    let result: Library;
    let failure: unknown;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure ?? transaction.error ?? Error('Could not read the browser library.'));
    transaction.onerror = () => reject(transaction.error ?? Error('Could not read the browser library.'));
  });
}

// A single read/write transaction serializes edits across tabs and commits file
// blobs together with their library entries. No copied byte buffers are needed.
export async function mutateBrowserLibrary(change: (library: Library, files: IDBObjectStore) => void): Promise<Library> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['state', 'files'], 'readwrite');
    const state = transaction.objectStore('state');
    const request = state.get('library');
    let library: Library;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        library = normalizeLibrary(request.result);
        change(library, transaction.objectStore('files'));
        state.put(library, 'library');
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(library);
    transaction.onabort = () => reject(failure ?? transaction.error ?? Error('The browser library could not be saved.'));
    transaction.onerror = () => reject(failure ?? transaction.error ?? Error('The browser library could not be saved.'));
  });
}

export async function getBrowserFile(path: string): Promise<File> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['state', 'files'], 'readonly');
    const libraryRequest = transaction.objectStore('state').get('library');
    const fileRequest = transaction.objectStore('files').get(path);
    transaction.oncomplete = () => {
      const library = libraryRequest.result as Library | undefined;
      const stored = fileRequest.result as StoredFile | undefined;
      if (!library?.documents.some(document => document.path === path) || !stored) {
        reject(Error('This document is no longer available in the browser library. Add the original file again.'));
        return;
      }
      resolve(stored.file instanceof File ? stored.file : new File([stored.file], stored.name, { lastModified: stored.lastModified }));
    };
    transaction.onabort = () => reject(transaction.error ?? Error('Could not read the stored document.'));
    transaction.onerror = () => reject(transaction.error ?? Error('Could not read the stored document.'));
  });
}
