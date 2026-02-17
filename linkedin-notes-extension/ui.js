(function () {
  const PANEL_ID = 'linkedin-notes-extension-panel';
  const STYLE_ID = 'linkedin-notes-extension-style';
  const LAUNCHER_ID = 'linkedin-notes-extension-launcher';
  const UI_STATE_KEY = 'linkedin_notes_ui_state';
  const RELATIONSHIP_VALUES = new Set(['peer', 'recruiter', 'hiring_manager', 'vendor', 'other']);

  function loadUiState() {
    try {
      const raw = window.localStorage.getItem(UI_STATE_KEY);
      if (!raw) {
        return { minimized: false, hidden: false, autoSyncEnabled: false, autoSyncDelay: 3 };
      }
      const parsed = JSON.parse(raw);
      const delay = Number(parsed.autoSyncDelay);
      return {
        minimized: Boolean(parsed.minimized),
        hidden: Boolean(parsed.hidden),
        autoSyncEnabled: Boolean(parsed.autoSyncEnabled),
        autoSyncDelay: [2, 3, 5].includes(delay) ? delay : 3
      };
    } catch (error) {
      return { minimized: false, hidden: false, autoSyncEnabled: false, autoSyncDelay: 3 };
    }
  }

  function saveUiState(state) {
    try {
      window.localStorage.setItem(
        UI_STATE_KEY,
        JSON.stringify({
          minimized: Boolean(state.minimized),
          hidden: Boolean(state.hidden),
          autoSyncEnabled: Boolean(state.autoSyncEnabled),
          autoSyncDelay: Number(state.autoSyncDelay) || 3
        })
      );
    } catch (error) {
      // Ignore storage failures; UI still works for current page session.
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseDateSafe(value) {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function isValidDateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function deriveDisplayName(profileUrl) {
    try {
      const parsed = new URL(profileUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const slug = segments.length > 1 ? segments[1] : profileUrl;
      return decodeURIComponent(slug).replace(/[-_]+/g, ' ');
    } catch (error) {
      return profileUrl;
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        top: 90px;
        right: 16px;
        width: 380px;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #d0d7de;
        border-radius: 10px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
        padding: 12px;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #1f2328;
      }
      #${PANEL_ID} .ln-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      #${PANEL_ID} .ln-header-title {
        font-size: 14px;
        font-weight: 700;
      }
      #${PANEL_ID} .ln-header-actions {
        display: flex;
        gap: 6px;
      }
      #${PANEL_ID} .ln-icon-btn {
        border: 1px solid #8c959f;
        border-radius: 6px;
        background: #f6f8fa;
        width: 26px;
        height: 24px;
        line-height: 22px;
        text-align: center;
        cursor: pointer;
        font-size: 12px;
      }
      #${PANEL_ID} .ln-label {
        display: block;
        font-size: 12px;
        margin: 8px 0 4px;
      }
      #${PANEL_ID} .ln-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #c9d1d9;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
      }
      #${PANEL_ID} .ln-textarea {
        resize: vertical;
      }
      #${PANEL_ID} .ln-actions {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${PANEL_ID} .ln-btn {
        border: 1px solid #8c959f;
        background: #f6f8fa;
        border-radius: 6px;
        padding: 7px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      #${PANEL_ID} .ln-btn:disabled,
      #${PANEL_ID} .ln-icon-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      #${PANEL_ID} .ln-autosync {
        margin-top: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
      }
      #${PANEL_ID} .ln-autosync-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #${PANEL_ID} .ln-status {
        margin-top: 8px;
        font-size: 12px;
        min-height: 18px;
      }
      #${PANEL_ID} .ln-list {
        margin-top: 10px;
        border-top: 1px solid #d0d7de;
        padding-top: 10px;
      }
      #${PANEL_ID} .ln-list-controls {
        display: grid;
        gap: 6px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .ln-list-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      #${PANEL_ID} .ln-list-search {
        flex: 1;
        border: 1px solid #c9d1d9;
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 12px;
      }
      #${PANEL_ID} .ln-list-chip-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .ln-chip {
        border: 1px solid #8c959f;
        border-radius: 999px;
        background: #f6f8fa;
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
      }
      #${PANEL_ID} .ln-chip-active {
        background: #dbeafe;
        border-color: #60a5fa;
      }
      #${PANEL_ID} .ln-analytics {
        margin-bottom: 8px;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        padding: 8px;
        font-size: 11px;
        color: #57606a;
      }
      #${PANEL_ID} .ln-list-empty {
        font-size: 12px;
        color: #57606a;
      }
      #${PANEL_ID} .ln-note-item {
        border: 1px solid #d0d7de;
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 8px;
        background: #f8fafc;
      }
      #${PANEL_ID} .ln-note-link {
        color: #0969da;
        text-decoration: none;
        font-size: 12px;
        font-weight: 600;
      }
      #${PANEL_ID} .ln-note-link:hover {
        text-decoration: underline;
      }
      #${PANEL_ID} .ln-note-meta {
        margin-top: 4px;
        color: #57606a;
        font-size: 11px;
      }
      #${PANEL_ID} .ln-note-text {
        margin-top: 6px;
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${LAUNCHER_ID} {
        position: fixed;
        top: 90px;
        right: 16px;
        z-index: 2147483646;
        border: 1px solid #8c959f;
        background: #f6f8fa;
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
    `;

    document.head.appendChild(style);
  }

  function createMarkup() {
    const root = document.createElement('aside');
    root.id = PANEL_ID;
    root.innerHTML = `
      <div class="ln-header">
        <div class="ln-header-title">LinkedIn Notes</div>
        <div class="ln-header-actions">
          <button class="ln-icon-btn" data-ln-action="minimize" title="Minimize">-</button>
          <button class="ln-icon-btn" data-ln-action="hide" title="Hide">x</button>
        </div>
      </div>

      <div data-ln-role="body">
        <label class="ln-label">Notes</label>
        <textarea class="ln-input ln-textarea" data-ln-field="notes" rows="7" placeholder="Private notes for this profile..."></textarea>

        <label class="ln-label">Tags (comma-separated)</label>
        <input class="ln-input" data-ln-field="tags" type="text" placeholder="founder, ai, referral" />

        <label class="ln-label">Relationship</label>
        <select class="ln-input" data-ln-field="relationship">
          <option value="peer">peer</option>
          <option value="recruiter">recruiter</option>
          <option value="hiring_manager">hiring_manager</option>
          <option value="vendor">vendor</option>
          <option value="other">other</option>
        </select>

        <label class="ln-label">Last contacted</label>
        <input class="ln-input" data-ln-field="last_contacted" type="date" />

        <div class="ln-actions">
          <button class="ln-btn" data-ln-action="save">Save</button>
          <button class="ln-btn" data-ln-action="sync">Sync</button>
          <button class="ln-btn" data-ln-action="connect">Connect</button>
          <button class="ln-btn" data-ln-action="allnotes">All Notes</button>
        </div>

        <div class="ln-autosync">
          <label><input type="checkbox" data-ln-field="autosync_enabled" /> Auto-sync after Save</label>
          <div class="ln-autosync-right">
            <span>Delay</span>
            <select class="ln-input" style="width:auto;" data-ln-field="autosync_delay">
              <option value="2">2s</option>
              <option value="3">3s</option>
              <option value="5">5s</option>
            </select>
          </div>
        </div>

        <div class="ln-status" data-ln-role="status">Not connected.</div>
        <div class="ln-list" data-ln-role="list" hidden></div>
      </div>
    `;

    const launcher = document.createElement('button');
    launcher.id = LAUNCHER_ID;
    launcher.type = 'button';
    launcher.textContent = 'Open Notes';

    document.body.appendChild(root);
    document.body.appendChild(launcher);

    return { root, launcher };
  }

  function collectElements(root) {
    return {
      root,
      body: root.querySelector('[data-ln-role="body"]'),
      notesInput: root.querySelector('[data-ln-field="notes"]'),
      tagsInput: root.querySelector('[data-ln-field="tags"]'),
      relationshipInput: root.querySelector('[data-ln-field="relationship"]'),
      lastContactedInput: root.querySelector('[data-ln-field="last_contacted"]'),
      autoSyncEnabledInput: root.querySelector('[data-ln-field="autosync_enabled"]'),
      autoSyncDelayInput: root.querySelector('[data-ln-field="autosync_delay"]'),
      saveButton: root.querySelector('[data-ln-action="save"]'),
      syncButton: root.querySelector('[data-ln-action="sync"]'),
      connectButton: root.querySelector('[data-ln-action="connect"]'),
      allNotesButton: root.querySelector('[data-ln-action="allnotes"]'),
      minimizeButton: root.querySelector('[data-ln-action="minimize"]'),
      hideButton: root.querySelector('[data-ln-action="hide"]'),
      statusLine: root.querySelector('[data-ln-role="status"]'),
      listContainer: root.querySelector('[data-ln-role="list"]'),
      launcher: document.getElementById(LAUNCHER_ID)
    };
  }

  function hasRequiredElements(elements) {
    return Boolean(
      elements &&
        elements.body &&
        elements.notesInput &&
        elements.tagsInput &&
        elements.relationshipInput &&
        elements.lastContactedInput &&
        elements.autoSyncEnabledInput &&
        elements.autoSyncDelayInput &&
        elements.saveButton &&
        elements.syncButton &&
        elements.connectButton &&
        elements.allNotesButton &&
        elements.minimizeButton &&
        elements.hideButton &&
        elements.statusLine &&
        elements.listContainer &&
        elements.launcher
    );
  }

  function buildController(elements) {
    const handlers = {
      save: null,
      sync: null,
      connect: null,
      allNotes: null
    };

    const uiState = loadUiState();
    const listState = {
      visible: false,
      allItems: [],
      query: '',
      activeTag: '',
      followUpOnly: false,
      followUpDays: 30,
      recentFirst: true
    };

    function isFollowUpDue(item) {
      if (!isValidDateOnly(item.last_contacted)) {
        return false;
      }
      const lastContactedTime = Date.parse(`${item.last_contacted}T00:00:00Z`);
      if (!Number.isFinite(lastContactedTime)) {
        return false;
      }
      const elapsedDays = Math.floor((Date.now() - lastContactedTime) / 86400000);
      return elapsedDays >= listState.followUpDays;
    }

    function computeTagCounts(items) {
      const counts = new Map();
      for (const item of items) {
        const tags = Array.isArray(item.tags) ? item.tags : [];
        for (const tag of tags) {
          const normalized = String(tag || '').trim();
          if (!normalized) {
            continue;
          }
          counts.set(normalized, (counts.get(normalized) || 0) + 1);
        }
      }
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }

    function computeAnalytics() {
      const total = listState.allItems.length;
      const topTags = computeTagCounts(listState.allItems).slice(0, 3);
      const followUpsDue = listState.allItems.filter((item) => isFollowUpDue(item)).length;
      return { total, topTags, followUpsDue };
    }

    function applyFiltersAndSort() {
      const query = listState.query.trim().toLowerCase();
      const activeTag = listState.activeTag;

      const filtered = listState.allItems.filter((item) => {
        const notes = String(item.notes || '');
        const displayName = String(item.displayName || deriveDisplayName(item.profileUrl));
        const tags = Array.isArray(item.tags) ? item.tags : [];

        if (query) {
          const haystack = `${displayName}\n${item.profileUrl}\n${notes}\n${tags.join(',')}`.toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }

        if (activeTag) {
          const tagMatch = tags.some((tag) => String(tag).trim() === activeTag);
          if (!tagMatch) {
            return false;
          }
        }

        if (listState.followUpOnly && !isFollowUpDue(item)) {
          return false;
        }

        return true;
      });

      filtered.sort((a, b) => {
        const aTs = parseDateSafe(a.updated_at);
        const bTs = parseDateSafe(b.updated_at);
        return listState.recentFirst ? bTs - aTs : aTs - bTs;
      });

      return filtered;
    }

    function renderNotesList() {
      if (!listState.visible) {
        elements.listContainer.hidden = true;
        elements.listContainer.textContent = '';
        elements.allNotesButton.textContent = 'All Notes';
        return;
      }

      const filtered = applyFiltersAndSort();
      const tagCounts = computeTagCounts(listState.allItems);
      const analytics = computeAnalytics();

      const tagsHtml = [
        `<button class="ln-chip ${listState.activeTag ? '' : 'ln-chip-active'}" data-ln-tag="">All</button>`,
        ...tagCounts.slice(0, 20).map(([tag, count]) => {
          const activeClass = listState.activeTag === tag ? 'ln-chip-active' : '';
          return `<button class="ln-chip ${activeClass}" data-ln-tag="${escapeHtml(tag)}">${escapeHtml(tag)} (${count})</button>`;
        })
      ].join('');

      const topTagsText = analytics.topTags.length
        ? analytics.topTags.map(([tag, count]) => `${tag} (${count})`).join(', ')
        : 'none';

      const itemsHtml = filtered.length
        ? filtered
            .map((item) => {
              const metaParts = [];
              if (item.relationship) {
                metaParts.push(`relationship: ${escapeHtml(item.relationship)}`);
              }
              if (item.last_contacted) {
                metaParts.push(`last_contacted: ${escapeHtml(item.last_contacted)}`);
              }
              if (item.updated_at) {
                metaParts.push(`updated_at: ${escapeHtml(item.updated_at)}`);
              }
              if (Array.isArray(item.tags) && item.tags.length) {
                metaParts.push(`tags: ${escapeHtml(item.tags.join(', '))}`);
              }

              return `
                <div class="ln-note-item">
                  <a class="ln-note-link" href="${escapeHtml(item.profileUrl)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(item.displayName || deriveDisplayName(item.profileUrl))}
                  </a>
                  <div class="ln-note-meta">${metaParts.join(' | ')}</div>
                  <div class="ln-note-text">${escapeHtml(item.notes || '')}</div>
                </div>
              `;
            })
            .join('')
        : '<div class="ln-list-empty">No notes match your current filters.</div>';

      elements.listContainer.hidden = false;
      elements.allNotesButton.textContent = 'Hide List';
      elements.listContainer.innerHTML = `
        <div class="ln-list-controls">
          <div class="ln-list-row">
            <input class="ln-list-search" data-ln-role="search" type="text" placeholder="Search notes, tags, profiles..." value="${escapeHtml(
              listState.query
            )}" />
            <button class="ln-btn" data-ln-role="sort">${listState.recentFirst ? 'Recently Updated' : 'Oldest Updated'}</button>
          </div>
          <div class="ln-list-row">
            <label style="font-size:12px;"><input type="checkbox" data-ln-role="followup_only" ${
              listState.followUpOnly ? 'checked' : ''
            } /> Follow-up queue</label>
            <span style="font-size:12px;">older than</span>
            <input class="ln-list-search" data-ln-role="followup_days" type="number" min="1" value="${escapeHtml(
              String(listState.followUpDays)
            )}" style="max-width:72px;" />
            <span style="font-size:12px;">days</span>
          </div>
        </div>

        <div class="ln-list-chip-row">${tagsHtml}</div>

        <div class="ln-analytics">
          Total notes: ${analytics.total} | Visible: ${filtered.length} | Follow-ups due (>${listState.followUpDays}d): ${analytics.followUpsDue}<br />
          Top tags: ${escapeHtml(topTagsText)}
        </div>

        <div>${itemsHtml}</div>
      `;

      const searchInput = elements.listContainer.querySelector('[data-ln-role="search"]');
      const sortButton = elements.listContainer.querySelector('[data-ln-role="sort"]');
      const followupCheckbox = elements.listContainer.querySelector('[data-ln-role="followup_only"]');
      const followupDaysInput = elements.listContainer.querySelector('[data-ln-role="followup_days"]');
      const tagButtons = elements.listContainer.querySelectorAll('[data-ln-tag]');

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          listState.query = searchInput.value || '';
          renderNotesList();
        });
      }

      if (sortButton) {
        sortButton.addEventListener('click', () => {
          listState.recentFirst = !listState.recentFirst;
          renderNotesList();
        });
      }

      if (followupCheckbox) {
        followupCheckbox.addEventListener('change', () => {
          listState.followUpOnly = Boolean(followupCheckbox.checked);
          renderNotesList();
        });
      }

      if (followupDaysInput) {
        followupDaysInput.addEventListener('input', () => {
          const parsed = Number(followupDaysInput.value || 30);
          listState.followUpDays = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
          renderNotesList();
        });
      }

      for (const chip of tagButtons) {
        chip.addEventListener('click', () => {
          const tag = chip.getAttribute('data-ln-tag') || '';
          listState.activeTag = tag;
          renderNotesList();
        });
      }
    }

    function applyUiVisibility() {
      elements.body.style.display = uiState.minimized ? 'none' : 'block';
      elements.minimizeButton.textContent = uiState.minimized ? '+' : '-';

      if (uiState.hidden) {
        elements.root.style.display = 'none';
        elements.launcher.style.display = 'block';
      } else {
        elements.root.style.display = 'block';
        elements.launcher.style.display = 'none';
      }

      saveUiState(uiState);
    }

    elements.autoSyncEnabledInput.checked = uiState.autoSyncEnabled;
    elements.autoSyncDelayInput.value = String(uiState.autoSyncDelay);

    elements.autoSyncEnabledInput.addEventListener('change', () => {
      uiState.autoSyncEnabled = Boolean(elements.autoSyncEnabledInput.checked);
      saveUiState(uiState);
    });

    elements.autoSyncDelayInput.addEventListener('change', () => {
      const parsed = Number(elements.autoSyncDelayInput.value);
      uiState.autoSyncDelay = [2, 3, 5].includes(parsed) ? parsed : 3;
      elements.autoSyncDelayInput.value = String(uiState.autoSyncDelay);
      saveUiState(uiState);
    });

    elements.saveButton.addEventListener('click', () => {
      if (typeof handlers.save === 'function') {
        handlers.save();
      }
    });

    elements.syncButton.addEventListener('click', () => {
      if (typeof handlers.sync === 'function') {
        handlers.sync();
      }
    });

    elements.connectButton.addEventListener('click', () => {
      if (typeof handlers.connect === 'function') {
        handlers.connect();
      }
    });

    elements.allNotesButton.addEventListener('click', () => {
      if (listState.visible) {
        listState.visible = false;
        renderNotesList();
        return;
      }

      if (typeof handlers.allNotes === 'function') {
        handlers.allNotes();
      }
    });

    elements.minimizeButton.addEventListener('click', () => {
      uiState.minimized = !uiState.minimized;
      applyUiVisibility();
    });

    elements.hideButton.addEventListener('click', () => {
      uiState.hidden = true;
      applyUiVisibility();
    });

    elements.launcher.addEventListener('click', () => {
      uiState.hidden = false;
      applyUiVisibility();
    });

    applyUiVisibility();

    return {
      onSave(callback) {
        handlers.save = callback;
      },
      onSync(callback) {
        handlers.sync = callback;
      },
      onConnect(callback) {
        handlers.connect = callback;
      },
      onAllNotes(callback) {
        handlers.allNotes = callback;
      },
      setStatus(message, isError) {
        elements.statusLine.textContent = message || '';
        elements.statusLine.style.color = isError ? '#b42318' : '#0f5132';
      },
      setBusy(isBusy) {
        const busy = Boolean(isBusy);
        elements.saveButton.disabled = busy;
        elements.syncButton.disabled = busy;
        elements.connectButton.disabled = busy;
        elements.allNotesButton.disabled = busy;
        elements.minimizeButton.disabled = busy;
      },
      setConnected(isConnected) {
        elements.connectButton.textContent = isConnected ? 'Reconnect' : 'Connect';
      },
      getFormValues() {
        return {
          notes: elements.notesInput.value || '',
          tags: elements.tagsInput.value || '',
          relationship: elements.relationshipInput.value || 'other',
          last_contacted: elements.lastContactedInput.value || ''
        };
      },
      getAutoSyncConfig() {
        const enabled = Boolean(elements.autoSyncEnabledInput.checked);
        const delay = Number(elements.autoSyncDelayInput.value);
        return {
          enabled,
          delaySeconds: [2, 3, 5].includes(delay) ? delay : 3
        };
      },
      setFormValues(record) {
        const safe = record && typeof record === 'object' ? record : {};
        const relationship =
          typeof safe.relationship === 'string' && RELATIONSHIP_VALUES.has(safe.relationship)
            ? safe.relationship
            : 'other';
        const lastContacted =
          typeof safe.last_contacted === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safe.last_contacted)
            ? safe.last_contacted
            : '';

        elements.notesInput.value = typeof safe.notes === 'string' ? safe.notes : '';
        elements.tagsInput.value = Array.isArray(safe.tags) ? safe.tags.join(', ') : '';
        elements.relationshipInput.value = relationship;
        elements.lastContactedInput.value = lastContacted;
      },
      clearForm() {
        elements.notesInput.value = '';
        elements.tagsInput.value = '';
        elements.relationshipInput.value = 'other';
        elements.lastContactedInput.value = '';
      },
      showNotesList(items) {
        listState.allItems = Array.isArray(items) ? items : [];
        listState.visible = true;
        renderNotesList();
      },
      hideNotesList() {
        listState.visible = false;
        renderNotesList();
      },
      isNotesListVisible() {
        return listState.visible;
      }
    };
  }

  function createOrGetPanel() {
    injectStyles();
    const existing = document.getElementById(PANEL_ID);
    const launcher = document.getElementById(LAUNCHER_ID);

    if (existing && launcher) {
      const existingElements = collectElements(existing);
      if (hasRequiredElements(existingElements)) {
        return buildController(existingElements);
      }

      existing.remove();
      launcher.remove();
    }

    const { root } = createMarkup();
    const elements = collectElements(root);
    if (!hasRequiredElements(elements)) {
      throw new Error('Failed to create notes panel markup.');
    }

    return buildController(elements);
  }

  window.LinkedInNotesUI = {
    createOrGetPanel
  };
})();
