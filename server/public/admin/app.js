// Cradlewell admin portal. Talks to /admin/api with the token from the login.
(function () {
  const API = './api';
  const TOKEN_KEY = 'cw_admin_token';
  const ME_KEY = 'cw_admin_me';
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };
  let token = store.get(TOKEN_KEY);

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('en-IN');
  const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const shortDay = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const phone = (p) => (/^\+91\d{10}$/.test(p || '') ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : (p || ''));
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '0%');
  const icon = (id, cls = 'icon') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
  function ago(iso) {
    if (!iso) return 'Never';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 2) return 'Just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  }
  const initial = (name) => (String(name || 'A').trim()[0] || 'A').toUpperCase();

  async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if ((res.status === 401 || res.status === 403) && path !== '/login') showLogin(json?.error?.message || 'Please log in again.');
    if (!res.ok) {
      const err = new Error(json?.error?.message || 'Something went wrong. Please try again.');
      err.code = json?.error?.code;
      throw err;
    }
    return json;
  }

  // ---------- Login / logout ----------
  function showLogin(message) {
    token = null;
    store.set(TOKEN_KEY, null);
    closeDialogs();
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginErr').textContent = message || '';
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginBtn').disabled = true;
    $('loginErr').textContent = '';
    try {
      const email = $('email').value.trim();
      const r = await call('/login', { method: 'POST', body: { email, password: $('password').value } });
      token = r.token;
      store.set(TOKEN_KEY, r.token);
      store.set(ME_KEY, JSON.stringify({ name: r.name, email }));
      $('password').value = '';
      start();
    } catch (err) {
      $('loginErr').textContent = err.message;
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  // ---------- Popovers ----------
  function popover(btn, menu) {
    const set = (open) => { $(menu).hidden = !open; $(btn).setAttribute('aria-expanded', String(open)); };
    $(btn).addEventListener('click', (e) => { e.stopPropagation(); const open = $(menu).hidden; closePopovers(); set(open); });
    return set;
  }
  const setMe = popover('meBtn', 'meMenu');
  const setBell = popover('bellBtn', 'bellMenu');
  function closePopovers() { setMe(false); setBell(false); }
  document.addEventListener('click', (e) => { if (!e.target.closest('.pop')) closePopovers(); });
  $('refresh').addEventListener('click', () => { closePopovers(); load(); });
  $('logout').addEventListener('click', async () => {
    closePopovers();
    try { await call('/logout', { method: 'POST' }); } catch (_) { /* ends locally anyway */ }
    showLogin('');
  });

  // ---------- Data ----------
  const data = { overview: null, families: null, nurses: null, assignments: null };
  let page = 'overview';
  const TITLES = { overview: 'Overview', clients: 'Clients', nurses: 'Nurses', assignments: 'Assignments' };

  function bell() {
    const a = data.overview?.alerts;
    if (!a) return;
    const waiting = data.overview.pendingNurses?.length || 0;
    $('bellDot').hidden = !(a.crashes7 > 0 || waiting > 0);
    $('bellMenu').innerHTML = `
      <div class="who"><b>Alerts</b><span>Last 7 days</span></div>
      ${waiting ? `<div class="note">${icon('i-steth')}<div><b>${num(waiting)} nurse${waiting === 1 ? '' : 's'} waiting for approval</b><span>Approve or reject them on the Overview page.</span></div></div>` : ''}
      <div class="note">${icon('i-alert')}<div><b>${num(a.crashes7)} app error${a.crashes7 === 1 ? '' : 's'}</b><span>${a.crashes7 ? 'Details: npm run admin -- list-crashes (server folder).' : 'No errors reported by phones.'}</span></div></div>
      <div class="note">${icon('i-users')}<div><b>${num(a.newFamilies7)} new famil${a.newFamilies7 === 1 ? 'y' : 'ies'}</b><span>Registered this week.</span></div></div>`;
  }

  // ---------- Pieces ----------
  const tile = (ic, colour, k, v, s, vColour = '') => `
    <div class="tile"><div class="ic ${colour}">${icon(ic)}</div>
      <div style="min-width:0"><div class="k">${esc(k)}</div><div class="v ${vColour}">${typeof v === 'number' ? num(v) : esc(v)}</div>${s ? `<div class="s">${s}</div>` : ''}</div></div>`;
  const head = (title, sub, actions = '') => `<div class="pagehead"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
  const carePill = (n) => (n ? '<span class="pill p-nurse">Nurse-assisted</span>' : '<span class="pill p-self">Self-tracking</span>');
  const loading = () => `${head(TITLES[page])}<div class="card"><p class="empty">Loading…</p></div>`;

  // ---------- Lists ----------
  const LISTS = {
    clients: {
      title: 'Registered families', search: 'Search client, baby, phone or nurse…', noun: ['client', 'clients'],
      rows: () => data.families,
      text: (r) => [r.code, r.name, r.email, r.phone, ...r.babyList.map((b) => b.name), ...r.assignedNurses.map((n) => n.name)],
      cols: [
        ['Client', (r) => r.name, (r) => `<span class="name">${esc(r.name)}</span><span class="code">${esc(r.code)}</span>`],
        ['Baby name(s)', (r) => r.babyList.map((b) => b.name).join(', '), (r) => (r.babyList.length ? esc(r.babyList.map((b) => b.name).join(', ')) : '<span class="dim">None yet</span>')],
        ['Baby count', (r) => r.babies, null, 'c'],
        ['Email', (r) => r.email || '', (r) => (r.email ? esc(r.email) : '<span class="dim">No email yet</span>')],
        ['Phone number', (r) => r.phone, (r) => esc(phone(r.phone))],
        ['Assigned nurse', (r) => r.assignedNurses.length, (r) => (r.assignedNurses.length ? esc(r.assignedNurses.map((n) => n.name).join(', ')) : '<span class="dim">—</span>')],
        ['Care type', (r) => (r.assignedNurses.length ? 1 : 0), (r) => carePill(r.assignedNurses.length)],
        ['Registered on', (r) => r.created || '', (r) => esc(fmtDay(r.created))],
        ['Monthly report', null, (r) => (r.babies
          ? `<button class="pdf" type="button" data-pdf="${r.id}">${icon('i-down')}PDF</button>`
          : '<button class="pdf" type="button" disabled title="No baby added yet">No baby</button>')],
      ],
      sort: [7, 'desc'],
    },
    nurses: {
      title: 'All nurses', search: 'Search nurse, email or phone…', noun: ['nurse', 'nurses'],
      rows: () => data.nurses,
      text: (r) => [r.name, r.email, r.phone],
      cols: [
        ['Nurse', (r) => r.name, (r) => `<span class="name">${esc(r.name)}</span><span class="code">${esc(r.email)}</span>`],
        ['Phone number', (r) => r.phone, (r) => esc(phone(r.phone))],
        ['Families', (r) => r.families, null, 'num'],
        ['Visits (7 days)', (r) => r.visits7, null, 'num'],
        ['Visits (30 days)', (r) => r.visits30, null, 'num'],
        ['Last visit', (r) => r.lastVisit || '', (r) => (r.lastVisit ? esc(shortDay(r.lastVisit)) : '<span class="dim">None yet</span>')],
        ['Last active', (r) => r.lastActive || '', (r) => esc(ago(r.lastActive))],
        ['Joined', (r) => r.joined || '', (r) => esc(fmtDay(r.joined))],
      ],
      sort: [4, 'desc'],
    },
    assignments: {
      title: 'Nurse assignments', search: 'Search nurse, client or client ID…', noun: ['assignment', 'assignments'],
      rows: () => data.assignments,
      text: (r) => [r.nurse, r.nurseEmail, r.client, r.clientCode],
      cols: [
        ['Nurse', (r) => r.nurse, (r) => `<span class="name">${esc(r.nurse)}</span><span class="code">${esc(r.nurseEmail)}</span>`],
        ['Client', (r) => r.client, (r) => `<span class="name">${esc(r.client)}</span><span class="code">${esc(r.clientCode)}</span>`],
        ['Assigned since', (r) => r.since || '', (r) => esc(fmtDay(r.since))],
        ['Last entry', (r) => r.lastEntry || '', (r) => (r.lastEntry ? esc(ago(r.lastEntry)) : '<span class="dim">None yet</span>')],
        ['Visits (30 days)', (r) => r.visits30, null, 'num'],
        ['Status', (r) => (recent(r.lastEntry) ? 1 : 0), (r) => (recent(r.lastEntry) ? '<span class="pill p-good">Active</span>' : '<span class="dim">No entries in 30 days</span>')],
      ],
      sort: [3, 'desc'],
    },
  };
  const recent = (iso) => iso && Date.now() - new Date(iso).getTime() < 30 * 864e5;

  // Nurses who signed up in the app and wait for approval. Hidden when nobody is waiting.
  function pendingCard(list, days) {
    if (!list?.length) return '';
    const left = (iso) => {
      const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
      return d <= 1 ? '<span class="pill p-warn">Last day</span>' : `${d} days left`;
    };
    return `<div class="card pending"><div class="cardhead"><h2>Nurses waiting for approval</h2><span class="count">${list.length}</span></div>
      <p class="hint">They signed up in the app and can't log in until you approve them. They get an email either way. A request not decided within ${days} days is removed, and the nurse is told they can sign up again.</p>
      <input class="search" id="pendingSearch" type="search" placeholder="Search nurse, email or phone…" aria-label="Search nurses waiting for approval">
      <div class="tablewrap"><table><thead><tr><th class="nosort">Nurse</th><th class="nosort">Phone number</th><th class="nosort">Signed up</th><th class="nosort">Removed in</th><th class="nosort"></th></tr></thead>
      <tbody id="pendingRows">${list.map((n) => `<tr data-q="${esc([n.name, n.email, n.phone, phone(n.phone)].join(' ').toLowerCase())}"><td><span class="name">${esc(n.name)}</span><span class="code">${esc(n.email)}</span></td>
        <td>${esc(phone(n.phone))}</td><td>${esc(ago(n.signedUp))}</td><td>${left(n.expires)}</td>
        <td class="decide"><button class="btn sm" type="button" data-approve="${n.id}">${icon('i-check')}Approve</button>
          <button class="btn sm ghost" type="button" data-reject="${n.id}" data-name="${esc(n.name)}">Reject</button></td></tr>`).join('')}
        <tr id="pendingNone" hidden><td class="empty" colspan="5">Nothing matches your search.</td></tr></tbody></table></div></div>`;
  }
  // Filters the waiting nurses by name, email or phone (digits match with or without spaces).
  function wirePendingSearch() {
    const box = $('pendingSearch');
    if (!box) return;
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      let shown = 0;
      $('pendingRows').querySelectorAll('tr[data-q]').forEach((tr) => {
        const text = tr.dataset.q;
        const hit = !q || text.includes(q) || (digits.length >= 3 && text.replace(/\D/g, '').includes(digits));
        tr.hidden = !hit;
        if (hit) shown += 1;
      });
      $('pendingNone').hidden = shown > 0;
    });
  }
  async function decide(id, action, btn) {
    const row = btn.closest('tr');
    row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const r = await call(`/nurses/${id}/${action}`, { method: 'POST' });
      if (!r.emailed) alert(`Done, but the email to the nurse could not be sent. ${action === 'approve' ? 'They can log in now.' : ''}`);
    } catch (err) {
      alert(err.message);
    }
    await load();
  }

  function listCard(key) {
    return `<div class="card"><div class="cardhead"><h2>${esc(LISTS[key].title)}</h2></div>
      <input class="search" id="search" type="search" placeholder="${esc(LISTS[key].search)}" aria-label="Search">
      <div class="tablewrap"><table id="list"></table></div><div class="foot" id="listFoot"></div></div>`;
  }
  function renderList(key) {
    const t = LISTS[key]; const rows = t.rows(); const el = $('list');
    if (!el || !rows) return;
    const q = ($('search')?.value || '').trim().toLowerCase();
    const shown = rows.filter((r) => !q || t.text(r).some((v) => String(v || '').toLowerCase().includes(q)));
    const [ci, dir] = t.sort; const get = t.cols[ci][1];
    shown.sort((a, b) => {
      const x = get(a); const y = get(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return dir === 'asc' ? c : -c;
    });
    el.innerHTML = `<thead><tr>${t.cols.map(([label, val, , cls], i) =>
      `<th class="${cls || ''}${val ? '' : ' nosort'}" data-col="${i}" aria-sort="${i === ci ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${esc(label)}</th>`).join('')}</tr></thead>
      <tbody>${shown.length ? shown.map((r) => `<tr>${t.cols.map(([, val, html, cls]) => `<td class="${cls || ''}">${html ? html(r) : esc(val(r))}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="empty" colspan="${t.cols.length}">${q ? 'Nothing matches your search.' : 'None yet.'}</td></tr>`}</tbody>`;
    el.querySelectorAll('th[data-col]').forEach((th) => {
      const i = Number(th.dataset.col);
      if (!t.cols[i][1]) return;
      th.addEventListener('click', () => { t.sort = [i, t.sort[0] === i && t.sort[1] === 'desc' ? 'asc' : 'desc']; renderList(key); });
    });
    el.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => openReport(Number(b.dataset.pdf), b)));
    $('listFoot').textContent = `Showing ${shown.length} of ${rows.length} ${rows.length === 1 ? t.noun[0] : t.noun[1]}`;
  }
  function wireList(key) {
    $('search').addEventListener('input', () => renderList(key));
    renderList(key);
  }

  // ---------- Pages ----------
  const PAGES = {
    overview() {
      const o = data.overview; const f = data.families;
      if (!o || !f) return loading();
      const t = o.totals; const care = o.care;
      return `${head('Overview', 'Monitor families, nursing care and app activity.')}
        <div class="tiles">
          ${tile('i-phone', 'c-purple', 'Total app downloads', t.appUsers, 'Accounts created in the app', 'v-purple')}
          ${tile('i-check', 'c-green', 'Active parents', t.activeParents7, `Last 7 days · of ${num(t.parents)}`, 'v-green')}
          ${tile('i-baby', 'c-blue', 'Total babies', t.babies, 'Registered baby profiles')}
          ${tile('i-steth', 'c-teal', 'Total nurses', t.nurses, `${num(o.assignedNurses)} currently assigned`, 'v-teal')}
          ${tile('i-users', 'c-teal', 'Self-tracking clients', care.selfTracking, `${pct(care.selfTracking, t.families)} of families`, 'v-teal')}
          ${tile('i-heart', 'c-nurse', 'Nurse-assisted clients', care.nurseAssisted, `${pct(care.nurseAssisted, t.families)} of families`, 'v-nurse')}
        </div>${pendingCard(o.pendingNurses, o.approvalDays)}${listCard('clients')}`;
    },
    clients() {
      const f = data.families;
      if (!f) return loading();
      const nurses = new Set(f.flatMap((x) => x.assignedNurses.map((n) => n.id)));
      const assisted = f.filter((x) => x.assignedNurses.length).length;
      return `${head('Clients', 'Every registered family, their babies and nurses.', `<button class="btn sm" data-add="client">${icon('i-useradd')}Add client</button>`)}
        <div class="tiles four">
          ${tile('i-users', 'c-purple', 'Total clients', f.length, null, 'v-purple')}
          ${tile('i-baby', 'c-blue', 'Total babies', f.reduce((s, x) => s + x.babies, 0))}
          ${tile('i-steth', 'c-teal', 'Assigned nurses', nurses.size, null, 'v-teal')}
          ${tile('i-heart', 'c-nurse', 'Families with nurses', assisted, `${pct(assisted, f.length)} of families`, 'v-nurse')}
        </div>${listCard('clients')}`;
    },
    nurses() {
      const n = data.nurses;
      if (!n) return loading();
      return `${head('Nurses', 'Nurse accounts, their families and visits.', `<button class="btn sm" data-add="nurse">${icon('i-stethadd')}Add nurse</button>`)}
        <div class="tiles four">
          ${tile('i-steth', 'c-teal', 'Total nurses', n.length, null, 'v-teal')}
          ${tile('i-check', 'c-green', 'Active this week', n.filter((x) => x.visits7 > 0).length, 'Visited a family in 7 days', 'v-green')}
          ${tile('i-calcheck', 'c-purple', 'Visits in 7 days', n.reduce((s, x) => s + x.visits7, 0), null, 'v-purple')}
          ${tile('i-clip', 'c-blue', 'Families assigned', n.reduce((s, x) => s + x.families, 0), 'Nurse–family pairs')}
        </div>${listCard('nurses')}`;
    },
    assignments() {
      const a = data.assignments; const f = data.families;
      if (!a || !f) return loading();
      const withNurse = new Set(a.map((x) => x.clientId));
      return `${head('Assignments', "Which nurse can open which family (they entered the parent's code).")}
        <div class="tiles four">
          ${tile('i-clip', 'c-purple', 'Active assignments', a.length, null, 'v-purple')}
          ${tile('i-steth', 'c-teal', 'Nurses with families', new Set(a.map((x) => x.nurseId)).size, null, 'v-teal')}
          ${tile('i-heart', 'c-nurse', 'Families with nurses', withNurse.size, null, 'v-nurse')}
          ${tile('i-phone', 'c-teal', 'Families without a nurse', f.filter((x) => !withNurse.has(x.id)).length, 'Self-tracking', 'v-teal')}
        </div>${listCard('assignments')}`;
    },
  };

  function afterRender() {
    const list = page === 'overview' ? 'clients' : page;
    if (LISTS[list] && $('list')) wireList(list);
    $('page').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
    $('page').querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openAdd(b.dataset.add, b)));
    $('page').querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => openReport(null, b)));
    wirePendingSearch();
    $('page').querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.approve, 'approve', b)));
    $('page').querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => {
      if (confirm(`Reject ${b.dataset.name}? They won't be able to log in, and they'll get an email saying so.`)) decide(b.dataset.reject, 'reject', b);
    }));
  }

  function show(name) {
    page = name;
    document.querySelectorAll('.side-nav button').forEach((b) => (b.dataset.page === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    $('crumb').textContent = TITLES[name];
    $('page').innerHTML = PAGES[name]();
    afterRender();
  }
  document.querySelectorAll('.side-nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));

  // ---------- Dialog plumbing ----------
  let returnFocus = null;
  function openDialog(id, from) {
    returnFocus = from || null;
    $(id).hidden = false;
  }
  function closeDialogs() {
    ['dl', 'add'].forEach((id) => { $(id).hidden = true; });
    if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDialogs));
  ['dl', 'add'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeDialogs(); }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDialogs(); closePopovers(); }
    const open = ['dl', 'add'].map($).find((d) => !d.hidden);
    if (e.key === 'Tab' && open) {
      const f = [...open.querySelectorAll('button:not([disabled]), input, select')].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ---------- Monthly report (the app's own report, built in this browser) ----------
  const recordsCache = new Map();
  let rep = { family: null, months: [] };
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthName = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };

  async function babyRecords(familyId, babyId) {
    const k = `${familyId}:${babyId}`;
    if (!recordsCache.has(k)) recordsCache.set(k, call(`/families/${familyId}/babies/${encodeURIComponent(babyId)}/records`).catch((e) => { recordsCache.delete(k); throw e; }));
    return recordsCache.get(k);
  }
  // The months (newest first) in which a baby has entries, by each entry's own time.
  function monthsOf(records) {
    const keys = new Set();
    const add = (v) => { const t = v ? new Date(v) : null; if (t && !Number.isNaN(t.getTime())) keys.add(monthKey(t)); };
    (records.feeding || []).forEach((x) => add(x.startTime || x.createdAt));
    (records.sleep || []).forEach((x) => add(x.startTime));
    (records.diaper || []).forEach((x) => add(x.eventTime || x.createdAt));
    (records.medicine || []).forEach((x) => add(x.time || x.createdAt));
    ['temperature', 'breathing', 'skin', 'milestone'].forEach((k) => (records[k] || []).forEach((x) => add(x.time)));
    (records.growth || []).forEach((x) => add(x.date || x.createdAt));
    (records.vaccination || []).filter((v) => v.completed).forEach((x) => add(x.completedDate));
    return [...keys].sort().reverse();
  }
  const chosenBabies = () => {
    const v = document.querySelector('input[name="dlBaby"]:checked')?.value;
    return !rep.family ? [] : v === 'all' ? rep.family.babyList : rep.family.babyList.filter((b) => b.id === v);
  };

  async function refreshMonths() {
    const babies = chosenBabies();
    const sel = $('dlMonth');
    $('dlErr').textContent = '';
    if (!babies.length) { sel.innerHTML = ''; $('dlGo').disabled = true; return; }
    sel.innerHTML = '<option>Loading months…</option>';
    sel.disabled = true; $('dlGo').disabled = true;
    try {
      const all = await Promise.all(babies.map((b) => babyRecords(rep.family.id, b.id)));
      const months = [...new Set(all.flatMap((r) => monthsOf(r.records)))].sort().reverse();
      if (!months.length) {
        sel.innerHTML = '<option>No records yet</option>';
        $('dlErr').textContent = 'Nothing has been recorded for this baby yet, so there is no report.';
        $('dlName').textContent = '';
        return;
      }
      const keep = sel.dataset.keep;
      sel.innerHTML = months.map((m) => `<option value="${m}" ${m === keep ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('');
      sel.disabled = false; $('dlGo').disabled = false;
      updateReportName();
    } catch (err) {
      sel.innerHTML = '';
      $('dlErr').textContent = err.message;
    }
  }
  function updateReportName() {
    const babies = chosenBabies(); const m = $('dlMonth').value;
    if (!m || !babies.length) { $('dlName').textContent = ''; return; }
    const who = babies.length > 2 ? 'All babies' : babies.map((b) => b.name).join('_');
    $('dlName').textContent = `File: Cradlewell_${who}_${monthName(m)}.pdf`;
  }

  function fillFamily(fam) {
    rep.family = fam;
    $('dlClient').textContent = fam ? `Client: ${fam.name} · ${fam.code}` : 'Choose a client';
    const babies = fam ? fam.babyList : [];
    const all = babies.length === 2 ? 'Both babies' : `All ${babies.length} babies`;
    $('dlBabies').innerHTML = babies.map((b, i) => `<label class="radio"><input type="radio" name="dlBaby" value="${esc(b.id)}" ${i === 0 ? 'checked' : ''}>${esc(b.name)}</label>`).join('')
      + (babies.length > 1 ? `<label class="radio"><input type="radio" name="dlBaby" value="all">${esc(all)}</label>` : '');
    $('dlBabyLabel').textContent = babies.length > 1 ? 'Select baby' : 'Baby';
    $('dlBabySec').hidden = !fam;
    $('dlMonth').dataset.keep = monthKey(new Date());
    refreshMonths();
  }
  function openReport(familyId, from) {
    const withBabies = (data.families || []).filter((f) => f.babies > 0);
    $('dlPickSec').hidden = familyId != null;
    $('dlName').textContent = ''; $('dlErr').textContent = '';
    if (familyId == null) {
      $('dlPick').innerHTML = withBabies.length
        ? withBabies.map((f) => `<option value="${f.id}">${esc(f.name)} · ${esc(f.code)}</option>`).join('')
        : '<option value="">No family has a baby yet</option>';
      fillFamily(withBabies[0] || null);
    } else {
      fillFamily(data.families.find((f) => f.id === familyId) || null);
    }
    openDialog('dl', from);
    (familyId == null ? $('dlPick') : document.querySelector('input[name="dlBaby"]:checked') || $('dlGo')).focus();
  }
  $('dlPick').addEventListener('change', () => fillFamily(data.families.find((f) => f.id === Number($('dlPick').value)) || null));
  $('dlBabies').addEventListener('change', refreshMonths);
  $('dlMonth').addEventListener('change', () => { $('dlMonth').dataset.keep = $('dlMonth').value; updateReportName(); });

  // Several babies: one document, each report on its own pages.
  function combine(htmls) {
    if (htmls.length === 1) return htmls[0];
    const docs = htmls.map((h) => new DOMParser().parseFromString(h, 'text/html'));
    const headHtml = docs[0].head.innerHTML;
    const bodies = docs.map((d) => d.body.innerHTML).join('<div style="break-before:page;page-break-before:always"></div>');
    return `<!doctype html><html><head>${headHtml}</head><body>${bodies}</body></html>`;
  }
  function printHtml(html, name) {
    return new Promise((resolve) => {
      const frame = $('printFrame');
      const titled = html.replace(/<title>[^<]*<\/title>/i, '').replace(/<head>/i, `<head><title>${esc(name)}</title>`);
      frame.onload = () => {
        const w = frame.contentWindow;
        const before = document.title;
        // Chrome and Edge name the saved PDF after the page title.
        document.title = name;
        setTimeout(() => {
          w.focus(); w.print();
          document.title = before;
          resolve();
        }, 250);
      };
      frame.srcdoc = titled;
    });
  }
  $('dlGo').addEventListener('click', async () => {
    const babies = chosenBabies(); const m = $('dlMonth').value;
    if (!babies.length || !m || !window.CradlewellReport) return;
    const btn = $('dlGo'); const label = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Preparing report…'; $('dlErr').textContent = '';
    try {
      const [y, mo] = m.split('-').map(Number);
      const month = new Date(y, mo - 1, 15);
      const results = await Promise.all(babies.map(async (b) => {
        const { baby, records } = await babyRecords(rep.family.id, b.id);
        return window.CradlewellReport.buildMonthReport({ baby, records, month });
      }));
      const ok = results.filter((r) => r.html);
      if (!ok.length) throw new Error(results[0]?.empty || 'Nothing was recorded that month.');
      const who = babies.length > 2 ? 'All babies' : babies.map((b) => b.name).join('_');
      const name = ok.length === 1 && babies.length === 1 ? ok[0].name : `Cradlewell_${who}_${monthName(m)}`;
      closeDialogs();
      await printHtml(combine(ok.map((r) => r.html)), name);
    } catch (err) {
      $('dlErr').textContent = err.message;
    } finally {
      btn.innerHTML = label; btn.disabled = false;
    }
  });

  // ---------- Add client / add nurse ----------
  const ADD = {
    client: {
      title: 'Add client', sub: 'Register a new family', icon: 'i-useradd', button: 'Add client',
      fields: [['name', 'Client name', 'text', 'e.g. Priya Sharma', 'name'], ['phone', 'Phone number', 'tel', '98765 43210', 'tel'], ['email', "Parent's email (optional)", 'email', 'parent@example.com', 'email']],
      send: (v) => call('/clients', { method: 'POST', body: { name: v.name, phone: v.phone, email: v.email || undefined } }),
      done: (r) => `<div class="ok">${esc(r.name)} is registered as <b>${esc(r.code)}</b> (${esc(r.phoneMasked)}). A nurse opens the family with the parent's emailed code${r.email ? '' : '; the nurse adds the parent\'s email the first time'}.</div>`,
    },
    nurse: {
      title: 'Add nurse', sub: 'Create a nurse account', icon: 'i-stethadd', button: 'Create nurse account',
      fields: [['name', 'Full name', 'text', 'e.g. Anusha Reddy', 'name'], ['email', 'Email', 'email', 'nurse@example.com', 'email'], ['phone', 'Phone number', 'tel', '98765 43210', 'tel']],
      send: (v) => call('/nurses', { method: 'POST', body: v }),
      done: (r) => `<div class="ok">${esc(r.name)} can now log in to the app as a <b>Nurse</b> with ${esc(r.email)} and this password. Share it with them privately; they can change it in the app. It is shown only now.</div>
        <div class="secret" style="margin-top:10px"><span id="newPw">${esc(r.password)}</span><button class="btn ghost sm" type="button" id="copyPw">${icon('i-copy')}Copy</button></div>`,
    },
  };
  let addKind = null;
  function openAdd(kind, from) {
    addKind = kind; const a = ADD[kind];
    $('addTitle').textContent = a.title; $('addSub').textContent = a.sub;
    $('addIcon').innerHTML = `<use href="#${a.icon}"/>`;
    $('addFields').innerHTML = a.fields.map(([id, label, type, ph, ac]) =>
      `<label class="lbl" for="f-${id}">${esc(label)}</label><input class="input" id="f-${id}" name="${id}" type="${type}" placeholder="${esc(ph)}" autocomplete="${ac}" ${id === 'email' && kind === 'client' ? '' : 'required'}>`).join('');
    $('addGo').textContent = a.button; $('addGo').hidden = false; $('addGo').disabled = false;
    $('addErr').textContent = ''; $('addDone').innerHTML = '';
    openDialog('add', from);
    $('f-name').focus();
  }
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = ADD[addKind];
    const v = Object.fromEntries(a.fields.map(([id]) => [id, $(`f-${id}`).value.trim()]));
    const missing = a.fields.find(([id]) => !v[id] && !(id === 'email' && addKind === 'client'));
    if (missing) { $('addErr').textContent = `Enter the ${missing[1].toLowerCase()}.`; $(`f-${missing[0]}`).focus(); return; }
    $('addGo').disabled = true; $('addErr').textContent = '';
    try {
      const r = await a.send(v);
      $('addFields').querySelectorAll('input').forEach((i) => { i.disabled = true; });
      $('addGo').hidden = true;
      $('addDone').innerHTML = a.done({ ...r, email: r.email || v.email });
      const copy = $('copyPw');
      if (copy) copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(r.password); copy.textContent = 'Copied'; } catch (_) { /* select by hand */ } });
      load();
    } catch (err) {
      $('addErr').textContent = err.message;
      $('addGo').disabled = false;
    }
  });

  // ---------- Loading ----------
  async function load() {
    try {
      const [o, f, n, a] = await Promise.all([call('/overview'), call('/families'), call('/nurses'), call('/assignments')]);
      data.overview = o; data.families = f.families; data.nurses = n.nurses; data.assignments = a.assignments;
      recordsCache.clear();
      bell();
      show(page);
    } catch (err) {
      if (token) $('page').innerHTML = `${head(TITLES[page])}<div class="card"><p class="empty">${esc(err.message)}</p></div>`;
    }
  }

  function start() {
    const me = (() => { try { return JSON.parse(store.get(ME_KEY) || 'null'); } catch (_) { return null; } })();
    const name = me?.name || 'Admin';
    $('meName').textContent = name; $('meEmail').textContent = me?.email || '';
    $('topName').textContent = name.split(' ')[0]; $('sideName').textContent = name;
    $('topAvatar').textContent = initial(name); $('sideAvatar').textContent = initial(name);
    $('today').textContent = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    $('login').hidden = true;
    $('app').hidden = false;
    show(page);
    load();
  }

  if (token) start(); else showLogin('');
}());
