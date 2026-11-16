import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const native='../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const bridge=read(native+'NativeBridge.java');
const allowed=read(native+'BridgePolicy.java');

describe('tanda de seguridad y publicidad',()=>{
  it('connects every new method to the closed bridge',()=>{
    for(const method of ['sponsored.settings','sponsored.settings.set','privacy.autoDelete','privacy.autoDelete.set','chat.autoDelete','chat.autoDelete.set','password.email.set','password.email.check','password.email.resend','password.email.cancel','chat.report','message.report','sponsored.report']) {
      expect(bridge).toContain('case "'+method+'"');expect(allowed).toContain('"'+method+'"');
    }
  });
  it('uses the official Premium setting without a local sponsored-message filter',()=>{
    expect(bridge).toContain('new TdApi.ToggleHasSponsoredMessagesEnabled(enabled)');
    expect(bridge).toContain('if(!user.isPremium)');
    expect(read('./SponsoredSettings.tsx')).toContain('disabled={!value?.canDisable||busy}');
    expect(read('./SponsoredSettings.tsx')).toContain('no es un filtro local');
    expect(read('./App.tsx')).toContain('(state.sponsored||[]).slice(0,1).map');
    expect(read(native+'TdSession.java')).toContain('new TdApi.GetChatSponsoredMessages(chatId)');
  });
  it('keeps sponsored views and clicks and exposes eligible reporting',()=>{
    const card=read('./SponsoredCard.tsx');
    expect(card).toContain("request('sponsored.view'");expect(card).toContain("request('sponsored.open'");
    expect(card).toContain('ad.canReport&&<ReportAction');
    expect(read(native+'NativeSnapshot.java')).toContain('.put("canReport",ad.canBeReported)');
  });
  it('adds settings for advertising, default timers and recovery email',()=>{
    const settings=read('./SettingsPage.tsx');
    for(const component of ['SponsoredSettings','AutoDeleteSettings','RecoveryEmailSettings'])expect(settings).toContain('<'+component+' key={state.selfId}');
    expect(read('./App.tsx')).toContain('chatId={chat.id} run={run} ready={state.ready}');
  });
  it('binds new sensitive operations to their originating account',()=>{
    expect(bridge.match(/AccountSafetyPolicy\.owner\(params,session\.selfId\)/g)?.length).toBeGreaterThanOrEqual(8);
    for(const file of ['SponsoredSettings.tsx','AutoDeleteSettings.tsx','RecoveryEmailSettings.tsx'])expect(read('./'+file)).toContain('accountId:owner.current');
    expect(read('./ReportAction.tsx')).toContain('accountId:owner');
    expect(bridge).toContain('BridgePolicy.id(params,"chatId")!=session.activeChat');
  });
  it('confirms auto-delete and checks for concurrent timer changes',()=>{
    expect(bridge).toContain('new TdApi.SetDefaultMessageAutoDeleteTime(new TdApi.MessageAutoDeleteTime(seconds))');
    expect(bridge).toContain('new TdApi.SetChatMessageAutoDeleteTime(chat.id,seconds)');
    expect(bridge).toContain('current.messageAutoDeleteTime!=previous');
    expect(bridge).toContain('current.time!=previous.time');
    expect(bridge).toContain('No es una limpieza del historial existente.');
    expect(read(native+'TdSession.java')).toContain('object instanceof TdApi.UpdateChatMessageAutoDeleteTime');
  });
  it('supports recovery verification, resend and cancellation without storing secrets',()=>{
    for(const type of ['SetRecoveryEmailAddress','CheckRecoveryEmailAddressCode','ResendRecoveryEmailAddressCode','CancelRecoveryEmailAddressVerification'])expect(bridge).toContain('new TdApi.'+type+'(');
    const panel=read('./RecoveryEmailSettings.tsx');
    expect(panel).toContain("setPassword('');setCode('');");
    expect(panel).not.toMatch(/localStorage|sessionStorage|writePreference/);
    expect(bridge).toContain('state.recoveryEmailAddressCodeInfo.emailAddressPattern');
  });
  it('uses only Telegram report options and never sends opaque option IDs through JS',()=>{
    const chat=read(native+'ChatReportFlow.java'),ad=read(native+'SponsoredReportFlow.java');
    expect(chat).toContain('new TdApi.ReportChat(chatId,optionId.clone(),messageIds.clone(),details)');
    expect(chat).toContain('if(!properties.canReportChat)');
    expect(chat).toContain('chosen.size()>20');
    expect(chat).toContain('details=text;dialog.dismiss();send();');
    expect(ad).toContain('new TdApi.ReportChatSponsoredMessage(chatId,messageId,optionId.clone())');
    expect(read('./ReportAction.tsx')).not.toContain('optionId');
    expect(read('./App.tsx')).toContain('props.report&&<ReportAction');
  });
  it('allows human confirmation time and never auto-retries a report',()=>{
    const timeouts=read('./bridge.ts');
    for(const method of ['chat.report','message.report','sponsored.report','chat.autoDelete.set','privacy.autoDelete.set'])expect(timeouts).toContain("'"+method+"'");
    for(const file of ['ReportAction.tsx','RecoveryEmailSettings.tsx'])expect(read('./'+file)).not.toMatch(/setInterval\(|setTimeout\(/);
  });
});
