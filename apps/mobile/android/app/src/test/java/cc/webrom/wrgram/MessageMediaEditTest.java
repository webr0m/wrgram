package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class MessageMediaEditTest {
    private static TdApi.FormattedText caption(String text) {
        return new TdApi.FormattedText(text, new TdApi.TextEntity[0]);
    }

    private static TdApi.MessagePhoto photo(String text, boolean above, boolean spoiler) {
        TdApi.MessagePhoto value = new TdApi.MessagePhoto();
        value.photo = new TdApi.Photo();
        value.caption = caption(text);
        value.showCaptionAboveMedia = above;
        value.hasSpoiler = spoiler;
        return value;
    }

    private static TdApi.MessageVideo video(String text, boolean above, boolean spoiler) {
        TdApi.MessageVideo value = new TdApi.MessageVideo();
        value.video = new TdApi.Video();
        value.caption = caption(text);
        value.showCaptionAboveMedia = above;
        value.hasSpoiler = spoiler;
        return value;
    }

    private static TdApi.MessageAnimation animation() {
        TdApi.MessageAnimation value = new TdApi.MessageAnimation();
        value.animation = new TdApi.Animation();
        value.caption = caption("");
        return value;
    }

    private static TdApi.MessageAudio audio() {
        TdApi.MessageAudio value = new TdApi.MessageAudio();
        value.audio = new TdApi.Audio();
        value.caption = caption("");
        return value;
    }

    private static TdApi.MessageDocument document() {
        TdApi.MessageDocument value = new TdApi.MessageDocument();
        value.document = new TdApi.Document();
        value.caption = caption("");
        return value;
    }

    @Test public void onlyTheFiveTypesTheFunctionAcceptsCountAsEditableMedia() {
        assertEquals(MessageMediaEdit.PHOTO, MessageMediaEdit.currentKind(photo("hola", false, false)));
        assertEquals(MessageMediaEdit.VIDEO, MessageMediaEdit.currentKind(video("hola", false, false)));
        assertEquals(MessageMediaEdit.ANIMATION, MessageMediaEdit.currentKind(animation()));
        assertEquals(MessageMediaEdit.AUDIO, MessageMediaEdit.currentKind(audio()));
        assertEquals(MessageMediaEdit.DOCUMENT, MessageMediaEdit.currentKind(document()));
    }

    @Test public void textVoiceNotesAndEverythingElseHaveNoMediaToReplace() {
        // La nota de voz y el videomensaje son el hueco real de la función: `TdApi.java:120743` lista cinco tipos y
        // ahí no están, y las otras dos funciones que editan medio (`TdApi.java:119451` y `TdApi.java:120385`) repiten
        // la misma lista de cinco: editar un mensaje propio no puede dejarlo en nota de voz ni sacarlo de una.
        TdApi.MessageText text = new TdApi.MessageText();
        text.text = caption("hola");
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(text));
        TdApi.MessageVoiceNote voice = new TdApi.MessageVoiceNote();
        voice.voiceNote = new TdApi.VoiceNote();
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(voice));
        TdApi.MessageVideoNote note = new TdApi.MessageVideoNote();
        note.videoNote = new TdApi.VideoNote();
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(note));
        TdApi.MessageSticker sticker = new TdApi.MessageSticker();
        sticker.sticker = new TdApi.Sticker();
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(sticker));
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(new TdApi.MessagePoll()));
        TdApi.MessageContact contact = new TdApi.MessageContact();
        contact.contact = new TdApi.Contact();
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(contact));
        TdApi.MessageLocation location = new TdApi.MessageLocation();
        location.location = new TdApi.Location(1, 2, 0);
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(location));
        assertEquals(MessageMediaEdit.NONE, MessageMediaEdit.currentKind(null));
    }

    @Test public void everyPickedFileLandsOnOneOfTheFiveKinds() {
        assertEquals(MessageMediaEdit.PHOTO, MessageMediaEdit.wantedKind("image/jpeg"));
        assertEquals(MessageMediaEdit.PHOTO, MessageMediaEdit.wantedKind("image/PNG"));
        assertEquals(MessageMediaEdit.PHOTO, MessageMediaEdit.wantedKind("image/webp"));
        assertEquals(MessageMediaEdit.ANIMATION, MessageMediaEdit.wantedKind("image/gif"));
        assertEquals(MessageMediaEdit.VIDEO, MessageMediaEdit.wantedKind("video/mp4"));
        assertEquals(MessageMediaEdit.VIDEO, MessageMediaEdit.wantedKind("video/webm"));
        assertEquals(MessageMediaEdit.AUDIO, MessageMediaEdit.wantedKind("audio/mpeg"));
        assertEquals(MessageMediaEdit.AUDIO, MessageMediaEdit.wantedKind("audio/mp4"));
        // Un HEIC no es una de las tres fotos que el puente sabe montar, así que viaja como documento: la misma
        // clasificación que hace el envío suelto, no una regla nueva inventada aquí.
        assertEquals(MessageMediaEdit.DOCUMENT, MessageMediaEdit.wantedKind("image/heic"));
        assertEquals(MessageMediaEdit.DOCUMENT, MessageMediaEdit.wantedKind("application/pdf"));
        assertEquals(MessageMediaEdit.DOCUMENT, MessageMediaEdit.wantedKind(null));
        assertEquals(MessageMediaEdit.DOCUMENT, MessageMediaEdit.wantedKind(""));
    }

    @Test public void theThreeRefusalsFallInTheOrderTheyAreChecked() {
        // Forma → permiso de Telegram → álbum. Un mensaje de texto con `canEditMedia` cierto no puede colar la
        // segunda frase, y un documento dentro de un álbum sin permiso tiene que oír la de Telegram primero.
        assertEquals(MessageMediaEdit.NOT_MEDIA,
                MessageMediaEdit.problem(true, MessageMediaEdit.NONE, MessageMediaEdit.PHOTO, 0));
        assertEquals(MessageMediaEdit.NOT_MEDIA,
                MessageMediaEdit.problem(false, MessageMediaEdit.NONE, MessageMediaEdit.VIDEO, 42));
        assertEquals(MessageMediaEdit.REFUSED,
                MessageMediaEdit.problem(false, MessageMediaEdit.PHOTO, MessageMediaEdit.DOCUMENT, 42));
        assertEquals(MessageMediaEdit.ALBUM_TYPE,
                MessageMediaEdit.problem(true, MessageMediaEdit.PHOTO, MessageMediaEdit.DOCUMENT, 42));
        assertNull(MessageMediaEdit.problem(true, MessageMediaEdit.PHOTO, MessageMediaEdit.DOCUMENT, 0));
        assertNull(MessageMediaEdit.problem(true, MessageMediaEdit.VIDEO, MessageMediaEdit.PHOTO, 42));
        assertNull(MessageMediaEdit.problem(true, MessageMediaEdit.PHOTO, MessageMediaEdit.PHOTO, 42));
        // Fuera del álbum un audio admite otro audio y un documento otro documento; dentro, la frase del álbum
        // manda también sobre ellos porque la librería no admite otro tipo que foto y vídeo (`TdApi.java:120725`).
        assertNull(MessageMediaEdit.problem(true, MessageMediaEdit.AUDIO, MessageMediaEdit.AUDIO, 0));
        assertEquals(MessageMediaEdit.ALBUM_TYPE, MessageMediaEdit.problem(true, MessageMediaEdit.AUDIO, MessageMediaEdit.DOCUMENT, 42));
    }

    @Test public void insideAnAlbumOnlyPhotoAndVideoSwapBetweenThemselves() {
        assertTrue(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.PHOTO, MessageMediaEdit.VIDEO));
        assertTrue(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.VIDEO, MessageMediaEdit.PHOTO));
        assertTrue(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.PHOTO, MessageMediaEdit.PHOTO));
        assertTrue(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.VIDEO, MessageMediaEdit.VIDEO));
        assertFalse(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.PHOTO, MessageMediaEdit.ANIMATION));
        assertFalse(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.ANIMATION, MessageMediaEdit.PHOTO));
        assertFalse(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.AUDIO, MessageMediaEdit.DOCUMENT));
        assertFalse(MessageMediaEdit.exchangeableInAlbum(MessageMediaEdit.DOCUMENT, MessageMediaEdit.VIDEO));
    }

    @Test public void theExistingCaptionTravelsWithTheNewMedia() {
        // `EditMessageMedia` edita «including message caption» (`TdApi.java:120725`): si el contenido nuevo se arma
        // con un pie vacío, el texto que ya estaba escrito desaparece sin que nadie lo pidiera.
        TdApi.MessagePhoto with = photo("hola", false, false);
        assertSame(with.caption, MessageMediaEdit.captionOf(with));
        assertEquals("hola", MessageMediaEdit.captionOf(with).text);
        assertEquals("hola", MessageMediaEdit.captionOf(video("hola", false, false)).text);
        TdApi.MessagePhoto without = new TdApi.MessagePhoto();
        without.photo = new TdApi.Photo();
        assertEquals("", MessageMediaEdit.captionOf(without).text);
        assertEquals(0, MessageMediaEdit.captionOf(without).entities.length);
        TdApi.MessageText text = new TdApi.MessageText();
        text.text = caption("no cuenta");
        assertEquals("", MessageMediaEdit.captionOf(text).text);
        assertEquals(0, MessageMediaEdit.captionOf(null).entities.length);
    }

    @Test public void theTwoPresentationFlagsComeFromTheThreeContentsThatCarryThem() {
        assertTrue(MessageMediaEdit.showsCaptionAboveMedia(photo("", true, false)));
        assertTrue(MessageMediaEdit.hasSpoiler(photo("", false, true)));
        assertTrue(MessageMediaEdit.showsCaptionAboveMedia(video("", true, true)));
        assertTrue(MessageMediaEdit.hasSpoiler(video("", true, true)));
        TdApi.MessageAnimation quiet = animation();
        assertFalse(quiet.showCaptionAboveMedia);
        assertFalse(quiet.hasSpoiler);
        // Documento y audio no tienen bandera que leer: la librería no las declara en su contenido.
        assertFalse(MessageMediaEdit.showsCaptionAboveMedia(document()));
        assertFalse(MessageMediaEdit.hasSpoiler(document()));
        assertFalse(MessageMediaEdit.showsCaptionAboveMedia(audio()));
        assertFalse(MessageMediaEdit.hasSpoiler(audio()));
        assertFalse(MessageMediaEdit.showsCaptionAboveMedia(null));
        assertFalse(MessageMediaEdit.hasSpoiler(null));
    }

    @Test public void streamingIsOnlyPromisedForTheContainerThatCanCarryIt() {
        assertTrue(MessageMediaEdit.streams("video/mp4"));
        assertTrue(MessageMediaEdit.streams("VIDEO/QuickTime"));
        assertFalse(MessageMediaEdit.streams("video/webm"));
        assertFalse(MessageMediaEdit.streams("video/x-matroska"));
        assertFalse(MessageMediaEdit.streams("image/gif"));
        assertFalse(MessageMediaEdit.streams(null));
    }

    @Test public void theFiveKindsAreTheOnlyWordsTheAlbumRuleKnows() {
        String[] kinds = {MessageMediaEdit.PHOTO, MessageMediaEdit.VIDEO, MessageMediaEdit.ANIMATION,
                MessageMediaEdit.AUDIO, MessageMediaEdit.DOCUMENT};
        for (int i = 0; i < kinds.length; i++) {
            assertNotSame(kinds[i], MessageMediaEdit.NONE);
            for (int j = 0; j < kinds.length; j++) {
                boolean photoOrVideo = (i < 2) == (j < 2) && i < 2;
                assertEquals(kinds[i] + " -> " + kinds[j], photoOrVideo,
                        MessageMediaEdit.exchangeableInAlbum(kinds[i], kinds[j]));
            }
        }
    }
}
