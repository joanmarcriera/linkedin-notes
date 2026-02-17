// Shared storage constants keep local dataset and Drive file binding stable over time.
export const STORAGE_KEYS = {
  LOCAL_DATA: 'ln_local_data',
  DRIVE_FILE_ID: 'ln_drive_file_id'
};

function getChromeStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(values, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

function setChromeStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function removeChromeStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function getLocalDataset() {
  const result = await getChromeStorage({ [STORAGE_KEYS.LOCAL_DATA]: null });
  return result[STORAGE_KEYS.LOCAL_DATA];
}

export async function setLocalDataset(data) {
  await setChromeStorage({ [STORAGE_KEYS.LOCAL_DATA]: data });
}

export async function getDriveFileId() {
  const result = await getChromeStorage({ [STORAGE_KEYS.DRIVE_FILE_ID]: '' });
  return typeof result[STORAGE_KEYS.DRIVE_FILE_ID] === 'string' ? result[STORAGE_KEYS.DRIVE_FILE_ID] : '';
}

export async function setDriveFileId(fileId) {
  await setChromeStorage({ [STORAGE_KEYS.DRIVE_FILE_ID]: fileId || '' });
}

export async function clearDriveFileId() {
  await removeChromeStorage([STORAGE_KEYS.DRIVE_FILE_ID]);
}
