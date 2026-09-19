import { crashCheckout } from './sandbox-error.min.js';
const $ = s => document.querySelector(s);
let recording = null;
function notify(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 5000); }
$('#record-start').onclick = async () => {
    try {
        let config;
        try {
            config = JSON.parse(sessionStorage.getItem('repro-sandbox') || 'null');
        }
        catch { }
        if (!config) {
            const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Recording sandbox', origins: [location.origin] }) });
            config = await response.json();
            if (!response.ok)
                throw new Error(config.error);
            sessionStorage.setItem('repro-sandbox', JSON.stringify(config));
        }
        recording = window.ReproLab.start({ endpoint: location.origin + '/api/ingest', captureKey: config.captureKey, consent: true, title: 'Checkout fails after adding a lamp', release: 'sandbox-v1' });
        $('#rec-state').textContent = 'Recording · inputs masked';
        $('#rec-state').classList.add('live');
        $('#record-start').hidden = true;
        $('#record-stop').hidden = false;
    }
    catch (e) {
        notify(e.message + ' Sign in to ReproLab first.');
    }
};
$('#record-stop').onclick = async () => {
    if (!recording)
        return;
    $('#record-stop').disabled = true;
    $('#rec-state').textContent = 'Saving evidence…';
    try {
        const saved = await recording.upload();
        $('#rec-state').textContent = 'Saved · ' + recording.eventCount + ' events';
        $('#rec-state').classList.remove('live');
        $('#record-stop').hidden = true;
        $('#view-session').hidden = false;
        $('#view-session').href = '/#/session/' + saved.id;
        notify('Recording saved. Open the replay to inspect the failure.');
    }
    catch (e) {
        $('#rec-state').textContent = 'Upload failed · recording kept in memory';
        $('#record-stop').disabled = false;
        $('#record-stop').textContent = 'Retry upload';
        notify(e.message);
    }
};
for (const name of ['ochre', 'forest'])
    $('#color-' + name).onclick = () => { document.querySelectorAll('.swatch').forEach(el => el.classList.remove('selected')); $('#color-' + name).classList.add('selected'); $('#color-label').textContent = name[0].toUpperCase() + name.slice(1); $('.lamp-scene').dataset.color = name; };
$('#add-to-bag').onclick = () => { $('#bag-count').textContent = '1'; $('#add-to-bag').textContent = 'Added to bag'; $('#checkout').hidden = false; };
$('#bag').onclick = () => { if ($('#bag-count').textContent === '1')
    $('#checkout').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
$('#checkout-button').onclick = async () => {
    $('#checkout-button').textContent = 'Processing…';
    const response = await fetch('/api/sandbox/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixture: true }) });
    if (!response.ok) {
        $('#checkout-button').textContent = 'Try again';
        $('#checkout-result').textContent = 'Something went wrong. Your order was not placed.';
        console.warn('Checkout inventory request returned 503.');
        crashCheckout();
    }
};
window.addEventListener('beforeunload', () => recording?.stop());
