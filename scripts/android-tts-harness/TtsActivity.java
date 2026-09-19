package com.amoshydra.androidapp;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import java.io.File;
import java.util.Locale;
import java.util.Set;

/**
 * Headless TTS-to-file harness.
 *
 *   adb shell am start -n com.amoshydra.androidapp/.TtsActivity \
 *     --es text "USD123.45" --es locale "en-US" --es out "en-US_USD" [--es engine "com.google.android.tts"]
 *
 * Writes a WAV to the app's external files dir:
 *   /sdcard/Android/data/com.amoshydra.androidapp/files/<out>.wav
 *
 * With no `text` extra, logs the installed engines, voices and languages
 * (filter logcat by TtsHarness) and exits.
 */
public class TtsActivity extends Activity {
    private static final String TAG = "TtsHarness";
    private TextToSpeech tts;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Intent intent = getIntent();
        final String text = intent.getStringExtra("text");
        final String outName = intent.getStringExtra("out");
        final String engine = intent.getStringExtra("engine");
        final String localeTag = intent.getStringExtra("locale");
        final Locale locale = (localeTag == null || localeTag.isEmpty())
                ? Locale.US : Locale.forLanguageTag(localeTag);

        TextToSpeech.OnInitListener listener = status -> {
            if (status != TextToSpeech.SUCCESS) {
                Log.e(TAG, "INIT_FAILED status=" + status);
                finish();
                return;
            }
            inventory(engine);
            if (text == null) {
                Log.i(TAG, "NO_TEXT inventory-only");
                finish();
                return;
            }
            int res = tts.setLanguage(locale);
            Log.i(TAG, "SET_LANGUAGE " + locale.toLanguageTag() + " -> " + res);

            File dir = getExternalFilesDir(null);
            if (dir == null) dir = getFilesDir();
            final File out = new File(dir, (outName == null ? "out" : outName) + ".wav");

            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { Log.i(TAG, "START " + id); }

                @Override public void onDone(String id) {
                    Log.i(TAG, "DONE " + out.getAbsolutePath() + " bytes=" + out.length());
                    finish();
                }

                @Override public void onError(String id) { Log.e(TAG, "ERROR " + id); finish(); }
            });

            Bundle params = new Bundle();
            int rc = tts.synthesizeToFile(text, params, out, "u1");
            Log.i(TAG, "SYNTH rc=" + rc + " text=" + text + " file=" + out.getAbsolutePath());
        };

        if (engine != null && !engine.isEmpty()) {
            tts = new TextToSpeech(this, listener, engine);
        } else {
            tts = new TextToSpeech(this, listener);
        }
    }

    private void inventory(String engine) {
        try {
            Log.i(TAG, "DEFAULT_ENGINE " + (engine == null ? "(default)" : engine));
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    Log.i(TAG, "VOICE " + v.getLocale().toLanguageTag()
                            + " name=" + v.getName() + " quality=" + v.getQuality());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "INVENTORY_ERROR " + e);
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
