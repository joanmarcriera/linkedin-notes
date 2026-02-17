import {
  DRIVE_SCOPE,
  findDriveFileByName,
  createDriveFile,
  downloadDriveFile,
  uploadDriveFile
} from './drive.js';
import {
  getLocalDataset,
  setLocalDataset,
  getDriveFileId,
  setDriveFileId,
  clearDriveFileId
} from './storage.js';

const RELATIONSHIP_VALUES = new Set(['peer', 'recruiter', 'hiring_manager', 'vendor', 'other']);
const OAUTH_CLIENT_ID_PLACEHOLDER = 'PASTE_YOUR_EXTENSION_OAUTH_CLIENT_ID_HERE';

function createAppError(message, status, code) {
  const error = new Error(message);
  error.status = status || 0;
  error.code = code || 'UNKNOWN';
  return error;
}

function nowIsoUtc() {
  return new Date().toISOString();
}

function isValidDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Canonical profile key is origin + path only, without trailing slash, query, or hash.
function canonicalizeProfileUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.pathname.startsWith('/in/')) {
      return null;
    }
    const trimmedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${trimmedPath}`;
  } catch (error) {
    return null;
  }
}

function normalizeRelationship(value) {
  if (typeof value !== 'string') {
    return 'other';
  }
  const lowered = value.trim().toLowerCase();
  return RELATIONSHIP_VALUES.has(lowered) ? lowered : 'other';
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Normalized records guarantee stable merge and UI defaults.
function normalizeProfileRecord(record) {
  const safe = record && typeof record === 'object' ? record : {};
  return {
    notes: typeof safe.notes === 'string' ? safe.notes : '',
    tags: normalizeTags(safe.tags),
    relationship: normalizeRelationship(safe.relationship),
    last_contacted: isValidDateOnly(safe.last_contacted) ? safe.last_contacted : '',
    updated_at: typeof safe.updated_at === 'string' && safe.updated_at ? safe.updated_at : '1970-01-01T00:00:00.000Z'
  };
}

function normalizeDataset(data) {
  const safe = data && typeof data === 'object' ? data : {};
  const meta = safe.meta && typeof safe.meta === 'object' ? safe.meta : {};
  const profiles = safe.profiles && typeof safe.profiles === 'object' ? safe.profiles : {};

  const normalizedProfiles = {};
  for (const [key, value] of Object.entries(profiles)) {
    if (typeof key !== 'string' || !key.trim()) {
      continue;
    }
    normalizedProfiles[key] = normalizeProfileRecord(value);
  }

  return {
    meta: {
      version: 1,
      last_sync: typeof meta.last_sync === 'string' ? meta.last_sync : ''
    },
    profiles: normalizedProfiles
  };
}

function parseUpdatedAt(value) {
  const millis = Date.parse(value || '');
  return Number.isFinite(millis) ? millis : 0;
}

// Merge local and remote profile maps with last-write-wins per profile key.
function mergeDatasets(localData, remoteData) {
  const merged = normalizeDataset(localData);
  const remote = normalizeDataset(remoteData);

  for (const [profileUrl, remoteRecord] of Object.entries(remote.profiles)) {
    const localRecord = merged.profiles[profileUrl];
    if (!localRecord) {
      merged.profiles[profileUrl] = normalizeProfileRecord(remoteRecord);
      continue;
    }

    const localTs = parseUpdatedAt(localRecord.updated_at);
    const remoteTs = parseUpdatedAt(remoteRecord.updated_at);
    merged.profiles[profileUrl] = remoteTs > localTs ? normalizeProfileRecord(remoteRecord) : normalizeProfileRecord(localRecord);
  }

  return merged;
}

function buildErrorResponse(status, errorCode) {
  return {
    ok: false,
    status,
    errorCode
  };
}

function hasMeaningfulContent(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  const hasNotes = typeof record.notes === 'string' && record.notes.trim().length > 0;
  const hasTags = Array.isArray(record.tags) && record.tags.length > 0;
  const hasRelationship = typeof record.relationship === 'string' && record.relationship !== 'other';
  const hasLastContacted = typeof record.last_contacted === 'string' && record.last_contacted.length > 0;
  return hasNotes || hasTags || hasRelationship || hasLastContacted;
}

function profileDisplayName(profileUrl) {
  try {
    const parsed = new URL(profileUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const slug = segments.length > 1 ? segments[1] : profileUrl;
    return decodeURIComponent(slug).replace(/[-_]+/g, ' ');
  } catch (error) {
    return profileUrl;
  }
}

function getOAuthClientIdFromManifest() {
  const manifest = chrome.runtime.getManifest();
  return manifest && manifest.oauth2 && typeof manifest.oauth2.client_id === 'string'
    ? manifest.oauth2.client_id
    : '';
}

function isOAuthClientConfigured() {
  const clientId = getOAuthClientIdFromManifest();
  return Boolean(clientId && !clientId.includes(OAUTH_CLIENT_ID_PLACEHOLDER));
}

function buildSyncSuccessResponse(dataset, profileUrl) {
  return {
    ok: true,
    status: `Synced at ${dataset.meta.last_sync}`,
    syncTime: dataset.meta.last_sync,
    profileRecord: dataset.profiles[profileUrl] || normalizeProfileRecord({})
  };
}

function isRemoteCorruptError(error) {
  return error && (error.code === 'REMOTE_EMPTY' || error.code === 'REMOTE_CORRUPT');
}

function isNetworkError(error) {
  return !!(error && (error.code === 'NETWORK_ERROR' || error.code === 'NETWORK_TIMEOUT'));
}

// chrome.identity is used with drive.file scope only and interactive prompt only on user actions.
async function getAccessToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes: [DRIVE_SCOPE] }, (token) => {
      if (chrome.runtime.lastError) {
        reject(createAppError(chrome.runtime.lastError.message, 0, 'AUTH'));
        return;
      }
      if (!token) {
        reject(createAppError('No OAuth token was returned.', 0, 'AUTH'));
        return;
      }
      resolve(token);
    });
  });
}

async function invalidateToken(token) {
  if (!token) {
    return;
  }
  await new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function safeInvalidateToken(token) {
  try {
    await invalidateToken(token);
  } catch (error) {
    // Ignore cache invalidation failures and continue with re-auth.
  }
}

function normalizeIncomingFields(fields) {
  const safe = fields && typeof fields === 'object' ? fields : {};
  return {
    notes: typeof safe.notes === 'string' ? safe.notes : '',
    tags: normalizeTags(safe.tags),
    relationship: normalizeRelationship(safe.relationship),
    last_contacted: isValidDateOnly(safe.last_contacted) ? safe.last_contacted : '',
    updated_at: nowIsoUtc()
  };
}

async function createRemoteFromLocal(token, localData, profileUrl) {
  const prepared = normalizeDataset(localData);
  prepared.meta.last_sync = nowIsoUtc();

  const newFileId = await createDriveFile(token, prepared);
  await setDriveFileId(newFileId);
  await setLocalDataset(prepared);

  return buildSyncSuccessResponse(prepared, profileUrl);
}

// Download wrapper applies the remote-corruption policy before merge.
async function readRemoteDataWithPolicy(token, fileId, localData, replaceCorruptRemote, profileUrl) {
  try {
    const remote = await downloadDriveFile(token, fileId);
    return { kind: 'data', remoteData: remote };
  } catch (error) {
    if (error.code === 'FILE_NOT_FOUND' || error.status === 404) {
      return { kind: 'missing' };
    }

    if (isRemoteCorruptError(error)) {
      if (!replaceCorruptRemote) {
        return {
          kind: 'confirm_required',
          response: {
            ok: false,
            status: 'Remote file is empty/corrupt. Confirm overwrite with local data.',
            errorCode: 'VALIDATION',
            needsRemoteOverwriteConfirm: true
          }
        };
      }

      const repaired = normalizeDataset(localData);
      repaired.meta.last_sync = nowIsoUtc();
      await uploadDriveFile(token, fileId, repaired);
      await setLocalDataset(repaired);
      return {
        kind: 'repaired',
        response: buildSyncSuccessResponse(repaired, profileUrl)
      };
    }

    throw error;
  }
}

// Full sync routine: load local -> resolve file -> pull remote -> merge -> push merged.
async function runSyncWithToken(profileUrl, token, replaceCorruptRemote) {
  let localData = normalizeDataset(await getLocalDataset());

  let fileId = await getDriveFileId();
  if (!fileId) {
    const found = await findDriveFileByName(token);
    if (found && found.id) {
      fileId = found.id;
      await setDriveFileId(fileId);
    }
  }

  if (!fileId) {
    return createRemoteFromLocal(token, localData, profileUrl);
  }

  let remoteOutcome = await readRemoteDataWithPolicy(token, fileId, localData, replaceCorruptRemote, profileUrl);

  if (remoteOutcome.kind === 'missing') {
    await clearDriveFileId();

    const found = await findDriveFileByName(token);
    if (found && found.id) {
      fileId = found.id;
      await setDriveFileId(fileId);
      remoteOutcome = await readRemoteDataWithPolicy(token, fileId, localData, replaceCorruptRemote, profileUrl);
    } else {
      return createRemoteFromLocal(token, localData, profileUrl);
    }
  }

  if (remoteOutcome.kind === 'confirm_required' || remoteOutcome.kind === 'repaired') {
    return remoteOutcome.response;
  }

  const remoteData = normalizeDataset(remoteOutcome.remoteData);
  const merged = mergeDatasets(localData, remoteData);
  merged.meta.last_sync = nowIsoUtc();

  await uploadDriveFile(token, fileId, merged);
  await setLocalDataset(merged);

  return buildSyncSuccessResponse(merged, profileUrl);
}

// Sync retries once on 401 by invalidating token cache and requesting a new token.
async function runSyncWithAuthRetry(profileUrl, replaceCorruptRemote) {
  let token;
  try {
    token = await getAccessToken(false);
  } catch (error) {
    token = await getAccessToken(true);
  }
  let retried = false;

  while (true) {
    try {
      return await runSyncWithToken(profileUrl, token, replaceCorruptRemote);
    } catch (error) {
      if (error.status === 401 && !retried) {
        retried = true;
        await safeInvalidateToken(token);
        try {
          token = await getAccessToken(false);
        } catch (authError) {
          token = await getAccessToken(true);
        }
        continue;
      }
      throw error;
    }
  }
}

async function handleGetProfileData(profileUrl) {
  const canonical = canonicalizeProfileUrl(profileUrl);
  if (!canonical) {
    return buildErrorResponse('Invalid LinkedIn profile URL.', 'VALIDATION');
  }

  const local = normalizeDataset(await getLocalDataset());
  return {
    ok: true,
    status: 'Local data loaded.',
    profileRecord: local.profiles[canonical] || normalizeProfileRecord({})
  };
}

async function handleSaveProfileData(profileUrl, fields) {
  const canonical = canonicalizeProfileUrl(profileUrl);
  if (!canonical) {
    return buildErrorResponse('Invalid LinkedIn profile URL.', 'VALIDATION');
  }

  const local = normalizeDataset(await getLocalDataset());
  local.profiles[canonical] = normalizeIncomingFields(fields);

  await setLocalDataset(local);

  return {
    ok: true,
    status: 'Local saved.',
    profileRecord: local.profiles[canonical]
  };
}

async function handleConnect() {
  if (!isOAuthClientConfigured()) {
    return buildErrorResponse(
      'OAuth client ID is not configured in manifest.json.',
      'AUTH'
    );
  }

  try {
    await getAccessToken(true);
    return { ok: true, status: 'Connected to Google Drive.' };
  } catch (error) {
    return buildErrorResponse(`Authentication failed: ${error.message}`, 'AUTH');
  }
}

async function handleGetAuthState() {
  if (!isOAuthClientConfigured()) {
    return {
      ok: true,
      connected: false,
      status: 'OAuth client ID is missing in manifest.json.'
    };
  }

  try {
    await getAccessToken(false);
    return {
      ok: true,
      connected: true,
      status: 'Connected to Google Drive.'
    };
  } catch (error) {
    return {
      ok: true,
      connected: false,
      status: 'Not connected.'
    };
  }
}

async function handleSyncProfileData(profileUrl, replaceCorruptRemote) {
  if (!isOAuthClientConfigured()) {
    return buildErrorResponse(
      'OAuth client ID is not configured in manifest.json.',
      'AUTH'
    );
  }

  const canonical = canonicalizeProfileUrl(profileUrl);
  if (!canonical) {
    return buildErrorResponse('Invalid LinkedIn profile URL.', 'VALIDATION');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return buildErrorResponse('Offline: local save works, sync unavailable.', 'OFFLINE');
  }

  try {
    return await runSyncWithAuthRetry(canonical, Boolean(replaceCorruptRemote));
  } catch (error) {
    if (error.status === 403) {
      return buildErrorResponse('Drive access denied (403). Verify OAuth and drive.file scope.', 'DRIVE');
    }
    if (error.status === 401 || error.code === 'AUTH') {
      return buildErrorResponse('Authentication failed. Reconnect and try again.', 'AUTH');
    }
    if (isNetworkError(error)) {
      return buildErrorResponse('Network error during sync.', 'OFFLINE');
    }
    return buildErrorResponse(`Sync failed: ${error.message || 'unknown error'}`, 'UNKNOWN');
  }
}

async function handleListAllNotes() {
  const local = normalizeDataset(await getLocalDataset());
  const items = [];

  for (const [profileUrl, rawRecord] of Object.entries(local.profiles)) {
    const record = normalizeProfileRecord(rawRecord);
    if (!hasMeaningfulContent(record)) {
      continue;
    }

    items.push({
      profileUrl,
      displayName: profileDisplayName(profileUrl),
      notes: record.notes,
      tags: record.tags,
      relationship: record.relationship,
      last_contacted: record.last_contacted,
      updated_at: record.updated_at
    });
  }

  items.sort((a, b) => parseUpdatedAt(b.updated_at) - parseUpdatedAt(a.updated_at));
  return {
    ok: true,
    status: `Loaded ${items.length} notes.`,
    items
  };
}

async function handleRuntimeMessage(message) {
  if (!message || typeof message !== 'object') {
    return buildErrorResponse('Invalid message payload.', 'VALIDATION');
  }

  switch (message.type) {
    case 'getProfileData':
      return handleGetProfileData(message.profileUrl);
    case 'saveProfileData':
      return handleSaveProfileData(message.profileUrl, message.fields);
    case 'getAuthState':
      return handleGetAuthState();
    case 'connect':
      return handleConnect();
    case 'syncProfileData':
      return handleSyncProfileData(message.profileUrl, message.replaceCorruptRemote);
    case 'listAllNotes':
      return handleListAllNotes();
    default:
      return buildErrorResponse('Unknown message type.', 'VALIDATION');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse(buildErrorResponse(`Unhandled background error: ${error.message || 'unknown error'}`, 'UNKNOWN'));
    });

  return true;
});
