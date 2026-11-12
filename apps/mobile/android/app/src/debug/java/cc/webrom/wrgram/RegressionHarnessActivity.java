package cc.webrom.wrgram;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import java.util.ArrayList;
import java.util.List;

/** DEBUG ONLY. Synthetic UI performance harness; never opens Telegram or an account. */
public final class RegressionHarnessActivity extends Activity {
    private ConversationAdapter adapter;
    private RecyclerView list;
    private int changed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setBackgroundColor(0xff0d0e10);
        TextView title = new TextView(this); title.setText(R.string.regression_harness_title); title.setTextColor(0xfff0c65c); title.setTextSize(16); body.addView(title);
        adapter = new ConversationAdapter(Palette.get("gold"), 16, false, ignored -> {});
        adapter.registerAdapterDataObserver(new RecyclerView.AdapterDataObserver() {
            @Override public void onItemRangeChanged(int start, int count, Object payload) { changed += count; }
        });
        list = new RecyclerView(this); list.setLayoutManager(new LinearLayoutManager(this)); list.setItemAnimator(null); list.setAdapter(adapter); body.addView(list, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(body);
    }
    public void populate(int count, boolean chats, Runnable done) {
        List<ConversationAdapter.Row> rows = new ArrayList<>();
        for (int i = 1; i <= count; i++) rows.add(new ConversationAdapter.Row(i, "Fixture " + i, "WRGRAM_FIXTURE: dato sintético sin contenido de cuenta", "Prueba local", "W", chats, i % 2 == 0, 0));
        adapter.submitList(rows, done);
    }
    public void changeOne(Runnable done) {
        changed = 0; List<ConversationAdapter.Row> rows = new ArrayList<>(adapter.getCurrentList()); ConversationAdapter.Row row = rows.get(0);
        rows.set(0, new ConversationAdapter.Row(row.id, row.title, "WRGRAM_FIXTURE: cambio sintético", row.meta, row.initials, row.chat, row.outgoing, row.unread)); adapter.submitList(rows, done);
    }
    public int rows() { return adapter.getItemCount(); }
    public int views() { return list.getChildCount(); }
    public int changedRows() { return changed; }
    public long lastId() { return adapter.getItemId(adapter.getItemCount() - 1); }
    public void jumpToLast() { list.scrollToPosition(adapter.getItemCount() - 1); }
}
