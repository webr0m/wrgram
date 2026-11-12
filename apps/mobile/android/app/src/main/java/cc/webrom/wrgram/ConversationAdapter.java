package cc.webrom.wrgram;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.File;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.ListAdapter;
import androidx.recyclerview.widget.RecyclerView;
import org.drinkless.tdlib.TdApi;
import java.util.Objects;
import java.util.function.LongConsumer;

/** Immutable row snapshots + asynchronous diffs: never rebuild an entire history per TDLib update. */
final class ConversationAdapter extends ListAdapter<ConversationAdapter.Row, ConversationAdapter.Holder> {
    static final class Row {
        final long id;
        final String title, body, meta, initials, previewMime;
        final boolean chat, outgoing;
        final int unread;
        final TdApi.File avatarFile, previewFile;
        Row(long id, String title, String body, String meta, String initials, boolean chat, boolean outgoing, int unread) {
            this(id,title,body,meta,initials,chat,outgoing,unread,null,null,"image/jpeg");
        }
        Row(long id,String title,String body,String meta,String initials,boolean chat,boolean outgoing,int unread,TdApi.File avatarFile,TdApi.File previewFile,String previewMime) {
            this.id = id; this.title = title; this.body = body; this.meta = meta; this.initials = initials;
            this.chat = chat; this.outgoing = outgoing; this.unread = unread;this.avatarFile=avatarFile;this.previewFile=previewFile;this.previewMime=previewMime;
        }
        @Override public boolean equals(Object other) {
            if (!(other instanceof Row)) return false;
            Row row = (Row) other;
            return id == row.id && chat == row.chat && outgoing == row.outgoing && unread == row.unread &&
                fileId(avatarFile)==fileId(row.avatarFile)&&fileId(previewFile)==fileId(row.previewFile)&&Objects.equals(previewMime,row.previewMime)&&
                Objects.equals(title, row.title) && Objects.equals(body, row.body) && Objects.equals(meta, row.meta) && Objects.equals(initials, row.initials);
        }
        @Override public int hashCode() { return Objects.hash(id, title, body, meta, initials, chat, outgoing, unread); }
        private static int fileId(TdApi.File file){return file==null?0:file.id;}
    }

    private final Palette palette;
    private final LongConsumer select;
    private final int font;
    private final boolean compact;
    private final MainActivity activity;
    private final NativeMediaStore media;

    ConversationAdapter(Palette palette, int font, boolean compact, LongConsumer select) {
        this(palette,font,compact,select,null,null);
    }
    ConversationAdapter(Palette palette,int font,boolean compact,LongConsumer select,MainActivity activity,NativeMediaStore media) {
        super(new DiffUtil.ItemCallback<Row>() {
            @Override public boolean areItemsTheSame(@NonNull Row a, @NonNull Row b) { return a.id == b.id && a.chat == b.chat; }
            @Override public boolean areContentsTheSame(@NonNull Row a, @NonNull Row b) { return a.equals(b); }
        });
        this.palette = palette; this.font = font; this.compact = compact; this.select = select;this.activity=activity;this.media=media;
        setHasStableIds(true);
        setStateRestorationPolicy(RecyclerView.Adapter.StateRestorationPolicy.PREVENT_WHEN_EMPTY);
    }
    @Override public long getItemId(int position) { return getItem(position).id; }
    Row row(int position) { return getItem(position); }
    private static int dp(Context context, int value) { return (int) (value * context.getResources().getDisplayMetrics().density + .5f); }
    private static GradientDrawable background(Context context, int color, int radius) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(context, radius)); return drawable;
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final LinearLayout card, labels, headline;
        final FrameLayout avatarFrame;
        final ImageView avatarImage, preview;
        final TextView avatar, title, body, meta, unread;
        final Button menu;
        Holder(LinearLayout outer,LinearLayout card,LinearLayout labels,LinearLayout headline,FrameLayout avatarFrame,
            ImageView avatarImage,ImageView preview,TextView avatar,TextView title,TextView body,TextView meta,TextView unread,Button menu) {
            super(outer); this.card = card; this.labels = labels; this.headline = headline;
            this.avatarFrame=avatarFrame;this.avatarImage=avatarImage;this.preview=preview;this.avatar = avatar; this.title = title; this.body = body; this.meta = meta; this.unread = unread; this.menu = menu;
        }
    }

    @Override @NonNull public Holder onCreateViewHolder(@NonNull ViewGroup parent, int type) {
        Context context = parent.getContext();
        LinearLayout outer = new LinearLayout(context); outer.setOrientation(LinearLayout.VERTICAL);
        outer.setLayoutParams(new RecyclerView.LayoutParams(-1, -2)); outer.setPadding(dp(context, 12), dp(context, 4), dp(context, 12), dp(context, 4));
        LinearLayout card = new LinearLayout(context); card.setOrientation(LinearLayout.HORIZONTAL); card.setGravity(Gravity.CENTER_VERTICAL);
        int vertical = dp(context, compact ? 7 : 12); card.setPadding(dp(context, 13), vertical, dp(context, 13), vertical);
        FrameLayout avatarFrame=new FrameLayout(context);avatarFrame.setBackground(background(context,palette.soft,14));avatarFrame.setClipToOutline(true);
        ImageView avatarImage=new ImageView(context);avatarImage.setScaleType(ImageView.ScaleType.CENTER_CROP);avatarImage.setVisibility(View.GONE);avatarFrame.addView(avatarImage,new FrameLayout.LayoutParams(-1,-1));
        TextView avatar = new TextView(context); avatar.setGravity(Gravity.CENTER); avatar.setTextSize(19); avatar.setTextColor(palette.accent);avatarFrame.addView(avatar,new FrameLayout.LayoutParams(-1,-1));
        card.addView(avatarFrame, new LinearLayout.LayoutParams(dp(context, 44), dp(context, 44)));
        LinearLayout labels = new LinearLayout(context); labels.setOrientation(LinearLayout.VERTICAL);
        LinearLayout headline = new LinearLayout(context); headline.setOrientation(LinearLayout.HORIZONTAL); headline.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(context); title.setTextSize(font); title.setTypeface(null, Typeface.BOLD); title.setMaxLines(2); title.setTextColor(palette.ink);
        headline.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button menu = new Button(context); menu.setText("⋮"); menu.setTextSize(20); menu.setTextColor(palette.accent); menu.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        menu.setMinWidth(0); menu.setMinimumWidth(0); menu.setContentDescription("Opciones del mensaje"); headline.addView(menu, new LinearLayout.LayoutParams(dp(context, 48), dp(context, 48)));
        ImageView preview=new ImageView(context);preview.setScaleType(ImageView.ScaleType.CENTER_CROP);preview.setBackground(background(context,palette.soft,10));preview.setClipToOutline(true);preview.setVisibility(View.GONE);LinearLayout.LayoutParams previewParams=new LinearLayout.LayoutParams(dp(context,220),dp(context,140));previewParams.bottomMargin=dp(context,6);labels.addView(preview,previewParams);
        TextView body = new TextView(context); body.setTextSize(font); body.setTextColor(palette.ink); body.setLineSpacing(dp(context, 2), 1f);
        TextView meta = new TextView(context); meta.setTextSize(11); meta.setTextColor(palette.muted); meta.setGravity(Gravity.END);
        labels.addView(headline); labels.addView(body); labels.addView(meta);
        card.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
        TextView unread = new TextView(context); unread.setTextSize(12); unread.setGravity(Gravity.CENTER); unread.setTextColor(palette.onAccent); unread.setPadding(dp(context, 7), dp(context, 4), dp(context, 7), dp(context, 4)); unread.setBackground(background(context, palette.accent, 8)); card.addView(unread);
        outer.addView(card, new LinearLayout.LayoutParams(-1, -2));
        return new Holder(outer,card,labels,headline,avatarFrame,avatarImage,preview,avatar,title,body,meta,unread,menu);
    }

    @Override public void onBindViewHolder(@NonNull Holder holder, int position) {
        Row row = getItem(position); Context context = holder.itemView.getContext();
        holder.title.setText(row.title); holder.body.setText(row.body); holder.meta.setText(row.meta);
        holder.avatar.setText(row.initials);holder.avatar.setVisibility(View.VISIBLE);holder.avatarImage.setTag(null);holder.avatarImage.setImageDrawable(null);holder.avatarImage.setVisibility(View.GONE);holder.avatarFrame.setVisibility(row.chat?View.VISIBLE:View.GONE);holder.preview.setTag(null);holder.preview.setImageDrawable(null);holder.preview.setVisibility(View.GONE);holder.unread.setText(String.valueOf(row.unread));
        if(row.chat&&row.avatarFile!=null)loadThumbnail(row.avatarFile,"image/jpeg",holder.avatarImage,holder.avatar);
        if(!row.chat&&row.previewFile!=null)loadThumbnail(row.previewFile,row.previewMime,holder.preview,null);
        holder.menu.setVisibility(row.chat ? View.GONE : View.VISIBLE);
        holder.unread.setVisibility(row.chat && row.unread > 0 ? View.VISIBLE : View.GONE);
        holder.meta.setVisibility(row.meta.isEmpty() ? View.GONE : View.VISIBLE);
        holder.labels.setPadding(row.chat ? dp(context, 12) : 0, 0, 0, 0);
        holder.body.setMaxLines(row.chat ? 2 : Integer.MAX_VALUE);
        holder.body.setEllipsize(row.chat ? android.text.TextUtils.TruncateAt.END : null);
        holder.body.setTextSize(row.chat ? font - 2 : font);
        holder.body.setTextColor(row.chat ? palette.muted : palette.ink);
        holder.title.setTextSize(row.chat ? font : font - 2);
        holder.title.setTextColor(row.chat ? palette.ink : palette.accent);
        holder.card.setBackground(background(context, !row.chat && row.outgoing ? palette.outgoing : palette.surface, 14));
        LinearLayout.LayoutParams layout = (LinearLayout.LayoutParams) holder.card.getLayoutParams();
        layout.setMarginStart(!row.chat && row.outgoing ? dp(context, 24) : 0); layout.setMarginEnd(!row.chat && !row.outgoing ? dp(context, 24) : 0); holder.card.setLayoutParams(layout);
        holder.card.setOnClickListener(row.chat ? view -> select.accept(row.id) : null);
        holder.card.setOnLongClickListener(row.chat ? null : view -> { select.accept(row.id); return true; });
        holder.menu.setOnClickListener(view -> select.accept(row.id));
        holder.card.setFocusable(row.chat);
        if (row.chat) holder.card.setContentDescription(row.title + ", " + row.unread + " sin leer");
        else holder.card.setContentDescription(null);
    }

    private void loadThumbnail(TdApi.File file,String mime,ImageView image,TextView initials){
        if(activity==null||media==null||file==null)return;
        final int id=file.id;image.setTag(id);
        try{
            org.json.JSONObject dto=media.register(file,mime,mime!=null&&mime.startsWith("video/")?"video":"image","Miniatura");
            if(dto.getBoolean("ready"))showThumbnail(id,image,initials);
            else media.load(id,ignored->showThumbnail(id,image,initials),error->{});
        }catch(Exception ignored){}
    }
    private void showThumbnail(int id,ImageView image,TextView initials){
        File file=media==null?null:media.displayFile(id);if(file==null)return;
        String mime=media==null?"image/jpeg":media.mimeType(id);
        activity.storageTask(()->decode(file,mime),bitmap->{if(bitmap==null||!(image.getTag() instanceof Integer)||((Integer)image.getTag())!=id)return;image.setImageBitmap(bitmap);image.setVisibility(View.VISIBLE);if(initials!=null){initials.setText("");initials.setVisibility(View.GONE);}},"No se pudo cargar la miniatura.");
    }
    private static Bitmap decode(File file,String mime){
        if(mime!=null&&mime.startsWith("video/")){
            android.media.MediaMetadataRetriever retriever=new android.media.MediaMetadataRetriever();
            try{retriever.setDataSource(file.getAbsolutePath());return retriever.getFrameAtTime(0,android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);}
            finally{try{retriever.release();}catch(Exception ignored){}}
        }
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getAbsolutePath(),bounds);
        if(bounds.outWidth<=0||bounds.outHeight<=0)return null;
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(bounds.outWidth/options.inSampleSize>720||bounds.outHeight/options.inSampleSize>540)options.inSampleSize*=2;
        return BitmapFactory.decodeFile(file.getAbsolutePath(),options);
    }
}
