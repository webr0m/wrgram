import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BlockedSender } from './contract';
import { blockedSenderKey, mergeBlockedSenders, MUTE_OPTIONS } from './privacyFlows';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const native='../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const sender=(kind:'user'|'chat',id:string,name=id):BlockedSender=>({kind,id,name});

describe('blocked senders',()=>{
  it('keeps sender type and exact 64-bit identifiers in its key',()=>{
    expect(blockedSenderKey(sender('user','9007199254740993'))).toBe('user:9007199254740993');
    expect(blockedSenderKey(sender('user','42'))).not.toBe(blockedSenderKey(sender('chat','42')));
  });
  it('merges pages without duplicate rows and refreshes names',()=>{
    const previous=[sender('user','42','Anterior'),sender('chat','-100')];
    expect(mergeBlockedSenders(previous,[sender('user','42','Actual'),sender('user','43')]))
      .toEqual([sender('user','42','Actual'),sender('chat','-100'),sender('user','43')]);
    expect(previous[0].name).toBe('Anterior');
  });
  it('a refresh starts a new list instead of keeping removed senders',()=>{
    expect(mergeBlockedSenders([],[sender('user','43')])).toEqual([sender('user','43')]);
    expect(mergeBlockedSenders([],[])).toEqual([]);
  });
  it('connects the settings, allowlist and guarded native confirmation',()=>{
    const bridge=read(native+'NativeBridge.java');
    expect(read('./SettingsPage.tsx')).toContain('<BlockedSettings key={state.selfId}');
    for(const method of ['privacy.blocked','privacy.unblock']) {
      expect(read(native+'BridgePolicy.java')).toContain('"'+method+'"');
      expect(bridge).toContain('case "'+method+'"');
    }
    expect(bridge).toContain('new TdApi.GetBlockedMessageSenders(new TdApi.BlockListMain(),offset,BlockedSendersPolicy.PAGE_SIZE)');
    expect(bridge).toContain('new TdApi.SetMessageSenderBlockList(sender,null)');
    expect(bridge).toContain('No se modificó el bloqueo.');
    expect(read('./bridge.ts')).toContain("'privacy.unblock'");
  });
});
describe('temporary chat notifications',()=>{
  it('offers finite durations in seconds and the TDLib permanent value',()=>{
    expect(MUTE_OPTIONS.map(option=>option.seconds)).toEqual([3600,28800,172800,2147483647]);
    for(const option of MUTE_OPTIONS)expect(Number.isSafeInteger(option.seconds)).toBe(true);
  });
  it('shares the control and uses remaining seconds for native notifications',()=>{
    for(const file of ['App.tsx','PeerProfile.tsx'])expect(read('./'+file)).toContain('<ChatMuteControl');
    expect(read(native+'NativeBridge.java')).toContain('value.muteFor=ChatNotificationPolicy.muteFor(p)');
    expect(read(native+'PushNotifications.java')).toContain('ChatNotificationPolicy.explicitlyMuted(settings.notificationSettings)');
    expect(read(native+'PushNotifications.java')).not.toContain('muteFor>(System.currentTimeMillis()/1000)');
    expect(read('./ChatMuteControl.tsx')).toContain('snapshot().selfId!==owner.current');
  });
});
