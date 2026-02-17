export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FILE_NAME = 'linkedin-notes.json';
export const DRIVE_MIME_TYPE = 'application/json';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function createDriveError(message, status, code) {
  const error = new Error(message);
  error.status = status || 0;
  error.code = code || 'DRIVE_ERROR';
  return error;
}

function parseDriveErrorMessage(raw) {
  if (!raw) {
    return 'Google Drive API request failed.';
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.error && parsed.error.message) {
      return parsed.error.message;
    }
  } catch (error) {
    // Ignore parse error and keep fallback message.
  }
  return 'Google Drive API request failed.';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Low-level fetch wrapper retries once on transient 5xx and normalizes network errors.
async function fetchWithAuth(token, url, options, retriesLeft = 1) {
  const requestOptions = Object.assign({}, options || {});
  requestOptions.headers = Object.assign({}, requestOptions.headers || {}, {
    Authorization: `Bearer ${token}`
  });

  let response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    throw createDriveError('Network request failed.', 0, 'NETWORK_ERROR');
  }

  if (response.status >= 500 && response.status <= 599 && retriesLeft > 0) {
    await sleep(500);
    return fetchWithAuth(token, url, options, retriesLeft - 1);
  }

  if (!response.ok) {
    const bodyText = await response.text();
    throw createDriveError(parseDriveErrorMessage(bodyText), response.status, 'DRIVE_HTTP_ERROR');
  }

  return response;
}

export async function findDriveFileByName(token) {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const fields = encodeURIComponent('files(id,name)');
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&pageSize=1&spaces=drive`;
  const response = await fetchWithAuth(token, url, { method: 'GET' });
  const payload = await response.json();
  return payload.files && payload.files.length ? payload.files[0] : null;
}

export async function createDriveFile(token, initialData) {
  const metadataUrl = `${DRIVE_API_BASE}/files?fields=id,name`;
  const metadataResponse = await fetchWithAuth(token, metadataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DRIVE_FILE_NAME,
      mimeType: DRIVE_MIME_TYPE
    })
  });

  const metadata = await metadataResponse.json();
  if (!metadata || !metadata.id) {
    throw createDriveError('Drive file creation returned no file id.', 500, 'DRIVE_CREATE_FAILED');
  }

  await uploadDriveFile(token, metadata.id, initialData);
  return metadata.id;
}

// Download validates JSON; empty/corrupt payloads are surfaced with explicit error codes.
export async function downloadDriveFile(token, fileId) {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;

  let response;
  try {
    response = await fetchWithAuth(token, url, { method: 'GET' });
  } catch (error) {
    if (error && error.status === 404) {
      throw createDriveError('Drive file was not found.', 404, 'FILE_NOT_FOUND');
    }
    throw error;
  }

  const raw = (await response.text()).trim();
  if (!raw) {
    throw createDriveError('Remote file is empty.', 200, 'REMOTE_EMPTY');
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw createDriveError('Remote file contains invalid JSON.', 200, 'REMOTE_CORRUPT');
  }
}

export async function uploadDriveFile(token, fileId, data) {
  const url = `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media`;

  try {
    await fetchWithAuth(token, url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data, null, 2)
    });
  } catch (error) {
    if (error && error.status === 404) {
      throw createDriveError('Drive file was not found during upload.', 404, 'FILE_NOT_FOUND');
    }
    throw error;
  }
}
