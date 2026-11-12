package cc.webrom.wrgram;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Deliberately no raw TDLib function, filesystem path, URL fetch, eval or plugin execution. */
final class BridgePolicy {
    static final int MAX_BYTES=65536;
    static final Set<String> METHODS=new HashSet<>(Arrays.asList("state","connect","authenticate","logout","retry","error.clear","appearance","chat.open","chat.close","chat.saved","chat.find","chats.list","chats.more","chats.search","saved.sources","saved.history","gallery.list","chat.pin","chat.mute","chat.archive","chat.unread","chat.read","history.older","history.refresh","history.byDate","typing","send.text","message.properties","messages.search","message.edit","message.delete","message.copy","message.pin","message.forward","message.react","catalog","send.catalog","media.load","media.play","media.export","media.retry","attachment.pick","attachment.camera","attachment.discard","send.attachment","security.lock","telegram.link","plugin.permission","notes.read","notes.write","notes.clear","assistant.status","assistant.consent","assistant.send","native.settings","native.assistant"));
    static { METHODS.add("app.background"); }
    static { METHODS.addAll(Arrays.asList("accounts.list","accounts.add","accounts.remove","accounts.switch","chat.secret","apps.list","apps.open","apps.chat","sponsored.view","sponsored.open","sponsored.retry","notifications.enable","notifications.status")); }
    static { METHODS.add("apps.profile"); }
    static { METHODS.add("notifications.disable"); }
    static { METHODS.add("appearance.systemPalette"); }
    static { METHODS.add("message.link"); }
    static { METHODS.add("link.open"); }
    static { METHODS.addAll(Arrays.asList("chat.username","chat.username.set","groups.events","downloads.status","downloads.pause")); }
    static { METHODS.addAll(Arrays.asList("chat.join","chat.leave")); }
    static { METHODS.addAll(Arrays.asList("forum.topics","forum.open","forum.close","forum.create","forum.rename","forum.closed","forum.delete","forum.pin","forum.order","chat.transfer.check","chat.transfer")); }
    static { METHODS.addAll(Arrays.asList("privacy.get","privacy.set","folders.list","folders.get","folders.save","folders.delete","folders.link","folders.join","chat.folderTags","chat.folderCount","saved.tags","saved.tag.label","saved.search","saved.topics.pin")); }
    static { METHODS.addAll(Arrays.asList("messages.forward","messages.delete","message.edit.caption","attachment.album","send.album","messages.search.more","chat.pinned","pinned.list","draft.set","message.album","message.translate")); }
    static { METHODS.addAll(Arrays.asList("access.countries","access.declare","access.terms","access.privacy","authenticate.qr","auth.register","auth.recover.request","auth.recover.reset","auth.resend","bot.button","bot.inline.more","bot.inline.send","bot.inline.choose","bot.inline.cancel","bot.inline.query","message.react.paid","message.react.custom","customEmoji.get","customEmoji.search","premium.state","premium.features","premium.limit","premium.stickers","premium.gift.options","premium.gift.check","premium.gift.apply","updates.check","updates.start","updates.complete","updates.open","account.profile","account.photo.pick","account.photo.delete","account.name","account.bio","account.username","account.sessions","account.session.revoke","chat.stories","chat.invite","story.open","story.close","story.create.photo","story.create.video","story.edit.caption","story.delete","story.profile.toggle","contacts.list","contacts.search","contacts.add","contacts.remove","contacts.open","contacts.import","contacts.sync.status","contacts.sync.set","contacts.sync.now","groups.create","groups.createSuper","groups.members","groups.banned","groups.member.ban","groups.member.unban","groups.member.promote","groups.member.demote","groups.permissions.get","groups.permissions.set","payments.stars.prepare","payments.stars.confirm","payments.stars.cancel","send.paidMedia","chat.paidMessages.get","chat.paidMessages.set","stars.paidMessageRevenue")); }
    static { METHODS.addAll(Arrays.asList("poll.send","poll.answer","poll.stop","poll.voters","checklist.send","checklist.add","checklist.toggle","checklist.edit","share.contact","share.location","voice.start","voice.finish","voice.cancel","attachment.videoNote","attachment.videoNote.record","stickers.installed","stickers.search","stickers.get","stickers.install","proxy.list","proxy.add","proxy.enable","proxy.disable","proxy.remove","proxy.ping","storage.status","storage.details","storage.settings","storage.optimize")); }
    static { METHODS.addAll(Arrays.asList("scheduled.list","scheduled.reschedule","scheduled.sendNow","scheduled.delete","password.state","password.set","story.reactions","story.react","story.interactions","emojiStatus.state","emojiStatus.options","emojiStatus.set","emojiPacks.list","emojiPacks.get")); }
    static { METHODS.addAll(Arrays.asList("security.timeout","security.lockNow")); }
    static { METHODS.addAll(Arrays.asList("chat.senders.get","chat.senders.set")); }
    static { METHODS.addAll(Arrays.asList("history.newer","chat.profile","profile.sender","profile.contact","profile.related","profile.peer","profile.block","clipboard.copy","media.open","media.text","media.archive","bot.father")); }
    static { METHODS.addAll(Arrays.asList("groups.members.page","groups.member.restrict","story.albums.list","story.albums.create","story.albums.rename","story.albums.delete","story.albums.order","story.albums.stories","story.albums.add","story.albums.remove","story.albums.story.order")); }
    static { METHODS.addAll(Arrays.asList("bot.status","bot.save","bot.forget","bot.publish","bot.publish.available","chat.subscription.create","inbox.tabs","inbox.tabs.set","feed.channels","search.filters.list","search.filters.save","search.filters.delete")); }
    static { METHODS.addAll(Arrays.asList("chat.bot.owned","chat.bot.defaults","chat.bot.add","chat.bot.remove","bot.posts","bot.edit","bot.delete","bot.pin","bot.unpin")); }
    static { METHODS.addAll(Arrays.asList("stars.transactions","stars.subscriptions","stars.subscription.cancel","stars.subscription.resume","stars.subscription.reuse","stars.options","stars.revenue","stars.ads.url","stars.withdraw")); }
    static { METHODS.addAll(Arrays.asList("chat.boost.status","chat.boost.slots","chat.boost.features","chat.boost.level","chat.boost.link","chat.boost.apply")); }
    static { METHODS.addAll(Arrays.asList("gifts.catalog","gifts.received","gifts.canSend","gifts.options","gifts.send","gifts.save","gifts.pin","gifts.sell","gifts.delete","gifts.upgrade.preview","gifts.upgrade","gifts.transfer")); }
    static { METHODS.addAll(Arrays.asList("downloads.queue","downloads.item.pause","downloads.item.cancel","downloads.item.remove","downloads.item.add","downloads.presets","downloads.rules","downloads.rules.set")); }
    static { METHODS.addAll(Arrays.asList("chat.translatable","chat.autotranslate","message.transcribe","message.transcribe.rate")); }
    static { METHODS.addAll(Arrays.asList("business.quick.list","business.quick.messages","business.quick.add","business.quick.name","business.quick.delete","business.quick.send","business.greeting","business.away","business.hours","business.location","business.start","business.links.list","business.links.save","business.links.delete","business.bot.get","business.bot.set","business.bot.delete","business.bot.pause","business.bot.remove","business.quick.edit")); }
    static { METHODS.addAll(Arrays.asList("folders.links.list","folders.links.edit","folders.links.delete")); }
    static { METHODS.add("call.open"); }
    static void envelope(JSONObject value){if(value.length()!=3||!value.optString("id").matches("[0-9]{1,16}")||!METHODS.contains(value.optString("method"))||!(value.opt("params") instanceof JSONObject))throw new IllegalArgumentException("Invalid bridge envelope");}
    static long id(JSONObject params,String key){Object value=params.opt(key);if(!(value instanceof String)||!((String)value).matches("-?(0|[1-9][0-9]{0,18})"))throw new IllegalArgumentException("Invalid identifier");return Long.parseLong((String)value);}
    static long[] ids(JSONObject params,String key,int maximum){Object value=params.opt(key);if(!(value instanceof JSONArray)||((JSONArray)value).length()<1||((JSONArray)value).length()>maximum)throw new IllegalArgumentException("Invalid identifier list");JSONArray items=(JSONArray)value;long[] result=new long[items.length()];for(int i=0;i<result.length;i++){Object item=items.opt(i);if(!(item instanceof String)||!((String)item).matches("-?(0|[1-9][0-9]{0,18})"))throw new IllegalArgumentException("Invalid identifier list");result[i]=Long.parseLong((String)item);}return result;}
    static String text(JSONObject params,String key,int maximum){Object value=params.opt(key);if(!(value instanceof String)||((String)value).length()>maximum)throw new IllegalArgumentException("Invalid text");return (String)value;}
}
