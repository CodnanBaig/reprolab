"""In-memory Chromium tests. No URL navigation or external network access.

This is deliberately NOT a replacement for browser_test.py. It verifies the
actual recorder and UI with synthetic transport at about:blank when a managed
browser blocks all URL navigation. These results must be reported separately.
"""
import json
import base64
from pathlib import Path
import shutil
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
ORIGIN = 'http://localhost:4318'

class MemoryBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(exist_ok=True)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
        cls.css = (ROOT / 'public/app.css').read_text()
        cls.sdk = (ROOT / 'public/sdk/reprolab.js').read_text()
        cls.ui = (ROOT / 'public/app.js').read_text()
        icon='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/icon.svg').read_bytes()).decode()
        cls.ui=cls.ui.replace('src="/icon.svg"', 'src="'+icon+'"')
        cls.capture = cls.make_recording()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    @classmethod
    def make_recording(cls):
        page = cls.browser.new_page(viewport={'width':1280,'height':900})
        html = (ROOT / 'public/sandbox.html').read_text()
        import re
        html = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', html)
        html = re.sub(r'<link[^>]*>', '', html)
        html = html.replace('</head>', '<style>'+cls.css+'</style></head>')
        page.set_content(html)
        page.evaluate("window.fetch = async () => new Response(JSON.stringify({error:'Inventory offline'}), {status:503,headers:{'Content-Type':'application/json'}})")
        page.add_script_tag(content=cls.sdk)
        page.evaluate("""() => {
          window.recording = ReproLab.start({consent:true, endpoint:'http://localhost:4318/api/ingest', captureKey:'test-capture-key-12345678901234567890', title:'Checkout fails after adding a lamp', release:'sandbox-v1'});
          document.querySelector('#add-to-bag').onclick = () => {
            document.querySelector('#checkout').hidden=false;
            document.querySelector('#bag-count').textContent='1';
            document.querySelector('#add-to-bag').textContent='Added to bag';
          };
          document.querySelector('#checkout-button').onclick = async () => {
            const response = await fetch('http://localhost:4318/api/sandbox/checkout?token=super-secret');
            document.querySelector('#checkout-result').textContent='Something went wrong. Your order was not placed.';
            if(!response.ok) throw new TypeError('Cannot read properties of undefined (reading inventory)');
          };
        }""")
        page.get_by_test_id('add-to-bag').click()
        page.get_by_test_id('customer-email').fill('private.identity@example.org')
        page.get_by_test_id('checkout-button').click()
        page.wait_for_timeout(350)
        captured = page.evaluate('recording.stop()')
        page.close()
        return captured

    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':1000})
        self.page=self.context.new_page()

    def tearDown(self):
        self.context.close()

    def mount_ui(self, route='/sessions'):
        self.page.close()
        self.page=self.context.new_page()
        c=self.capture
        session={'id':'session-local','project_id':'project-local','client_id':c['clientId'],'title':c['title'],
                 'url':ORIGIN+'/sandbox','release':'sandbox-v1','browser':'Chromium (isolated test)',
                 'viewport_width':1280,'viewport_height':900,'duration':c['duration'],
                 'status':'new','error_count':sum(e['kind']=='error' for e in c['events']),
                 'event_count':len(c['events']),'fingerprint':'9a48d01b7289f663','created_at':1800000000000,
                 'github_url':None,'events':c['events'],'notes':[]}
        session['events']=[{**e, 'data':{**e['data'], 'url':ORIGIN+'/sandbox'} if e['kind']=='navigation' else e['data']} for e in session['events']]
        self.page.set_content('<!doctype html><html lang="en"><head><style>'+self.css+'</style></head><body><div id="app"></div><div id="toast" role="status" aria-live="polite"></div></body></html>')
        self.page.evaluate(r"""({session,route}) => {
          const storage=new Map(); Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
          window.fixtureSession=session;
          window.location.hash=route;
          window.fetch=async (path,opts={})=>{
            const u=new URL(path,'http://localhost:4318'), method=opts.method||'GET'; let data;
            if(u.pathname==='/api/auth/me')data={user:{id:'u',name:'Adnan Baig',email:'test@example.org'},githubConfigured:false,retentionDays:14};
            else if(u.pathname==='/api/auth/logout')data={ok:true};
            else if(u.pathname==='/api/projects')data=[{id:'project-local',name:'Orbit Store',origins:['http://localhost:4318'],repo:'',session_count:1}];
            else if(u.pathname==='/api/sessions')data={sessions:[fixtureSession],stats:{total:1,errors:fixtureSession.error_count,groups:1,resolved:fixtureSession.status==='resolved'?1:0}};
            else if(u.pathname==='/api/sessions/session-local'&&method==='PATCH'){fixtureSession.status=JSON.parse(opts.body).status;data={ok:true};}
            else if(u.pathname==='/api/sessions/session-local')data=fixtureSession;
            else if(u.pathname.endsWith('/notes')){fixtureSession.notes.push({body:JSON.parse(opts.body).body,created_at:1800000000000});data={ok:true};}
            else if(u.pathname.endsWith('/symbolicate'))data={positions:[]};
            else if(u.pathname.endsWith('/source-maps'))data=[];
            else if(u.pathname.endsWith('/export'))return new Response("import { test, expect } from '@playwright/test';\n// Input values were masked.\nconst value = process.env.REPRO_INPUT_1;",{headers:{'Content-Type':'text/javascript'}});
            else data={ok:true};
            return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""", {'session':session,'route':route})
        self.page.add_script_tag(content=self.ui)
        self.page.wait_for_timeout(180)

    def test_01_actual_recorder_masks_inputs_and_captures_errors(self):
        raw=json.dumps(self.capture)
        self.assertNotIn('private.identity@example.org',raw)
        self.assertNotIn('super-secret',raw)
        kinds={e['kind'] for e in self.capture['events']}
        self.assertTrue({'snapshot','click','input','network','error'} <= kinds)
        self.assertTrue(any(e['kind']=='network' and e['data']['status']==503 for e in self.capture['events']))

    def test_02_consent_and_teardown(self):
        self.page.set_content('<button data-testid="action" data-repro-public>Action</button>')
        self.page.add_script_tag(content=self.sdk)
        consent=self.page.evaluate("() => { try{ReproLab.start({endpoint:'http://localhost/api/ingest'});return false}catch(e){return e.message.includes('consent')} }")
        self.assertTrue(consent)
        self.page.evaluate("window.r=ReproLab.start({endpoint:'http://localhost/api/ingest',consent:true})")
        self.page.get_by_test_id('action').click()
        self.page.evaluate('r.stop()')
        before=self.page.evaluate('r.eventCount')
        self.page.get_by_test_id('action').click()
        self.assertEqual(before,self.page.evaluate('r.eventCount'))

    def test_03_inbox_desktop_mobile_layout(self):
        self.mount_ui()
        expect(self.page.get_by_role('heading',name='Evidence, not guesswork.')).to_be_visible()
        expect(self.page.locator('.session-row')).to_have_count(1)
        self.page.screenshot(path=str(OUT/'desktop-inbox.png'),full_page=True)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)
        self.page.screenshot(path=str(OUT/'mobile-inbox.png'),full_page=True)

    def test_04_replay_and_mobile_layout(self):
        self.mount_ui('/session/session-local')
        expect(self.page.locator('#replay')).to_be_visible()
        pixels=self.page.evaluate("() => document.querySelector('#replay').getContext('2d').getImageData(0,0,100,100).data.some(v=>v!==0)")
        self.assertTrue(pixels)
        self.page.get_by_role('button',name='Play replay',exact=True).click()
        expect(self.page.get_by_role('button',name='Pause replay',exact=True)).to_be_visible()
        self.page.get_by_role('button',name='Pause replay',exact=True).click()
        self.page.screenshot(path=str(OUT/'desktop-replay.png'),full_page=True)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)
        self.page.screenshot(path=str(OUT/'mobile-replay.png'),full_page=True)

    def test_05_triage_notes_and_html_escaping(self):
        self.mount_ui('/session/session-local')
        self.page.get_by_label('Session status').select_option('resolved')
        expect(self.page.locator('#toast')).to_contain_text('Triage state updated')
        note='<img src=x onerror="window.injected=true">'
        self.page.get_by_label('Investigation note',exact=True).fill(note)
        self.page.get_by_role('button',name='Add note',exact=True).click()
        expect(self.page.locator('.notes')).to_contain_text(note)
        self.assertFalse(self.page.evaluate('Boolean(window.injected)'))

    def test_06_event_filter_and_export_ui(self):
        self.mount_ui('/session/session-local')
        self.page.get_by_role('button',name='Network',exact=True).click()
        expect(self.page.locator('.event-row.network')).to_have_count(1)
        self.page.locator('.event-row.network').click()
        expect(self.page.locator('#event-inspector')).to_contain_text('503')
        self.page.get_by_role('button',name='Generate regression test').click()
        expect(self.page.get_by_role('dialog')).to_contain_text('REPRO_INPUT_1')

    def test_07_authenticated_views_render_without_script_errors(self):
        for route,title in [('/setup','One small recorder. A lot of context.'),('/settings','A project with boundaries.'),('/issues','Same failure. One place.')]:
            self.mount_ui(route)
            expect(self.page.get_by_role('heading',name=title,exact=True)).to_be_visible()
            self.page.set_viewport_size({'width':390,'height':844})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)

    def test_08_login_keyboard_and_mobile_layout(self):
        self.mount_ui()
        self.page.get_by_role('button',name='Sign out',exact=True).click()
        expect(self.page.get_by_role('heading',name='Welcome to the lab.')).to_be_visible()
        self.page.screenshot(path=str(OUT/'desktop-login.png'),full_page=True)
        self.page.set_viewport_size({'width':390,'height':844})
        self.page.get_by_label('Email address').focus()
        expect(self.page.get_by_label('Email address')).to_be_focused()
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)
        self.page.screenshot(path=str(OUT/'mobile-login.png'),full_page=True)

if __name__=='__main__': unittest.main(verbosity=2)
