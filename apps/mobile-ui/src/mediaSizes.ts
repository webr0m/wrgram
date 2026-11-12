import type { MediaVariant } from './contract';

/** Physical pixels the rendered box needs, capped so huge screens do not pull 4K photos. */
export function imageTargetWidth(boxWidth:number,density:number,ceiling=2048):number{
  const width=Number.isFinite(boxWidth)&&boxWidth>0?boxWidth:0;
  const scale=Number.isFinite(density)&&density>0?density:2;
  return Math.min(Math.max(Math.round(width*scale),96),ceiling);
}

/** Smallest Telegram variant that still covers `targetWidth`, or the largest one. */
export function pickImageVariant(variants:MediaVariant[]|undefined,targetWidth:number):MediaVariant|undefined{
  if(!variants||variants.length===0)return undefined;
  const want=Number.isFinite(targetWidth)&&targetWidth>0?targetWidth:0;
  let smallest:MediaVariant|undefined,largest:MediaVariant|undefined;
  for(const variant of variants){
    if(!variant||variant.id<=0||variant.width<=0)continue;
    if(!largest||variant.width>largest.width)largest=variant;
    if(want>0&&variant.width>=want&&(!smallest||variant.width<smallest.width))smallest=variant;
  }
  return smallest??largest;
}

export function largestImageVariant(variants:MediaVariant[]|undefined):MediaVariant|undefined{
  if(!variants||variants.length===0)return undefined;
  let largest:MediaVariant|undefined;
  for(const variant of variants){
    if(!variant||variant.id<=0||variant.width<=0)continue;
    if(!largest||variant.width>largest.width)largest=variant;
  }
  return largest;
}
