#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
let body=''; for await(const chunk of process.stdin) body+=chunk;
writeFileSync(process.env.FAKE_GH_RECORD,JSON.stringify({args:process.argv.slice(2),body,host:process.env.GH_HOST}));
const mode=process.env.FAKE_GH_MODE || 'ok';
if(mode==='retained'){const descendant=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:['ignore','inherit','inherit']});writeFileSync(process.env.FAKE_GH_RECORD,JSON.stringify({args:process.argv.slice(2),body,descendantPid:descendant.pid}));process.exit(0);}
if(mode==='wait')await new Promise(resolve=>setTimeout(resolve,10000));
if(mode==='huge')process.stdout.write('X'.repeat(20000));
else if(mode==='wrong')console.log('https://github.com/wrong/repo/issues/123');
else if(mode==='none')console.log('missing URL');
else if(mode==='multiple'){console.log('https://github.com/example/demo/issues/123');console.log('https://github.com/example/demo/issues/124');}
else console.log('https://github.com/example/demo/issues/123');
if(mode==='error')process.exitCode=1;
