/*
Tujuan: Mengekspos monotonic clock Android dan payload launch push untuk SmartPatrol.
Caller: Capacitor bridge JavaScript melalui service native/capacitorBridge.js.
Dependensi: Android SystemClock, Activity Intent, JSON parser, dan Capacitor Plugin API.
Main Functions: Mengembalikan elapsedRealtime, elapsedRealtimeNanos, uptime, wall clock perangkat, dan payload push yang membuka app.
Side Effects: Membaca clock sistem Android dan menghapus payload push dari intent setelah dikonsumsi JavaScript.
*/
package com.smartpatrol.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;

@CapacitorPlugin(name = "SmartPatrolTime")
public class SmartPatrolTimePlugin extends Plugin {
    private static final String PUSH_PAYLOAD_EXTRA = "smartpatrol_push_payload";

    @PluginMethod
    public void getTimeSnapshot(PluginCall call) {
        JSObject result = new JSObject();
        result.put("elapsedRealtimeMs", SystemClock.elapsedRealtime());
        result.put("elapsedRealtimeNanos", SystemClock.elapsedRealtimeNanos());
        result.put("uptimeMs", SystemClock.uptimeMillis());
        result.put("deviceEpochMs", System.currentTimeMillis());
        result.put("source", "android-system-clock");
        call.resolve(result);
    }

    @PluginMethod
    public void getLaunchNotificationPayload(PluginCall call) {
        JSObject result = new JSObject();
        Intent intent = getActivity() != null ? getActivity().getIntent() : null;
        String payload = intent != null ? intent.getStringExtra(PUSH_PAYLOAD_EXTRA) : null;

        if (payload == null || payload.trim().isEmpty()) {
            appendIntentExtras(result, intent);
            call.resolve(result);
            return;
        }

        try {
            JSONObject json = new JSONObject(payload);
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                result.put(key, json.optString(key, ""));
            }
        } catch (JSONException ignored) {
            // Payload berasal dari native service sendiri; jika rusak, abaikan agar app tetap terbuka.
        }

        intent.removeExtra(PUSH_PAYLOAD_EXTRA);
        call.resolve(result);
    }

    private void appendIntentExtras(JSObject result, Intent intent) {
        if (intent == null || intent.getExtras() == null) {
            return;
        }

        Bundle extras = intent.getExtras();
        for (String key : extras.keySet()) {
            if (key == null || key.startsWith("google.") || key.startsWith("gcm.")) {
                continue;
            }

            Object value = extras.get(key);
            if (value == null) {
                continue;
            }

            result.put(key, String.valueOf(value));
        }
    }
}
