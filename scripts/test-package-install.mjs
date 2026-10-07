import {spawnSync} from 'node:child_process';import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=resolve(process.argv[2]??join(root,'.superpowers/sdd/2026-10-07-pi-gh/package-final')),pi=process.argv[3]??'/opt/homebrew/bin/pi';mkdirSync(artifacts,{recursive:true});
const home=join(artifacts,'synthetic-home');mkdirSync(home,{recursive:true});const env={HOME:home,PATH:'/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'};
function run(name,args,cwd=root){const r=spawnSync(name,args,{cwd,env,encoding:'utf8',timeout:150000});if(r.status!==0)throw new Error(name+' failed: '+r.stderr+' '+r.stdout);return r.stdout;}
const metadata=JSON.parse(run('npm',['pack','--ignore-scripts','--json','--pack-destination',artifacts]));writeFileSync(join(artifacts,'pack.json'),JSON.stringify(metadata,null,2));
const prefix=join(artifacts,'installed with space');writeFileSync(join(artifacts,'install.log'),run('npm',['install','--prefix',prefix,'--ignore-scripts','--legacy-peer-deps','--omit=dev','--cache',join(artifacts,'cache'),join(artifacts,metadata[0].filename)]));
const log=run('python3',[join(root,'scripts/test-pi-gh-cli.py'),'--pi',pi,'--package',join(prefix,'node_modules',metadata[0].name)]);writeFileSync(join(artifacts,'native.log'),log);
console.log('Installed tarball runtime validated at '+prefix);
