# webview-safe-area-inset-override

This post records the iOS measurement behind the safe-area override. The numbers
in it come from a real simulator, not from a template. If you change the override,
the probe, or the launcher, the tables go stale until you re-measure.

## Layout

- `index.mdx` — the post.
- `hero.webp` — the hero image. Composed, not generated: it is the
  `ios-before.webp` and `ios-after.webp` captures cropped to their top 660 rows,
  placed side by side on a paper ground, with the title set in real font files.
  The only crop in the post. The ember measure bar beside each capture spans the
  top inset, which is 99px in `ios-before.webp` and 240px in `ios-after.webp`
  (644px wide for 402pt, so 1.602 px/pt). Re-measure those two numbers if the
  captures are replaced. The script is `/tmp/opencode/sa_photo_cover.py`; move it
  into the repo if the hero is ever rebuilt.
- `public/posts/webview-safe-area-inset-override/` — the in-body screenshots,
  referenced with absolute `/blog/posts/...` paths because the site base is
  `/blog`. Scaled with `sips -Z 1400` (fits within 1400px, preserves aspect
  ratio) and encoded with `cwebp -q 84`. Do **not** crop them: the top and bottom
  inset bands are the evidence, and cropping to a fixed pixel height stretched the
  1080x2340 Android shots when forced to iOS's 1206px width.
- `Tests/probe/index.html` — a minimal page that reads `env(safe-area-inset-*)`.
  Useful for scripted runs; **the post's own screenshots use
  [`amoshydra/demo-viewport`](https://amoshydra.github.io/demo-viewport) instead**,
  so the claims do not rest on a fixture written by the same author.
- `Tests/probe/control.html` — distinguishes "`env()` resolved to 0" from "`env()`
  is unsupported" via the `env(x, 77px)` fallback.
- `Tests/SAFE_AREA_RESULT.md` — the raw iOS measurement log, including the two
  false negatives described in the post.

In-body images are `<img class="shot" …>` rather than markdown `![]()`. Tall device
screenshots scaled to the column width run off the bottom of the viewport, so
`img.shot` in `src/styles/markdown.css` caps the height at `80vh` and derives the
width from the aspect ratio.

## Re-measuring

### iOS (simulator)

Requirements: Xcode and the `xcodegen` CLI (`brew install xcodegen`).

1. Generate and build:

   ```bash
   xcodegen generate
   xcodebuild -project WebViewLauncher.xcodeproj -scheme WebViewLauncher \
     -sdk iphonesimulator -configuration Debug -destination "id=<UDID>" \
     build CODE_SIGNING_ALLOWED=NO
   ```

2. Install and seed. `@AppStorage` is backed by UserDefaults, so the values go
   into the app's preference domain before launch:

   ```bash
   UDID=<UDID>
   APP=$(find ~/Library/Developer/Xcode/DerivedData/WebViewLauncher-*/Build/Products/Debug-iphonesimulator -name 'WebViewLauncher.app' -maxdepth 1)

   xcrun simctl uninstall $UDID com.amoshydra.iosapp 2>/dev/null
   xcrun simctl install $UDID "$APP"

   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp url -string 'https://amoshydra.github.io/demo-viewport/?fit=cover'
   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp edgeToEdge -bool true
   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp insetTop    -string '150'
   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp insetRight  -string '40'
   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp insetBottom -string '180'
   xcrun simctl spawn $UDID defaults write com.amoshydra.iosapp insetLeft   -string '40'
   ```

3. Launch with the probe enabled. `ENV_PROBE=1` writes the report *and* auto-opens
   the web view, which is how this is tested without tap injection:

   ```bash
   SIMCTL_CHILD_ENV_PROBE=1 xcrun simctl launch $UDID com.amoshydra.iosapp
   C=$(xcrun simctl get_app_container $UDID com.amoshydra.iosapp data)
   cat "$C/Documents/env-probe.txt"
   ```

4. Screenshot and encode. `sips -Z` fits within the box and preserves the aspect
   ratio; `-c`/`--cropToHeightWidth` force exact dimensions and will stretch a
   screenshot from a device with a different resolution:

   ```bash
   xcrun simctl io $UDID screenshot /tmp/shot.png
   sips -Z 1400 /tmp/shot.png --out /tmp/shot-scaled.png
   cwebp -quiet -q 84 -metadata none /tmp/shot-scaled.png -o <destination>.webp
   ```

   Keep the before/after pair for one platform at identical dimensions so the
   comparison table lines up. The iOS and Android pairs differ by ~2px in width
   (644 vs 646) because the devices differ; that is expected.

### Android (device)

The Android host is a separate repo and takes its overrides as **intent extras in
physical pixels**. Launch `MainActivity` directly (not the launcher entry, which
is `SettingsActivity`, or the app will not be foregrounded):

```bash
adb shell am force-stop com.amoshydra.androidapp
adb shell am start -W -n com.amoshydra.androidapp/.MainActivity \
  --es url 'https://amoshydra.github.io/demo-viewport/?fit=cover' \
  --ez edge_to_edge true \
  --ei inset_top 150 --ei inset_right 40 --ei inset_bottom 180 --ei inset_left 40

sleep 10
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png /tmp/and-after.png
```

Omit the `--ei inset_*` flags for the "before" shot. The page will report the
requested pixels divided by `dpr` — 150 px at dpr 1.96 shows as ~77px.

**Do not add a `v=` query param to demo-viewport.** An A/B on the same device, same
intent extras, differing only in the URL:

| URL | viewport | insets |
| --- | --- | --- |
| `?fit=cover` | 550x1192 | `77 21 92 21` |
| `?fit=cover&v=5` | 550x1152 | `0 0 0 0` |

The extra param changes the rendered layout (height 1192 -> 1152) and zeroes the
insets. Plain `?fit=cover` is what every screenshot in the post uses.

**A newly created iPhone Duo can return black screenshots.** Every capture came
back as a black frame at the correct resolution (2007x2853) while the app itself
ran fine and the probe wrote correct values. `simctl erase` followed by deleting
and recreating the device fixed it. Check the probe report before assuming the
app is at fault.

**iPhone Duo: all three screenshots come from a screen recording, not
`simctl io screenshot`.** Rotation could not be driven headlessly — relaunching,
the demo page's own rotate button and `SBOrientationLockOverride` all left the
device in portrait. The native capture also renders the bare screen with no
device chassis, and the post's Duo figures want the chassis, so all three stills
are frames extracted from the same recording in `~/Desktop`. Notes for redoing it:

- That recording is 1430x1394 and renders the device at roughly 550px wide
  portrait, 770px landscape and 1000px unfolded. Enough for a table column; not
  enough to use as a full-width figure.
- Crop to the chassis by finding the bounding box of dark pixels (the bezel)
  against the white background, and **scan only the top 85% of the frame** — the
  recorder's own toolbar is dark and sits at the bottom, which otherwise gets
  pulled into the crop. Worked-out crops: `565x777+458+222` portrait (t≈10),
  `773x561+356+334` landscape (t≈3), `1015x779+234+222` unfolded (t≈14).
- The folded portrait and landscape frames show a black panel beside the outer
  display: that is the folded-away inner screen, not a capture artefact. Keep it,
  it is what a foldable looks like closed.
- Screen-recording filenames contain a narrow no-break space (U+202F) before
  AM/PM, so glob (`Screen*.mov`) rather than quoting the name literally.

**Creating an iPhone Duo.** The device type needs runtime 27.1 or newer. Check
`xcrun simctl list runtimes -j` for what is actually installed.

## Watch-outs

**Uninstall before re-seeding on iOS.** Relaunching an already-running app reuses
the existing `WKWebView` and the cached `@AppStorage` values, so the report can be
stale while `defaults read` shows the new config. This cost one false negative.

**A single reading proves nothing.** WebKit bug 191872: `env(safe-area-inset-*)`
is zero on first load and settles non-deterministically later. The probe samples
12 times over ~6s and records every distinct reading. Read the `history:` block,
not just `settled`. How many samples it takes varies by runtime and device — the
same iPhone 17 Pro needed two on 27.0 and one on 26.5.

**`?fit=cover` is mandatory on demo-viewport.** It only appends
`viewport-fit=cover` when that query param is present, and without it every edge
reads 0px on both platforms.

**Android needs `MainActivity`, not the launcher entry.** `am start` without `-n`
lands on `SettingsActivity` and the screenshot shows the launcher UI.

**Blank fields mean "real system value", not zero.** To test the fall-through,
write empty strings for all four edges and confirm the page reports the device's
actual insets (e.g. `62/0/34/0`).

**Device types have minimum runtimes.** `iPhone Duo` needs 27.1+. Check
`xcrun simctl list runtimes -j` rather than the text form, which has hidden a
runtime here.

## Environment the current numbers came from

**iOS** — Xcode 27.0 (27A266a), iOS Simulator SDK, deployment target iOS 17.0.
Runtimes 18.6 / 26.5 / 27.0 / 27.1; devices iPhone 16 Pro, 17 Pro, 18 Pro,
iPhone Duo. Simulator only — no physical iOS device.

**Android** — physical device, Android 15 (API 35), WebView 153.0.8010.36,
1080x2340 at density 314 override (dpr 1.96).

Record the runtime, device and WebView version whenever you re-measure, and update
the post's [Test matrix](https://github.com/amoshydra/blog/blob/main/content/posts/webview-safe-area-inset-override/index.mdx).
