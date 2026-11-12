import { request, snapshot } from './bridge';

// A long chat list can expose hundreds of avatars at once. Keep below the native
// bridge's pending-request limit and coalesce identical thumbnail requests.
let running=0;
const waiting:Array<()=>void>=[];
const pending=new Map<string,Promise<unknown>>();
export function loadMedia(id:number):Promise<unknown>{
  const owner=snapshot().selfId,key=`${owner}:${id}`;
  const existing=pending.get(key);if(existing)return existing;
  const job=new Promise<unknown>((resolve,reject)=>{
    const start=()=>{running++;const operation=snapshot().selfId===owner?request('media.load',{id}):Promise.reject(new Error('La cuenta cambió.'));void operation.then(resolve,reject).finally(()=>{running--;pending.delete(key);waiting.shift()?.();});};
    if(running<4)start();else waiting.push(start);
  });
  pending.set(key,job);return job;
}
