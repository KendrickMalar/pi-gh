import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {fileURLToPath} from 'node:url';
import {RuntimeScope} from './runtime-scope.ts';
import {registerTools} from './tools.ts';
export default function(pi:ExtensionAPI){
 const scope=new RuntimeScope();registerTools(pi,scope,fileURLToPath(new URL('../',import.meta.url)));
 pi.on('session_start',()=>scope.invalidate());
 pi.on('session_before_switch',()=>scope.invalidate());
 pi.on('session_before_fork',()=>scope.invalidate());
 pi.on('session_before_tree',()=>scope.invalidate());
 pi.on('session_shutdown',()=>scope.invalidate());
}
