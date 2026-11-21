package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/**
 * El fondo de la cuenta se puede leer y escribir, pero solo se pinta lo que viene como relleno.
 * `GetInstalledBackgrounds` (TdApi.java:128958) devuelve `Backgrounds` (TdApi.java:5411) con cada
 * `Background` (TdApi.java:4982) en `id`, `isDefault`, `isDark`, `name`, `document` (TdApi.java:5002) y
 * `type`, y `SetDefaultBackground` (TdApi.java:152518) admite `background` nulo —el documento dice «pass
 * null to create a new filled background»— con tal de darle el `type`. Los tres rellenos son datos puros:
 * `BackgroundFillSolid` (TdApi.java:5079) trae un color, `BackgroundFillGradient` (TdApi.java:5117) dos con
 * su `rotationAngle` «Must always be divisible by 45», y `BackgroundFillFreeformGradient` (TdApi.java:5167)
 * «A list of 3 or 4 colors», todos en RGB. Lo que no tiene relleno no se pinta: un
 * `BackgroundTypeWallpaper` (TdApi.java:5235) en este vendado solo declara `isBlurred` e `isMoving` —su
 * comentario «A wallpaper in JPEG format» no llega a campo alguno— y la imagen vive en el `document` de
 * arriba, que hay que bajar por el conducto de medios; `BackgroundTypeChatTheme` (TdApi.java:5373) tampoco
 * tiene más que `themeName`. De `BackgroundTypePattern` (TdApi.java:5279) sí se pinta su `fill`, y se dice
 * por escrito que el estampado —un PNG o TGV— queda sin dibujar. Esta clase es la única que decide qué se
 * pinta y con qué palabra.
 */
final class AccountBackgrounds {
    /** Los cuatro tipos que TDLib sabe traer en `Background.type`. */
    static final String FILL = "fill";
    static final String WALLPAPER = "wallpaper";
    static final String PATTERN = "pattern";
    static final String CHAT_THEME = "chatTheme";

    static final String BAD_COLOR = "El color del fondo no está en el formato de Telegram.";
    static final String BAD_ANGLE = "El giro del degradado tiene que ser múltiplo de 45 grados.";
    static final String NOTHING = "Hay que decir qué fondo elegir o qué colores ponerle.";

    private AccountBackgrounds() {}

    /** El tipo con su nombre estable, para que la pantalla no tenga que adivinar de qué rama se trata. */
    static String kindOf(TdApi.BackgroundType type) {
        if (type instanceof TdApi.BackgroundTypeFill) return FILL;
        if (type instanceof TdApi.BackgroundTypeWallpaper) return WALLPAPER;
        if (type instanceof TdApi.BackgroundTypePattern) return PATTERN;
        if (type instanceof TdApi.BackgroundTypeChatTheme) return CHAT_THEME;
        return "";
    }

    /**
     * La cadena CSS que pinta el relleno, o null si el fondo no tiene relleno que pintar. Un relleno liso es
     * un color; un degradado de dos colores se escribe con el giro de arriba abajo, que es como lo lee el
     * propio Telegram: su `rotationAngle` mide en sentido horario desde la vertical, y CSS mide desde abajo.
     */
    static String css(TdApi.BackgroundType type) {
        TdApi.BackgroundFill fill = fillOf(type);
        if (fill instanceof TdApi.BackgroundFillSolid) return hex(((TdApi.BackgroundFillSolid) fill).color);
        if (fill instanceof TdApi.BackgroundFillGradient) {
            TdApi.BackgroundFillGradient gradient = (TdApi.BackgroundFillGradient) fill;
            return "linear-gradient(" + angle(gradient.rotationAngle) + "deg, "
                + hex(gradient.topColor) + ", " + hex(gradient.bottomColor) + ")";
        }
        if (fill instanceof TdApi.BackgroundFillFreeformGradient) {
            int[] colors = ((TdApi.BackgroundFillFreeformGradient) fill).colors;
            if (colors == null || colors.length < 3 || colors.length > 4) return null;
            StringBuilder stops = new StringBuilder();
            for (int color : colors) {
                if (stops.length() > 0) stops.append(", ");
                stops.append(hex(color));
            }
            return "linear-gradient(180deg, " + stops + ")";
        }
        return null;
    }

    private static TdApi.BackgroundFill fillOf(TdApi.BackgroundType type) {
        if (type instanceof TdApi.BackgroundTypeFill) return ((TdApi.BackgroundTypeFill) type).fill;
        if (type instanceof TdApi.BackgroundTypePattern) return ((TdApi.BackgroundTypePattern) type).fill;
        return null;
    }

    /**
     * Una fila del listado. El identificador viaja en texto porque un `long` de Telegram no cabe en
     * JavaScript, `stock` es el `isDefault` del documento («one of default backgrounds», o sea: de los que
     * trae Telegram, no el elegido), y `selected` lo da la tienda de los dos huecos de abajo:
     * `UpdateDefaultBackground` (TdApi.java:99598) avisa cuando cambia el puesto y `background.set` escribe
     * la misma fila, así que lo elegido en otro aparato sale marcado mientras esta sesión haya visto su
     * aviso. Lo que sigue sin haber es una función que pregunte cuál está puesto: si el cambio ocurrió con
     * WRGram cerrado, la marca llega con el siguiente aviso o con el siguiente puesto.
     */
    static JSONObject row(TdApi.Background background, String chosen) throws Exception {
        String paint = css(background.type);
        String id = String.valueOf(background.id);
        return new JSONObject().put("id", id)
            .put("name", background.name == null ? "" : background.name)
            .put("dark", background.isDark)
            .put("stock", background.isDefault)
            .put("selected", id.equals(chosen))
            .put("kind", kindOf(background.type))
            .put("css", paint == null ? JSONObject.NULL : paint);
    }

    static JSONArray rows(TdApi.Background[] backgrounds, String chosen) throws Exception {
        JSONArray result = new JSONArray();
        if (backgrounds == null) return result;
        for (TdApi.Background background : backgrounds) if (background != null) result.put(row(background, chosen));
        return result;
    }

    /**
     * La tienda de los dos huecos: `{"owner":…,"light":fila,"dark":fila}`. El aviso
     * `UpdateDefaultBackground` (TdApi.java:99598) trae el `Background` nuevo y un `forDarkTheme` que dice a
     * qué modo afecta, y es lo único que Telegram manda; como solo llega mientras la sesión está abierta, lo
     * que se recibe se guarda en las preferencias con el `owner` de la cuenta dentro, para que el fondo de
     * una cuenta no se pinte en la siguiente. Poner la fila a null deja el hueco libre.
     */
    static String putSlot(String stored, String owner, boolean dark, String row) {
        if (owner == null || owner.isEmpty()) return stored;
        JSONObject store = parse(stored);
        try {
            String key = dark ? "dark" : "light";
            if (row == null) store.remove(key);
            else store.put(key, new JSONObject(row));
            store.put("owner", owner);
        } catch (Exception ignored) {
            return stored;
        }
        return store.toString();
    }

    /** El texto de la fila guardada en un hueco, o vacío si el hueco está libre. */
    static String slot(String stored, boolean dark) {
        JSONObject row = parse(stored).optJSONObject(dark ? "dark" : "light");
        return row == null ? "" : row.toString();
    }

    /** El identificador elegido para un modo: vacío si la cuenta cambió o si el hueco está libre. */
    static String chosenId(String stored, String owner, boolean dark) {
        if (owner == null || owner.isEmpty() || !owner.equals(parse(stored).optString("owner"))) return "";
        JSONObject row = parse(stored).optJSONObject(dark ? "dark" : "light");
        return row == null ? "" : row.optString("id", "");
    }

    /** Los dos huecos tal y como se publican en el estado; vacío si la cuenta de la tienda no es esta. */
    static JSONObject slots(String stored, String owner) throws Exception {
        JSONObject result = new JSONObject();
        if (owner == null || owner.isEmpty() || !owner.equals(parse(stored).optString("owner"))) return result;
        for (String key : new String[] {"light", "dark"}) {
            JSONObject row = parse(stored).optJSONObject(key);
            if (row != null) result.put(key, row);
        }
        return result;
    }

    private static JSONObject parse(String json) {
        try {
            return new JSONObject(json == null ? "" : json);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    /**
     * El relleno que se escribe en la cuenta a partir de los colores de la pantalla. El color nulo del
     * `background` es lo que pide TDLib para crear un fondo relleno nuevo, así que aquí no se sube archivo
     * alguno; los que llegan son hex del catálogo compartido, con almohadilla y seis u ocho dígitos, y sin
     * ese formato no se pinta nada: `Palette.parse` también acepta el hex desnudo y aquí no se le deja.
     */
    static TdApi.BackgroundType fillType(String top, String bottom, int rotation) {
        int first = rgb(top);
        if (bottom == null || bottom.isEmpty() || bottom.equals(top)) return wrap(solid(first));
        if (rotation % 45 != 0 || rotation < 0 || rotation > 359) throw new IllegalArgumentException(BAD_ANGLE);
        TdApi.BackgroundFillGradient gradient = new TdApi.BackgroundFillGradient();
        gradient.topColor = first;
        gradient.bottomColor = rgb(bottom);
        gradient.rotationAngle = rotation;
        return wrap(gradient);
    }

    /** El giro puede llegar como número o como texto; lo que no es un entero se rechaza con la palabra del ángulo. */
    static int angleOf(String value) {
        try {
            return Integer.parseInt(value == null ? "" : value.trim());
        } catch (Exception ignored) {
            throw new IllegalArgumentException(BAD_ANGLE);
        }
    }

    private static TdApi.BackgroundType wrap(TdApi.BackgroundFill fill) {
        TdApi.BackgroundTypeFill type = new TdApi.BackgroundTypeFill();
        type.fill = fill;
        return type;
    }

    private static TdApi.BackgroundFill solid(int color) {
        TdApi.BackgroundFillSolid fill = new TdApi.BackgroundFillSolid();
        fill.color = color;
        return fill;
    }

    /** Los dos formatos de Telegram, `#rrggbb` y `#rrggbbaa`, siempre con su almohadilla. */
    private static final String HEX = "#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})";

    private static int rgb(String value) {
        String hex = value == null ? "" : value.trim();
        if (!hex.matches(HEX)) throw new IllegalArgumentException(BAD_COLOR);
        return Palette.parse(hex) & 0xffffff;
    }

    /** El giro con el que CSS pinta lo mismo que Telegram: 0 grados es color de arriba, y CSS mide al revés. */
    private static int angle(int rotation) {
        return (180 + Math.floorMod(rotation, 360)) % 360;
    }

    private static String hex(int color) {
        return String.format(Locale.ROOT, "#%06x", color & 0xffffff);
    }
}
