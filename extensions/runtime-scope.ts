export class RuntimeScope {
 private generation=0;private leases=new Set<AbortController>();private tail:Promise<unknown>=Promise.resolve();
 get stamp(){return String(this.generation);}
 isCurrent(stamp:string){return stamp===this.stamp;}
 acquire(caller?:AbortSignal){
  const controller=new AbortController(),stamp=this.stamp;this.leases.add(controller);
  const abort=()=>controller.abort();caller?.addEventListener('abort',abort,{once:true});if(caller?.aborted)abort();
  let disposed=false;return {stamp,signal:controller.signal,dispose:()=>{if(disposed)return;disposed=true;caller?.removeEventListener('abort',abort);this.leases.delete(controller);}};
 }
 invalidate(){this.generation++;for(const controller of this.leases)controller.abort();this.leases.clear();}
 runExclusive<T>(fn:()=>Promise<T>):Promise<T>{
  const stamp=this.stamp;const result=this.tail.then(()=>{if(!this.isCurrent(stamp))throw new Error('Session changed; queued operation expired.');return fn();});
  this.tail=result.then(()=>undefined,()=>undefined);return result;
 }
}
