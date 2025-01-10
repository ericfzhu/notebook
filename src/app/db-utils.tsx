// db-utils.ts
export interface KindleHighlight {
  id: string; // Highlight-specific ID
  bookId: string; // Stable book identifier
  title: string;
  author: string;
  highlight: string;
  location: string;
  timestamp: string;
  originalData?: {
    title: string;
    author: string;
  };
  isEdited?: boolean;
}

export const DB_NAME = "NotebookDB";
export const DB_VERSION = 2;
export const STORE_NAME = "highlights";

// Type guard for IDBDatabase
function isIDBDatabase(db: any): db is IDBDatabase {
  return db && typeof db === "object" && "createObjectStore" in db;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      if (isIDBDatabase(db)) {
        resolve(db);
      } else {
        reject(new Error("Failed to open database"));
      }
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("bookId", "bookId", { unique: false });
      store.createIndex("bookId_location", ["bookId", "location"], {
        unique: true,
      });
      store.createIndex("title", "title", { unique: false });
    };
  });
}

function getStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  const transaction = db.transaction(STORE_NAME, mode);
  return transaction.objectStore(STORE_NAME);
}

export async function getAllHighlights(): Promise<KindleHighlight[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const store = getStore(db, "readonly");
      const request = store.getAll();

      request.onsuccess = () => {
        const highlights = request.result as KindleHighlight[];
        db.close();
        resolve(highlights);
      };

      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function putHighlight(highlight: KindleHighlight): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const store = getStore(db, "readwrite");
      const request = store.put(highlight);

      request.onsuccess = () => {
        db.close();
        resolve();
      };

      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function putHighlights(
  highlights: KindleHighlight[]
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      // Use a single transaction for all puts
      for (const highlight of highlights) {
        store.put(highlight);
      }
    } catch (error) {
      reject(error);
    }
  });
}

export async function clearStore(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const store = getStore(db, "readwrite");
      const request = store.clear();

      request.onsuccess = () => {
        db.close();
        resolve();
      };

      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function getHighlightsByBookId(
  bookId: string
): Promise<KindleHighlight[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const store = getStore(db, "readonly");
      const index = store.index("bookId");
      const request = index.getAll(bookId);

      request.onsuccess = () => {
        const highlights = request.result as KindleHighlight[];
        db.close();
        resolve(highlights);
      };

      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function searchHighlights(
  query: string
): Promise<KindleHighlight[]> {
  const highlights = await getAllHighlights();
  const lowerQuery = query.toLowerCase();

  return highlights.filter(
    (highlight) =>
      highlight.title.toLowerCase().includes(lowerQuery) ||
      highlight.author.toLowerCase().includes(lowerQuery) ||
      highlight.highlight.toLowerCase().includes(lowerQuery)
  );
}

// Utility function to batch operations
export async function batchOperation<T>(
  items: T[],
  operation: (item: T) => Promise<void>,
  batchSize = 100
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(operation));
  }
}
