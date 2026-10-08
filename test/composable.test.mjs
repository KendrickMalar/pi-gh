import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './extension-loader.mjs';

test('GitHub changes are callable by wrapper tools and have schema-backed results',async()=>{
 const {default:extension}=await load('index.ts');const tools=[];
 extension({registerTool:t=>tools.push(t),on:()=>()=>{}});
 for(const name of ['gh_issue_submit','gh_labels_apply']){
  const tool=tools.find(t=>t.name===name);assert.equal(tool.exposure,'direct');assert.ok(tool.outputSchema);
 }
 const capability=tools.find(t=>t.name==='gh_capabilities');assert.ok(capability);
 const r=await capability.execute('cap',{},undefined,undefined,{});
 assert.equal(r.structuredContent.data.contractVersion,1);
 assert.ok(r.structuredContent.data.operations.includes('gh_issue_submit'));
 assert.deepEqual(r.structuredContent.data.features,['issue-list-labels']);
});
