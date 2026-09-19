const $ = s => document.querySelector(s);
chrome.storage.local.get(['endpoint', 'key']).then(v => { $('#endpoint').value = v.endpoint || 'http://localhost:4318/api/ingest'; $('#key').value = v.key || ''; });
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !/^https?:/.test(tab.url || ''))
    throw new Error('Open a normal HTTP(S) website first.'); return tab.id; }
$('#start').onclick = async () => {
    try {
        if (!$('#consent').checked)
            throw new Error('Confirm you have permission before recording.');
        const endpoint = $('#endpoint').value.trim(), key = $('#key').value.trim(), title = $('#title').value.trim() || 'Browser extension recording';
        const u = new URL(endpoint);
        if (!/^https?:$/.test(u.protocol))
            throw new Error('Use an HTTP(S) endpoint.');
        if (key.length < 30)
            throw new Error('Enter your project capture key.');
        const tabId = await activeTab();
        await chrome.storage.local.set({ endpoint, key });
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['reprolab.js'] });
        const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (endpoint, captureKey, title) => {
                try {
                    window.ReproLab.start({ endpoint, captureKey, title, consent: true, release: 'extension-capture' });
                    return { ok: true };
                }
                catch (e) {
                    return { error: e.message };
                }
            }, args: [endpoint, key, title] });
        if (result[0]?.result?.error)
            throw new Error(result[0].result.error);
        $('#status').textContent = 'Recording this tab. Reproduce the bug, then stop and upload. Navigation to a different document ends the recording; use the SDK for app-wide instrumentation.';
    }
    catch (e) {
        $('#status').textContent = e.message;
    }
};
$('#stop').onclick = async () => {
    $('#stop').disabled = true;
    try {
        const tabId = await activeTab();
        const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: async () => {
                try {
                    if (!window.ReproLab?.active)
                        throw new Error('No recording in this tab.');
                    return await window.ReproLab.active.upload();
                }
                catch (e) {
                    return { error: e.message };
                }
            } });
        const data = result[0]?.result;
        if (data?.error)
            throw new Error(data.error);
        $('#status').textContent = `Saved recording ${data.id}. Open your ReproLab session inbox.`;
    }
    catch (e) {
        $('#status').textContent = e.message;
    }
    finally {
        $('#stop').disabled = false;
    }
};
