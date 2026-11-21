package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class AccountBackgroundsTest {
    private static TdApi.BackgroundType fill(TdApi.BackgroundFill value) {
        TdApi.BackgroundTypeFill type = new TdApi.BackgroundTypeFill();
        type.fill = value;
        return type;
    }

    private static TdApi.BackgroundFillSolid solid(int color) {
        TdApi.BackgroundFillSolid fill = new TdApi.BackgroundFillSolid();
        fill.color = color;
        return fill;
    }

    private static TdApi.BackgroundFillGradient gradient(int top, int bottom, int angle) {
        TdApi.BackgroundFillGradient fill = new TdApi.BackgroundFillGradient();
        fill.topColor = top;
        fill.bottomColor = bottom;
        fill.rotationAngle = angle;
        return fill;
    }

    private static TdApi.BackgroundFillFreeformGradient freeform(int... colors) {
        TdApi.BackgroundFillFreeformGradient fill = new TdApi.BackgroundFillFreeformGradient();
        fill.colors = colors;
        return fill;
    }

    private static TdApi.Background background(long id, String name, boolean dark, boolean selected,
                                               TdApi.BackgroundType type) {
        TdApi.Background background = new TdApi.Background();
        background.id = id;
        background.name = name;
        background.isDark = dark;
        background.isDefault = selected;
        background.type = type;
        return background;
    }

    @Test public void onlyTheFourKnownTypesGetAName() {
        assertEquals(AccountBackgrounds.FILL, AccountBackgrounds.kindOf(fill(solid(0x102030))));
        assertEquals(AccountBackgrounds.PATTERN, AccountBackgrounds.kindOf(new TdApi.BackgroundTypePattern()));
        assertEquals(AccountBackgrounds.WALLPAPER, AccountBackgrounds.kindOf(new TdApi.BackgroundTypeWallpaper()));
        assertEquals(AccountBackgrounds.CHAT_THEME, AccountBackgrounds.kindOf(new TdApi.BackgroundTypeChatTheme()));
        assertEquals("", AccountBackgrounds.kindOf(null));
    }

    @Test public void aWallpaperAndAChatThemeHaveNothingToPaint() {
        TdApi.BackgroundTypeWallpaper wallpaper = new TdApi.BackgroundTypeWallpaper();
        wallpaper.isBlurred = true;
        wallpaper.isMoving = true;
        assertNull(AccountBackgrounds.css(wallpaper));
        TdApi.BackgroundTypeChatTheme theme = new TdApi.BackgroundTypeChatTheme();
        theme.themeName = "sunset";
        assertNull(AccountBackgrounds.css(theme));
    }

    @Test public void aSolidFillBecomesItsRgbHex() {
        assertEquals("#102030", AccountBackgrounds.css(fill(solid(0xff102030))));
        assertEquals("#000000", AccountBackgrounds.css(fill(solid(0))));
    }

    @Test public void theGradientAngleIsReadFromTheTopByTelegramAndFromTheBottomByCss() {
        assertEquals("linear-gradient(180deg, #ff0000, #0000ff)",
            AccountBackgrounds.css(fill(gradient(0xff0000, 0x0000ff, 0))));
        assertEquals("linear-gradient(225deg, #ff0000, #0000ff)",
            AccountBackgrounds.css(fill(gradient(0xff0000, 0x0000ff, 45))));
        assertEquals("linear-gradient(270deg, #ff0000, #0000ff)",
            AccountBackgrounds.css(fill(gradient(0xff0000, 0x0000ff, 90))));
        assertEquals("linear-gradient(0deg, #ff0000, #0000ff)",
            AccountBackgrounds.css(fill(gradient(0xff0000, 0x0000ff, 180))));
        assertEquals("linear-gradient(135deg, #ff0000, #0000ff)",
            AccountBackgrounds.css(fill(gradient(0xff0000, 0x0000ff, 315))));
    }

    @Test public void aFreeformFillNeedsThreeOrFourColorsAndKeepsTheirOrder() {
        assertEquals("linear-gradient(180deg, #010203, #040506, #070809)",
            AccountBackgrounds.css(fill(freeform(0x010203, 0x040506, 0x070809))));
        assertEquals("linear-gradient(180deg, #010203, #040506, #070809, #0a0b0c)",
            AccountBackgrounds.css(fill(freeform(0x010203, 0x040506, 0x070809, 0x0a0b0c))));
        assertNull(AccountBackgrounds.css(fill(freeform(0x010203, 0x040506))));
        assertNull(AccountBackgrounds.css(fill(freeform())));
    }

    @Test public void aPatternPaintsItsFillAndNotItsStamp() {
        TdApi.BackgroundTypePattern pattern = new TdApi.BackgroundTypePattern();
        pattern.fill = solid(0x0f1e2d);
        pattern.intensity = 55;
        pattern.isInverted = true;
        assertEquals("#0f1e2d", AccountBackgrounds.css(pattern));
        assertEquals(AccountBackgrounds.PATTERN, AccountBackgrounds.kindOf(pattern));
    }

    @Test public void oneHexColorWithoutBottomIsASolidFill() throws Exception {
        TdApi.BackgroundType type = AccountBackgrounds.fillType("#0a141e", null, 0);
        assertEquals(AccountBackgrounds.FILL, AccountBackgrounds.kindOf(type));
        assertEquals("#0a141e", AccountBackgrounds.css(type));
        assertEquals("#0a141e", AccountBackgrounds.css(AccountBackgrounds.fillType("#0a141e", "#0a141e", 90)));
        assertEquals("#0a141e", AccountBackgrounds.css(AccountBackgrounds.fillType("#0a141e", "", 90)));
    }

    @Test public void twoColorsBecomeAGradientWithTheAngleTelegramAccepts() {
        TdApi.BackgroundType type = AccountBackgrounds.fillType("#ff0000", "#0000ff", 45);
        assertTrue(type instanceof TdApi.BackgroundTypeFill);
        TdApi.BackgroundFillGradient fill = (TdApi.BackgroundFillGradient) ((TdApi.BackgroundTypeFill) type).fill;
        assertEquals(0xff0000, fill.topColor);
        assertEquals(0x0000ff, fill.bottomColor);
        assertEquals(45, fill.rotationAngle);
        assertEquals("linear-gradient(225deg, #ff0000, #0000ff)", AccountBackgrounds.css(type));
    }

    @Test public void anAlphaHexReachesTelegramAsRgbOnly() {
        TdApi.BackgroundType type = AccountBackgrounds.fillType("#0a141e80", null, 0);
        assertEquals("#0a141e", AccountBackgrounds.css(type));
    }

    @Test public void anAngleThatIsNotMultipleOfFortyFiveIsRefusedWithItsWord() {
        for (int angle : new int[] {1, 44, 46, 359, -45}) {
            try {
                AccountBackgrounds.fillType("#ff0000", "#0000ff", angle);
                fail("el ángulo " + angle + " tendría que haberse rechazado");
            } catch (IllegalArgumentException expected) {
                assertEquals(AccountBackgrounds.BAD_ANGLE, expected.getMessage());
            }
        }
    }

    @Test public void theAngleArrivesAsNumberOrAsTextAndNothingElse() {
        assertEquals(45, AccountBackgrounds.angleOf("45"));
        assertEquals(-45, AccountBackgrounds.angleOf(" -45 "));
        assertEquals(0, AccountBackgrounds.angleOf("0"));
        for (String value : new String[] {"", "  ", "cuarenta", "45grados", "45.0", null}) {
            try {
                AccountBackgrounds.angleOf(value);
                fail("el ángulo «" + value + "» tendría que haberse rechazado");
            } catch (IllegalArgumentException expected) {
                assertEquals(AccountBackgrounds.BAD_ANGLE, expected.getMessage());
            }
        }
    }

    @Test public void aColorOutsideTheTwoFormatsIsRefusedWithItsWord() {
        for (String value : new String[] {"rojo", "ffffff", "#ff00gg", "#fff", null, ""}) {
            try {
                AccountBackgrounds.fillType(value, null, 0);
                fail("el color " + value + " tendría que haberse rechazado");
            } catch (IllegalArgumentException expected) {
                assertEquals(AccountBackgrounds.BAD_COLOR, expected.getMessage());
            }
        }
    }

    @Test public void theIdentifierTravelsAsTextSoJavaScriptDoesNotRoundIt() throws Exception {
        JSONObject row = AccountBackgrounds.row(
            background(8214925438721492L, "Fondo oscuro", true, false, fill(solid(0x010203))), "8214925438721492");
        assertEquals("8214925438721492", row.getString("id"));
        assertEquals("Fondo oscuro", row.getString("name"));
        assertTrue(row.getBoolean("dark"));
        assertFalse(row.getBoolean("stock"));
        assertTrue(row.getBoolean("selected"));
        assertEquals(AccountBackgrounds.FILL, row.getString("kind"));
        assertEquals("#010203", row.getString("css"));
    }

    @Test public void onlyTheBackgroundChosenInThisSessionCountsAsSelected() throws Exception {
        JSONObject row = AccountBackgrounds.row(background(12, "Uno", false, false, fill(solid(0))), "13");
        assertFalse(row.getBoolean("selected"));
        assertTrue(AccountBackgrounds.row(background(13, "Dos", false, false, fill(solid(0))), "13")
            .getBoolean("selected"));
        assertFalse(AccountBackgrounds.row(background(13, "Dos", false, false, fill(solid(0))), "").getBoolean("selected"));
    }

    @Test public void anUnpaintableRowStillShowsItsNameWithTheCssAbsent() throws Exception {
        JSONObject row = AccountBackgrounds.row(
            background(7, "Tapiz", false, true, new TdApi.BackgroundTypeWallpaper()), "7");
        assertEquals("7", row.getString("id"));
        assertTrue(row.getBoolean("selected"));
        assertTrue("isDefault significa que Telegram lo trae de serie", row.getBoolean("stock"));
        assertEquals(AccountBackgrounds.WALLPAPER, row.getString("kind"));
        assertTrue(row.isNull("css"));
    }

    @Test public void aNameThatTdLibDidNotFillBecomesEmptyNotBroken() throws Exception {
        assertEquals("", AccountBackgrounds.row(background(1, null, false, false, fill(solid(0))), "").getString("name"));
    }

    @Test public void theListKeepsEveryRowAndSurvivesWithoutNada() throws Exception {
        JSONArray rows = AccountBackgrounds.rows(new TdApi.Background[] {
            background(1, "Liso", false, true, fill(solid(0x0a141e))),
            background(2, "Degradado", true, false, fill(gradient(0xff0000, 0x0000ff, 180))),
            background(3, "Tapiz", false, false, new TdApi.BackgroundTypeWallpaper()),
            null}, "1");
        assertEquals(3, rows.length());
        assertEquals("Liso", rows.getJSONObject(0).getString("name"));
        assertTrue(rows.getJSONObject(0).getBoolean("selected"));
        assertEquals("linear-gradient(0deg, #ff0000, #0000ff)", rows.getJSONObject(1).getString("css"));
        assertTrue(rows.getJSONObject(2).isNull("css"));
        assertEquals(0, AccountBackgrounds.rows(null, "").length());
    }

    private static String rowText(long id, String name) throws Exception {
        return AccountBackgrounds.row(background(id, name, id % 2 == 0, false, fill(solid(0x0a141e))),
            String.valueOf(id)).toString();
    }

    @Test public void theStoreKeepsOneRowPerModeAndNamesItsOwner() throws Exception {
        String stored = AccountBackgrounds.putSlot("", "42", false, rowText(7, "Claro"));
        stored = AccountBackgrounds.putSlot(stored, "42", true, rowText(9, "Oscuro"));
        assertTrue(stored.contains("\"owner\":\"42\""));
        assertEquals("7", AccountBackgrounds.chosenId(stored, "42", false));
        assertEquals("9", AccountBackgrounds.chosenId(stored, "42", true));
        assertEquals("Claro", new JSONObject(AccountBackgrounds.slot(stored, false)).getString("name"));
        assertEquals("Oscuro", new JSONObject(AccountBackgrounds.slot(stored, true)).getString("name"));
    }

    @Test public void writingOneModeLeavesTheOtherAlone() throws Exception {
        String stored = AccountBackgrounds.putSlot(AccountBackgrounds.putSlot("", "42", true, rowText(9, "Oscuro")),
            "42", false, rowText(7, "Claro"));
        stored = AccountBackgrounds.putSlot(stored, "42", true, rowText(11, "Oscuro nuevo"));
        assertEquals("7", AccountBackgrounds.chosenId(stored, "42", false));
        assertEquals("11", AccountBackgrounds.chosenId(stored, "42", true));
    }

    @Test public void aSlotPutToNullFreesItsModeAndKeepsTheOther() throws Exception {
        String stored = AccountBackgrounds.putSlot(AccountBackgrounds.putSlot("", "42", false, rowText(7, "Claro")),
            "42", true, rowText(9, "Oscuro"));
        stored = AccountBackgrounds.putSlot(stored, "42", true, null);
        assertEquals("", AccountBackgrounds.slot(stored, true));
        assertEquals("", AccountBackgrounds.chosenId(stored, "42", true));
        assertEquals("7", AccountBackgrounds.chosenId(stored, "42", false));
        assertEquals(1, AccountBackgrounds.slots(stored, "42").length());
    }

    @Test public void aStoreWithoutOwnerOrRowKeepsWhatItHad() throws Exception {
        String stored = AccountBackgrounds.putSlot("", "42", false, rowText(7, "Claro"));
        assertEquals(stored, AccountBackgrounds.putSlot(stored, null, true, rowText(9, "Oscuro")));
        assertEquals(stored, AccountBackgrounds.putSlot(stored, "", true, rowText(9, "Oscuro")));
        assertEquals(stored, AccountBackgrounds.putSlot(stored, "42", true, "{no es json"));
        assertEquals("", AccountBackgrounds.slot(stored, true));
        assertEquals("7", AccountBackgrounds.chosenId(stored, "42", false));
    }

    @Test public void anotherAccountDoesNotGetTheRowsOfThisOne() throws Exception {
        String stored = AccountBackgrounds.putSlot("", "42", false, rowText(7, "Claro"));
        assertEquals("", AccountBackgrounds.chosenId(stored, "43", false));
        assertEquals("", AccountBackgrounds.chosenId(stored, "", false));
        assertEquals("", AccountBackgrounds.chosenId(stored, null, false));
        assertEquals(0, AccountBackgrounds.slots(stored, "43").length());
        assertEquals(0, AccountBackgrounds.slots(stored, null).length());
    }

    @Test public void aStoreWrittenWithOnlyTheOwnerStillTakesARow() throws Exception {
        String stored = AccountBackgrounds.putSlot("{\"owner\":\"42\"}", "42", false, rowText(7, "Claro"));
        assertEquals("7", AccountBackgrounds.chosenId(stored, "42", false));
        assertEquals(1, AccountBackgrounds.slots(stored, "42").length());
    }

    @Test public void aBrokenOrEmptyStoreReadsAsNothingPuesto() throws Exception {
        for (String stored : new String[] {"", null, "{", "{\"owner\":42}", "{\"light\":\"no fila\"}"}) {
            assertEquals("", AccountBackgrounds.slot(stored, false));
            assertEquals("", AccountBackgrounds.chosenId(stored, "42", false));
            assertEquals(0, AccountBackgrounds.slots(stored, "42").length());
        }
    }

    @Test public void thePublishedSlotsCarryTheRowSoTheUiPaintsWithoutAskingAgain() throws Exception {
        String stored = AccountBackgrounds.putSlot(AccountBackgrounds.putSlot("", "42", false, rowText(7, "Claro")),
            "42", true, rowText(9, "Oscuro"));
        JSONObject slots = AccountBackgrounds.slots(stored, "42");
        assertEquals("#0a141e", slots.getJSONObject("dark").getString("css"));
        assertEquals("7", slots.getJSONObject("light").getString("id"));
        assertTrue("la fila publicada dice qué estaba puesto", slots.getJSONObject("light").getBoolean("selected"));
        assertFalse(slots.has("owner"));
    }
}
