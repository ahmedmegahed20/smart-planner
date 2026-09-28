package com.ahmedkilwa.app;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Immersive host activity.
 *
 * <p>Two independent jobs, deliberately kept in the platform layer so the web
 * UI never has to fake them with CSS:
 *
 * <ol>
 *   <li><b>Edge-to-edge.</b> {@code setDecorFitsSystemWindows(false)} makes the
 *       window fill the display instead of being letterboxed by the system bars.
 *       From API 35 this is also the enforced default; setting it explicitly
 *       keeps API 24-34 behaving the same, which is the range the theme in
 *       {@code res/values/styles.xml} still supports.</li>
 *   <li><b>Immersive system UI.</b> The status and navigation bars are hidden
 *       through {@link WindowInsetsControllerCompat} — the supported modern
 *       replacement for the deprecated {@code SYSTEM_UI_FLAG_*} flags — with
 *       {@code BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE} so a swipe from an edge
 *       still reveals the bars temporarily, as Android requires.</li>
 * </ol>
 *
 * <p>Hiding is re-applied on focus changes because the system restores the bars
 * after transient reveals and after any dialog or permission dialog that takes
 * window focus. The WebView itself is never detached from the insets: the web
 * layer reads real {@code env(safe-area-inset-*)} values, so keyboard, dialogs,
 * and bottom sheets stay clear of the cutout even though the bars are hidden.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // MUST come before super.onCreate(): BridgeActivity.onCreate() calls
        // load(), which hands the accumulated plugin list to Bridge.Builder and
        // builds the bridge. Registering afterwards only mutates a builder that
        // has already been consumed, so the plugin would never be instantiated
        // and every call to it would fail with "plugin not found".
        registerPlugin(AppHostPlugin.class);

        super.onCreate(savedInstanceState);
        applyImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersive();
        }
    }

    private void applyImmersive() {
        // Let the layout extend behind a (hidden) cutout instead of being
        // letterboxed around it, so an edge-to-edge screen gets no notch band.
        WindowManager.LayoutParams attrs = getWindow().getAttributes();
        if (attrs.layoutInDisplayCutoutMode
                != WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES) {
            attrs.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        // Swiping from a screen edge reveals the bars temporarily; they then
        // auto-hide again. This is the behaviour Android expects from an
        // immersive app, and it keeps the gesture area usable.
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
