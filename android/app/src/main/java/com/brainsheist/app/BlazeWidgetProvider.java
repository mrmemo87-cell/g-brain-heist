package com.brainsheist.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Blaze on the home screen (IELTS Visual & UX Bible §14.6): the streak number, a lit flame when today is
 * done and a cold flame in the evening when the streak is at risk. Tapping it opens the IELTS course map.
 * Motivation only; it never shows an IELTS level or score.
 */
public class BlazeWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "blaze_widget";
    private static final int WEAK_FROM_HOUR = 18;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BlazeWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int streak = prefs.getInt("streak", 0);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        // "Done" only counts for the day it was saved.
        boolean todayDone = prefs.getBoolean("todayDone", false) && today.equals(prefs.getString("day", ""));
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        boolean cold = streak > 0 && !todayDone && hour >= WEAK_FROM_HOUR;

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_blaze);
        views.setImageViewResource(R.id.widget_flame, todayDone ? R.drawable.widget_flame_lit : cold ? R.drawable.widget_flame_cold : R.drawable.widget_flame_idle);
        views.setTextViewText(R.id.widget_streak, String.valueOf(streak));
        String line;
        if (todayDone) line = "Done today";
        else if (cold) line = "Blaze is getting cold";
        else if (streak > 0) line = "Keep it going";
        else line = "Start a streak";
        views.setTextViewText(R.id.widget_line, line);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("brainsheist://ielts/course"));
        open.setPackage(context.getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        return views;
    }
}
