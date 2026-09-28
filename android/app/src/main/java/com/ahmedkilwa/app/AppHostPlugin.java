package com.ahmedkilwa.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The one native behaviour the web layer cannot express in CSS or the DOM.
 *
 * <p>Android's convention for "back" on a root destination is to send the task
 * to the background, not to destroy it. The Capacitor App plugin's back handler
 * is enabled by default, which means a back press is <em>consumed</em> and
 * forwarded to JavaScript instead of falling through to the platform default —
 * so without this plugin a JS handler that simply does nothing at the root
 * leaves the user stuck in the app with an unbackable screen.
 *
 * <p>{@code moveTaskToBack} is the API that reproduces the platform default.
 * {@code App.exitApp()} would call {@code finish()} and tear the activity down,
 * losing the WebView and forcing a cold start on return; the task switcher
 * would also show the app as closed rather than backgrounded.
 */
@CapacitorPlugin(name = "AppHost")
public class AppHostPlugin extends Plugin {

    @PluginMethod
    public void moveTaskToBack(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }
}
