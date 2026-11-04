package com.brainsheist.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives the learner's streak from the web app and refreshes the Blaze home-screen widget.
 * Only the streak number, whether today is done and the day are stored on the phone.
 */
@CapacitorPlugin(name = "BlazeWidget")
public class BlazeWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        int streak = Math.max(0, call.getInt("streak", 0));
        boolean todayDone = Boolean.TRUE.equals(call.getBoolean("todayDone", false));
        String day = call.getString("day", "");
        context.getSharedPreferences(BlazeWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt("streak", streak)
            .putBoolean("todayDone", todayDone)
            .putString("day", day)
            .apply();
        BlazeWidgetProvider.refreshAll(context);
        call.resolve(new JSObject());
    }
}
