import {ImageJob} from '../types';

const DB_NAME = 'ImgCompress_DB';
const STORE_NAME = 'jobs';
const DB_VERSION = 1;

/**
 * Opens (or creates) the IndexedDB database.
 * IndexedDB is fully client sided and is a built in db in web browsers.
 * What it does is if you ever refresh the site, it will still have the images you compressed
 * in the queue, uncompressed images will also then continue to compress and your selected settings. 
 * If you dont want this caching to local memory, theres an option in the website.
 * Turn on incognito mode in our advanced settings tab.
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'id'});
      }
    };

    request.onsuccess = event => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = event => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

/**
 * We strip the previewUrl because Object URLs expire on refresh.
 */
export const saveJobToDb = async (job: ImageJob): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    // Remove previewUrl
    const jobToSave = {...job};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (jobToSave as any).previewUrl;

    store.put(jobToSave);
  } catch (e) {
    console.error('Failed to save job to DB', e);
  }
};

export const deleteJobFromDb = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
  } catch (e) {
    console.error('Failed to delete job from DB', e);
  }
};

export const clearDb = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  } catch (e) {
    console.error('Failed to clear DB', e);
  }
};

/**
 * If a job was still processing when saved,
 * it returns as 'queued' so it can restart the compression.
 */
export const getAllJobsFromDb = async (): Promise<ImageJob[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rawJobs = request.result as ImageJob[];
        const hydratedJobs = rawJobs.map(job => {
          // If it was interrupted, reset to queued
          if (job.status === 'processing') {
            return {...job, status: 'queued', progress: 0} as ImageJob;
          }
          return job;
        });

        resolve(hydratedJobs);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to load jobs', e);
    return [];
  }
};
