"""Real Chromium journeys against a disposable MongoDB database. No production writes."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import unittest
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'

def local_env_value(name):
    path = ROOT / '.env.local'
    if not path.exists():
        return None
    for line in path.read_text().splitlines():
        key, separator, value = line.partition('=')
        if separator and key.strip() == name:
            return value.strip()
    return None

class BrowserJourneys(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        RESULTS.mkdir(exist_ok=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://localhost:{cls.port}'
        cls.log = open(RESULTS / 'browser-server.log', 'w')
        mongo_uri = os.environ.get('MONGODB_URI') or local_env_value('MONGODB_URI')
        if not mongo_uri:
            raise RuntimeError('Set MONGODB_URI before running the MongoDB-backed browser journeys.')
        cls.database = f"reprolab_browser_{time.time_ns()}"
        cls.mongo_uri = mongo_uri
        env = {**os.environ, 'MONGODB_URI': mongo_uri, 'PORT': str(cls.port), 'APP_ORIGIN': cls.base,
               'MONGODB_DB': cls.database}
        cls.process = subprocess.Popen(['pnpm', 'exec', 'next', 'dev', '--port', str(cls.port)], cwd=ROOT, env=env, stdout=cls.log, stderr=cls.log)
        for _ in range(60):
            try:
                urlopen(cls.base + '/api/health', timeout=1).close()
                break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError('Disposable ReproLab server did not start.')
        cls.pw = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        cls.browser = cls.pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}), args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.log.close()
        subprocess.run(['node', '--input-type=module', '--eval', "import { MongoClient } from 'mongodb'; const client = new MongoClient(process.env.MONGODB_URI); await client.connect(); await client.db(process.env.REPROLAB_TEST_DATABASE).dropDatabase(); await client.close();"], cwd=ROOT, env={**os.environ, 'MONGODB_URI': cls.mongo_uri, 'REPROLAB_TEST_DATABASE': cls.database}, check=True)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000})
        self.page = self.context.new_page()
        self.page.goto(self.base)
        self.page.get_by_role('button', name='Create workspace', exact=True).click()
        self.page.get_by_label('Your name').fill('Adnan Baig')
        self.page.get_by_label('Email address').fill(f'test-{time.time_ns()}@example.org')
        self.page.get_by_label('Password', exact=False).fill('reprolab-test-password')
        self.page.get_by_role('button', name='Create workspace', exact=True).click()
        expect(self.page.get_by_role('heading', name='Evidence, not guesswork.')).to_be_visible()

    def tearDown(self):
        self.context.close()

    def record_bug(self):
        page = self.page
        page.goto(self.base + '/sandbox?token=never-capture-this-token')
        page.get_by_role('button', name='Start recording', exact=True).click()
        expect(page.locator('#rec-state')).to_contain_text('Recording')
        page.get_by_role('button', name='Choose forest').click()
        page.get_by_test_id('add-to-bag').click()
        page.get_by_test_id('customer-email').fill('sensitive.identity@example.org')
        page.get_by_test_id('checkout-button').click()
        expect(page.locator('#checkout-result')).to_contain_text('Your order was not placed')
        page.wait_for_timeout(350)
        page.get_by_role('button', name='Stop & save').click()
        expect(page.locator('#rec-state')).to_contain_text('Saved')
        href = page.get_by_role('link', name='Open replay', exact=True).get_attribute('href')
        page.get_by_role('link', name='Open replay', exact=True).click()
        expect(page.get_by_role('heading', name='Checkout fails after adding a lamp', exact=True)).to_be_visible()
        sid = href.split('/')[-1]
        data = page.request.get(self.base + '/api/sessions/' + sid).json()
        return sid, data

    def test_01_capture_replay_privacy_and_export(self):
        sid, data = self.record_bug()
        raw = json.dumps(data)
        self.assertNotIn('sensitive.identity@example.org', raw)
        self.assertNotIn('never-capture-this-token', raw)
        self.assertGreaterEqual(data['error_count'], 1)
        kinds = {event['kind'] for event in data['events']}
        self.assertTrue({'snapshot', 'click', 'input', 'network', 'error'} <= kinds)
        self.assertTrue(any(event['kind'] == 'network' and event['data']['status'] == 503 for event in data['events']))
        self.page.get_by_role('button', name='Play replay', exact=True).click()
        self.page.wait_for_timeout(180)
        expect(self.page.get_by_role('button', name='Pause replay', exact=True)).to_be_visible()
        self.page.get_by_role('button', name='Pause replay', exact=True).click()
        self.page.get_by_label('Session status').select_option('investigating')
        expect(self.page.locator('#toast')).to_contain_text('Triage state updated')
        self.page.get_by_label('Investigation note', exact=True).fill('Inventory response is unguarded. Add an error-state test.')
        self.page.get_by_role('button', name='Add note', exact=True).click()
        expect(self.page.locator('.notes')).to_contain_text('Inventory response is unguarded')
        self.page.screenshot(path=str(RESULTS / 'desktop-replay.png'), full_page=True)
        self.page.get_by_role('button', name='Generate regression test').click()
        expect(self.page.get_by_role('dialog')).to_contain_text('REPRO_INPUT_')
        with self.page.expect_download() as info:
            self.page.get_by_role('button', name='Download .spec.js').click()
        download = info.value
        download.save_as(str(RESULTS / 'generated-regression.spec.js'))
        subprocess.run(['node', '--check', str(RESULTS / 'generated-regression.spec.js')], check=True, capture_output=True)
        self.page.get_by_role('button', name='Close', exact=True).click()
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.screenshot(path=str(RESULTS / 'mobile-replay.png'), full_page=True)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        self.page.get_by_role('link', name='Session inbox', exact=True).first.click()
        expect(self.page.get_by_role('heading', name='Evidence, not guesswork.')).to_be_visible()
        self.page.set_viewport_size({'width': 1440, 'height': 1000})
        self.page.screenshot(path=str(RESULTS / 'desktop-inbox.png'), full_page=True)
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.screenshot(path=str(RESULTS / 'mobile-inbox.png'), full_page=True)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)

    def test_02_expiring_shared_view_is_readonly(self):
        sid, data = self.record_bug()
        self.page.get_by_role('button', name='Create an expiring share').click()
        self.page.get_by_role('button', name='Create link', exact=True).click()
        expect(self.page.locator('#share-url')).to_be_visible()
        link = self.page.locator('#share-url').input_value()
        guest = self.browser.new_context(viewport={'width': 1000, 'height': 800})
        try:
            view = guest.new_page()
            view.goto(link)
            expect(view.get_by_text('Shared · read-only', exact=True)).to_be_visible()
            expect(view.get_by_role('button', name='Delete recording', exact=True)).to_have_count(0)
            self.page.get_by_role('button', name='Revoke existing links').click()
            expect(self.page.locator('#toast')).to_contain_text('All existing share links revoked.')
            view.reload()
            expect(view.get_by_role('heading', name='This link is no longer available.')).to_be_visible()
        finally:
            guest.close()

    def test_03_project_setup_key_rotation_and_settings(self):
        self.page.get_by_role('button', name='Create a project', exact=True).click()
        self.page.get_by_label('Project name', exact=True).fill('Orbit Store')
        self.page.get_by_label('Allowed website origins', exact=False).fill(self.base)
        self.page.get_by_role('button', name='Create project', exact=True).click()
        expect(self.page.get_by_role('heading', name='Add the recorder to Orbit Store')).to_be_visible()
        self.page.get_by_role('button', name='Generate a new capture key').click()
        self.page.get_by_role('button', name='Rotate key', exact=True).click()
        expect(self.page.locator('#toast')).to_contain_text('New key generated')
        self.page.get_by_role('link', name='Project settings', exact=True).click()
        self.page.get_by_label('GitHub repository', exact=False).fill('CodnanBaig/reprolab')
        self.page.get_by_role('button', name='Save settings').click()
        expect(self.page.locator('#toast')).to_contain_text('Project settings saved')
        self.page.reload()
        expect(self.page.get_by_label('GitHub repository', exact=False)).to_have_value('CodnanBaig/reprolab')

    def test_04_source_map_upload_and_symbolication(self):
        sid, data = self.record_bug()
        self.page.get_by_role('link', name='Install recorder', exact=True).click()
        self.page.get_by_label('Generated JavaScript URL').fill(self.base + '/sandbox-error.min.js')
        self.page.get_by_label('Release', exact=True).fill('sandbox-v1')
        self.page.get_by_label('Source map (.map)').set_input_files(str(ROOT / 'examples/sandbox-error.min.js.map'))
        self.page.get_by_role('button', name='Upload map', exact=True).click()
        expect(self.page.locator('#toast')).to_contain_text('Source map uploaded')
        self.page.goto(self.base + '/#/session/' + sid)
        self.page.get_by_role('button', name='Resolve with source maps').click()
        expect(self.page.locator('#source-result')).to_contain_text('src/checkout.ts')

    def test_05_delete_search_and_session_restoration(self):
        sid, data = self.record_bug()
        self.page.reload()
        expect(self.page.get_by_role('heading', name='Checkout fails after adding a lamp', exact=True)).to_be_visible()
        self.page.get_by_role('button', name='Delete recording', exact=True).click()
        self.page.get_by_role('button', name='Delete recording permanently', exact=True).click()
        expect(self.page.get_by_role('heading', name='Your next bug gets a paper trail.')).to_be_visible()
        self.page.get_by_role('button', name='Sign out', exact=True).click()
        expect(self.page.get_by_role('heading', name='Welcome to the lab.')).to_be_visible()

    def test_06_recorder_requires_consent_and_stops_cleanly(self):
        self.page.goto(self.base + '/sandbox')
        self.page.wait_for_function('() => Boolean(window.ReproLab)')
        result = self.page.evaluate("""() => {
          try { ReproLab.start({endpoint: location.origin + '/api/ingest'}); return false; }
          catch (e) { return e.message.includes('consent'); }
        }""")
        self.assertTrue(result)
        self.page.get_by_role('button', name='Start recording', exact=True).click()
        self.page.wait_for_function('() => Boolean(window.ReproLab.active)')
        self.page.get_by_test_id('add-to-bag').click()
        self.page.evaluate('ReproLab.active.stop()')
        count = self.page.evaluate('ReproLab.active.eventCount')
        self.page.get_by_test_id('color-forest').click()
        self.page.wait_for_timeout(250)
        self.assertEqual(count, self.page.evaluate('ReproLab.active.eventCount'))

    def test_07_auth_accessible_and_mobile_without_overflow(self):
        self.page.get_by_role('button', name='Sign out', exact=True).click()
        self.page.screenshot(path=str(RESULTS / 'desktop-login.png'), full_page=True)
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.screenshot(path=str(RESULTS / 'mobile-login.png'), full_page=True)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        self.page.get_by_label('Email address').focus()
        expect(self.page.get_by_label('Email address')).to_be_focused()

if __name__ == '__main__':
    unittest.main(verbosity=2)
