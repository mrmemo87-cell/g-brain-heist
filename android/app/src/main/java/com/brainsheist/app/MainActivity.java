package com.brainsheist.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-only plugins must be registered before the bridge starts.
        registerPlugin(BlazeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
