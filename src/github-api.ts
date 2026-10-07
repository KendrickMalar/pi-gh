import {runGh,type GhOptions} from './core/gh-process.js';
import {fail,parseJson,record} from './core/data.js';
export type JsonObject=Record<string,unknown>;
export function object(value:unknown):JsonObject{if(!record(value))fail('GITHUB_RESPONSE','','Expected a GitHub object.');return value;}
export function array(value:unknown):unknown[]{if(!Array.isArray(value))fail('GITHUB_RESPONSE','','Expected a GitHub array.');return value;}
export const projectFieldsQuery=`query($projectId:ID!,$cursor:String){node(id:$projectId){__typename ... on ProjectV2{id title fields(first:100,after:$cursor){nodes{__typename ... on ProjectV2Field{id name dataType} ... on ProjectV2SingleSelectField{id name dataType options{id name}} ... on ProjectV2IterationField{id name dataType}} pageInfo{hasNextPage endCursor}}}}}`;
export const projectItemsQuery=`query($projectId:ID!,$cursor:String){node(id:$projectId){__typename ... on ProjectV2{id title items(first:100,after:$cursor){nodes{id content{__typename ... on Issue{id number repository{nameWithOwner}}} fieldValues(first:100){nodes{__typename ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{id}}} ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id}}} ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id}}} ... on ProjectV2ItemFieldSingleSelectValue{optionId field{... on ProjectV2SingleSelectField{id}}}} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}`;
export const addProjectIssueMutation=`mutation($projectId:ID!,$contentId:ID!){addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){item{id}}}`;
export const updateProjectFieldMutation=`mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$value:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:$value}){projectV2Item{id}}}`;
export class GithubApi{
 private bytes=0;
 constructor(private options:GhOptions){}
 private args(endpoint:string,method:string){return ['api','--hostname','github.com','--method',method,'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2026-03-10',endpoint];}
 private decode(stdout:string):unknown{this.bytes+=Buffer.byteLength(stdout);if(this.bytes>1048576)fail('GITHUB_LIMIT','','Combined response limit exceeded.');return parseJson(Buffer.from(stdout));}
 async rest(endpoint:string):Promise<unknown>{const r=await runGh(this.args(endpoint,'GET'),'',this.options);if(r.status!=='ok')fail('GITHUB_READ','','GitHub read failed.');return this.decode(r.stdout);}
 async restList(endpoint:string):Promise<unknown[]>{
  const all:unknown[]=[];for(let page=1;page<=100;page++){const items=array(await this.rest(endpoint+(endpoint.includes('?')?'&':'?')+'per_page=100&page='+page));all.push(...items);if(items.length<100)return all;}fail('GITHUB_LIMIT','','Pagination limit exceeded.');
 }
 async issue(repo:string,number:number):Promise<JsonObject>{
  const v=object(await this.rest('repos/'+repo+'/issues/'+number));
  if(v.pull_request!==undefined||v.number!==number||!Number.isSafeInteger(v.id)||(v.id as number)<1||typeof v.node_id!=='string'||!/^I_[A-Za-z0-9_-]+$/.test(v.node_id)||typeof v.html_url!=='string'||v.html_url.toLowerCase()!==('https://github.com/'+repo+'/issues/'+number).toLowerCase())fail('GITHUB_IDENTITY','','Expected the exact GitHub Issue, not a PR.');
  return v;
 }
 async graphql(query:string,variables:JsonObject):Promise<JsonObject>{
  const r=await runGh([...this.args('graphql','POST'),'--input','-'],JSON.stringify({query,variables}),this.options);if(r.status!=='ok')fail('GITHUB_READ','','GraphQL read failed.');
  const v=object(this.decode(r.stdout));if(v.errors!==undefined)fail('GITHUB_READ','','GraphQL returned errors.');return object(v.data);
 }
 async project(projectId:string,kind:'fields'|'items'):Promise<JsonObject>{
  const nodes:unknown[]=[];const cursors=new Set<string>();let cursor:string|null=null,title:unknown;
  for(let page=0;page<100;page++){
   const response=await this.graphql(kind==='fields'?projectFieldsQuery:projectItemsQuery,{projectId,cursor});const project=object(response.node);
   if(project.__typename!=='ProjectV2'||project.id!==projectId)fail('GITHUB_IDENTITY','','Expected the exact Projects V2 node.');title=project.title;
   const connection=object(project[kind]),items=array(connection.nodes);nodes.push(...items);
   if(kind==='items')for(const raw of items){const item=object(raw),values=object(item.fieldValues);if(values.pageInfo!==undefined&&object(values.pageInfo).hasNextPage!==false)fail('GITHUB_LIMIT','','Item field values were truncated.');}
   const info=object(connection.pageInfo);if(info.hasNextPage===false)return {id:projectId,title,[kind]:nodes};
   if(info.hasNextPage!==true||typeof info.endCursor!=='string'||!info.endCursor||cursors.has(info.endCursor))fail('GITHUB_LIMIT','','Invalid or repeated pagination cursor.');cursor=info.endCursor;cursors.add(cursor);
  }fail('GITHUB_LIMIT','','Pagination limit exceeded.');
 }
 async mutateRest(endpoint:string,method:'POST'|'PATCH',body:JsonObject):Promise<{status:'ok'|'not-started'|'unknown';data?:unknown}>{
  const r=await runGh([...this.args(endpoint,method),'--input','-'],JSON.stringify(body),this.options);if(r.status!=='ok')return {status:r.status};
  try{return {status:'ok',data:this.decode(r.stdout)};}catch{return {status:'unknown'};}
 }
 async mutateGraphql(query:string,variables:JsonObject):Promise<{status:'ok'|'not-started'|'unknown';data?:unknown}>{
  const r=await runGh([...this.args('graphql','POST'),'--input','-'],JSON.stringify({query,variables}),this.options);if(r.status!=='ok')return {status:r.status};
  try{const v=object(this.decode(r.stdout));if(v.errors!==undefined)return {status:'unknown'};return {status:'ok',data:object(v.data)};}catch{return {status:'unknown'};}
 }
}
