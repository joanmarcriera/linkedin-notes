(function () {
  const URL_WATCH_INTERVAL_MS = 1000;
  const PANEL_ID = 'linkedin-notes-extension-panel';

  const RELATIONSHIP_VALUES = new Set(['peer', 'recruiter', 'hiring_manager', 'vendor', 'other']);

  let panelController = null;
  let currentProfileUrl = null;
  let lastHref = window.location.href;
  let isBusy = false;
  let watcherTickInFlight = false;
  let autoSyncTimerId = null;

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

  // Canonical key is strictly derived from URL and used as profile record key across both deliverables.
  function canonicalizeProfileUrl(rawHref) {
    try {
      const parsed = new URL(rawHref || window.location.href);
      if (!parsed.pathname.startsWith('/in/')) {
        return null;
      }
      const trimmedPath = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.origin}${trimmedPath}`;
    } catch (error) {
      return null;
    }
  }

  function setBusy(nextBusy) {
    isBusy = Boolean(nextBusy);
    if (panelController) {
      panelController.setBusy(isBusy);
    }
  }

  function setStatus(message, isError) {
    if (panelController) {
      panelController.setStatus(message, Boolean(isError));
    }
  }

  function normalizeFields(fields) {
    const safe = fields && typeof fields === 'object' ? fields : {};
    return {
      notes: typeof safe.notes === 'string' ? safe.notes : '',
      tags: normalizeTags(safe.tags),
      relationship: normalizeRelationship(safe.relationship),
      last_contacted:
        typeof safe.last_contacted === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safe.last_contacted)
          ? safe.last_contacted
          : ''
    };
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { ok: false, status: 'No response from background.', errorCode: 'UNKNOWN' });
      });
    });
  }

  async function loadProfileData() {
    if (!currentProfileUrl) {
      setStatus('Open a LinkedIn /in/ profile page to use notes.', true);
      return;
    }

    const response = await sendRuntimeMessage({
      type: 'getProfileData',
      profileUrl: currentProfileUrl
    });

    if (!response.ok) {
      setStatus(response.status || 'Failed to load local data.', true);
      return;
    }

    panelController.setFormValues(response.profileRecord || {});
    setStatus(response.status || 'Local data loaded.', false);
  }

  async function refreshAuthState() {
    try {
      const response = await sendRuntimeMessage({ type: 'getAuthState' });
      if (!response || !response.ok) {
        panelController.setConnected(false);
        return false;
      }
      const connected = Boolean(response.connected);
      panelController.setConnected(connected);
      return connected;
    } catch (error) {
      panelController.setConnected(false);
      return false;
    }
  }

  async function refreshNotesListSilent() {
    if (!panelController || !panelController.isNotesListVisible()) {
      return;
    }

    try {
      const response = await sendRuntimeMessage({ type: 'listAllNotes' });
      if (response && response.ok) {
        panelController.showNotesList(response.items || []);
      }
    } catch (error) {
      // Silent refresh intentionally ignores errors to avoid noisy UI updates.
    }
  }

  function clearAutoSyncTimer() {
    if (autoSyncTimerId) {
      window.clearTimeout(autoSyncTimerId);
      autoSyncTimerId = null;
    }
  }

  function getAutoSyncConfig() {
    if (!panelController || typeof panelController.getAutoSyncConfig !== 'function') {
      return { enabled: false, delaySeconds: 3 };
    }
    return panelController.getAutoSyncConfig();
  }

  function scheduleAutoSync() {
    const autoSync = getAutoSyncConfig();
    clearAutoSyncTimer();

    if (!autoSync.enabled) {
      return;
    }

    const delaySeconds = autoSync.delaySeconds;
    setStatus(`Local saved. Auto-sync in ${delaySeconds}s...`, false);

    autoSyncTimerId = window.setTimeout(async () => {
      autoSyncTimerId = null;

      if (isBusy) {
        scheduleAutoSync();
        return;
      }

      const connected = await refreshAuthState();
      if (!connected) {
        setStatus('Auto-sync skipped: connect to Google Drive first.', true);
        return;
      }

      await onSyncClick({ fromAutoSync: true });
    }, delaySeconds * 1000);
  }

  async function onSaveClick() {
    if (!currentProfileUrl) {
      setStatus('Invalid LinkedIn profile URL.', true);
      return;
    }

    setBusy(true);
    try {
      const response = await sendRuntimeMessage({
        type: 'saveProfileData',
        profileUrl: currentProfileUrl,
        fields: normalizeFields(panelController.getFormValues())
      });

      if (!response.ok) {
        setStatus(response.status || 'Local save failed.', true);
        return;
      }

      panelController.setFormValues(response.profileRecord || {});
      setStatus(response.status || 'Local saved.', false);

      await refreshNotesListSilent();
      scheduleAutoSync();
    } catch (error) {
      setStatus(`Local save failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function onConnectClick() {
    setBusy(true);
    try {
      const response = await sendRuntimeMessage({ type: 'connect' });
      if (!response.ok) {
        panelController.setConnected(false);
        setStatus(response.status || 'Connect failed.', true);
        return;
      }

      await refreshAuthState();
      setStatus(response.status || 'Connected.', false);
    } catch (error) {
      panelController.setConnected(false);
      setStatus(`Connect failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  // Sync always saves local first, then requests pull/merge/push from background.
  async function onSyncClick(options) {
    const syncOptions = options || { fromAutoSync: false };

    if (!currentProfileUrl) {
      setStatus('Invalid LinkedIn profile URL.', true);
      return;
    }

    if (!navigator.onLine) {
      setStatus('Offline: local save works, sync unavailable.', true);
      return;
    }

    if (!syncOptions.fromAutoSync) {
      clearAutoSyncTimer();
    } else {
      setStatus('Auto-syncing...', false);
    }

    setBusy(true);
    try {
      const saveResponse = await sendRuntimeMessage({
        type: 'saveProfileData',
        profileUrl: currentProfileUrl,
        fields: normalizeFields(panelController.getFormValues())
      });

      if (!saveResponse.ok) {
        setStatus(saveResponse.status || 'Local save before sync failed.', true);
        return;
      }

      let syncResponse = await sendRuntimeMessage({
        type: 'syncProfileData',
        profileUrl: currentProfileUrl,
        replaceCorruptRemote: false
      });

      if (syncResponse && syncResponse.needsRemoteOverwriteConfirm) {
        const overwrite = window.confirm(
          'Remote Drive file is empty/corrupt. Overwrite with your local data now?'
        );

        if (!overwrite) {
          setStatus('Sync cancelled. Local data was preserved.', true);
          return;
        }

        syncResponse = await sendRuntimeMessage({
          type: 'syncProfileData',
          profileUrl: currentProfileUrl,
          replaceCorruptRemote: true
        });
      }

      if (!syncResponse.ok) {
        setStatus(syncResponse.status || 'Sync failed.', true);
        if (syncResponse.errorCode === 'AUTH') {
          await refreshAuthState();
        }
        return;
      }

      panelController.setFormValues(syncResponse.profileRecord || {});
      await refreshAuthState();
      setStatus(syncResponse.status || 'Sync completed.', false);
      await refreshNotesListSilent();
    } catch (error) {
      setStatus(`Sync failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function onAllNotesClick() {
    setBusy(true);
    try {
      const response = await sendRuntimeMessage({ type: 'listAllNotes' });
      if (!response.ok) {
        setStatus(response.status || 'Failed to load notes list.', true);
        return;
      }

      panelController.showNotesList(response.items || []);
      setStatus(response.status || 'Loaded notes list.', false);
    } catch (error) {
      setStatus(`Failed to load notes list: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function refreshForCurrentUrl() {
    currentProfileUrl = canonicalizeProfileUrl(window.location.href);
    if (!currentProfileUrl) {
      panelController.clearForm();
      setStatus('Open a LinkedIn /in/ profile page to use notes.', true);
      return;
    }
    await loadProfileData();
  }

  function bindPanelHandlers() {
    panelController.onSave(() => {
      onSaveClick().catch((error) => setStatus(`Local save failed: ${error.message}`, true));
    });
    panelController.onConnect(() => {
      onConnectClick().catch((error) => setStatus(`Connect failed: ${error.message}`, true));
    });
    panelController.onSync(() => {
      onSyncClick({ fromAutoSync: false }).catch((error) => setStatus(`Sync failed: ${error.message}`, true));
    });
    panelController.onAllNotes(() => {
      onAllNotesClick().catch((error) => setStatus(`Failed to load notes list: ${error.message}`, true));
    });
  }

  async function ensurePanelPresent() {
    if (!document.getElementById(PANEL_ID)) {
      panelController = window.LinkedInNotesUI.createOrGetPanel();
      bindPanelHandlers();
      await refreshAuthState();
      await refreshForCurrentUrl();
      await refreshNotesListSilent();
    }
  }

  function startUrlWatcher() {
    window.setInterval(async () => {
      if (watcherTickInFlight) {
        return;
      }

      watcherTickInFlight = true;
      try {
        await ensurePanelPresent();
        if (window.location.href !== lastHref) {
          lastHref = window.location.href;
          await refreshForCurrentUrl();
        }
      } finally {
        watcherTickInFlight = false;
      }
    }, URL_WATCH_INTERVAL_MS);
  }

  async function waitForDomReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      return;
    }

    await new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  async function init() {
    if (!window.LinkedInNotesUI || typeof window.LinkedInNotesUI.createOrGetPanel !== 'function') {
      return;
    }

    await waitForDomReady();
    panelController = window.LinkedInNotesUI.createOrGetPanel();
    bindPanelHandlers();
    await refreshAuthState();
    await refreshForCurrentUrl();
    startUrlWatcher();
  }

  init().catch((error) => {
    // Fallback alert is used only when panel status can't be shown due to initialization failure.
    alert(`LinkedIn Notes extension failed to initialize: ${error.message}`);
  });
})();
