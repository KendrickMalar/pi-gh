#!/usr/bin/env node
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
let body='';for await(const c of process.stdin)body+=c;
const args=process.argv.slice(2), file=process.env.LABEL_STATE;
const s=JSON.parse(readFileSync(file,'utf8'));
appendFileSync(process.env.LABEL_RECORD,JSON.stringify({args,body,host:process.env.GH_HOST})+'\n');
if(args[0]!=='api'||args[1]!=='--hostname=github.com'||process.env.GH_HOST!=='github.com')process.exit(9);
const mi=args.indexOf('--method'), method=args[mi+1], url=new URL(args[mi+2],'https://api.github.com/');
const path=url.pathname.split('/').map(decodeURIComponent);
const payload=body?JSON.parse(body):{};
const out=x=>process.stdout.write(JSON.stringify(x));
const save=()=>writeFileSync(file,JSON.stringify(s));
if(s.mode==='read-error'&&method==='GET')process.exit(1);
if(s.mode==='retained') {spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:['ignore','inherit','inherit']});process.exit(0);}
if(s.mode==='wait')await new Promise(r=>setTimeout(r,10000));
if(s.mode==='huge'){console.log('X'.repeat(20000));process.exit(0)}
const key=x=>x.toLowerCase();
const label=n=>s.labels.find(x=>key(x.name)===key(n));
const issue=n=>s.issues.find(x=>x.number===Number(n));
if(method==='GET'&&s.failReadsAfterWrite&&s.writes)process.exit(1);
if(path.length===4&&method==='GET'){out(s.repository??{id:77,node_id:'R77',full_name:'example/demo',html_url:'https://github.com/example/demo'});process.exit(0)}
if(path[4]==='labels'&&path.length===5) {
 if(method==='GET'){
 const page=Number(url.searchParams.get('page')||1), per=Number(url.searchParams.get('per_page')||100);
 out(s.mode==='endless'?Array.from({length:100},(_,i)=>({...s.labels[0],id:page*100+i,node_id:'L'+page+'-'+i,name:'p'+page+'-'+i})):s.labels.slice((page-1)*per,page*per));
 }else if(method==='POST'){if(label(payload.name))process.exit(1);s.posts=(s.posts||0)+1;if(s.failPostAt===s.posts){save();process.exit(1)}const id=899+s.posts;const l={id,node_id:'L'+id,name:payload.name,color:payload.color,description:payload.description??''};s.labels.push(l);s.writes=(s.writes||0)+1;save();if(s.uncertainPostAt===s.posts)process.exit(1);out(l)}
 else process.exit(1);
} else if(path[4]==='labels'&&path.length===6) {
 const l=label(path[5]);if(!l)process.exit(1);
 if(method==='PATCH'){if(payload.new_name&&label(payload.new_name)&&key(payload.new_name)!==key(l.name))process.exit(1);const old=l.name;Object.assign(l,{...(payload.new_name?{name:payload.new_name}:{}),...(payload.color!==undefined?{color:payload.color}:{}),...(payload.description!==undefined?{description:payload.description}:{})});for(const i of s.issues)i.labels=i.labels.map(x=>key(x.name)===key(old)?{...l}:x);s.writes=(s.writes||0)+1;save();out(l)}
 else if(method==='DELETE'){s.labels=s.labels.filter(x=>x!==l);for(const i of s.issues)i.labels=i.labels.filter(x=>key(x.name)!==key(l.name));s.writes=(s.writes||0)+1;save()}
 else if(method==='GET')out(l);else process.exit(1);
} else if(path[4]==='issues'&&path.length===5) {
 if(method==='GET'){
 const n=url.searchParams.get('labels');let list=s.issues.filter(i=>!n||i.labels.some(x=>key(x.name)===key(n)));
 const page=Number(url.searchParams.get('page')||1);out(list.slice((page-1)*100,page*100));
 }else if(method==='POST'){
 const names=payload.labels??[];if(names.some(n=>!label(n)))process.exit(1);
 const i={id:123,node_id:'I123',number:123,title:payload.title,body:payload.body,html_url:'https://github.com/example/demo/issues/123',labels:names.map(n=>({...label(n)}))};s.issues.push(i);s.writes=(s.writes||0)+1;save();out(i);
 }else process.exit(1);
} else if(path[4]==='issues'&&path.length===6) {
 const i=issue(path[5]);if(!i)process.exit(1);
 if(method==='GET')out(i);
 else if(method==='PATCH'){if(payload.labels.some(n=>!label(n)))process.exit(1);i.labels=payload.labels.map(n=>({...label(n)}));s.writes=(s.writes||0)+1;save();out(i)}
 else process.exit(1);
} else process.exit(1);
if(s.mode==='write-error'&&method!=='GET')process.exitCode=1;
