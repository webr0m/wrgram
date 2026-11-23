import type { CustomTheme } from './themes';
import type { CloudBackgroundSlots } from './cloud-backgrounds';
export interface State { mediaReady?: number[]; mediaLoading?:number[]; mediaFailed?:number[] }
export interface SecurityStatus {enabled:boolean;available:boolean;biometric:boolean;lockAfter:number}
export interface TelegramLinkResult {action:string;chatId?:string;title?:string;messageId?:string;storyId?:number;installed?:boolean;channel?:boolean;opened?:boolean;members?:number;approval?:boolean;state?:string}
export interface State { profilePhoto?:Media|null; emojiStatus?:EmojiStatusMark|null; startupError?:string; chatList?:string }
export interface PlayUpdateStatus { starting?:boolean;downloading?:boolean;installing?:boolean;bytesDownloaded?:number;totalBytes?:number }
export interface AccountBirthday { day:number;month:number;year:number }
export interface AccountBusinessHours { startMinute:number;endMinute:number }
export interface BusinessGreetingInfo { shortcutId:string;inactivityDays:number;recipients:BusinessRecipientsInfo }
export interface BusinessAwayInfo { shortcutId:string;offlineOnly:boolean;schedule:{type:'always'|'outside'|'custom';startDate?:number;endDate?:number};recipients:BusinessRecipientsInfo }
export interface AccountBusiness { address:string;timeZoneId?:string;hours?:AccountBusinessHours[];nextOpenIn?:number;nextCloseIn?:number;greeting?:BusinessGreetingInfo;away?:BusinessAwayInfo;startPage?:{title:string;message:string} }
export interface AccountProfile { firstName:string;lastName:string;username:string;bio:string;id:string;photoId:string;phoneNumber?:string;usernames?:string[];editableUsername?:string;birthday?:AccountBirthday;business?:AccountBusiness;bioEntities?:TextEntity[] }
export interface ChatProfile {
  id:string;title:string;username:string;usernames?:string[];bio:string;bioEntities?:TextEntity[];
  bot?:boolean;memberCount?:number;administratorCount?:number;canViewMembers?:boolean;canManageMembers?:boolean;
  groupCount?:number;linkedChatId?:string;hasStories?:boolean;isForum?:boolean;
  phone?:string;presence?:string;birthday?:{day:number;month:number;year:number};
  verified?:boolean;premium?:boolean;emojiStatus?:EmojiStatusMark;photo?:Media;commands?:{name:string;description:string}[];privacyUrl?:string;blocked?:boolean;
}
export interface Chat { canReport?:boolean }
export interface SafetySignal { id:string; tone:'bad'|'warn'|'good'|'info'; value?:string }
export interface SafetyNotice { kind:'spam'|'unknown'|'invite'|'contact'|'phone'|'join'; tone:'warn'|'info'; canUnarchive?:boolean; registered?:string; title?:string; channel?:boolean; date?:number }
export interface SafetyInfo { id:string; notice?:SafetyNotice; signals:SafetySignal[]; canReport:boolean; dismissible:boolean }
export interface Chat { notice?:SafetyNotice }
export interface Properties { report?:boolean }
export interface AccountSession { id:string;current:boolean;device:string;platform:string;version:string;location:string;ip:string;lastActive:number }
export interface MediaVariant { id:number; width:number; height:number; size:number }
export interface Media { id: number; ready: boolean; mime: string; kind: 'image' | 'video' | 'audio' | 'file' | 'sticker'; name: string; size: number; animated?:boolean; width?:number; height?:number; downloadLimit?:number; thumbnail?: Media; minithumbnail?: string; exportable?: boolean; variants?: MediaVariant[] }
export interface Chat { premium?:boolean; emojiStatus?:EmojiStatusMark; inList?:boolean; id: string; title: string; preview: string; date: number; unread: number; marked: boolean; bot: boolean; type: string; pinned: boolean; muted: boolean; archived: boolean; photo?: Media; supported: boolean; activeStories?:number;isContact?:boolean;supergroup?:boolean;isForum?:boolean;secretState?: 'pending'|'ready'|'closed'; fingerprint?: string; canSendExpressions?:boolean; username?:string; draft?:string; draftEntities?:TextEntity[]; draftReply?:string; readInbox?:string; senderKind?:'user'|'chat'; senderId?:string; senderName?:string; translatable?:boolean; automaticTranslation?:boolean; defaultSilent?:boolean }
export interface SpeechInfo { state:'pending'|'text'|'error'; partial?:string; text?:string; error?:string }
export interface Message { speech?:SpeechInfo; transcribable?:boolean }
export interface ChatSender { kind:'user'|'chat'; id:string; name:string; premium:boolean }
export interface ChatSenders { canChoose:boolean; senders:ChatSender[]; current?:ChatSender }
export interface BotAccount { configured:boolean; botUserId?:string; username?:string; name?:string }
export interface BotPublished { messageId:string; username:string }
export interface OwnedBot { id:string; name?:string; username?:string; owned:boolean; canJoinGroups:boolean }
export interface BotDefaultRights { known:boolean; group?:GroupAdminRights; channel?:GroupAdminRights }
export interface BotPost { id:string; text:string; entities?:TextEntity[]; pinned:boolean; date:number }
export interface ForumTopicInfo {id:number;name:string;closed:boolean;general:boolean;pinned?:boolean;unread?:number;lastText?:string;lastSender?:string;date?:number;iconColor?:number;iconEmoji?:string;readInbox?:string}
export interface Contact {id:string;name:string;username:string;bot:boolean;photo?:Media}
export interface GroupAdminRights {canChangeInfo:boolean;canPostMessages:boolean;canEditMessages:boolean;canDeleteMessages:boolean;canInviteUsers:boolean;canRestrictMembers:boolean;canPinMessages:boolean;canManageTopics:boolean;canPromoteMembers:boolean;canManageVideoChats:boolean;canPostStories:boolean;canEditStories:boolean;canDeleteStories:boolean;canManageDirectMessages:boolean;canManageTags:boolean;canSendWelcomeMessages:boolean}
export interface GroupMember {id:string;name:string;status:string;admin?:boolean;bot?:boolean;canBan:boolean;canUnban?:boolean;canRestrict?:boolean;canPromote?:boolean;canDemote?:boolean;canEditRights?:boolean;restricted?:boolean;banned?:boolean;until?:number;currentRights?:GroupAdminRights;adminRights?:GroupAdminRights}
export interface GroupMemberPage {members:GroupMember[];nextOffset:number;hasMore:boolean}
/** `AddChatMember` solo nombra a los que no entraron: la interfaz distingue las tres salidas. */
export type AddState = 'added' | 'rejected' | 'unclear'
export interface AddResult {id:string;name:string;state:AddState;reason:string}
export interface AddBatch {results:AddResult[];stopped:string}
export interface AddPermission {allowed:boolean;reason:string;forward:boolean;remaining:number}
export interface RosterMember {id:string;name:string;username:string;status:string;inside:boolean;self:boolean;bot:boolean;since:number;invitedBy:string;invitedByName:string;tag:string}
export interface GroupRoster {members:RosterMember[];shown:number;listed:number;inside:number;creator:string;note:string;remaining:number;order:string;manage:boolean;scope:string}
export interface GroupPermissions {canSendBasicMessages:boolean;canSendAudios:boolean;canSendDocuments:boolean;canSendPhotos:boolean;canSendVideos:boolean;canSendVideoNotes:boolean;canSendVoiceNotes:boolean;canSendPolls:boolean;canSendOtherMessages:boolean;canAddLinkPreviews:boolean;canReactToMessages:boolean;canEditTag:boolean;canChangeInfo:boolean;canInviteUsers:boolean;canPinMessages:boolean;canCreateTopics:boolean}
export interface ChatUsername {editable:string;active:string[]}
export interface CommunityInfo {title:string;description:string;descriptionKnown:boolean;canChange:boolean;maxTitle:number;maxDescription:number}
/** `opened` solo significa algo en el estado «bot»: indica si se pudo abrir el chat del bot de seguridad. */
export interface ChatMembership {state:string;opened:boolean;owner?:boolean;when?:string;successor?:string}
export interface AdminEvent {id:string;date:number;title:string;description:string}
export interface ActiveStory {id:number;date:number;closeFriends:boolean;live:boolean}
export interface OpenStory {id:number;chatId:string;posterChatId:string;caption:string;media:Media;canEdit:boolean;canDelete:boolean;canToggleProfile:boolean;isPostedToChatPage:boolean;canArchive:boolean}
export interface ArchivedStory {id:number;chatId:string;date:number;caption:string}
export interface StoryAlbum {id:number;name:string}
export interface StoryAlbumStories {stories:ArchivedStory[];nextOffset:number;hasMore:boolean}
export interface Sponsored { id:string; chatId:string; title:string; text:string; label:string; button:string; info:string; sponsor?:string; media?:Media }
export interface State { sponsored?: Sponsored[]; sponsoredError?:string }
export interface SponsoredSettings { premium:boolean; enabled:boolean; canDisable:boolean }
export interface Sponsored { canReport?:boolean }
export interface State { notifications?:{configured:boolean;missing?:string;enabled:boolean;permission:boolean;registered:boolean;status:string} }
export type NotificationScopeId = 'private' | 'group' | 'channel';
/** Los ids de sonido llegan en texto: un identificador de 64 bits no sobrevive en un double. */
export interface ScopeSettings { scope:NotificationScopeId; muted:boolean; muteFor:number; sound:string; preview:boolean; muteStories:boolean; storyDefault:boolean; storySound:string; storyPoster:boolean; quietPinned:boolean; quietMentions:boolean }
export interface NotificationSound { id:string; title:string; duration:number }
export interface NotificationScopes { scopes:ScopeSettings[]; sounds:NotificationSound[] }
/** Solo las claves presentes viajan a Telegram; las demás se conservan tal como las devolvió la lectura. */
export interface ScopePatch { muted?:boolean; muteFor?:number; sound?:string; preview?:boolean; muteStories?:boolean; storySound?:string; storyPoster?:boolean; quietPinned?:boolean; quietMentions?:boolean }
export interface PlayUpdateStatus { supported:boolean;checking:boolean;available:boolean;downloaded:boolean;currentVersionCode:number;availableVersionCode:number;priority:number;error:string;notes?:string }
export interface State { update?:PlayUpdateStatus }
export interface State { access:{checked:boolean;allowed:boolean;blocked:boolean;expiresAt:number;countries?:{code:string;name:string}[]}; qrImage?:string }
export interface BotButton { text:string;kind:'text'|'sharePhone'|'location'|'poll'|'users'|'requestChat'|'managedBot'|'url'|'login'|'callback'|'callbackPassword'|'game'|'webapp'|'copy'|'user'|'switch'|'unsupported';enabled:boolean;style?:'primary'|'success'|'danger'|'link' }
export interface InlineResult { index:number;title:string;description:string;kind:string;media?:Media }
export interface InlineTargetTypes { allowUserChats:boolean;allowBotChats:boolean;allowGroupChats:boolean;allowChannelChats:boolean }
export interface InlineSelection { token:string;bot:string;allowUserChats:boolean;allowBotChats:boolean;allowGroupChats:boolean;allowChannelChats:boolean }
export interface InlineBatch { token:string;bot:string;query:string;target:string;results:InlineResult[];hasMore:boolean }
export interface State { botKeyboard?:{messageId:string;rows:BotButton[][]}|null }
export interface Message { senderPhoto?:Media; preview?:{title:string;site:string;description:string;photo?:Media} }
export interface StarsInvoice {title:string;description:string;currency:string;amount:number;eligible:boolean;paid:boolean;test:boolean}
export interface StarsPayment {token:string;title:string;description:string;amount:number;seller:string;test:boolean;subscription:boolean;period:number;balance:number}
export interface PaidMediaPiece { kind:'photo'|'video'|'preview'|'unsupported'; media?:Media; width?:number; height?:number; duration?:number; minithumbnail?:string }
export interface PaidMediaInfo { starCount:number; locked:boolean; media:PaidMediaPiece[] }
export interface Message { paidMedia?:PaidMediaInfo }
export interface PaidMessagesInfo { starCount:number; canEnable:boolean }
export interface Wallet {stars:number;nanostars:number;premium:boolean}
export interface State {wallet?:Wallet}
export interface StarAmount {starCount:number;nanostarCount:number}
export interface StarTransaction {id:string;date:number;refund:boolean;starCount:number;nanostarCount:number;kind:string;label:string;chatId?:string;userId?:string;title?:string;period?:number}
export interface StarTransactions {starCount:number;transactions:StarTransaction[];nextOffset:string}
export interface StarSubscription {id:string;chatId:string;title:string;expirationDate:number;canceled:boolean;expiring:boolean;period:number;starCount:number;kind:'channel'|'bot'|'unsupported';canReuse?:boolean;inviteLink?:string;canceledByBot?:boolean}
export interface StarSubscriptions {starCount:number;requiredStarCount:number;subscriptions:StarSubscription[];nextOffset:string}
export interface StarPaymentOption {currency:string;amount:number;starCount:number;additional:boolean}
export interface StarPaymentOptions {options:StarPaymentOption[];notice:string}
export interface StarRevenue {usdRate:number;total:StarAmount|null;current:StarAmount|null;available:StarAmount|null;withdrawalEnabled:boolean;nextWithdrawalIn:number}
export interface PremiumPlan {currency:string;amount:number;monthCount:number;discountPercentage:number;current:boolean;upgrade:boolean}
export interface PremiumStatus {premium:boolean;state:string;notice:string;paymentOptions:PremiumPlan[]}
export interface PremiumFeature {key:string;label:string}
export interface PremiumLimit {key:string;label:string;defaultValue:number;premiumValue:number}
export interface PremiumFeatures {features:PremiumFeature[];limits:PremiumLimit[]}
export interface PremiumGiftOption {currency:string;amount:number;starCount:number;monthCount:number;discountPercentage:number}
export interface PremiumGiftOptions {options:PremiumGiftOption[];notice:string}
export interface PremiumGiftCode {creationDate:number;fromGiveaway:boolean;monthCount:number;dayCount:number;useDate:number;used:boolean;userId:string;creator?:string;giveawayMessageId?:string}
export interface PremiumStickers {stickers:Media[]}
export interface BoostSlot {slotId:number;chatId:string;startDate:number;expirationDate:number;cooldownUntilDate:number;inUse:boolean;available:boolean;expired?:boolean}
export interface BoostSlots {total:number;available:number;items:BoostSlot[]}
export interface PrepaidGiveaway {id:string;winnerCount:number;boostCount:number;paymentDate:number;monthCount?:number;starCount?:number}
export interface BoostStatus {level:number;boostCount:number;currentLevelBoostCount:number;nextLevelBoostCount:number;giftCodeBoostCount:number;premiumMemberCount:number;premiumMemberPercentage:number;appliedSlotIds:number[];boostUrl?:string;giveaways?:PrepaidGiveaway[]}
export interface BoostLevelFeatures {level:number;storyPerDayCount:number;customEmojiReactionCount:number;titleColorCount:number;profileAccentColorCount:number;accentColorCount:number;chatThemeBackgroundCount:number;canSetProfileBackgroundCustomEmoji:boolean;canSetBackgroundCustomEmoji:boolean;canSetEmojiStatus:boolean;canSetCustomBackground:boolean;canSetCustomEmojiStickerSet:boolean;canEnableAutomaticTranslation:boolean;canRecognizeSpeech:boolean;canDisableSponsoredMessages:boolean}
export interface BoostFeatures {levels:BoostLevelFeatures[];minimum:Record<string,number>}
export interface BoostLink {link:string;isPublic:boolean}
export interface Message {invoice?:StarsInvoice}
export interface Message { inlineKeyboard?:BotButton[][] }
export interface PollOption { index:number;text:string;votes:number;percentage:number;chosen:boolean;choosing:boolean;media?:Media }
/** Identificador opaque de la encuesta. TDLib no lo manda nunca; Windows sí, porque su `updateMessagePoll`
 *  puede llegar sin `peer` y entonces la única forma de encontrar la fila es comparar este número. */
/** Segundo de época en el que Telegram cierra la encuesta. Falta cuando la encuesta no lleva cierre, y en
 *  Windows también cuando el cierre viene dicho como periodo y no como fecha —ver DesktopPoll.HasCloseDate—. */
export interface Poll { pollId?:number;question:string;description:string;totalVoters:number;anonymous:boolean;multiple:boolean;revoting:boolean;closed:boolean;canSeeResults:boolean;canGetVoters:boolean;canStop:boolean;quiz:boolean;closesAt?:number;explanation?:string;restriction?:string;options:PollOption[] }
export interface GiftInfo { stars:number;premium:boolean;unique:boolean;saved:boolean;private:boolean;upgraded:boolean;converted:boolean;refunded:boolean;canUpgrade:boolean;number?:number;text?:string }
export interface Message { gift?:GiftInfo }
export interface GiftAttribute { name:string;rarity:string;perMille:number;crafted?:boolean;sticker?:Media }
export interface GiftBackdropColors { center?:string;edge?:string;symbol?:string;text?:string }
export interface GiftBackdrop { id:number;name:string;rarity:string;perMille:number;colors?:GiftBackdropColors }
export interface GiftUnique { title:string;name:string;number:number;totalUpgradedCount:number;maxUpgradedCount:number;isPremium:boolean;isCrafted:boolean;isBurned:boolean;publisherChatId:string;model?:GiftAttribute;symbol?:GiftAttribute;backdrop?:GiftBackdrop;valueCurrency?:string;valueAmount?:number;valueUsdAmount?:number;sticker?:Media }
export interface CatalogGift { id:string;starCount:number;defaultSellStarCount:number;upgradeStarCount:number;upgradeVariantCount:number;hasColors:boolean;isPremium:boolean;isForBirthday:boolean;nextSendDate:number;publisherChatId:string;resaleCount:number;minResaleStarCount:number;upgradedTitle:string;sticker?:Media }
export interface GiftCatalog { gifts:CatalogGift[] }
export interface ReceivedGiftItem { id:string;date:number;private:boolean;saved:boolean;pinned:boolean;canUpgrade:boolean;canTransfer:boolean;canDelete:boolean;refunded:boolean;number:number;sellStarCount:number;prepaidUpgradeStarCount:number;upgradeSeparate:boolean;transferStarCount:number;dropOriginalDetailsStarCount:number;nextTransferDate:number;nextResaleDate:number;exportDate:number;collections:number[];sender?:string;senderId?:string;text?:string;giftId?:string;starCount?:number;upgradeStarCount?:number;isPremium?:boolean;unique?:GiftUnique;sticker?:Media;kind:string }
export interface ReceivedGiftCatalog { total:number;offset:string;notifications:boolean;gifts:ReceivedGiftItem[] }
export interface CanSendGiftResult { allowed:boolean;reason:string }
export interface GiftUpgradePrice { date:number;starCount:number }
export interface GiftUpgradePreview { models:GiftAttribute[];symbols:GiftAttribute[];backdrops:GiftBackdrop[];prices:GiftUpgradePrice[];nextPrices:GiftUpgradePrice[] }
export interface GiftUpgradeResult { id:string;saved:boolean;canTransfer:boolean;transferStarCount:number;dropOriginalDetailsStarCount:number;nextTransferDate:number;nextResaleDate:number;exportDate:number;unique:GiftUnique }
export type GiftView = 'all'|'saved'|'unsaved'|'upgradable'|'upgraded'|'colors'
export interface Message { poll?:Poll }
export interface RichListItem { label:string;checkbox:boolean;checked:boolean;blocks:RichBlock[] }
export interface RichTableCell { text:string;entities?:TextEntity[];header:boolean;colspan:number;rowspan:number }
export interface RichArticle { url:string;title:string;description:string;author:string;date:number;media?:Media }
export interface RichButton { text:string;url?:string }
export interface RichBlock { type:string;text?:string;entities?:TextEntity[];size?:number;language?:string;credit?:string;date?:number;caption?:string;captionEntities?:TextEntity[];media?:Media;spoiler?:boolean;autoplay?:boolean;looped?:boolean;url?:string;author?:string;blocks?:RichBlock[];block?:RichBlock;open?:boolean;items?:RichListItem[];cells?:(RichTableCell|null)[][];bordered?:boolean;striped?:boolean;compact?:boolean;articles?:RichArticle[];header?:string;latitude?:number;longitude?:number;buttons?:RichButton[];title?:string;username?:string }
export interface RichMessageInfo { rtl:boolean;full:boolean;blocks:RichBlock[] }
export interface Message { rich?:RichMessageInfo }
export interface StickerPack { id:string;title:string;name:string;size:number;installed:boolean;archived:boolean;official:boolean;thumbnail?:Media;stickers?:Media[] }
export interface ProxyEntry { id:number;server:string;port:number;type:string;enabled:boolean;comment:string;lastUsed:number }
export type CacheCategory = 'photos'|'videos'|'audio'|'files';
export interface CachePolicy {maxGiB:number;privateDays:number;groupDays:number;channelDays:number;keepChats:string[]}
export interface CacheDetails {
  categories:Partial<Record<CacheCategory,number>>;
  chats:{id:string;title:string;size:number;categories:Partial<Record<CacheCategory,number>>}[];
}
export interface StorageStatus { filesSize:number;fileCount:number;databaseSize:number;languagePackDatabaseSize:number;logSize:number;total:number;policy:CachePolicy }
export type TextEntityType = 'bold'|'italic'|'underline'|'strikethrough'|'spoiler'|'code'|'pre'|'preCode'|'blockquote'|'expandableBlockquote'|'link'|'mention'|'mentionName'|'hashtag'|'cashtag'|'botCommand'|'email'|'phone'|'bankCard'|'tonAddress'|'customEmoji'|'mediaTimestamp'|'dateTime';
export interface TextEntity { type:TextEntityType; offset:number; length:number; url?:string; userId?:string; customEmojiId?:string; mediaTimestamp?:number; unixTime?:number; dateTimeType?:'relative'|'absolute'; language?:string }
export interface Message { entities?:TextEntity[]; albumId?:string; forumTopicId?:number }
export interface ServiceInfo { kind:string; text:string; photo?:Media; messageId?:string; chatId?:string; userId?:string; currency?:string; amount?:number; date?:number; duration?:number; count?:number }
export interface Message { service?:ServiceInfo }
export type MessageExtra =
  | {kind:'location';title:string;address:string;latitude?:number;longitude?:number;live?:boolean;expiresAt?:number;canOpen:boolean;canStop?:boolean}
  | {kind:'contact';name:string;phone:string;userId:string;canCopy:boolean}
  | {kind:'animatedEmoji';emoji:string;media?:Media;interactive:boolean}
  | {kind:'dice';emoji:string;value:number;media?:Media;stake?:string;prize?:string}
  | {kind:'game';title:string;description?:string;media?:Media}
  | {kind:'story';mention:boolean}
  | {kind:'unsupported'};
export interface Message { extra?:MessageExtra }
export interface Message { senderPremium?:boolean; senderEmojiStatus?:EmojiStatusMark; authorKind?:'user'|'chat'; authorId?:string; id: string; chatId: string; sender: string; text: string; date: number; outgoing: boolean; status: 'pending' | 'failed' | 'read' | 'sent' | ''; edited: boolean; reply?: string; media?: Media; reactions: { emoji: string; count: number; chosen: boolean; kind?: 'paid' | 'custom'; customEmojiId?: string }[]; scheduledAt?: number; chatTitle?: string }
/** Los cinco criterios que Telegram admite de una vez en una conversación. `sender` es un id en texto o «chat». */
export interface SearchCriteria { query: string; sender: string; filter: string; from: number; until: number }
export interface ForwardOrigin { kind:'user'|'hidden'|'chat'|'channel'; name:string; signature?:string; date?:number; chatId?:string; messageId?:string; userId?:string }
/** Lo que Telegram dijo de un envío propio sin confirmar. Las Stars viajan en texto, como los ids de 64 bits. */
export interface UnsentInfo { pending:boolean; code:number; telegram:string; canRetry:boolean; anotherSender:boolean; otherQuote:boolean; dropsReply:boolean; stars:string; wait:number }
export interface Message { unsent?:UnsentInfo }
export interface Message { forward?:ForwardOrigin; replyAuthor?:string; replyTo?:{chatId:string;messageId:string} }
export interface MessageThreadBadge { comments:number; canOpen?:boolean }
export interface Message { thread?:MessageThreadBadge }
export interface ThreadPage { chatId:string; threadId:string; comments:number; unread:number; messages:Message[]; next:boolean }
export interface JoinRequest { userId:string; name:string; date:number; bio:string }
export interface JoinRequestPage { total:number; requests:JoinRequest[]; cursor?:string; next:boolean }
export interface Chat { requests?:number }
/**
 * El derecho `send_polls` que Telegram negó para esta cuenta en esta conversación. En Android lo trae TDLib
 * dentro de `chat.permissions`; en Windows se lee de los `ChatBannedRights` de la fila del canal, y el andamio
 * solo puede decir la respuesta, que es lo que la pantalla necesita para no prometer una encuesta que no va a
 * entrar. Ausente significa «no lo sé», y ahí decide Telegram.
 */
export interface Chat { noPolls?:boolean }
/**
 * El derecho que Telegram negó para las tarjetas de contacto en esta conversación. TDLib lo llama
 * `canSendOtherMessages` —es el que mira `NativeBridge.java:4722`— y MTProto no tiene ese bit, así que el puente de
 * Windows usa `send_docs`, que es lo que un contacto es ahí: un documento con atributo de contacto. Como con las
 * encuestas, el andamio solo puede dar la respuesta, y ausente significa «no lo sé»: decide Telegram.
 */
export interface Chat { noContacts?:boolean }
export interface InviteLink { link:string; name:string; creator:string; created:number; edited:number; expires:number; memberLimit:number; memberCount:number; pending:number; approval:boolean; primary:boolean; revoked:boolean; paid:boolean }
export interface InviteLinkPage { total:number; links:InviteLink[]; revoked:boolean; cursor?:string; next:boolean }
export interface LinkForm { name:string; expiresIn:number; memberLimit:number; approval:boolean }
export interface GlobalSearch { messages: Message[]; nextOffset: string; total: number }
export type FeedEntry = { chatId:string; messageId:string; title:string; text:string; date:number }
export type SavedFilter = { id:string; name:string; query:string; filter:string; mode:'chat'|'global'; chatId?:string }
export interface SavedTag { kind:'emoji'|'custom'; emoji?:string; customEmojiId?:string; label:string; count:number }
export interface State { topic?: {id:number;name:string;closed:boolean;readInbox?:string;unread?:number;draft?:string;draftEntities?:TextEntity[];draftReply?:string} }
export interface ContactSync {enabled:boolean;running:boolean;last:number;matched:number;imported:number;skipped:boolean;error:string}
export interface State { contactsSync?: ContactSync; authEmailPattern?: string; authCodeLength?: number; authHint?: string; authRecoveryAvailable?: boolean; authRecoveryPattern?: string; authTerms?: string; authMinAge?: number }
export interface State { voiceAutoStopped?: boolean }
export interface State { ready: boolean; auth: string; consent: boolean; busy: boolean; connection: string; online: boolean; error: string; notice: string; version: string; selfId: string; name: string; active: string; canSend: boolean; sending: boolean; uncertain: boolean; chatsBusy: boolean; chatsEnd?:boolean; chats: Chat[]; messages: Message[]; folders: { id: number; title: string }[]; history: { loading: boolean; initialRetry?:boolean; error: string; end: boolean; latest: boolean; anchor?:string }; typing: string; appearance: { theme: string; font: number; compact: boolean; typing: boolean; enter: boolean; fontFamily: string; wallpaper: string; auto?: boolean; custom?: CustomTheme; customThemes?: CustomTheme[]; chatThemes?: Record<string, string>; accountBackgrounds?: CloudBackgroundSlots; gestures?: { left:string; right:string }; navigation?: 'bar'|'side'; systemDark?: boolean }; permissions: { notes: boolean; replies: boolean }; security: SecurityStatus; assistant: { state: string; ready: boolean; busy: boolean; consent: boolean; error: string; turns: { role: string; content: string }[] }; platform?: 'android' | 'web' | 'desktop' }
export interface CatalogItem { key: string; label: string; media?: Media; preview?: string; emoji?:string; premium?:boolean }
export interface Catalog { items: CatalogItem[]; sets?: { id: string; title: string; thumbnail?:Media; emoji?:string }[] }
export interface Properties { reply: boolean; copy: boolean; copyContent: boolean; edit: boolean; editChecklist: boolean; deleteSelf: boolean; deleteAll: boolean; forward: boolean; pin: boolean; editCaption: boolean; editMedia?: boolean; caption: string; reactions: ReactionOption[]; paid?: boolean; allowCustom?: boolean; transcribe?: boolean; canBePaid?: boolean }
export interface PasswordState { hasPassword: boolean; hint: string; hasRecoveryEmail: boolean; hasPassport: boolean; pendingReset: number; recoveryEmailPattern?:string; recoveryCodeLength?:number }
export interface AutoDeleteSettings { seconds:number; canChange:boolean }
export interface PrivacySetting { key: string; value: string; allowUsers: string[]; restrictUsers: string[]; preserved?: string[] }
export interface BlockedSender { kind:'user'|'chat'; id:string; name:string; photo?:Media }
export interface BlockedSenders { items:BlockedSender[]; total:number; nextOffset:number; hasMore:boolean }
export interface ReactionOption { kind: 'emoji' | 'custom'; emoji?: string; customEmojiId?: string; needsPremium?: boolean }
export type StoryReactionOption = ReactionOption;
export interface StoryReactions { top: StoryReactionOption[]; recent: StoryReactionOption[]; allowCustom: boolean; restriction?: string }
export interface StoryInteraction { name: string; date: number; type: 'view' | 'forward' | 'repost'; emoji?: string; customEmojiId?: string }
export interface StoryInteractions { total: number; forwards: number; reactions: number; next: string; items: StoryInteraction[] }
export interface EmojiStatusMark { customEmojiId:string; expiration:number }
export interface EmojiStatusState extends EmojiStatusMark { premium:boolean }
export interface EmojiStatusOption { id:string; emoji?:string; expiration?:number; media?:Media }
export interface EmojiPack { id:string; title:string; name:string; size:number; installed:boolean; thumbnail?:Media; emoji?:string }
export interface EmojiPackPage { items:EmojiPack[]; nextOffset:number }
export interface EmojiPackDetail extends EmojiPack { items:EmojiStatusOption[] }
export interface QuickReplyShortcutInfo { id:number; name:string; count:number; first?:string }
export interface ChecklistTaskInfo { id:number; text:string; done:boolean }
export interface ChecklistInfo { title:string; tasks:ChecklistTaskInfo[]; othersCanAdd:boolean; othersCanMark:boolean; canAdd:boolean; canMark:boolean }
export interface Message { checklist?:ChecklistInfo }
export interface Message { scheduledOnline?:boolean; scheduledRepeat?:boolean; repeatPeriod?:number }
export interface QuickRepliesState { shortcuts:QuickReplyShortcutInfo[]; messages:Record<string,string[]> }
export interface State { quickReplies?:QuickRepliesState }
export interface BusinessRecipientsInfo { existing?:boolean; newChats?:boolean; contacts?:boolean; nonContacts?:boolean }
export interface BusinessLinkInfo { link:string; title:string; text:string; views:number }
export interface BusinessBotState { configured:boolean; botUserId?:string; name?:string; recipients?:BusinessRecipientsInfo; rights?:Record<string,boolean>; connectionDate?:number; deviceModel?:string; location?:string }
export interface BusinessProfile { nextOpenIn?:number; nextCloseIn?:number; address?:string; timeZoneId?:string; hours?:{startMinute:number;endMinute:number}[]; greeting?:{shortcutId:string;inactivityDays:number;recipients:BusinessRecipientsInfo}; away?:{shortcutId:string;offlineOnly:boolean;schedule:{type:'always'|'outside'|'custom';startDate?:number;endDate?:number};recipients:BusinessRecipientsInfo}; startPage?:{title:string;message:string} }
export const EMPTY: State = { ready: false, auth: 'welcome', consent: false, busy: false, connection: 'Sin conectar', online: false, error: '', notice: '', version: '1.0.0-beta33', selfId: '0', name: '', active: '0', canSend: false, sending: false, uncertain: false, chatsBusy: false, chats: [], messages: [], folders: [], history: { loading: false, error: '', end: false, latest: true }, typing: '', appearance: { theme: 'gold', font: 16, compact: false, typing: true, enter: false, fontFamily: 'system', wallpaper: 'none', auto: false, customThemes: [], chatThemes: {}, systemDark: false }, permissions: { notes: false, replies: false }, security:{enabled:false,available:false,biometric:false,lockAfter:0}, assistant: { state: 'Sin comprobar', ready: false, busy: false, consent: false, error: '', turns: [] }, access:{checked:false,allowed:false,blocked:false,expiresAt:0,countries:[]},update:{supported:false,checking:false,available:false,downloaded:false,currentVersionCode:61,availableVersionCode:0,priority:0,error:''},wallet:{stars:0,nanostars:0,premium:false},platform:'web' };
/** Estadísticas de una comunidad (ronda CA). Las fichas viajan por `id` para que Android y Windows no puedan llamar de dos maneras al mismo número; `previous` se omite cuando la biblioteca no lo contesta, y la pantalla solo promete crecimiento si viene. */
export interface ChatStatCard {id:string;value:number;previous?:number}
export interface ChatStatSender {name:string;messages:number;avgChars:number}
export interface CommunityStats {kind:'channel'|'group';from?:string;to?:string;values:ChatStatCard[];top:ChatStatSender[]}
/** Registro de llamadas (ronda CL). `label` es la frase que ya se lee dentro del chat; `total` es aproximado y
 *  viene 0 cuando Telegram no lo sabe; `more` solo es cierto si el servidor devolvió cursor para la página siguiente. */
export interface CallLogEntry {chatId:string;messageId:string;title:string;label:string;date:number;missed:boolean;video:boolean;group:boolean;duration:number}
export interface CallLogPage {rows:CallLogEntry[];fetched:number;shown:number;total:number;nextOffset:string;more:boolean}
