import {DataError} from './core/data.js';
import {maskDecodedSecrets} from './core/secrets.js';
import type {OperationResult} from './service-types.js';
export function safeResult(result:OperationResult):OperationResult{return maskDecodedSecrets(result).value;}
export function rejected(code:string,message:string):OperationResult{return safeResult({status:'rejected',problems:[{code,path:'',message}]});}
export function errorResult(error:unknown):OperationResult{return error instanceof DataError?safeResult({status:'rejected',problems:[{code:error.code,path:error.field,message:error.message}]}):rejected('OPERATION_FAILED','Operation could not be confirmed.');}
