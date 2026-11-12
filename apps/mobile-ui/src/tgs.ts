export interface TgsAnimation {w:number;h:number;ip:number;op:number;fr:number;layers:unknown[];assets?:Array<Record<string,unknown>>;[key:string]:unknown}

export async function readTgs(bytes:Uint8Array):Promise<TgsAnimation>{
  if(bytes.byteLength>2*1024*1024)throw new Error('Sticker exceeds the safe compressed-size limit');
  let raw:Uint8Array;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    const stream=new DecompressionStream('gzip'),writer=stream.writable.getWriter(),reader=stream.readable.getReader(),input=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,writing=writer.write(input).then(()=>writer.close()),parts:Uint8Array[]=[];let length=0;
    try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>1024*1024){await reader.cancel();void writer.abort();throw new Error('Sticker exceeds the safe animation limit');}parts.push(part.value);}await writing;}catch(error){void writer.abort();throw error;}
    raw=new Uint8Array(length);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.byteLength;}
  }else{if(bytes.byteLength>1024*1024)throw new Error('Sticker exceeds the safe animation limit');raw=bytes;}
  const data=JSON.parse(new TextDecoder().decode(raw)) as TgsAnimation;
  if(!data||!Array.isArray(data.layers)||data.layers.length>150||![data.w,data.h,data.ip,data.op,data.fr].every(Number.isFinite)||data.w<=0||data.h<=0||data.w>512||data.h>512||data.ip<0||data.op<=data.ip||data.op-data.ip>240||data.fr<=0||data.fr>60)throw new Error('Unsupported sticker animation');
  if(Array.isArray(data.assets)&&data.assets.some(asset=>typeof asset.p==='string'&&asset.p.length>0||typeof asset.u==='string'&&asset.u.length>0))throw new Error('External sticker assets are blocked');
  return data;
}
