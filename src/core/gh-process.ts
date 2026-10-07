import {spawn} from 'node:child_process';
export type GhOptions={ghExecutable?:string;timeoutMs?:number;maxOutputBytes?:number;env?:NodeJS.ProcessEnv;signal?:AbortSignal;beforeStart?:()=>boolean;beforeStartAsync?:()=>Promise<boolean>};
export type GhResult={status:'ok'|'not-started'|'unknown';stdout:string};
export async function runGh(args:string[],body:string,options:GhOptions={}):Promise<GhResult>{
 const timeout=options.timeoutMs??60000,max=options.maxOutputBytes??1048576;
 if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000||!Number.isSafeInteger(max)||max<1||max>1048576||Buffer.byteLength(body)>1048576)
 return Promise.resolve({status:'not-started',stdout:''});
 try{if(options.beforeStartAsync&&!await options.beforeStartAsync())return {status:'not-started',stdout:''};}catch{return {status:'not-started',stdout:''};}
 return new Promise(resolve=>{
 const group=process.platform!=='win32';
 let child;
 try{if(options.signal?.aborted||options.beforeStart?.()===false||options.signal?.aborted)return resolve({status:'not-started',stdout:''});child=spawn(options.ghExecutable??'gh',args,{shell:false,detached:group,env:{...process.env,...options.env,GH_HOST:'github.com'},stdio:['pipe','pipe','pipe']});}
 catch{return resolve({status:'not-started',stdout:''})}
 let started=false,failed=false,settled=false,stopping=false,stdoutBytes=0,stderrBytes=0;
 const chunks:Buffer[]=[];let cleanup:NodeJS.Timeout|undefined;
 const signal=(kind:NodeJS.Signals)=>{try{if(group&&child.pid)process.kill(-child.pid,kind);else child.kill(kind)}catch{/* Owned process already gone. */}};
 const finish=(status:GhResult['status'])=>{if(settled)return;settled=true;clearTimeout(timer);if(cleanup)clearTimeout(cleanup);options.signal?.removeEventListener('abort',abort);if(stopping&&started)signal('SIGKILL');child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();resolve({status,stdout:Buffer.concat(chunks).toString('utf8')})};
 const abort=()=>{if(settled||stopping)return;stopping=true;failed=true;if(started)signal('SIGTERM');cleanup=setTimeout(()=>{if(started)signal('SIGKILL');finish(started?'unknown':'not-started')},100)};
 const timer=setTimeout(abort,timeout);
 child.once('spawn',()=>{started=true;if(stopping)signal('SIGTERM')});
 child.once('error',()=>{failed=true;if(!started)finish('not-started');else abort()});
 child.stdout.on('data',(b:Buffer)=>{stdoutBytes+=b.length;if(stdoutBytes>max)return abort();chunks.push(b)});
 child.stderr.on('data',(b:Buffer)=>{stderrBytes+=b.length;if(stderrBytes>max)abort()});
 child.stdin.on('error',abort);child.stdout.on('error',abort);child.stderr.on('error',abort);
 child.once('close',(code,signal)=>finish(!started?'not-started':!failed&&code===0&&!signal?'ok':'unknown'));
 options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 child.stdin.end(body);
 });
}
