#!/usr/bin/env python3
"""Native Pi acceptance with synthetic HOME, loopback model and owned fake gh."""
import argparse, fcntl, http.server, json, os, pty, re, select, shutil, signal, struct, subprocess, tempfile, termios, threading, time, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OPTIONS=None
ANSI=re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[()][A-Z0-9])")
class Child:
    def __init__(self, args, env, cwd):
        self.master, slave = pty.openpty()
        os.set_blocking(self.master, False)
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 42, 120, 0, 0))
        self.p = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave,
                                  env=env, cwd=cwd, start_new_session=True)
        os.close(slave)
        self.data = b""
        self.closed = False
    def pump(self, seconds=.05):
        if select.select([self.master], [], [], seconds)[0]:
            try:
                b = os.read(self.master, 65536)
                self.data += b
                # Answer terminal queries using fixture values only.
                if b"\x1b[6n" in b: self.send(b"\x1b[1;1R")
                if b"\x1b[c" in b: self.send(b"\x1b[?1;2c")
            except OSError: pass
    def text(self, mark=0):
        return ANSI.sub("", self.data[mark:].decode("utf8", "replace"))
    def wait(self, predicate, timeout=12):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.pump()
            if predicate(): return
            if self.p.poll() is not None: break
        raise AssertionError("timeout/exit waiting for Pi; tail:\n"+self.text()[-4000:])
    def send(self, data):
        payload = data.encode() if isinstance(data, str) else data
        deadline = time.monotonic()+12
        offset = 0
        while offset < len(payload):
            if time.monotonic() > deadline: raise AssertionError("PTY input blocked")
            self.pump(0)
            if select.select([], [self.master], [], .05)[1]:
                try: offset += os.write(self.master, payload[offset:offset+512])
                except BlockingIOError: pass
    def close(self):
        if self.closed: return
        self.closed = True
        if self.p.poll() is None:
            os.killpg(self.p.pid, signal.SIGTERM)
            try: self.p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(self.p.pid, signal.SIGKILL); self.p.wait(timeout=3)
        self.pump(0)
        os.close(self.master)

class Acceptance(unittest.TestCase):
 def setUp(self):
  self.home=Path(tempfile.mkdtemp(prefix='pi-gh-cli-'))
  self.agent=self.home/'agent';self.agent.mkdir();self.cwd=self.home/'cwd';self.cwd.mkdir();self.requests=[];self.children=[]
  self.pkg=Path(OPTIONS.package).resolve();self.record=self.home/'gh-record';self.tool='gh_issue_submit';self.tool_args={'draftPath':str(self.cwd/'draft.json')}
  self.parallel=False
  shutil.copyfile(self.pkg/'examples/task.json',self.cwd/'draft.json')
  self.probe=self.home/'ready.ts';self.probe.write_text("export default function(pi){pi.registerCommand('owned-ready',{description:'Synthetic readiness probe',handler:async(_,ctx)=>{ctx.ui.notify('OWNED_READY','info')}});pi.registerCommand('owned-tree',{handler:async(_,ctx)=>{const e=ctx.sessionManager.getEntries().find(e=>e.type==='message'&&e.message.role==='user');await ctx.navigateTree(e.id,{summarize:false});ctx.ui.setEditorText('');ctx.ui.notify('OWNED_TREE_DONE','info')}});}")
  self.bin=self.home/'bin';self.bin.mkdir();shutil.copyfile(ROOT/'test/fake-gh.mjs',self.bin/'gh');(self.bin/'gh').chmod(0o755)
  for name in ['node','rg','fd']:
   found=shutil.which(name)
   if found:(self.bin/name).symlink_to(found)
  owner=self
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def do_POST(self):
    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));owner.requests.append(body)
    messages=body.get('messages',[]);last=max([i for i,m in enumerate(messages) if m.get('role')=='user'],default=-1)
    trailing=messages[last+1:]
    call=not any(m.get('role')=='tool' for m in trailing)
    self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
    if call:
     delta={'role':'assistant','tool_calls':[{'index':0,'id':'owned-call','type':'function','function':{'name':owner.tool,'arguments':json.dumps(owner.tool_args)}}]}
     if owner.parallel:delta['tool_calls'].append({'index':1,'id':'owned-other','type':'function','function':{'name':'gh_issue_form','arguments':'{}'}})
     end='tool_calls'
    else:delta={'role':'assistant','content':'GH_FIXTURE_DONE'};end='stop'
    for d,finish in [(delta,None),({},end)]:
     event={'id':'owned','object':'chat.completion.chunk','created':1,'model':'fixture','choices':[{'index':0,'delta':d,'finish_reason':finish}]}
     self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
    self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
  self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
  models={'providers':{'owned-fixture':{'baseUrl':f'http://127.0.0.1:{self.server.server_port}/v1','api':'openai-completions','apiKey':'FAKE_LOCAL_KEY','models':[{'id':'fixture','contextWindow':32768,'maxTokens':512}]}}}
  (self.agent/'models.json').write_text(json.dumps(models));(self.agent/'auth.json').write_text('{}')
  settings={'packages':[],'extensions':[],'quietStartup':True,'telemetry':False,'theme':'dark','compaction':{'enabled':False}}
  (self.agent/'settings.json').write_text(json.dumps(settings))
  self.env={'HOME':str(self.home),'PATH':str(self.bin)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TERM':'xterm-256color','LANG':'en_US.UTF-8','PI_CODING_AGENT_DIR':str(self.agent),'PI_CODING_AGENT_SESSION_DIR':str(self.agent/'sessions'),'PI_OFFLINE':'1','PI_SKIP_VERSION_CHECK':'1','PI_TELEMETRY':'0','XDG_CONFIG_HOME':str(self.home/'xdg'),'FAKE_GH_RECORD':str(self.record),'FAKE_GH_MODE':'ok','GH_HOST':'other.invalid'}
  settings['lastChangelogVersion']=subprocess.check_output([OPTIONS.pi,'--no-extensions','--version'],env=self.env,cwd=self.cwd,text=True).strip();(self.agent/'settings.json').write_text(json.dumps(settings))
  self.unchanged={name:(self.agent/name).read_bytes() for name in ['auth.json','models.json','settings.json']}
 def args(self,*more):
  return [OPTIONS.pi,'--offline','--no-extensions','--no-skills','--no-prompt-templates','-e',str(self.pkg),'-e',str(self.probe),'--model','owned-fixture/fixture',*more]
 def child(self):
  c=Child(self.args(),self.env,self.cwd);self.children.append(c);return c
 def prompt(self,c):
  c.wait(lambda:'fixture' in c.text());c.send('/owned-ready\r');c.wait(lambda:'OWNED_READY' in c.text());c.send('OWNED_TOOL_REQUEST\r');c.wait(lambda:'pi-gh review:' in c.text(),20)
 def done(self,c):
  c.wait(lambda:'GH_FIXTURE_DONE' in c.text(),20)
 def tearDown(self):
  for c in self.children:c.close()
  self.server.shutdown();self.thread.join();self.server.server_close()
  for name,data in self.unchanged.items():self.assertEqual((self.agent/name).read_bytes(),data)
  evidence=ROOT/'.superpowers/sdd/2026-10-07-pi-gh/native';evidence.mkdir(parents=True,exist_ok=True)
  (evidence/(self._testMethodName+'.txt')).write_text('\n'.join(c.text() for c in self.children))
 def test_tui_cancel_and_approve(self):
  for keys,written in [('escape',False),('default',False),('approve',True)]:
   c=self.child();self.prompt(c);c.send('\x1b' if keys=='escape' else '\r' if keys=='default' else '\x1b[C\r');self.done(c)
   self.assertEqual(self.record.exists(),written)
   if written:
    record=json.loads(self.record.read_text());self.assertEqual(record['host'],'github.com');self.assertEqual(record['args'][0:2],['issue','create'])
   c.close()
 def test_resize_and_controls(self):
  value=json.loads((self.cwd/'draft.json').read_text());value['fields']['purpose']='日本語 '*100+'\x1b[2J\u202eHIDDEN';(self.cwd/'draft.json').write_text(json.dumps(value))
  c=self.child();self.prompt(c);fcntl.ioctl(c.master,termios.TIOCSWINSZ,struct.pack('HHHH',16,40,0,0));os.kill(c.p.pid,signal.SIGWINCH);c.pump(.2);c.send('\x1b[6~'*15+'\x1b');self.done(c);self.assertFalse(self.record.exists())
 def test_print_and_rpc_refuse_changes(self):
  for args in [('--mode','json','--print','OWNED_TOOL_REQUEST'),('--print','OWNED_TOOL_REQUEST')]:
   r=subprocess.run(self.args(*args),env=self.env,cwd=self.cwd,text=True,capture_output=True,timeout=20);self.assertEqual(r.returncode,0,r.stderr);self.assertFalse(self.record.exists());self.assertIn('APPROVAL_UI_REQUIRED',json.dumps(self.requests));self.assertNotIn('pi-gh review:',r.stdout)
  p=subprocess.Popen(self.args('--mode','rpc'),env=self.env,cwd=self.cwd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try:
   p.stdin.write(b'{"type":"prompt","message":"OWNED_TOOL_REQUEST"}\n');p.stdin.flush();events=[];pending=b'';deadline=time.monotonic()+20
   while time.monotonic()<deadline:
    if select.select([p.stdout],[],[],.1)[0]:
     pending+=os.read(p.stdout.fileno(),65536)
     while b'\n' in pending:
      line,pending=pending.split(b'\n',1)
      if line:events.append(json.loads(line))
    if any(e.get('type')=='agent_end' for e in events):break
   self.assertTrue(any(e.get('type')=='agent_end' for e in events));self.assertIn('APPROVAL_UI_REQUIRED',json.dumps(events));self.assertFalse(self.record.exists())
  finally:
   p.stdin.close();p.stdin=None
   try:p.communicate(timeout=3)
   except subprocess.TimeoutExpired:p.terminate();p.communicate(timeout=3)
 def test_read_only_and_reload(self):
  self.tool='gh_issue_validate';c=self.child();c.wait(lambda:'fixture' in c.text());c.send('/owned-ready\r');c.wait(lambda:'OWNED_READY' in c.text());c.send('OWNED_TOOL_REQUEST\r');self.done(c)
  names=[t.get('function',{}).get('name') for t in self.requests[0].get('tools',[])];self.assertEqual(len([n for n in names if n and n.startswith('gh_')]),7)
  self.assertIn('validated',json.dumps(self.requests));mark=len(c.data);c.send('/reload\r');c.wait(lambda:'Reloaded' in c.text(mark) or 'reloaded' in c.text(mark));c.send('OWNED_TOOL_REQUEST\r');c.wait(lambda:'GH_FIXTURE_DONE' in c.text(mark));self.assertFalse(self.record.exists())

 def test_parallel_readonly(self):
  self.parallel=True;self.tool='gh_issue_validate'
  r=subprocess.run(self.args('--print','OWNED_TOOL_REQUEST'),env=self.env,cwd=self.cwd,text=True,capture_output=True,timeout=20)
  self.assertEqual(r.returncode,0,r.stderr);self.assertFalse(self.record.exists());received=json.dumps(self.requests)
  self.assertIn('validated',received);self.assertIn('generated',received);self.assertNotIn('STALE_OPERATION',received)
 def test_new_session(self):
  self.tool='gh_issue_validate';c=self.child();c.wait(lambda:'fixture' in c.text());c.send('/owned-ready\r');c.wait(lambda:'OWNED_READY' in c.text());c.send('OWNED_TOOL_REQUEST\r');self.done(c)
  mark=len(c.data);c.send('/new\r');c.wait(lambda:'New session started' in c.text(mark));c.send('OWNED_TOOL_REQUEST\r');c.wait(lambda:'GH_FIXTURE_DONE' in c.text(mark));self.assertFalse(self.record.exists())
 def test_secret_preview_is_masked(self):
  self.tool='gh_issue_preview';value=json.loads((self.cwd/'draft.json').read_text());value['fields']['purpose']='password=syntheticvalue123';(self.cwd/'draft.json').write_text(json.dumps(value))
  r=subprocess.run(self.args('--print','OWNED_TOOL_REQUEST'),env=self.env,cwd=self.cwd,text=True,capture_output=True,timeout=20);self.assertEqual(r.returncode,0,r.stderr);self.assertFalse(self.record.exists());self.assertNotIn('syntheticvalue123',json.dumps(self.requests));self.assertIn('[REDACTED]',json.dumps(self.requests))
 def test_tui_ctrl_c_and_shutdown(self):
  c=self.child();self.prompt(c);c.send('\x03');self.done(c);self.assertFalse(self.record.exists());c.close()
  c=self.child();self.prompt(c);os.killpg(c.p.pid,signal.SIGTERM);c.wait(lambda:c.p.poll() is not None);self.assertFalse(self.record.exists())

 def test_tree_requires_fresh_confirmation(self):
  c=self.child();self.prompt(c);c.send('\x1b');self.done(c);self.assertFalse(self.record.exists())
  mark=len(c.data);c.send('/owned-tree\r');c.wait(lambda:'OWNED_TREE_DONE' in c.text(mark));c.send('OWNED_TOOL_REQUEST\r');c.wait(lambda:'pi-gh review:' in c.text(mark));self.assertFalse(self.record.exists());c.send('\r');c.wait(lambda:'GH_FIXTURE_DONE' in c.text(mark));self.assertFalse(self.record.exists())
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--pi',default=shutil.which('pi'));parser.add_argument('--package',default=str(ROOT));parser.add_argument('--case');OPTIONS=parser.parse_args()
 names=['test_'+OPTIONS.case] if OPTIONS.case else [n for n in Acceptance.__dict__ if n.startswith('test_')]
 suite=unittest.TestSuite(Acceptance(name) for name in names);result=unittest.TextTestRunner(verbosity=2).run(suite);raise SystemExit(0 if result.wasSuccessful() else 1)
