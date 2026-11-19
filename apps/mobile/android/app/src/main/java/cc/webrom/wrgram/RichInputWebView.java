package cc.webrom.wrgram;

import android.content.Context;
import android.os.Bundle;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;

/** IME commitContent for GIFs and Emoji Kitchen images; Unicode remains ordinary text. */
final class RichInputWebView extends WebView {
    interface Receiver {boolean receive(InputContentInfoCompat content,int flags,Bundle options);}
    private final Receiver receiver;
    private boolean composer;
    public RichInputWebView(Context context){this(context,(content,flags,options)->false);}
    RichInputWebView(Context context,Receiver receiver){super(context);this.receiver=receiver;}
    void composer(boolean active){
        if(composer==active)return;composer=active;
        // The keyboard reads MIME types when creating its connection.
        if(hasFocus())((InputMethodManager)getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).restartInput(this);
    }
    @Override public InputConnection onCreateInputConnection(EditorInfo info){
        InputConnection connection=super.onCreateInputConnection(info);
        if(connection==null||!composer)return connection;
        EditorInfoCompat.setContentMimeTypes(info,new String[]{"image/gif","image/png","image/jpeg","image/webp"});
        return InputConnectionCompat.createWrapper(connection,info,(content,flags,options)->composer&&receiver.receive(content,flags,options));
    }
}
