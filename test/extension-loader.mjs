import {createJiti} from 'jiti';import {fileURLToPath} from 'node:url';
export async function load(file){const jiti=createJiti(import.meta.url,{moduleCache:false,fsCache:false});return jiti.import(fileURLToPath(new URL('../extensions/'+file,import.meta.url)));}
