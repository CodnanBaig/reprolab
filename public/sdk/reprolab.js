/* ReproLab browser recorder · MIT · explicit consent required · zero dependencies */
(function (global) {
    'use strict';
    if (global.ReproLab)
        return;
    let active = null;
    const secret = /\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s,"';]+/gi;
    function safeUrl(value) {
        try {
            const u = new URL(String(value), location.href);
            if (!/^https?:$/.test(u.protocol))
                return '[redacted-url]';
            const path = u.pathname.split('/').map(p => {
                let s;
                try {
                    s = decodeURIComponent(p);
                }
                catch {
                    return '[segment]';
                }
                return /@/.test(s) || /^\d{7,}$/.test(s) || /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(s) || s.length > 64 ? '[id]' : s.replace(/[\u0000-\u001f<>"']/g, '_');
            }).join('/');
            return (u.origin + path).slice(0, 500);
        }
        catch {
            return '[redacted-url]';
        }
    }
    function scrub(v, max = 1200) {
        return String(v || '').slice(0, max)
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
            .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g, '[secret]')
            .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
            .replace(/\bBearer\s+\S+/gi, 'Bearer [token]').replace(secret, '$1=[redacted]')
            .replace(/\b(?:\d[ -]?){13,19}\b/g, '[number]')
            .replace(/https?:\/\/[^\s)]+/g, safeUrl);
    }
    function privateElement(el) { return Boolean(el.closest('[data-repro-private], .repro-private, [data-repro-ignore]')); }
    function publicLabel(el) {
        if (privateElement(el) || !el.matches('[data-repro-public]'))
            return el.tagName.toLowerCase();
        // Only direct text nodes: an opted-in container never unmasks a private child.
        return scrub(Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim(), 90) || el.tagName.toLowerCase();
    }
    function locator(el) {
        const safe = v => v && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v) && !/password|secret|token/i.test(v);
        for (const attr of ['data-testid', 'data-repro-id'])
            if (safe(el.getAttribute(attr)))
                return `[${attr}="${el.getAttribute(attr)}"]`;
        if (safe(el.id) && document.querySelectorAll(`[id="${el.id}"]`).length === 1)
            return `[id="${el.id}"]`;
        const parts = [];
        let item = el;
        while (item && item !== document.body && parts.length < 6) {
            const siblings = item.parentElement ? Array.from(item.parentElement.children).filter(n => n.tagName === item.tagName) : [];
            parts.unshift(`${item.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(item) + 1})`);
            item = item.parentElement;
        }
        return parts.length ? parts.join(' > ') : 'body';
    }
    function frame() {
        const nodes = [];
        const all = [document.body, ...document.body.querySelectorAll('*')];
        for (const el of all) {
            if (nodes.length >= 250)
                break;
            if (!(el instanceof HTMLElement) || el.closest('[data-repro-ignore]') || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|SVG|PATH|IFRAME)$/.test(el.tagName))
                continue;
            const parentPrivate = el.parentElement?.closest('[data-repro-private],.repro-private');
            if (parentPrivate)
                continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth)
                continue;
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden' || s.display === 'none')
                continue;
            const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
            const masked = privateElement(el) || isInput || !el.matches('[data-repro-public]');
            const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
            const content = masked ? (isInput || direct || privateElement(el) ? '[masked]' : '') : scrub(direct, 100);
            const visibleBg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
            if (!content && !visibleBg && !/^(BUTTON|IMG|INPUT|TEXTAREA|SELECT|HR)$/.test(el.tagName))
                continue;
            nodes.push({ tag: el.tagName.toLowerCase(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: content,
                color: s.color, bg: visibleBg ? s.backgroundColor : isInput ? '#e7ebf2' : 'transparent', size: parseFloat(s.fontSize) || 14, weight: parseInt(s.fontWeight) || 400, radius: parseFloat(s.borderRadius) || 0, masked });
        }
        return { width: innerWidth, height: innerHeight, scrollY: scrollY, nodes };
    }
    function start(options = {}) {
        if (options.consent !== true)
            throw new Error('ReproLab requires explicit consent before recording.');
        if (active?.isRecording)
            throw new Error('A ReproLab recording is already active.');
        let endpoint;
        try {
            endpoint = new URL(options.endpoint);
            if (!/^https?:$/.test(endpoint.protocol))
                throw new Error();
        }
        catch {
            throw new Error('Provide an absolute HTTP(S) collector endpoint.');
        }
        const startTime = performance.now(), startUrl = safeUrl(location.href), events = [], cleanup = [];
        const originalFetch = global.fetch;
        let live = true, bytes = 0, snapshots = 0, frameTimer = null, reason = 'manual', saved = null;
        const clientId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
            Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        const at = () => Math.round(performance.now() - startTime);
        const add = (kind, data) => {
            if (!live)
                return;
            const e = { kind, at: Math.min(at(), 300000), data };
            const n = JSON.stringify(e).length;
            if (events.length >= 2200 || bytes + n > 2300000) {
                reason = 'buffer-limit';
                stop();
                return;
            }
            events.push(e);
            bytes += n;
        };
        function snapshot() { if (!live || snapshots >= 35)
            return; snapshots++; add('snapshot', { frame: frame() }); }
        function scheduleFrame() { clearTimeout(frameTimer); frameTimer = setTimeout(snapshot, 180); }
        function on(target, name, fn) { target.addEventListener(name, fn, true); cleanup.push(() => target.removeEventListener(name, fn, true)); }
        function captureError(error) { add('error', { name: scrub(error?.name || 'Error', 60), message: scrub(error?.message || String(error), 800), stack: scrub(error?.stack || '', 4000) }); scheduleFrame(); }
        on(global, 'error', e => { if (e.error)
            captureError(e.error);
        else if (e.message)
            captureError({ name: 'Error', message: e.message }); });
        on(global, 'unhandledrejection', e => captureError(e.reason));
        on(document, 'click', e => {
            const el = e.target instanceof Element ? e.target.closest('button,a,input,select,[role="button"],[data-testid],[data-repro-id]') : null;
            if (!el || privateElement(el))
                return;
            add('click', { selector: locator(el), label: publicLabel(el), x: Math.round(e.clientX), y: Math.round(e.clientY) });
            scheduleFrame();
        });
        on(document, 'input', e => {
            const el = e.target;
            if (!(el instanceof HTMLElement) || privateElement(el))
                return;
            const data = { selector: locator(el), inputType: el.type || 'text', redacted: true };
            const last = events.at(-1);
            if (last?.kind === 'input' && last.data.selector === data.selector && at() - last.at < 1000)
                last.at = at();
            else
                add('input', data);
            scheduleFrame();
        });
        let scrollTimer;
        on(global, 'scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => { add('scroll', { x: scrollX, y: scrollY }); scheduleFrame(); }, 180); });
        on(global, 'popstate', () => { add('navigation', { url: safeUrl(location.href) }); scheduleFrame(); });
        for (const key of ['pushState', 'replaceState']) {
            const original = history[key];
            const wrapper = function (...args) { const r = original.apply(this, args); add('navigation', { url: safeUrl(location.href) }); scheduleFrame(); return r; };
            history[key] = wrapper;
            cleanup.push(() => { if (history[key] === wrapper)
                history[key] = original; });
        }
        function skipNetwork(url) { try {
            return new URL(url, location.href).href.startsWith(endpoint.href);
        }
        catch {
            return true;
        } }
        const fetchWrapper = async function (input, init) {
            const reqUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
            const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
            const time = performance.now();
            try {
                const response = await originalFetch.apply(this, arguments);
                if (!skipNetwork(reqUrl))
                    add('network', { url: safeUrl(reqUrl), method: String(method).toUpperCase(), status: response.status, duration: Math.round(performance.now() - time) });
                return response;
            }
            catch (error) {
                if (!skipNetwork(reqUrl))
                    add('network', { url: safeUrl(reqUrl), method: String(method).toUpperCase(), status: 0, duration: Math.round(performance.now() - time) });
                throw error;
            }
        };
        global.fetch = fetchWrapper;
        cleanup.push(() => { if (global.fetch === fetchWrapper)
            global.fetch = originalFetch; });
        const xhrMeta = new WeakMap(), xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
        function openWrapper(method, url) { xhrMeta.set(this, { method, url }); return xhrOpen.apply(this, arguments); }
        function sendWrapper() { const meta = xhrMeta.get(this), time = performance.now(); if (meta && !skipNetwork(meta.url))
            this.addEventListener('loadend', () => add('network', { url: safeUrl(meta.url), method: meta.method, status: this.status, duration: Math.round(performance.now() - time) }), { once: true }); return xhrSend.apply(this, arguments); }
        XMLHttpRequest.prototype.open = openWrapper;
        XMLHttpRequest.prototype.send = sendWrapper;
        cleanup.push(() => { if (XMLHttpRequest.prototype.open === openWrapper)
            XMLHttpRequest.prototype.open = xhrOpen; if (XMLHttpRequest.prototype.send === sendWrapper)
            XMLHttpRequest.prototype.send = xhrSend; });
        for (const level of ['warn', 'error']) {
            const original = console[level];
            const wrapper = function (...args) { add('console', { level, message: scrub(args.map(x => typeof x === 'string' ? x : x instanceof Error ? x.message : `[${typeof x}]`).join(' '), 800) }); return original.apply(console, args); };
            console[level] = wrapper;
            cleanup.push(() => { if (console[level] === wrapper)
                console[level] = original; });
        }
        const observer = new MutationObserver(scheduleFrame);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'aria-expanded'] });
        cleanup.push(() => observer.disconnect());
        const maxTimer = setTimeout(() => { reason = 'time-limit'; stop(); }, 300000);
        cleanup.push(() => clearTimeout(maxTimer));
        add('navigation', { url: safeUrl(location.href) });
        snapshot();
        function stop() {
            if (!saved) {
                if (live && reason === 'manual' && snapshots < 35) {
                    live = false;
                    const final = { kind: 'snapshot', at: Math.min(at(), 300000), data: { frame: frame() } };
                    if (bytes + JSON.stringify(final).length < 2300000)
                        events.push(final);
                }
                live = false;
                cleanup.forEach(fn => fn());
                clearTimeout(frameTimer);
                clearTimeout(scrollTimer);
                saved = { version: 1, clientId, title: scrub(options.title || 'Untitled recording', 180), url: startUrl, release: scrub(options.release || 'development', 80), browser: scrub(navigator.userAgent, 150), viewport: { width: innerWidth, height: innerHeight }, duration: Math.min(at(), 300000), events };
            }
            return saved;
        }
        const controller = { stop, get isRecording() { return live; }, get eventCount() { return events.length; }, get duration() { return at(); }, get stopReason() { return reason; },
            mark(label) { add('marker', { label: scrub(label, 100) }); snapshot(); },
            async upload() { const payload = stop(); const res = await originalFetch(endpoint.href, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Repro-Key': options.captureKey || '' }, body: JSON.stringify(payload) }); const result = await res.json(); if (!res.ok)
                throw new Error(result.error || 'Capture upload failed.'); return result; } };
        active = controller;
        return controller;
    }
    global.ReproLab = { start, version: '0.1.0', get active() { return active; }, privacy: { scrub, safeUrl } };
})(window);
