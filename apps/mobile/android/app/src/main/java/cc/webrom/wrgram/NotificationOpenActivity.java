package cc.webrom.wrgram;

/** Only immutable app-created PendingIntents can launch this non-exported component. */
public final class NotificationOpenActivity extends AccessActivity {
    @Override public void onCreate(android.os.Bundle state){super.onCreate(state);if(!requireAccess())return;WrgramApplication app=(WrgramApplication)getApplication();String slot=getIntent().getStringExtra("slot");TdSession session=app.account(slot);long chat=getIntent().getLongExtra("chat",0),message=getIntent().getLongExtra("message",0);if(session!=null){app.switchAccount(slot);session.openFromNotification(chat,message);}startActivity(new android.content.Intent(this,ShellActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP));finish();}
}
