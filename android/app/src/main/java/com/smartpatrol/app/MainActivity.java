/*
Tujuan: Entry activity Android SmartPatrol SQL dan registrasi plugin native aplikasi.
Caller: Android launcher dan Capacitor runtime.
Dependensi: BridgeActivity Capacitor dan SmartPatrolTimePlugin.
Main Functions: Memulai WebView Capacitor, menyimpan intent terbaru, serta mendaftarkan plugin waktu.
Side Effects: Membuat bridge native yang dapat dipanggil dari JavaScript dan memperbarui intent terbaru.
*/
package com.smartpatrol.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmartPatrolTimePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
