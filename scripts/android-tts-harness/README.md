# Android TTS-to-file harness

A headless `Activity` that turns a text string into a WAV on a connected
Android device, for a given TTS engine and locale. Used to capture how closed
engines (e.g. Google's Speech Recognition & Synthesis) read currency amounts in
different locales.

This is an add-on to the [android-simple-webview](https://github.com/amoshydra/android-simple-webview)
app: drop `TtsActivity.java` into
`app/src/main/java/com/amoshydra/androidapp/` and add the `<activity>` (and the
`<queries>` block) from `AndroidManifest.xml` to the app manifest,
then build with the `build-android` Podman flow:

```bash
./podman-build.sh build-apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Use

```bash
# inventory (no text): logs engines/voices to logcat under the tag TtsHarness
adb shell am start -n com.amoshydra.androidapp/.TtsActivity --es engine com.google.android.tts

# synthesize
adb shell am start -n com.amoshydra.androidapp/.TtsActivity \
  --es engine com.google.android.tts \
  --es locale en-US \
  --es text "USD123.45" \
  --es out en-US_USD
adb pull /sdcard/Android/data/com.amoshydra.androidapp/files/en-US_USD.wav
```

`scripts/gtts-locale-dump.sh` runs the whole locale × string matrix.

## Getting a TTS engine onto a de-Googled device

Most LineageOS installs ship no TTS engine. Two notes from doing this:

- **Google TTS from APKPure installs but is rejected by Android 15.** The
  APKPure copy is signed only with the v1 (JAR) scheme, and Android 11+ refuses
  v1-only signatures for a modern `targetSdk`
  (`INSTALL_PARSE_FAILED_NO_CERTIFICATES: … no verified SignerInfos`).
  Re-signing the downloaded APK with a v2 signature makes it install:
  `zipalign -p -f 4 in.apk aligned.apk` then
  `apksigner sign --v1-signing-enabled true --v2-signing-enabled true …`.
- **eSpeak NG on F-Droid ships no voice data.** Its APK has no `assets/`, so its
  `CheckVoiceData`/DownloadVoiceData flow must fetch voice data, which does not
  run headless. Use an engine that bundles its voices, or one installed through
  a store client.

## Limitation

This produces **audio**, not text. The engine's normalised text is not exposed
by Android's `TextToSpeech` API, and ASR is a poor transcription tool here
because it renders numbers as digits (it tends to write `123.45`, not
"one hundred and twenty-three point four five"). Use the audio to listen, or to
compare durations and structure; use an open engine (NeMo) for the text.
