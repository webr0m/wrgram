package cc.webrom.wrgram;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;
import java.io.File;

/** Full-screen ExoPlayer for a video already downloaded into the app sandbox. */
@SuppressLint("UnsafeOptInUsageError")
public final class PlayerActivity extends Activity {
    static final String EXTRA_FILE="file",EXTRA_TITLE="title",EXTRA_POSITION="position",EXTRA_MIME="mime",EXTRA_EXTERNAL="external";
    private ExoPlayer player;
    private PlayerView video;
    private File file;
    private boolean immersive, resume, failed;
    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON|WindowManager.LayoutParams.FLAG_SECURE);
        file=playable(getIntent().getStringExtra(EXTRA_FILE));
        if(file==null){finish();return;}
        String title=getIntent().getStringExtra(EXTRA_TITLE);
        player=new ExoPlayer.Builder(this,new DefaultRenderersFactory(this).setEnableDecoderFallback(true))
                .setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(10_000).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);
        video=new PlayerView(this);
        video.setPlayer(player);
        video.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        video.setShowSubtitleButton(true);
        video.setShowPreviousButton(false);
        video.setShowNextButton(false);
        video.setBackgroundColor(Color.BLACK);
        video.setFullscreenButtonClickListener(this::fullscreen);
        FrameLayout surface=new FrameLayout(this);
        surface.addView(video,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(0xc4161c28);
        TextView back=control("‹","Volver al chat");
        back.setOnClickListener(view->finish());
        header.addView(back,new LinearLayout.LayoutParams(dp(52),dp(50)));
        TextView name=new TextView(this);
        name.setTextColor(Color.WHITE);
        name.setTextSize(16);
        name.setMaxLines(1);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setText(title==null||title.isBlank()?file.getName():title);
        header.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        TextView options=control("⋮","Opciones de reproducción");
        options.setOnClickListener(this::options);
        header.addView(options,new LinearLayout.LayoutParams(dp(52),dp(50)));
        surface.addView(header,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
        video.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility->header.setVisibility(visibility));
        ViewCompat.setOnApplyWindowInsetsListener(surface,(view,insets)->{
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            return insets;
        });
        setContentView(surface);
        if(title!=null&&!title.isBlank())setTitle(title);
        player.setMediaItem(new MediaItem.Builder().setUri(Uri.fromFile(file)).setMediaMetadata(new MediaMetadata.Builder().setTitle(title==null?"":title).build()).build());
        player.addListener(new Player.Listener(){
            @Override public void onPlayerError(PlaybackException error){playbackError();}
        });
        long position=state==null?getIntent().getLongExtra(EXTRA_POSITION,0):state.getLong(EXTRA_POSITION);
        player.seekTo(Math.max(0,position));
        player.setPlaybackSpeed(state==null?1f:state.getFloat("speed",1f));
        if(state!=null){video.setResizeMode(state.getInt("resize",AspectRatioFrameLayout.RESIZE_MODE_FIT));fullscreen(state.getBoolean("fullscreen"));}
        player.setPlayWhenReady(state==null||state.getBoolean("playing",true));
        player.prepare();
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private TextView control(String glyph,String description){
        TextView view=new TextView(this);
        view.setGravity(Gravity.CENTER);
        view.setTextColor(Color.WHITE);
        view.setTextSize(30);
        view.setText(glyph);
        view.setContentDescription(description);
        view.setFocusable(true);
        return view;
    }
    private void options(View anchor){
        PopupMenu menu=new PopupMenu(this,anchor);
        menu.getMenu().add(0,1,0,"Velocidad");
        menu.getMenu().add(0,2,1,"Pista de audio").setEnabled(player.getCurrentTracks().isTypeSupported(C.TRACK_TYPE_AUDIO));
        menu.getMenu().add(0,3,2,"Subtítulos").setEnabled(player.getCurrentTracks().isTypeSupported(C.TRACK_TYPE_TEXT));
        menu.getMenu().add(0,4,3,video.getResizeMode()==AspectRatioFrameLayout.RESIZE_MODE_FIT?"Llenar pantalla":"Ajustar al encuadre");
        menu.getMenu().add(0,5,4,"Girar pantalla");
        if(getIntent().getBooleanExtra(EXTRA_EXTERNAL,false))menu.getMenu().add(0,6,5,"Abrir con otra app");
        menu.setOnMenuItemClickListener(item->{
            switch(item.getItemId()){
                case 1 -> speeds();
                case 2 -> tracks(C.TRACK_TYPE_AUDIO,"Pista de audio");
                case 3 -> tracks(C.TRACK_TYPE_TEXT,"Subtítulos");
                case 4 -> video.setResizeMode(video.getResizeMode()==AspectRatioFrameLayout.RESIZE_MODE_FIT?AspectRatioFrameLayout.RESIZE_MODE_ZOOM:AspectRatioFrameLayout.RESIZE_MODE_FIT);
                case 5 -> setRequestedOrientation(getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE?
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT:ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                case 6 -> external();
            }
            return true;
        });
        menu.show();
    }
    private void speeds(){
        float[] speeds={0.5f,0.75f,1f,1.25f,1.5f,1.75f,2f,2.5f,3f};
        String[] labels={"0,5×","0,75×","Normal","1,25×","1,5×","1,75×","2×","2,5×","3×"};
        int selected=-1;
        for(int i=0;i<speeds.length;i++)if(speeds[i]==player.getPlaybackParameters().speed)selected=i;
        Dialogs.builder(this).setTitle("Velocidad").setSingleChoiceItems(labels,selected,(dialog,index)->{
            player.setPlaybackSpeed(speeds[index]);dialog.dismiss();
        }).setNegativeButton("Cerrar",null).show();
    }
    private void tracks(int type,String title){
        new TrackSelectionDialogBuilder(this,title,player,type).setShowDisableOption(type==C.TRACK_TYPE_TEXT).build().show();
    }
    private void fullscreen(boolean enabled){
        immersive=enabled;
        WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),video);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if(enabled)controller.hide(WindowInsetsCompat.Type.systemBars());
        else controller.show(WindowInsetsCompat.Type.systemBars());
        video.setFullscreenButtonState(enabled);
    }
    private void external(){
        try{FileViewers.open(this,file,FileViewers.mime(getIntent().getStringExtra(EXTRA_MIME),file));}
        catch(android.content.ActivityNotFoundException|SecurityException ignored){
            Dialogs.builder(this).setTitle("Visor de Android").setMessage("No hay una app compatible para este formato.").setPositiveButton("Aceptar",null).show();
        }
    }
    private void playbackError(){
        if(failed)return;
        failed=true;
        android.app.AlertDialog.Builder dialog=Dialogs.builder(this).setTitle("Este vídeo no se puede reproducir")
                .setMessage("El archivo o su códec no es compatible con el reproductor de este dispositivo.")
                .setPositiveButton("Volver",(box,button)->finish());
        if(getIntent().getBooleanExtra(EXTRA_EXTERNAL,false))dialog.setNeutralButton("Abrir con otra app",(box,button)->external());
        dialog.show();
    }
    private File playable(String path){
        if(path==null||path.isBlank())return null;
        try{
            File file=new File(path).getCanonicalFile();
            if(!file.isFile()||file.length()<=0)return null;
            for(File root:new File[]{getNoBackupFilesDir(),getFilesDir(),getCacheDir(),getExternalFilesDir(null)}){
                if(root==null)continue;
                if(file.getPath().startsWith(root.getCanonicalPath()+File.separator))return file;
            }
        }catch(Exception ignored){}
        return null;
    }
    @Override protected void onSaveInstanceState(Bundle out){
        if(player!=null){
            out.putLong(EXTRA_POSITION,player.getCurrentPosition());
            out.putBoolean("playing",player.getPlayWhenReady()||resume);
            out.putFloat("speed",player.getPlaybackParameters().speed);
            out.putInt("resize",video.getResizeMode());
            out.putBoolean("fullscreen",immersive);
        }
        super.onSaveInstanceState(out);
    }
    @Override protected void onStart(){super.onStart();if(player!=null&&resume&&!failed)player.play();}
    @Override protected void onStop(){super.onStop();if(player!=null){resume=player.getPlayWhenReady();player.pause();}}
    @Override protected void onDestroy(){if(player!=null){player.release();player=null;}super.onDestroy();}
}
