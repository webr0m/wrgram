import { describe, expect, it } from 'vitest';
import type { MediaVariant } from './contract';
import { imageTargetWidth, largestImageVariant, pickImageVariant } from './mediaSizes';

const variants:MediaVariant[]=[
  {id:1,width:90,height:90,size:2000},
  {id:2,width:320,height:320,size:22000},
  {id:3,width:800,height:800,size:90000},
  {id:4,width:1280,height:1280,size:190000},
  {id:5,width:2560,height:2560,size:640000}
];

describe('imageTargetWidth',()=>{
  it('scales CSS pixels by device density',()=>{
    expect(imageTargetWidth(320,1)).toBe(320);
    expect(imageTargetWidth(320,3)).toBe(960);
  });
  it('clamps tiny and huge boxes',()=>{
    expect(imageTargetWidth(10,1)).toBe(96);
    expect(imageTargetWidth(4000,3)).toBe(2048);
  });
  it('falls back to a sane density for invalid input',()=>{
    expect(imageTargetWidth(0,2)).toBe(96);
    expect(imageTargetWidth(Number.NaN,Number.NaN)).toBe(96);
  });
});

describe('pickImageVariant',()=>{
  it('picks the smallest variant covering the target',()=>{
    expect(pickImageVariant(variants,300)?.id).toBe(2);
    expect(pickImageVariant(variants,900)?.id).toBe(4);
  });
  it('uses the exact match when it exists',()=>{
    expect(pickImageVariant(variants,1280)?.id).toBe(4);
  });
  it('falls back to the largest variant beyond the biggest size',()=>{
    expect(pickImageVariant(variants,4000)?.id).toBe(5);
  });
  it('returns the largest available when there is no target yet',()=>{
    expect(pickImageVariant(variants,0)?.id).toBe(5);
  });
  it('ignores unusable entries and empty lists',()=>{
    expect(pickImageVariant([{id:0,width:320,height:320,size:1},...variants],200)?.id).toBe(2);
    expect(pickImageVariant([],200)).toBeUndefined();
    expect(pickImageVariant(undefined,200)).toBeUndefined();
  });
});

describe('largestImageVariant',()=>{
  it('returns the biggest registered size for the viewer',()=>{
    expect(largestImageVariant(variants)?.id).toBe(5);
    expect(largestImageVariant([variants[0],variants[3]])?.id).toBe(4);
  });
  it('returns undefined without variants',()=>{
    expect(largestImageVariant(undefined)).toBeUndefined();
    expect(largestImageVariant([])).toBeUndefined();
  });
});
