const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
    inbox: 'M3 4h18v16H3z M3 13h5l2 3h4l2-3h5',
    bug: 'M8 9h8v8a4 4 0 0 1-8 0V9z M9 9V7a3 3 0 0 1 6 0v2 M4 10l4 2m8 0 4-2M4 16h4m8 0h4M6 22l3-3m6 0 3 3M12 10v8',
    code: 'm8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',
    gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-6-6 6 6-6 6', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
    play: 'm8 4 12 8-12 8z', pause: 'M8 4v16M16 4v16', download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
    check: 'm5 12 4 4L20 5', shield: 'm12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3z m-4 9 3 3 5-6',
    close: 'm6 6 12 12M6 18 18 6', copy: 'M8 8h12v13H8zM16 8V3H3v13h5', link: 'm9 15 6-6M8 17l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l4 3', logout: 'M9 3H3v18h6m5-15 6 6-6 6m-7-6h13',
    refresh: 'M20 8a8 8 0 1 0 0 8m0-13v5h-5', monitor: 'M3 3h18v14H3z M12 17v4m-5 0h10',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', terminal: 'm4 5 6 7-6 7m9 0h7', alert: 'm12 3 10 18H2L12 3zM12 9v5m0 3v1', folder: 'M3 5h6l2 3h10v12H3z',
    cursor: 'm5 3 14 9-7 2-3 7L5 3z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.code}"/></svg>`;
const time = ms => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000) % 60 < 10 ? '0' : ''}${Math.floor(ms / 1000) % 60}.${Math.floor(ms % 1000 / 100)}`;
const ago = value => { const n = Math.max(0, Math.round((Date.now() - value) / 60000)); return n < 1 ? 'Just now' : n < 60 ? `${n}m ago` : n < 1440 ? `${Math.floor(n / 60)}h ago` : new Date(value).toLocaleDateString(); };
const state = { user: null, projects: [], project: null, sessions: [], stats: {}, session: null, filter: '', query: '', tab: 'all', at: 0, playing: false, speed: 1, selectedEvent: -1, githubConfigured: false, retention: 14 };
let animation = 0, lastTick = 0, loadGeneration = 0;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = 'show' + (error ? ' error' : ''); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', 5000); }
async function api(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const data = await response.json();
    if (!response.ok) {
        if (response.status === 401 && !path.includes('/auth/')) {
            state.user = null;
            authPage();
        }
        throw new Error(data.error || 'Request failed.');
    }
    return data;
}
function action(fn) { return async (e) => { try {
    await fn(e);
}
catch (error) {
    toast(error.message, true);
} }; }
function bind(selector, event, fn) { const el = $(selector); if (el)
    el.addEventListener(event, action(fn)); }
async function clipboard(value) { try {
    await navigator.clipboard.writeText(value);
    toast('Copied to clipboard.');
}
catch {
    dialog('Copy this text', `<textarea class="copy-fallback" readonly>${escape(value)}</textarea>`);
    $('.copy-fallback').select();
} }
function download(url) { const a = document.createElement('a'); a.href = url; a.click(); }
function stopPlayer() { state.playing = false; cancelAnimationFrame(animation); }
function closeDialog() { $('#modal')?.remove(); }
function dialog(title, content) { closeDialog(); const el = document.createElement('dialog'); el.id = 'modal'; el.innerHTML = `<div class="dialog-head"><h2>${escape(title)}</h2><button class="icon-btn" id="close-dialog" aria-label="Close">${icon('close')}</button></div><div class="dialog-body">${content}</div>`; document.body.append(el); el.showModal(); bind('#close-dialog', 'click', closeDialog); el.addEventListener('click', e => { if (e.target === el)
    el.close(); }); el.addEventListener('close', () => el.remove()); }
function authPage(register = false) {
    stopPlayer();
    $('#app').innerHTML = `<main class="auth-layout"><section class="auth-story"><a class="brand light" href="/"><img src="/icon.svg" width="35" height="35" alt="">ReproLab</a><div class="auth-copy"><h1>“It broke.”<br><span>Now you have<br>the evidence.</span></h1><p>Go from a browser failure to a clear reproduction, a visual timeline and a regression-test draft.</p></div><div class="evidence-card"><div class="evidence-top"><span class="record-dot"></span><strong>Checkout failure</strong><code>00:08.4</code></div><div class="evidence-line">${icon('cursor')}<span>Click <code>[data-testid="checkout"]</code></span><i>8.1s</i></div><div class="evidence-line">${icon('globe')}<span>POST /api/checkout <b class="error-text">503</b></span><i>8.3s</i></div><div class="evidence-line highlighted">${icon('bug')}<span>TypeError: inventory is undefined</span><i>8.4s</i></div><div class="evidence-foot">Illustrative sequence · reproduce it in the sandbox</div></div><div class="auth-bottom">${icon('shield')} Your evidence. Your infrastructure.</div></section><section class="auth-form-panel"><div class="auth-form-wrap"><span class="version-pill">Self-hosted developer preview</span><h2>${register ? 'Create your workspace' : 'Welcome to the lab.'}</h2><p>${register ? 'One account. Private projects. No paid services required.' : 'Sign in to your private bug workbench.'}</p><form id="auth-form">${register ? '<label for="name">Your name</label><input id="name" autocomplete="name" required maxlength="60" placeholder="Adnan Baig">' : ''}<label for="email">Email address</label><input id="email" type="email" autocomplete="email" required placeholder="you@yourcompany.com"><label for="password">Password <small>12 characters minimum</small></label><input id="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="12" maxlength="128" placeholder="A strong, unique password"><p id="auth-error" class="form-error" role="alert"></p><button class="btn primary wide" type="submit">${register ? 'Create workspace' : 'Open workbench'} ${icon('arrow')}</button></form><p class="auth-switch">${register ? 'Already have an account?' : 'First time here?'} <button id="switch-auth" class="text-btn">${register ? 'Sign in' : 'Create workspace'}</button></p><div class="auth-note">${icon('shield')} Recording starts only with consent. Inputs and private text stay masked.</div></div><p class="auth-footer">ReproLab v0.1 · No tracking pixels. No external fonts.</p></section></main>`;
    bind('#switch-auth', 'click', () => authPage(!register));
    bind('#auth-form', 'submit', async (e) => { e.preventDefault(); const button = $('#auth-form button[type=submit]'); button.disabled = true; $('#auth-error').textContent = ''; try {
        const data = await api('/api/auth/' + (register ? 'register' : 'login'), { method: 'POST', body: { email: $('#email').value, password: $('#password').value, ...(register ? { name: $('#name').value } : {}) } });
        state.user = data.user;
        await loadProjects();
        await route();
    }
    catch (e) {
        $('#auth-error').textContent = e.message;
        button.disabled = false;
    } });
}
async function loadProjects() { state.projects = await api('/api/projects'); state.project = state.projects.find(p => p.id === state.project?.id) || state.projects[0] || null; }
async function loadSessions() { if (!state.project) {
    state.sessions = [];
    state.stats = {};
    return;
} const data = await api('/api/sessions?' + new URLSearchParams({ project: state.project.id, search: state.query, status: state.filter })); state.sessions = data.sessions; state.stats = data.stats; }
function nav(active) { return `<aside class="sidebar"><a href="#/sessions" class="brand light"><img src="/icon.svg" alt="" width="30" height="30"><span>ReproLab</span></a><div class="workspace-label">PERSONAL WORKSPACE</div><button class="project-switch" id="project-switch">${icon('folder')}<span>${escape(state.project?.name || 'Choose a project')}</span><span class="chevron">⌄</span></button><nav class="nav-list"><a href="#/sessions" aria-label="Session inbox" class="${active === 'sessions' ? 'active' : ''}">${icon('inbox')}<span>Session inbox</span><span class="nav-count">${state.stats.total ?? state.project?.session_count ?? 0}</span></a><a href="#/issues" aria-label="Error groups" class="${active === 'issues' ? 'active' : ''}">${icon('bug')}<span>Error groups</span></a><a href="#/setup" aria-label="Install recorder" class="${active === 'setup' ? 'active' : ''}">${icon('code')}<span>Install recorder</span></a><a href="#/settings" aria-label="Project settings" class="${active === 'settings' ? 'active' : ''}">${icon('gear')}<span>Project settings</span></a></nav><div class="sidebar-sandbox"><div class="tiny-window">${icon('cursor')}${icon('bug')}</div><strong>Meet your next bug.</strong><p>Reproduce a broken checkout and inspect the recording.</p><a href="/sandbox" class="btn side-btn">Try the sandbox ${icon('arrow')}</a></div><div class="sidebar-bottom"><div class="avatar">${escape(state.user?.name?.slice(0, 1).toUpperCase())}</div><div><strong>${escape(state.user?.name)}</strong><small>Private workspace</small></div><button class="icon-btn" id="logout" aria-label="Sign out">${icon('logout')}</button></div></aside>`; }
function shell(active, title, content, extra = '') {
    $('#app').innerHTML = `<div class="app-shell">${nav(active)}<div class="main-shell"><header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>/</span><strong>${escape(title)}</strong></div><div class="header-actions"><span class="private-pill">${icon('shield')}Private by default</span><a href="/sandbox" class="btn primary">${icon('plus')} Record a session</a></div></header><main class="main-content ${extra}">${content}</main><footer class="app-footer"><span>ReproLab <b>v0.1</b></span><span>${icon('shield')} Input values never recorded</span><span>MongoDB-backed · ${state.retention}-day retention</span></footer></div></div>`;
    bind('#logout', 'click', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); sessionStorage.removeItem('repro-sandbox'); sessionStorage.removeItem('repro-keys'); state.user = null; location.hash = ''; authPage(); });
    bind('#project-switch', 'click', () => {
        dialog('Your projects', `<div class="project-picker">${state.projects.map(p => `<button class="project-option" data-project="${p.id}">${icon('folder')}<span>${escape(p.name)}</span><small>${p.session_count} recordings</small></button>`).join('')}</div><button id="new-project" class="btn primary wide">${icon('plus')} Create project</button>`);
        document.querySelectorAll('[data-project]').forEach(el => el.onclick = action(async () => { state.project = state.projects.find(p => p.id === el.dataset.project); closeDialog(); location.hash = '/sessions'; await route(); }));
        bind('#new-project', 'click', newProject);
    });
}
function newProject() { dialog('Create a project', `<p class="muted">Group recordings by application. Capture keys can only submit recordings; they cannot read them.</p><form id="project-form"><label for="project-name">Project name</label><input id="project-name" required maxlength="80" placeholder="My web application"><label for="project-origins">Allowed website origins <small>One per line</small></label><textarea id="project-origins" required rows="3">${escape(location.origin)}</textarea><button class="btn primary wide" type="submit">Create project ${icon('arrow')}</button></form>`); bind('#project-form', 'submit', async (e) => { e.preventDefault(); const p = await api('/api/projects', { method: 'POST', body: { name: $('#project-name').value, origins: $('#project-origins').value.split('\n').map(s => s.trim()).filter(Boolean) } }); const keys = JSON.parse(sessionStorage.getItem('repro-keys') || '{}'); keys[p.id] = p.captureKey; sessionStorage.setItem('repro-keys', JSON.stringify(keys)); state.project = p; await loadProjects(); closeDialog(); location.hash = '/setup'; await route(); toast('Project created. Your capture key is shown once.'); }); }
function sessionRow(s) { return `<a class="session-row" href="#/session/${s.id}"><span class="session-kind ${s.error_count ? 'error' : 'ok'}">${icon(s.error_count ? 'bug' : 'monitor')}</span><div class="session-name"><strong>${escape(s.title)}</strong><span>${escape(s.url.replace(/^https?:\/\//, ''))}</span></div><span class="release-code">${escape(s.release)}</span><span class="row-errors ${s.error_count ? 'error-text' : ''}">${s.error_count ? `${s.error_count} error${s.error_count === 1 ? '' : 's'}` : 'No errors'}</span><span class="row-duration">${time(s.duration)}</span><span class="status ${s.status}">${s.status}</span><span class="row-date">${ago(s.created_at)}</span><span class="row-arrow">${icon('arrow')}</span></a>`; }
function inbox() {
    const all = state.stats.total || 0;
    shell('sessions', 'Session inbox', `<div class="page-title"><div><h1>Evidence, not guesswork.</h1><p>Every click. Every failed request. The moment it broke.</p></div><button class="btn" id="refresh">${icon('refresh')}Refresh</button></div><section class="signal-strip"><div><span class="signal-label">Captured sessions</span><strong>${all}</strong><span class="signal-note">in this project</span></div><div><span class="signal-label">Uncaught errors</span><strong class="${state.stats.errors ? 'error-text' : ''}">${state.stats.errors || 0}</strong><span class="signal-note">with reproduction context</span></div><div><span class="signal-label">Distinct error groups</span><strong>${state.stats.groups || 0}</strong><span class="signal-note">deduplicated by fingerprint</span></div><div><span class="signal-label">Resolved sessions</span><strong>${state.stats.resolved || 0}</strong><span class="signal-note">triaged by you</span></div></section><div class="inbox-toolbar"><div class="tabs">${[['', 'All sessions'], ['new', 'Needs attention'], ['investigating', 'Investigating'], ['resolved', 'Resolved']].map(([v, l]) => `<button data-filter="${v}" class="${state.filter === v ? 'selected' : ''}">${l}</button>`).join('')}</div><div class="search-box">${icon('search')}<input id="session-search" aria-label="Search sessions" placeholder="Search recordings…" value="${escape(state.query)}"><kbd>/</kbd></div></div><div class="sessions-table"><div class="table-head"><span>RECORDING</span><span>RELEASE</span><span>ERRORS</span><span>LENGTH</span><span>STATUS</span><span>CAPTURED</span></div><div id="session-rows">${state.sessions.length ? state.sessions.map(sessionRow).join('') : empty()}</div></div><div class="inbox-bottom"><span>${state.sessions.length} recording${state.sessions.length === 1 ? '' : 's'} shown${state.sessions.length === 250 ? ' · latest 250' : ''}</span><a class="text-link" href="#/setup">${icon('code')} Connect another application</a></div>`);
    bind('#refresh', 'click', async () => { await loadSessions(); inbox(); toast('Inbox refreshed.'); });
    document.querySelectorAll('[data-filter]').forEach(b => b.onclick = action(async () => { state.filter = b.dataset.filter; await loadSessions(); inbox(); }));
    let timer;
    bind('#session-search', 'input', e => { state.query = e.target.value; clearTimeout(timer); timer = setTimeout(action(async () => { await loadSessions(); $('#session-rows').innerHTML = state.sessions.length ? state.sessions.map(sessionRow).join('') : empty(); }), 250); });
    bind('#empty-project', 'click', newProject);
}
function empty() { return `<div class="empty"><div class="empty-art">${icon('inbox')}</div><h2>${state.query || state.filter ? 'No matching recordings' : 'Your next bug gets a paper trail.'}</h2><p>${state.query || state.filter ? 'Try another search or clear the status filter.' : 'Connect the recorder to your app, or capture a real failure in our interactive sandbox.'}</p><div><a href="/sandbox" class="btn primary">Try the recording sandbox ${icon('arrow')}</a>${!state.project ? `<button id="empty-project" class="btn">${icon('plus')}Create a project</button>` : ''}</div><span class="empty-note">No sample analytics. This inbox contains only your recordings.</span></div>`; }
function groups() { const list = new Map(); for (const s of state.sessions) {
    if (!s.error_count)
        continue;
    const g = list.get(s.fingerprint) || { ...s, count: 0 };
    g.count++;
    list.set(s.fingerprint, g);
} shell('issues', 'Error groups', `<div class="page-title"><div><h1>Same failure. One place.</h1><p>Errors grouped by normalized message. Start with the most frequent.</p></div></div><div class="group-list">${[...list.values()].sort((a, b) => b.count - a.count).map(g => `<a href="#/session/${g.id}" class="group-row"><span class="session-kind error">${icon('bug')}</span><div><h3>${escape(g.title)}</h3><p><code>${g.fingerprint}</code> · ${escape(g.release)}</p></div><div class="group-count"><strong>${g.count}</strong><span>recording${g.count === 1 ? '' : 's'}</span></div>${icon('arrow')}</a>`).join('') || '<div class="empty"><h2>No uncaught errors recorded.</h2><p>The sandbox can give you a failure to investigate.</p><a class="btn primary" href="/sandbox">Record a bug</a></div>'}</div><p class="muted small">Grouping uses up to the latest 250 recordings. Similar messages may need manual review; a shared fingerprint is not proof of a shared cause.</p>`); }
function eventLabel(e) { switch (e.kind) {
    case 'click': return e.data.label || e.data.selector;
    case 'input': return 'Input changed · value masked';
    case 'network': return `${e.data.method} ${e.data.url} → ${e.data.status}`;
    case 'error': return `${e.data.name}: ${e.data.message}`;
    case 'console': return e.data.message;
    case 'navigation': return e.data.url;
    case 'snapshot': return 'Visual checkpoint';
    case 'scroll': return `Scrolled to ${e.data.y}px`;
    default: return e.data.label || e.kind;
} }
const eventIcon = k => ({ click: 'cursor', input: 'shield', network: 'globe', error: 'bug', console: 'terminal', navigation: 'arrow', snapshot: 'monitor', scroll: 'arrow', marker: 'check' }[k]);
function timelineRows() { const s = state.session; if (!s)
    return ''; return s.events.map((e, i) => ({ e, i })).filter(({ e }) => state.tab === 'all' ? e.kind !== 'snapshot' : state.tab === 'errors' ? ['error', 'console'].includes(e.kind) : state.tab === 'network' ? e.kind === 'network' : ['click', 'input', 'navigation', 'marker'].includes(e.kind)).map(({ e, i }) => `<button class="event-row ${e.kind} ${state.selectedEvent === i ? 'selected' : ''}" data-event="${i}"><time>${time(e.at)}</time><span class="event-icon">${icon(eventIcon(e.kind))}</span><span>${escape(eventLabel(e))}</span><small>${escape(e.kind)}</small></button>`).join('') || '<p class="muted timeline-empty">No events in this category.</p>'; }
function detailPage(shared = false) {
    const s = state.session;
    const html = `<div class="detail-heading"><div><a href="#/sessions" class="back-link">← ${shared ? 'ReproLab' : 'Session inbox'}</a><h1>${escape(s.title)}</h1><div class="session-meta"><span class="${s.error_count ? 'error-text' : ''}">${icon('bug')}${s.error_count} uncaught error${s.error_count === 1 ? '' : 's'}</span><span>${icon('clock')}${time(s.duration)}</span><span>${icon('monitor')}${s.viewport_width} × ${s.viewport_height}</span><code>${escape(s.release)}</code>${shared ? '<span class="pill">Shared · read-only</span>' : ''}</div></div>${shared ? '' : `<select id="triage-status" aria-label="Session status" class="status-select">${['new', 'investigating', 'resolved', 'ignored'].map(v => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>`}</div><div class="detail-grid"><section class="replay-column"><div class="replay-panel"><div class="replay-top"><div class="window-dots"><i></i><i></i><i></i></div><span>${escape(s.url)}</span><span>${icon('shield')} Sanitized replay</span></div><div class="canvas-wrap"><canvas id="replay" width="1280" height="800" aria-label="Privacy-safe visual reconstruction of the recorded page"></canvas><div id="no-frame" hidden>No visual frame recorded for this session.</div></div><div class="replay-controls"><button class="play-button" id="play" aria-label="Play replay">${icon('play')}</button><span id="play-time" class="play-time">00:00.0</span><input type="range" id="seek" aria-label="Replay position" min="0" max="${s.duration || 1}" value="0" step="50"><span class="total-time">${time(s.duration)}</span><select id="speed" aria-label="Playback speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></div></div><div class="replay-caption">${icon('shield')} Layout reconstruction, not video. Private text and input values are masked.</div><section class="timeline"><div class="timeline-head"><h2>Event timeline <span>${s.event_count}</span></h2><div class="tabs compact">${[['all', 'All'], ['errors', 'Errors'], ['network', 'Network'], ['actions', 'Actions']].map(([v, l]) => `<button data-tab="${v}" class="${state.tab === v ? 'selected' : ''}">${l}</button>`).join('')}</div></div><div class="event-list" id="events">${timelineRows()}</div></section></section><aside class="inspection"><section class="inspect-section"><div class="inspect-title">${icon('terminal')}<h2>Inspector</h2></div><div id="event-inspector"><p class="muted">Select an event to inspect its captured evidence.</p></div></section>${shared ? '' : `<section class="inspect-section"><h2>Turn evidence into action.</h2><button class="btn primary wide" id="export-test">${icon('code')} Generate regression test</button><button class="btn wide" id="export-report">${icon('download')} Download bug report</button><button class="btn wide" id="share-session">${icon('link')} Create an expiring share</button><button class="btn wide" id="github-issue">${icon('bug')} Create GitHub issue</button><div class="inline-actions"><button class="text-btn" id="json-export">Export JSON</button><button class="text-btn danger-text" id="delete-session">Delete recording</button></div></section><section class="inspect-section"><h2>Investigation notes</h2><div class="notes">${s.notes.map(n => `<article><p>${escape(n.body)}</p><small>${ago(n.created_at)}</small></article>`).join('') || '<p class="muted small">Keep the context alongside the evidence.</p>'}</div><form id="note-form"><label class="sr-only" for="note-text">Investigation note</label><textarea id="note-text" rows="3" placeholder="What did you find?" required maxlength="2000"></textarea><button class="btn wide" type="submit">Add note</button></form></section>`}</aside></div>`;
    if (shared)
        $('#app').innerHTML = `<header class="shared-top"><a class="brand" href="/"><img src="/icon.svg" width="28" height="28" alt="">ReproLab</a><span>Shared evidence · expiring link</span></header><main class="main-content shared-content">${html}</main>`;
    else
        shell('sessions', 'Session replay', html, 'detail-content');
    bind('#triage-status', 'change', async (e) => { await api(`/api/sessions/${s.id}`, { method: 'PATCH', body: { status: e.target.value } }); s.status = e.target.value; toast('Triage state updated.'); });
    bind('#play', 'click', () => togglePlay());
    bind('#seek', 'input', e => { state.at = Number(e.target.value); drawFrame(); });
    bind('#speed', 'change', e => state.speed = Number(e.target.value));
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('selected', x === b)); $('#events').innerHTML = timelineRows(); bindEvents(); });
    bindEvents();
    bind('#export-test', 'click', async () => { const result = await fetch(`/api/sessions/${s.id}/export?format=playwright`); const code = await result.text(); dialog('Your regression-test draft', `<p>This test expects no runtime errors or HTTP 5xx responses after the recorded actions. It should fail against the broken sandbox. Add your own auth fixtures and product assertions before using it in CI.</p><pre class="code-block large">${escape(code)}</pre><div class="dialog-actions"><button class="btn" id="copy-test">${icon('copy')}Copy code</button><button class="btn primary" id="download-test">${icon('download')}Download .spec.js</button></div>`); bind('#copy-test', 'click', () => clipboard(code)); bind('#download-test', 'click', () => download(`/api/sessions/${s.id}/export?format=playwright`)); });
    bind('#export-report', 'click', () => download(`/api/sessions/${s.id}/export?format=markdown`));
    bind('#json-export', 'click', () => download(`/api/sessions/${s.id}/export?format=json`));
    bind('#share-session', 'click', () => { dialog('Share this recording', `<p>Anyone with the link can view this sanitized recording. Private notes, project keys and source-map contents are excluded.</p><label for="share-hours">Link expires after</label><select id="share-hours"><option value="1">1 hour</option><option value="24" selected>24 hours</option><option value="168">7 days</option></select><div class="dialog-actions"><button class="btn danger" id="revoke-shares">Revoke existing links</button><button class="btn primary" id="create-share">Create link</button></div><div id="share-result"></div>`); bind('#create-share', 'click', async () => { const result = await api(`/api/sessions/${s.id}/share`, { method: 'POST', body: { hours: Number($('#share-hours').value) } }); $('#share-result').innerHTML = `<label for="share-url">Expiring link</label><input id="share-url" readonly value="${escape(result.url)}"><button class="btn wide" id="copy-share">Copy link</button>`; bind('#copy-share', 'click', () => clipboard(result.url)); }); bind('#revoke-shares', 'click', async () => { await api(`/api/sessions/${s.id}/share`, { method: 'DELETE' }); toast('All existing share links revoked.'); }); });
    bind('#github-issue', 'click', async () => { const report = await (await fetch(`/api/sessions/${s.id}/export?format=markdown`)).text(); const project = state.projects.find(p => p.id === s.project_id); dialog('Review GitHub issue', `<p>${state.githubConfigured && project?.repo ? `Publish to <strong>${escape(project.repo)}</strong> only after reviewing the report below.` : 'Configure a server-side GITHUB_TOKEN and the project repository in Settings. Markdown export works without a token.'}</p><pre class="code-block large">${escape(report)}</pre><div class="dialog-actions"><button class="btn" id="copy-report">Copy Markdown</button><button class="btn primary" id="confirm-github" ${state.githubConfigured && project?.repo ? '' : 'disabled'}>Confirm & create issue</button></div>`); bind('#copy-report', 'click', () => clipboard(report)); bind('#confirm-github', 'click', async () => { $('#confirm-github').disabled = true; try {
        const result = await api(`/api/sessions/${s.id}/github`, { method: 'POST', body: { confirm: true } });
        dialog('GitHub issue created', `<p><a class="text-link" href="${escape(result.url)}" rel="noopener noreferrer" target="_blank">Open the issue on GitHub ${icon('arrow')}</a></p>`);
    }
    catch (e) {
        $('#confirm-github').disabled = false;
        throw e;
    } }); });
    bind('#delete-session', 'click', () => { dialog('Delete this recording?', `<p>This permanently removes its events, notes and shared links. Download JSON first to keep a copy.</p><button class="btn danger wide" id="confirm-delete">Delete recording permanently</button>`); bind('#confirm-delete', 'click', async () => { await api(`/api/sessions/${s.id}`, { method: 'DELETE' }); closeDialog(); location.hash = '/sessions'; toast('Recording deleted.'); }); });
    bind('#note-form', 'submit', async (e) => { e.preventDefault(); await api(`/api/sessions/${s.id}/notes`, { method: 'POST', body: { body: $('#note-text').value } }); await route(); toast('Note saved.'); });
    const firstError = s.events.findIndex(e => e.kind === 'error');
    state.selectedEvent = firstError;
    state.at = firstError >= 0 ? s.events[firstError].at : 0;
    drawFrame();
    if (firstError >= 0)
        inspect(firstError);
    else if (s.events.length)
        inspect(0);
}
function bindEvents() { document.querySelectorAll('[data-event]').forEach(b => b.onclick = () => { stopPlayer(); state.selectedEvent = Number(b.dataset.event); state.at = state.session.events[state.selectedEvent].at; inspect(state.selectedEvent); drawFrame(); document.querySelectorAll('[data-event]').forEach(x => x.classList.toggle('selected', x === b)); }); }
function inspect(index) {
    const event = state.session.events[index];
    if (!event || !$('#event-inspector'))
        return;
    const data = { ...event.data };
    if (event.kind === 'snapshot')
        data.frame = `${data.frame.nodes.length} sanitized visual elements`;
    $('#event-inspector').innerHTML = `<div class="inspector-kind ${event.kind}">${icon(eventIcon(event.kind))}<strong>${escape(event.kind)}</strong><time>${time(event.at)}</time></div><pre class="event-json">${escape(JSON.stringify(data, null, 2))}</pre>${event.kind === 'error' && !location.hash.startsWith('#/share/') ? '<button class="btn wide" id="symbolicate">Resolve with source maps</button><div id="source-result"></div>' : ''}`;
    bind('#symbolicate', 'click', async () => { const result = await api(`/api/sessions/${state.session.id}/symbolicate`, { method: 'POST', body: {} }); $('#source-result').innerHTML = result.positions.length ? `<pre class="event-json">${escape(JSON.stringify(result.positions, null, 2))}</pre>` : '<p class="muted small">No matching source map. Upload one for this asset URL and release in Install recorder.</p>'; });
}
function drawFrame() {
    const c = $('#replay');
    if (!c || !state.session)
        return;
    const s = state.session, frames = s.events.filter(e => e.kind === 'snapshot');
    const event = [...frames].reverse().find(e => e.at <= state.at) || frames[0];
    const ctx = c.getContext('2d');
    if (!event) {
        $('#no-frame').hidden = false;
        return;
    }
    const f = event.data.frame;
    c.width = f.width;
    c.height = f.height;
    ctx.fillStyle = '#f5f6f9';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const n of f.nodes) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(n.x, n.y, Math.max(0, n.w), Math.max(0, n.h), Math.min(n.radius, n.w / 2, n.h / 2));
        ctx.fillStyle = n.bg;
        ctx.fill();
        ctx.clip();
        if (n.text) {
            const pad = /^(button|input|textarea|select)$/.test(n.tag) ? 12 : 0;
            ctx.font = `${n.weight} ${n.size}px system-ui, sans-serif`;
            ctx.fillStyle = n.masked ? '#8994a6' : n.color;
            if (n.masked) {
                const w = Math.min(n.w - pad * 2, 90);
                ctx.globalAlpha = .35;
                ctx.fillRect(n.x + pad, n.y + Math.min(n.h / 2, n.size * .8), Math.max(8, w), 5);
            }
            else {
                const words = n.text.split(' ');
                let line = '', y = n.y + n.size;
                for (const word of words) {
                    const next = line ? line + ' ' + word : word;
                    if (ctx.measureText(next).width > n.w - pad * 2 && line) {
                        ctx.fillText(line, n.x + pad, y);
                        line = word;
                        y += n.size * 1.3;
                    }
                    else
                        line = next;
                    if (y > n.y + n.h + 5)
                        break;
                }
                ctx.fillText(line, n.x + pad, y);
            }
        }
        ctx.restore();
    }
    const click = [...s.events].reverse().find(e => e.kind === 'click' && e.at <= state.at && state.at - e.at < 1500);
    if (click) {
        ctx.beginPath();
        ctx.arc(click.data.x, click.data.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52,77,220,.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(click.data.x, click.data.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#344ddc';
        ctx.fill();
    }
    $('#seek').value = state.at;
    $('#play-time').textContent = time(state.at);
    $('#play').innerHTML = icon(state.playing ? 'pause' : 'play');
    $('#play').setAttribute('aria-label', state.playing ? 'Pause replay' : 'Play replay');
}
function togglePlay() { if (state.playing) {
    stopPlayer();
    drawFrame();
    return;
} if (state.at >= state.session.duration)
    state.at = 0; state.playing = true; lastTick = performance.now(); function tick(now) { state.at = Math.min(state.session.duration, state.at + (now - lastTick) * state.speed); lastTick = now; drawFrame(); if (state.at >= state.session.duration) {
    stopPlayer();
    drawFrame();
    return;
} animation = requestAnimationFrame(tick); } animation = requestAnimationFrame(tick); }
function setup() {
    const p = state.project, keys = JSON.parse(sessionStorage.getItem('repro-keys') || '{}'), key = keys[p?.id] || 'YOUR_CAPTURE_KEY';
    const snippet = `<script src="${location.origin}/sdk/reprolab.js"><\/script>\n<script>\n  // Call only after explicit user consent.\n  const recording = ReproLab.start({\n    endpoint: '${location.origin}/api/ingest',\n    captureKey: '${key}',\n    consent: true,\n    title: 'Describe the bug',\n    release: 'v1.0.0'\n  });\n  // After reproducing the bug:\n  // await recording.upload();\n<\/script>`;
    shell('setup', 'Install recorder', `<div class="page-title"><div><h1>One small recorder. A lot of context.</h1><p>Instrument any browser app. No framework lock-in. No runtime dependencies.</p></div><button class="btn primary" id="setup-project">${icon('plus')}New project</button></div>${!p ? '<div class="callout">Create a project to get an ingestion key and configure allowed website origins.</div>' : `<div class="setup-grid"><section><h2>Add the recorder to ${escape(p.name)}</h2><p class="muted">This key is ingestion-only. Keep it out of public examples; it can be rotated at any time.</p><pre class="code-block">${escape(snippet)}</pre><div class="inline-actions"><button class="btn" id="copy-snippet">${icon('copy')}Copy snippet</button><button class="btn" id="rotate-key">Generate a new capture key</button></div><h2 class="section-title">Record public text intentionally.</h2><pre class="code-block">&lt;button data-testid="checkout" data-repro-public&gt;\n  Complete checkout\n&lt;/button&gt;\n\n&lt;section data-repro-private&gt;Private content&lt;/section&gt;\n&lt;div data-repro-ignore&gt;Recorder controls&lt;/div&gt;</pre><p class="muted">Inputs are always masked. Public-text opt-in applies to direct text nodes only, not descendants. Stable <code>data-testid</code> attributes make regression drafts more useful.</p></section><aside class="setup-aside"><h2>Capture contract</h2><ul class="contract-list"><li>${icon('check')} Explicit recording consent</li><li>${icon('check')} No request or response bodies</li><li>${icon('check')} No cookies or auth headers</li><li>${icon('check')} Query strings stripped</li><li>${icon('check')} Inputs always masked</li><li>${icon('check')} 5-minute session limit</li><li>${icon('check')} Bounded in-memory buffer</li><li>${icon('check')} Idempotent uploads</li></ul><a class="btn wide" href="/sandbox">Test in the sandbox ${icon('arrow')}</a><p class="small muted">The SDK uploads only when you call <code>upload()</code>. It never records continuously after being stopped.</p></aside></div><section class="source-map-section"><h2>Unminify the stack trace.</h2><p class="muted">Optional: upload a flat v3 source map for an exact asset URL and release. Maps stay private to this project and are not included in shared recordings.</p><form id="map-form" class="map-form"><div><label for="map-asset">Generated JavaScript URL</label><input id="map-asset" type="url" placeholder="${location.origin}/sandbox-error.min.js" required></div><div><label for="map-release">Release</label><input id="map-release" placeholder="sandbox-v1" required maxlength="80"></div><div><label for="map-file">Source map (.map)</label><input id="map-file" type="file" accept=".map,.json" required></div><button class="btn primary" type="submit">Upload map</button></form><div id="map-list"></div></section>`}`);
    bind('#setup-project', 'click', newProject);
    bind('#copy-snippet', 'click', () => clipboard(snippet));
    bind('#rotate-key', 'click', () => { dialog('Rotate capture key?', `<p>The previous key stops accepting uploads immediately. Update each instrumented app and your browser extension.</p><button class="btn primary wide" id="confirm-rotate">Rotate key</button>`); bind('#confirm-rotate', 'click', async () => { const r = await api(`/api/projects/${p.id}/rotate-key`, { method: 'POST', body: {} }); keys[p.id] = r.captureKey; sessionStorage.setItem('repro-keys', JSON.stringify(keys)); closeDialog(); setup(); toast('New key generated. Copy it before closing this browser session.'); }); });
    bind('#map-form', 'submit', async (e) => { e.preventDefault(); const file = $('#map-file').files[0]; if (file.size > 2500000)
        throw new Error('Source map must be smaller than 2.5 MB.'); await api(`/api/projects/${p.id}/source-maps`, { method: 'POST', body: { asset: $('#map-asset').value, release: $('#map-release').value, map: JSON.parse(await file.text()) } }); toast('Source map uploaded.'); await mapsList(); });
    if (p)
        mapsList().catch(e => toast(e.message, true));
}
async function mapsList() { const maps = await api(`/api/projects/${state.project.id}/source-maps`); if ($('#map-list'))
    $('#map-list').innerHTML = maps.map(m => `<div class="map-row">${icon('code')}<code>${escape(m.asset)}</code><span class="pill">${escape(m.release)}</span><small>${ago(m.created_at)}</small></div>`).join('') || '<p class="muted small">No maps uploaded yet. A sample map ships in the repository’s examples directory.</p>'; }
function settings() {
    const p = state.project;
    shell('settings', 'Project settings', `<div class="page-title"><div><h1>A project with boundaries.</h1><p>Control which applications can send recordings and where evidence goes.</p></div></div>${p ? `<div class="settings-grid"><form id="settings-form"><h2>Project configuration</h2><label for="settings-name">Project name</label><input id="settings-name" value="${escape(p.name)}" required maxlength="80"><label for="settings-origins">Allowed origins <small>Exact origins only, one per line</small></label><textarea id="settings-origins" rows="4" required>${escape(p.origins.join('\n'))}</textarea><label for="settings-repo">GitHub repository <small>Optional · owner/repository</small></label><input id="settings-repo" placeholder="CodnanBaig/my-app" value="${escape(p.repo || '')}"><p class="muted small">${state.githubConfigured ? 'A server-side GitHub token is configured.' : 'No server-side GITHUB_TOKEN is configured. Markdown export still works.'} ReproLab never creates an issue without your confirmation.</p><button class="btn primary" type="submit">Save settings</button></form><section class="settings-info"><h2>Your data stays yours.</h2><dl><dt>Database</dt><dd>MongoDB</dd><dt>Automatic retention</dt><dd>${state.retention} days</dd><dt>Capture visibility</dt><dd>Only your signed-in account</dd><dt>External sharing</dt><dd>Explicit, expiring, revocable</dd><dt>Third-party analytics</dt><dd>None</dd><dt>AI provider</dt><dd>None required</dd></dl><p class="muted small">Retention is configured with RETENTION_DAYS. Source maps are retained until project deletion. Back up MongoDB before changing infrastructure.</p><button class="btn danger" id="delete-project">${icon('trash')}Delete this project</button></section></div>` : '<div class="empty"><h2>No project yet.</h2><button class="btn primary" id="settings-create">Create a project</button></div>'}`);
    bind('#settings-create', 'click', newProject);
    bind('#settings-form', 'submit', async (e) => { e.preventDefault(); await api(`/api/projects/${p.id}`, { method: 'PATCH', body: { name: $('#settings-name').value, origins: $('#settings-origins').value.split('\n').map(s => s.trim()).filter(Boolean), repo: $('#settings-repo').value.trim() } }); await loadProjects(); settings(); toast('Project settings saved.'); });
    bind('#delete-project', 'click', () => { dialog('Delete project and all evidence?', `<p>This removes every recording, note, shared link and source map in <strong>${escape(p.name)}</strong>. This cannot be undone.</p><button class="btn danger wide" id="confirm-delete-project">Permanently delete project</button>`); bind('#confirm-delete-project', 'click', async () => { await api(`/api/projects/${p.id}`, { method: 'DELETE', body: { confirm: true } }); closeDialog(); state.project = null; await loadProjects(); location.hash = '/sessions'; await route(); toast('Project deleted.'); }); });
}
async function route() {
    const generation = ++loadGeneration;
    stopPlayer();
    const path = location.hash.replace(/^#/, '') || '/sessions';
    if (path.startsWith('/share/')) {
        try {
            state.session = await api('/api/shared/' + encodeURIComponent(path.split('/')[2]));
            state.tab = 'all';
            if (generation === loadGeneration)
                detailPage(true);
        }
        catch (e) {
            $('#app').innerHTML = `<main class="shared-error"><a class="brand" href="/"><img src="/icon.svg" alt="" width="32">ReproLab</a><h1>This link is no longer available.</h1><p>${escape(e.message)}</p><a class="btn" href="/">Open your workbench</a></main>`;
        }
        return;
    }
    if (!state.user) {
        authPage();
        return;
    }
    try {
        if (path.startsWith('/session/')) {
            state.session = await api('/api/sessions/' + encodeURIComponent(path.split('/')[2]));
            state.project = state.projects.find(p => p.id === state.session.project_id) || state.project;
            state.at = 0;
            state.tab = 'all';
            if (generation === loadGeneration)
                detailPage();
            return;
        }
        await loadSessions();
        if (generation !== loadGeneration)
            return;
        if (path === '/setup')
            setup();
        else if (path === '/settings')
            settings();
        else if (path === '/issues') {
            state.filter = '';
            state.query = '';
            await loadSessions();
            groups();
        }
        else
            inbox();
    }
    catch (e) {
        toast(e.message, true);
        if (state.user)
            shell('sessions', 'Unavailable', `<div class="empty"><h1>Couldn’t load this view.</h1><p>${escape(e.message)}</p><a class="btn primary" href="#/sessions">Return to session inbox</a></div>`);
    }
}
window.addEventListener('hashchange', () => route());
window.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $('#modal'))
    return; if (e.key === '/') {
    $('#session-search')?.focus();
    e.preventDefault();
} if (e.code === 'Space' && $('#play')) {
    e.preventDefault();
    togglePlay();
} });
(async () => { try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.githubConfigured = me.githubConfigured;
    state.retention = me.retentionDays;
    if (state.user)
        await loadProjects();
    await route();
}
catch (e) {
    $('#app').innerHTML = '<main class="shared-error"><h1>Cannot reach ReproLab.</h1><p>Make sure the local server is running, then reload.</p></main>';
    toast(e.message, true);
} })();
