import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Public profile photographs of the six owner-specified bots; no login or bot tokens.
const apps=[['groupbutler','GroupButlerEsp_bot'],['antiu','antiubot'],['compressor','anycompressorbot'],['shorten','WRShorten_bot'],['downloads','mutidlprobot'],['snake','Wrsnakebot']];
const directory=new URL('../apps/mobile-ui/public/bots/',import.meta.url);
await mkdir(directory,{recursive:true});
const records=[];
for(const [id,username] of apps){
  const source=`https://t.me/${username}`;
  const page=await fetch(source);
  if(!page.ok)throw Error(`Public profile unavailable: ${username}`);
  const html=await page.text();
  const image=html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1];
  if(!image?.startsWith('https://'))throw Error(`Profile photo absent: ${username}`);
  const response=await fetch(image);
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/jpeg'))throw Error(`Invalid profile image: ${username}`);
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>1024*1024||data[0]!==255||data[1]!==216)throw Error(`Invalid image payload: ${username}`);
  await writeFile(new URL(`${id}.jpg`,directory),data);
  records.push({id,username,source,date:new Date().toISOString().slice(0,10),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  console.log(`${username}: ${data.length} bytes`);
}
await writeFile(new URL('provenance.json',directory),JSON.stringify(records,null,2)+'\n');
