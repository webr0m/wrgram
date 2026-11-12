import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('mensajes de servicio de TDLib',()=>{
  const service=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ServiceMessages.java');
  const snapshot=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');
  const session=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
  const contract=source('./contract.ts');
  const view=source('./ServiceMessage.tsx');
  const app=source('./App.tsx');
  const preview=source('./preview.ts');

  it('reconoce todas las acciones de servicio del TDLib empaquetado sin depender de MessageService',()=>{
    const actions=[
      'MessageBasicGroupChatCreate','MessageSupergroupChatCreate','MessageChatChangeTitle','MessageChatChangePhoto','MessageChatDeletePhoto',
      'MessageChatOwnerLeft','MessageChatOwnerChanged','MessageChatHasProtectedContentToggled','MessageChatHasProtectedContentDisableRequested',
      'MessageChatAddMembers','MessageChatJoinByLink','MessageChatJoinByRequest','MessageChatJoinFromCommunity','MessageChatDeleteMember',
      'MessageChatAddedToCommunity','MessageChatRemovedFromCommunity','MessageChatUpgradeTo','MessageChatUpgradeFrom','MessagePinMessage',
      'MessageScreenshotTaken','MessageChatSetBackground','MessageChatSetTheme','MessageChatSetMessageAutoDeleteTime','MessageChatBoost',
      'MessageForumTopicCreated','MessageForumTopicEdited','MessageForumTopicIsClosedToggled','MessageForumTopicIsHiddenToggled',
      'MessageSuggestProfilePhoto','MessageSuggestBirthdate','MessageCustomServiceAction','MessageGameScore','MessageManagedBotCreated',
      'MessagePaymentSuccessful','MessagePaymentSuccessfulBot','MessagePaymentRefunded','MessageGiftedPremium','MessagePremiumGiftCode',
      'MessageGiveawayCreated','MessageGiveaway','MessageGiveawayCompleted','MessageGiveawayWinners','MessageGiftedStars','MessageGiftedGrams',
      'MessageGiveawayPrizeStars','MessageTonWalletTransfer','MessageTonConnectRequest','MessageUpgradedGift','MessageRefundedUpgradedGift',
      'MessageUpgradedGiftPurchaseOffer','MessageUpgradedGiftPurchaseOfferRejected','MessagePaidMessagesRefunded','MessagePaidMessagePriceChanged',
      'MessageDirectMessagePriceChanged','MessageUnpaidMessagesAllowedByLink','MessageChecklistTasksDone','MessageChecklistTasksAdded',
      'MessageSuggestedPostApprovalFailed','MessageSuggestedPostApproved','MessageSuggestedPostDeclined','MessageSuggestedPostPaid',
      'MessageSuggestedPostRefunded','MessageContactRegistered','MessageUsersShared','MessageChatShared','MessageBotWriteAccessAllowed',
      'MessageWebAppDataSent','MessageWebAppDataReceived','MessagePassportDataSent','MessagePassportDataReceived','MessageProximityAlertTriggered',
      'MessageCall','MessageGroupCall','MessageVideoChatScheduled','MessageVideoChatStarted','MessageVideoChatEnded',
      'MessageInviteVideoChatParticipants','MessagePollOptionAdded','MessagePollOptionDeleted','MessageExpiredPhoto','MessageExpiredVideo',
      'MessageExpiredVideoNote','MessageExpiredVoiceNote',
    ];
    for(const action of actions)expect(service).toContain(`TdApi.${action}`);
    expect(service).toContain('static boolean isService');
  });

  it('genera texto propio en lugar del fallback de contenido no compatible',()=>{
    expect(service).toContain('static String text(TdApi.Message message,TdSession session)');
    expect(snapshot).toContain('ServiceMessages.text(message,session)');
    expect(snapshot).toContain('ServiceMessages.dto(message,this)');
    expect(session).toContain('String service = ServiceMessages.text(message, session)');
  });

  it('adjunta datos para saltar al mensaje relacionado y para fotos de cambio de chat',()=>{
    expect(service).toContain('new Info(kind,text).id(a.messageId)');
    expect(service).toContain('new Info(kind,text).id(a.pollMessageId)');
    expect(service).toContain('new Info(kind,text).id(a.checklistMessageId)');
    expect(service).toContain('new Info(kind,text).id(a.suggestedPostMessageId)');
    expect(service).toContain('snapshot.photoDto(small,big,photo.minithumbnail,"Foto del chat")');
  });

  it('modela, pinta y reutiliza el menú contextual en la interfaz',()=>{
    expect(contract).toContain('interface ServiceInfo');
    expect(contract).toContain('service?:ServiceInfo');
    expect(view).toContain('service-jump');
    expect(view).toContain('onContextMenu');
    expect(view).toContain('<MediaView media={service.photo} auto/>');
    expect(app).toContain('<ServiceMessage message={message}');
    expect(app).toContain("'.message-row.highlight, .service-row.highlight'");
    expect(preview).toContain("service:{kind:'pin'");
    expect(preview).toContain('Videollamada programada');
  });
});
