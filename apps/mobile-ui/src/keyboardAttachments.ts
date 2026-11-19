import { useEffect, useRef } from 'react';
import { native, request, snapshot, subscribe, subscribeKeyboardContent } from './bridge';
import type { PickedAttachment } from './AttachmentPanel';

export function useKeyboardAttachments(preview:(item:PickedAttachment,photo:boolean)=>void,report:(error:unknown)=>void){
  const latest=useRef({preview,report});latest.current={preview,report};
  useEffect(()=>subscribeKeyboardContent(value=>{
    const state=snapshot();
    if(state.selfId!==value.owner||state.active!==value.chat||(state.topic?.id||0)!==(value.topic||0)||!state.canSend){if(value.item)void request('attachment.discard',{token:value.item.token}).catch(()=>{});return;}
    if(value.error){latest.current.report(new Error(value.error));return;}
    if(value.item)latest.current.preview(value.item,true);
  }),[]);
  useEffect(()=>{
    if(!native)return;let previous='';
    return subscribe(()=>{const state=snapshot(),scope=state.selfId+':'+state.active+':'+(state.topic?.id||0)+':'+state.canSend;if(scope===previous)return;previous=scope;if(document.activeElement?.matches('.rich-field'))void request('composer.focus',{active:state.canSend}).catch(()=>{});});
  },[]);
}
