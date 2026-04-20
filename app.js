(function() {
  'use strict';

  const STATUS_ORDER = ['Pending', 'To Do', 'Doing', 'Waiting', 'Ongoing', 'Delay', 'Done', 'On Hold'];
  const STATUS_CLASS = {
    'Pending': 'status-pending',
    'To Do': 'status-todo',
    'Doing': 'status-doing',
    'Waiting': 'status-waiting',
    'Ongoing': 'status-ongoing',
    'Delay': 'status-delay',
    'Done': 'status-done',
    'On Hold': 'status-cancel'
  };

  const state = {
    tasks: [],
    summary: null,
    view: 'board',
    filters: { owner: '', type: '', priority: '', search: '' },
    sortField: 'dueDay',
    sortDir: 'asc'
  };

  const $ = (id) => document.getElementById(id);

  function getShortStatus(fullStatus) {
    if (!fullStatus) return 'Unknown';
    for (const key of STATUS_ORDER) {
      if (fullStatus.indexOf(key) !== -1) return key;
    }
    return fullStatus.split(' ')[0];
  }

  function getTagClass(type) {
    if (!type) return 'tag-default';
    const t = type.toLowerCase();
    if (t === 'social media') return 'tag-social-media';
    if (t === 'social') return 'tag-social';
    if (t.indexOf('external') !== -1) return 'tag-ad-external';
    if (t.indexOf('internal') !== -1) return 'tag-ad-internal';
    if (t.indexOf('incentive') !== -1) return 'tag-ad-incentive';
    return 'tag-default';
  }

  function getPriorityClass(p) {
    if (p === '高') return 'priority-high';
    if (p === '中') return 'priority-med';
    return 'priority-low';
  }

  function getInitials(name) {
    if (!name) return '?';
    if (/^[A-Za-z]/.test(name)) return name.slice(0, 2).toUpperCase();
    return name.slice(0, 1);
  }

  function getDueInfo(dueDay, today, status) {
    if (!dueDay) return { text: '-', cls: 'due-normal' };
    const isDone = status && status.indexOf('Done') !== -1;
    const isCancel = status && status.indexOf('Canceled') !== -1;

    const d1 = new Date(dueDay);
    const d2 = new Date(today);
    const diffDays = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));

    if (isDone || isCancel) {
      return { text: dueDay.slice(5), cls: 'due-normal' };
    }
    if (diffDays < 0) return { text: '逾期 ' + Math.abs(diffDays) + ' 天', cls: 'due-overdue' };
    if (diffDays === 0) return { text: '今日到期', cls: 'due-today' };
    if (diffDays <= 3) return { text: diffDays + ' 天後', cls: 'due-soon' };
    return { text: dueDay.slice(5), cls: 'due-normal' };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchData() {
    if (!window.XCITY_CONFIG || !window.XCITY_CONFIG.API_URL || !window.XCITY_CONFIG.API_TOKEN) {
      throw new Error('config.js 未正確設定 API_URL 或 API_TOKEN');
    }
    const url = window.XCITY_CONFIG.API_URL + '?token=' + encodeURIComponent(window.XCITY_CONFIG.API_TOKEN) + '&action=all';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function renderKPIs() {
    const s = state.summary;
    if (!s) return;

    // 1. 取得篩選後的任務
    const filteredTasks = applyFilters(state.tasks);
    const todayStr = s.today || new Date().toISOString().slice(0, 10);
    
    // 2. 計算基礎指標
    const total = filteredTasks.length;
    let overdueCount = 0;
    let doneCount = 0;

    filteredTasks.forEach(t => {
      // 檢查是否逾期
      const dueInfo = getDueInfo(t.dueDay, todayStr, t.status);
      if (dueInfo.cls === 'due-overdue') {
        overdueCount++;
      }
      // 檢查是否完成
      if (t.status && t.status.indexOf('Done') !== -1) {
        doneCount++;
      }
    });

    // 計算達成率 (保留兩位小數以符合 UI)
    const completionRate = total > 0 ? ((doneCount / total) * 100).toFixed(2) : "0.00";

    // 3. 更新 DOM
    $('kpi-total').textContent = total;
    $('kpi-overdue').textContent = overdueCount;
    $('kpi-completion').textContent = completionRate + '%';

    // 4. 計算本週到期 (針對篩選後的清單)
    const today = new Date(todayStr);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const thisWeek = filteredTasks.filter(t => {
      if (!t.dueDay) return false;
      // 已完成的不列入本週待辦
      if (t.status && t.status.indexOf('Done') !== -1) return false;
      return t.dueDay >= weekStartStr && t.dueDay <= weekEndStr;
    });
    $('kpi-this-week').textContent = thisWeek.length;
  }

  function renderFilters() {
    const owners = Array.from(new Set(state.tasks.map(t => t.owner).filter(Boolean))).sort();
    const types = Array.from(new Set(state.tasks.map(t => t.type).filter(Boolean))).sort();

    const ownerSel = $('filter-owner');
    const typeSel = $('filter-type');

    const currentOwner = ownerSel.value;
    const currentType = typeSel.value;

    ownerSel.innerHTML = '<option value="">所有負責人</option>' +
      owners.map(o => `<option value="${escapeHtml(o)}"${o === currentOwner ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
    typeSel.innerHTML = '<option value="">所有類型</option>' +
      types.map(t => `<option value="${escapeHtml(t)}"${t === currentType ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
  }

  function applyFilters(tasks) {
    return tasks.filter(t => {
      if (state.filters.owner && t.owner !== state.filters.owner) return false;
      if (state.filters.type && t.type !== state.filters.type) return false;
      if (state.filters.priority && t.priority !== state.filters.priority) return false;
      if (state.filters.search) {
        const q = state.filters.search.toLowerCase();
        if (!(t.name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    const filtered = applyFilters(state.tasks);
    const today = state.summary ? state.summary.today : new Date().toISOString().slice(0, 10);

    const cols = ['Pending', 'To Do', 'Doing', 'Done'];
    const byCol = {};
    cols.forEach(c => byCol[c] = []);
    const otherTasks = [];

    filtered.forEach(t => {
      const s = getShortStatus(t.status);
      if (byCol[s]) byCol[s].push(t);
      else otherTasks.push(t);
    });

    const html = cols.map(col => {
      const items = byCol[col];
      return `<div class="board-column">
        <div class="board-column-header">
          <span class="board-column-title">${col}</span>
          <span class="board-column-count">${items.length}</span>
        </div>
        ${items.map(t => renderCard(t, today)).join('')}
      </div>`;
    }).join('');

    $('main-content').innerHTML = '<div class="board">' + html + '</div>';
  }

  function renderCard(t, today) {
    const due = getDueInfo(t.dueDay, today, t.status);
    const tagCls = getTagClass(t.type);
    const priCls = getPriorityClass(t.priority);

    return `<div class="task-card">
      <div class="task-card-title">
        <span class="priority-bar ${priCls}"></span>${escapeHtml(t.name)}
      </div>
      <div class="task-card-meta">
        <span class="task-tag ${tagCls}">${escapeHtml(t.type || '其他')}</span>
        <span class="due-pill ${due.cls}">${due.text}</span>
      </div>
      <div class="task-card-meta">
        <span class="owner-chip">
          <span class="avatar">${escapeHtml(getInitials(t.owner))}</span>${escapeHtml(t.owner || '未指派')}
        </span>
        <span style="font-size:11px; color:#9ca3af;">${escapeHtml(t.week || '')}</span>
      </div>
    </div>`;
  }

  function renderList() {
    const filtered = applyFilters(state.tasks);
    const today = state.summary ? state.summary.today : new Date().toISOString().slice(0, 10);

    const sorted = filtered.slice().sort((a, b) => {
      const field = state.sortField;
      const dir = state.sortDir === 'asc' ? 1 : -1;
      const va = (a[field] || '').toString();
      const vb = (b[field] || '').toString();
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });

    if (sorted.length === 0) {
      $('main-content').innerHTML = '<div class="list-view"><div class="empty">沒有符合條件的任務</div></div>';
      return;
    }

    const rows = sorted.map(t => {
      const due = getDueInfo(t.dueDay, today, t.status);
      const tagCls = getTagClass(t.type);
      const shortStatus = getShortStatus(t.status);
      const statusCls = STATUS_CLASS[shortStatus] || 'status-waiting';
      const priCls = getPriorityClass(t.priority);

      return `<tr>
        <td>${escapeHtml(t.week || '')}</td>
        <td><span class="priority-bar ${priCls}"></span>${escapeHtml(t.name)}</td>
        <td><span class="owner-chip"><span class="avatar">${escapeHtml(getInitials(t.owner))}</span>${escapeHtml(t.owner || '-')}</span></td>
        <td><span class="task-tag ${tagCls}">${escapeHtml(t.type || '-')}</span></td>
        <td><span class="status-pill ${statusCls}">${escapeHtml(shortStatus)}</span></td>
        <td><span class="due-pill ${due.cls}">${escapeHtml(t.dueDay || '-')}</span></td>
        <td style="font-size:11px; color:#9ca3af;">${escapeHtml(due.text)}</td>
      </tr>`;
    }).join('');

    const html = `<div class="list-view">
      <table class="list-table">
        <thead>
          <tr>
            <th class="sortable" data-sort="week">週次</th>
            <th class="sortable" data-sort="name">任務名稱</th>
            <th class="sortable" data-sort="owner">負責人</th>
            <th class="sortable" data-sort="type">類型</th>
            <th class="sortable" data-sort="status">狀態</th>
            <th class="sortable" data-sort="dueDay">Due Day</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    $('main-content').innerHTML = html;

    document.querySelectorAll('.list-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (state.sortField === field) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = field;
          state.sortDir = 'asc';
        }
        renderList();
      });
    });
  }

  function render() {
    renderKPIs();
    if (state.view === 'board') renderBoard();
    else renderList();
  }

  async function loadAndRender() {
    const btn = $('refresh-btn');
    btn.classList.add('spinning');
    try {
      const data = await fetchData();
      state.tasks = data.tasks || [];
      state.summary = data.summary || null;
      const now = new Date();
      $('last-updated').textContent = '最後更新：' + now.toLocaleString('zh-TW', { hour12: false });
      renderFilters();
      render();
    } catch (err) {
      console.error(err);
      $('main-content').innerHTML = `<div class="error">載入失敗：${escapeHtml(err.message)}<br><br>請檢查 config.js 的 API_URL 和 API_TOKEN 是否正確。</div>`;
    } finally {
      btn.classList.remove('spinning');
    }
  }

  function bindEvents() {
    document.querySelectorAll('#view-toggle button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#view-toggle button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.view = b.dataset.view;
        render();
      });
    });

    $('filter-owner').addEventListener('change', e => { state.filters.owner = e.target.value; render(); });
    $('filter-type').addEventListener('change', e => { state.filters.type = e.target.value; render(); });
    $('filter-priority').addEventListener('change', e => { state.filters.priority = e.target.value; render(); });
    $('filter-search').addEventListener('input', e => { state.filters.search = e.target.value; render(); });

    $('filter-reset').addEventListener('click', () => {
      state.filters = { owner: '', type: '', priority: '', search: '' };
      $('filter-owner').value = '';
      $('filter-type').value = '';
      $('filter-priority').value = '';
      $('filter-search').value = '';
      render();
    });

    $('refresh-btn').addEventListener('click', loadAndRender);

    if (window.XCITY_CONFIG && window.XCITY_CONFIG.SHEET_URL) {
      $('sheet-link').href = window.XCITY_CONFIG.SHEET_URL;
    }
  }

  bindEvents();
  loadAndRender();
})();