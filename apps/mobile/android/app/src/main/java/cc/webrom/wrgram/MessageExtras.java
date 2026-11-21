package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/** Content with a dedicated chat card, separate from service messages and ordinary attachments. */
final class MessageExtras {
    private MessageExtras() {}

    static boolean temporary(TdApi.Message message) {
        return message.selfDestructType != null || message.ephemeralContent != null;
    }

    static String summary(TdApi.MessageContent content) {
        if (content instanceof TdApi.MessageLocation) return "Ubicación";
        if (content instanceof TdApi.MessageLiveLocation) return "Ubicación en vivo";
        if (content instanceof TdApi.MessageVenue) {
            TdApi.Venue venue = ((TdApi.MessageVenue) content).venue;
            return venue == null ? "Lugar" : text(venue.title, "Lugar");
        }
        if (content instanceof TdApi.MessageContact) {
            TdApi.Contact contact = ((TdApi.MessageContact) content).contact;
            return "Contacto · " + contactName(contact);
        }
        if (content instanceof TdApi.MessageAnimatedEmoji) return text(((TdApi.MessageAnimatedEmoji) content).emoji, "Emoji animado");
        if (content instanceof TdApi.MessageDice) return text(((TdApi.MessageDice) content).emoji, "🎲") + " · " + result(((TdApi.MessageDice) content).value);
        if (content instanceof TdApi.MessageStakeDice) return "🎲 Dado con apuesta · " + result(((TdApi.MessageStakeDice) content).value);
        if (content instanceof TdApi.MessageGame) {
            TdApi.Game game = ((TdApi.MessageGame) content).game;
            return game == null ? "Juego de Telegram" : text(game.title, "Juego de Telegram");
        }
        if (content instanceof TdApi.MessageStory) return ((TdApi.MessageStory) content).viaMention ? "Mención en una historia" : "Historia compartida";
        if (content instanceof TdApi.MessageUnsupported) return "Esta versión de TDLib no puede leer el contenido de este mensaje.";
        return null;
    }

    static JSONObject card(TdApi.Message message, NativeSnapshot dto, boolean protect) throws Exception {
        if (temporary(message)) return null;
        TdApi.MessageContent content = message.content;
        if (content instanceof TdApi.MessageLiveLocation) {
            TdApi.MessageLiveLocation live = (TdApi.MessageLiveLocation) content;
            long expiresAt = live.expiresIn <= 0 || live.location == null ? 0 : (long) message.date + live.location.livePeriod;
            return location(coordinates(content), "Ubicación en vivo", "", !protect)
                    .put("live", true).put("expiresAt", expiresAt).put("canStop", message.isOutgoing && live.expiresIn > 0);
        }
        if (content instanceof TdApi.MessageLocation) return location(coordinates(content), "Ubicación", "", !protect);
        if (content instanceof TdApi.MessageVenue) {
            TdApi.Venue venue = ((TdApi.MessageVenue) content).venue;
            return venue == null ? location(null, "Lugar", "", false) : location(venue.location, text(venue.title, "Lugar"), text(venue.address, ""), !protect);
        }
        if (content instanceof TdApi.MessageContact) {
            TdApi.Contact contact = ((TdApi.MessageContact) content).contact;
            return kind("contact").put("name", contactName(contact))
                    .put("phone", contact == null ? "" : text(contact.phoneNumber, ""))
                    .put("userId", contact == null || contact.userId <= 0 ? "" : Long.toString(contact.userId))
                    .put("canCopy", !protect);
        }
        if (content instanceof TdApi.MessageAnimatedEmoji) {
            TdApi.MessageAnimatedEmoji emoji = (TdApi.MessageAnimatedEmoji) content;
            return kind("animatedEmoji").put("emoji", text(emoji.emoji, "✨"))
                    .put("media", asset(dto, emoji.animatedEmoji == null ? null : emoji.animatedEmoji.sticker, protect))
                    .put("interactive", !protect);
        }
        if (content instanceof TdApi.MessageDice) {
            TdApi.MessageDice dice = (TdApi.MessageDice) content;
            return dice(dto, text(dice.emoji, "🎲"), dice.value, dice.initialState, dice.finalState, protect);
        }
        if (content instanceof TdApi.MessageStakeDice) {
            TdApi.MessageStakeDice dice = (TdApi.MessageStakeDice) content;
            return dice(dto, "🎲", dice.value, dice.initialState, dice.finalState, protect)
                    .put("stake", Long.toString(dice.stakeGramAmount)).put("prize", Long.toString(dice.prizeGramAmount));
        }
        if (content instanceof TdApi.MessageGame) {
            TdApi.Game game = ((TdApi.MessageGame) content).game;
            JSONObject result = kind("game").put("title", summary(content));
            if (game == null) return result;
            JSONObject cover = game.animation == null ? null : dto.animation(game.animation);
            if (cover == null && game.photo != null) {
                TdApi.MessagePhoto photo = new TdApi.MessagePhoto();
                photo.photo = game.photo;
                cover = dto.contentMedia(photo);
            }
            return result.put("description", text(game.description, "")).put("media", restricted(dto, cover, protect));
        }
        if (content instanceof TdApi.MessageStory) return kind("story").put("mention", ((TdApi.MessageStory) content).viaMention);
        if (content instanceof TdApi.MessageUnsupported) return kind("unsupported");
        return null;
    }

    private static JSONObject dice(NativeSnapshot dto, String emoji, int value, TdApi.DiceStickers initial,
                                   TdApi.DiceStickers result, boolean protect) throws Exception {
        TdApi.DiceStickers chosen = value > 0 && result != null ? result : initial;
        TdApi.Sticker sticker = chosen instanceof TdApi.DiceStickersRegular ? ((TdApi.DiceStickersRegular) chosen).sticker : null;
        // Slot machine assets are separate layers. Keep the result visible without playing unrelated reel loops.
        return kind("dice").put("emoji", emoji).put("value", value).put("media", asset(dto, sticker, protect));
    }

    private static JSONObject asset(NativeSnapshot dto, TdApi.Sticker sticker, boolean protect) throws Exception {
        return sticker == null ? null : restricted(dto, dto.sticker(sticker), protect);
    }

    private static JSONObject restricted(NativeSnapshot dto, JSONObject file, boolean protect) throws Exception {
        if (file != null && protect) {
            dto.protect(file);
            file.put("exportable", false);
        }
        return file;
    }

    private static JSONObject location(TdApi.Location location, String title, String address, boolean canOpen) throws Exception {
        JSONObject result = kind("location").put("title", title).put("address", address).put("canOpen", canOpen);
        if (validLocation(location)) result.put("latitude", location.latitude).put("longitude", location.longitude);
        return result;
    }

    static TdApi.Location coordinates(TdApi.MessageContent content) {
        if (content instanceof TdApi.MessageLocation) return ((TdApi.MessageLocation) content).location;
        if (content instanceof TdApi.MessageVenue) {
            TdApi.Venue venue = ((TdApi.MessageVenue) content).venue;
            return venue == null ? null : venue.location;
        }
        if (content instanceof TdApi.MessageLiveLocation) {
            TdApi.LiveLocation live = ((TdApi.MessageLiveLocation) content).location;
            return live == null ? null : live.location;
        }
        return null;
    }

    static boolean validLocation(TdApi.Location value) {
        return value != null && Double.isFinite(value.latitude) && Double.isFinite(value.longitude)
                && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
    }

    private static JSONObject kind(String value) throws Exception { return new JSONObject().put("kind", value); }
    private static String result(int value) { return value > 0 ? Integer.toString(value) : "En curso"; }
    private static String text(String value, String fallback) { return value == null || value.isBlank() ? fallback : NativeSnapshot.limit(value, 2048); }
    private static String contactName(TdApi.Contact contact) {
        if (contact == null) return "Contacto";
        return text((text(contact.firstName, "") + " " + text(contact.lastName, "")).trim(), "Contacto");
    }
}
