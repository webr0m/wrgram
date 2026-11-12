package cc.webrom.wrgram;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Owner-supplied identities. No bot tokens, guessed domains, payments or auto-enrolment. */
final class BuiltInApps {
    static final class App {
        final String id,username,name,description,category;
        App(String id,String username,String name,String description,String category){this.id=id;this.username=username;this.name=name;this.description=description;this.category=category;}
    }
    static final List<App> ALL=Collections.unmodifiableList(Arrays.asList(
        new App("groupbutler","GroupButlerEsp_bot","Group Butler Español","Administración de grupos.","grupos"),
        new App("antiu","antiubot","AntiU","Control de grupos contra bots y usuarios automatizados.","grupos"),
        new App("compressor","anycompressorbot","Any Compressor","Compresión de archivos en distintos formatos.","archivos"),
        new App("shorten","WRShorten_bot","WR Shorten","Acortador de URLs.","enlaces"),
        new App("downloads","mutidlprobot","MultiDL Pro","Descargas de archivos y medios con autorización del titular.","archivos"),
        new App("snake","Wrsnakebot","WR Snake","Juego Snake mediante Mini App.","juegos")
    ));
    static App require(String id){return ALL.stream().filter(app->app.id.equals(id)).findFirst().orElseThrow(()->new IllegalArgumentException("Unknown built-in app"));}
    static JSONArray json()throws Exception{JSONArray items=new JSONArray();for(App app:ALL)items.put(new JSONObject().put("id",app.id).put("username",app.username).put("name",app.name).put("description",app.description).put("category",app.category).put("builtIn",true));return items;}
}
