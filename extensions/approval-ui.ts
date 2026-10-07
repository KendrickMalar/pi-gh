import type {ExtensionContext} from '@earendil-works/pi-coding-agent';
import {ScrollView,Text,Key,matchesKey,wrapTextWithAnsi,truncateToWidth,type Component} from '@earendil-works/pi-tui';
import type {ApprovalView} from '../src/service-types.js';
type Scope={signal:AbortSignal;isCurrent:()=>boolean};
function plain(text:string){return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
export async function showApproval(view:ApprovalView,scope:Scope,ui:ExtensionContext['ui']):Promise<boolean>{
 if(scope.signal.aborted||!scope.isCurrent())return false;
 try{
  return await ui.custom<boolean>((tui,theme,_keys,done)=>{
   let selected=0,settled=false;const text=plain(view.text),scroll=new ScrollView(new Text(text,0,0),{scrollbar:'hidden',overscroll:'contain'});
   let cachedWidth=0,cachedLines:string[]=[];
   const finish=(value:boolean)=>{if(settled)return;settled=true;done(value&&scope.isCurrent()&&!scope.signal.aborted);};
   const abort=()=>finish(false);scope.signal.addEventListener('abort',abort,{once:true});
   if(scope.signal.aborted||!scope.isCurrent())queueMicrotask(abort);
   const component:Component&{dispose:()=>void}={
    render(width){
     const rows=tui.terminal.rows;if(width<16||rows<9||!scope.isCurrent()){queueMicrotask(abort);return [truncateToWidth('Approval unavailable. Cancelled.',width)];}
     const viewport=Math.max(1,rows-7);if(cachedWidth!==width){cachedLines=wrapTextWithAnsi(text,Math.max(1,width));cachedWidth=width;}const lines=cachedLines;
     scroll.updateLayout(lines.length,viewport,()=>tui.requestRender());
     const top=scroll.scrollTop,visible=lines.slice(top,top+viewport);
     return [theme.fg('accent',truncateToWidth('pi-gh review: '+view.operation,width)),truncateToWidth('Target and content below. No changes yet.',width),'',...visible,'',truncateToWidth((selected===0?'[Cancel]  Approve':'Cancel  [Approve]')+'   '+(top+1)+'/'+lines.length,width),truncateToWidth('Up/Down/PgUp/PgDn scroll; Left/Right choose; Enter; Esc cancel',width)];
    },
    handleInput(data){
     if(settled)return;if(!scope.isCurrent()||scope.signal.aborted)return finish(false);
     if(matchesKey(data,Key.escape)||matchesKey(data,Key.ctrl('c')))return finish(false);
     if(matchesKey(data,Key.left)||matchesKey(data,Key.right)||matchesKey(data,Key.tab))selected=selected===0?1:0;
     else if(matchesKey(data,Key.enter))return finish(selected===1);
     else if(matchesKey(data,Key.up))scroll.scrollBy(-1);
     else if(matchesKey(data,Key.down))scroll.scrollBy(1);
     else if(matchesKey(data,Key.pageUp))scroll.scrollBy(-Math.max(1,tui.terminal.rows-7));
     else if(matchesKey(data,Key.pageDown))scroll.scrollBy(Math.max(1,tui.terminal.rows-7));
     else if(matchesKey(data,Key.home))scroll.scrollToStart();
     else if(matchesKey(data,Key.end))scroll.scrollToEnd();
     tui.requestRender();
    },
    invalidate(){cachedWidth=0;scroll.invalidate();},
    dispose(){scope.signal.removeEventListener('abort',abort);settled=true;}
   };return component;
  });
 }catch{return false;}
}
