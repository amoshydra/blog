# webview-safe-area-inset-override

This post records the iOS measurement behind the safe-area override. The numbers
in it come from a real simulator, not from a template. If you change the override,
the probe, or the launcher, the tables go stale until you re-measure.

## Layout

- `index.mdx` — the post.
- `hero.webp` — the hero image. Composed, not generated: it is the
  `ios-before.webp` and `ios-after.webp` captures cropped to their top 660 rows,
  placed side by side on a paper ground, with the title set in real font files.
  The only crop in the post. The ember measure bar beside each capture spans that
  capture's top inset: it is offset 30px from the frame, its extension lines touch
  the frame at the top edge and at the first row of page content, and that lower
  row is 100 in `ios-before.webp` and 241 in `ios-after.webp` (the blue band ends
  at 95 and 236). Read those rows off the pixels instead of deriving them from the
  points, since 644px for 402pt is 1.602 px/pt and the arithmetic lands a pixel or
  two out. Re-measure if the captures are replaced. The script is
  `/tmp/opencode/sa_photo_cover.py`; move it into the repo if the hero is ever
  rebuilt.
- `public/posts/webview-safe-area-inset-override/` — the in-body screenshots,
  referenced with absolute `/blog/posts/...` paths because the site base is
  `/blog`. Scaled with `sips -Z 1400` (fits within 1400px, preserves aspect
  ratio) and encoded with `cwebp -q 84`. Do **not** crop them: the top and bottom
  inset bands are the evidence, and cropping to a fixed pixel height stretched the
  1080x2340 Android shots when forced to iOS's 1206px width.
- `keyboard-closed.webp` and `keyboard-open.webp` — the IME pair, for the section
  "The keyboard takes the bottom edge". Captured on the OnePlus with the override
  `150/40/180/40`, so the page reports `77 21 92 21` and then `77 21 0 21`. The page
  used draws its own blue band from `env()` and pads its body with the same values,
  so the numbers sit inside the band; the readout is the first line and the band is
  the evidence. Two traps when redoing it: uiautomator cannot see WebView text
  unless `/data/local/tmp/webview-command-line` contains
  `_ --force-renderer-accessibility`, and the WebView will serve a stale
  `input.html` from cache unless the URL carries a changing query parameter. Raise
  the keyboard by tapping the field, whose bounds come from the dump rather than
  from a guessed coordinate.

## Re-measuring the runtime-update numbers

The "Changing the override while the page is loaded" section needs the value to
change with the page still loaded, which neither launcher can do on its own:

- **Android.** `InsetAwareWebView.setInsetOverride` is only read inside
  `onApplyWindowInsets`, so a new value needs a dispatch. Either
  `webView.dispatchApplyWindowInsets(webView.getRootWindowInsets())` or
  `webView.getRootView().requestApplyInsets()` does it, and both were measured to
  give the same page value. Reaching it from adb needs an intent that lands on the
  existing activity, so `android:launchMode="singleTop"` plus an `onNewIntent`
  that applies the values.
- **iOS.** Assigning `insetOverride` is the whole update, since the property's
  `didSet` invalidates UIKit's memoised geometry. Driving it without the settings
  screen needs a DEBUG hook that polls a value from outside the app: write it into
  the app container (a file in `Documents`, not `UserDefaults`, which caches) and
  have a timer compare and apply. `simctl spawn <udid> defaults write` does not
  reach a running app's `UserDefaults`.
- **Reading the page.** Sample `env()` on every `requestAnimationFrame`, not on a
  timer, and post each distinct value somewhere with a page id and an elapsed
  time. The page id is what distinguishes a live change from a reload, and it is
  the only reason the section can claim the page never reloaded.
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

## Re-measuring `contentInsetAdjustmentBehavior`

The condition-2 table needs four runs on one page, one per behaviour value, with
the *document's* geometry reported next to `env()`. Two things make it go wrong:

- **`env()` alone cannot detect this failure.** It reads `150 40 180 40` under all
  four values. The page has to report `documentElement.clientWidth` and
  `clientHeight` too, since that is where the scroll view's content inset shows
  up. `window.innerWidth` and `visualViewport` also move, and `visualViewport`
  settles late, so a single sample can catch it mid-animation.
- **The env toggles reach the app as `SIMCTL_CHILD_<NAME>`.** A plain
  `env NAME=1 xcrun simctl launch` silently does nothing, and because
  `makeUIView` still sets `.never` by default the run looks like a valid control
  rather than a failure. Have the app log the toggle it read on every run and
  check it before trusting anything else. `.never` is WKWebView's own default
  here, so "I removed the line" and "the value is 2" are indistinguishable
  without that log line.

Do not `return` early out of `updateUIView` to skip the behaviour: the pending
URL load lives in that same function, so the early return skips the navigation and
the page renders blank. That looked exactly like suppression and cost two runs.
Wrap only the assignment in `if`.

The four-way matrix also needs a second layout, because "the web view fills its
window" turns out not to be what decides this. Dropping `.ignoresSafeArea()` makes
the frame `402x778` inside a `402x874` window, and the insets land identically.
The override values were `150/40/180/40` throughout.

## Screenshot tables must line up

Both images in a before/after row have to render at the same height. The CSS in
`src/styles/markdown.css` does this with equal columns and width-driven sizing.
Three things about it are load-bearing and each one silently does nothing if you
get it wrong:

- **Name `.scrollable-table`, not `.table-scroll`.** The Table component adds an
  inner `.scrollable-table` inside the rehype plugin's `.table-scroll`. The inner
  wrapper's rules outrank the outer ones, so a selector written against
  `.table-scroll` is parsed, matches nothing decisive, and loses.
- **Widths go on `td`, never `th`.** The images live in the body cells.
  `th:has(img.shot)` matches zero elements in this post, which is what left the
  columns content-driven and the heights unequal.
- **`table-layout: fixed` plus `white-space: normal` on shot tables.** With the
  general `white-space: nowrap` still applied, two 644px captures set the table's
  own width and the browser divides that by content, giving columns like 123px
  and 213px and a 195px height difference on a phone.

Verify by measuring, never by eye. Read `getBoundingClientRect().height` for
every image in the row and check the spread is 0, at several viewport heights.
**A `max-height` clamp will make the spread read 0 at some viewport sizes and
non-zero at others**, which is how this stayed broken through repeated attempts:
the clamp equalises the heights whenever it binds, so 600px and 720px always
looked correct and 1400px did not. Pinning an explicit height instead is also
wrong, because `max-width` still clamps the width and leaves a tall box holding a
small letterboxed image, which reads as a broken picture on a phone.

The Duo row cannot match on width, since its three captures are 0.727, 1.378 and
1.303 aspect by design. It uses `img.shot-wide`, which sets height directly and
lets the widths follow, with its cells exempted from the 50% column width.

`ios-launcher.webp` was rescaled from 644 to 646px wide to match
`android-launcher.webp`. They are the one pair that came from different devices,
and the 2px difference was a visible 2.79px height spread in that row.

## Environment

The numbers in this post come from **Xcode 27.0** unless a figure says otherwise.
The SDK comparison pair is the one place where the SDK is the variable, and that is
the point of those figures.

## The iPhone Duo SDK comparison figures

`duo-sdk-27-0.webp` and `duo-sdk-27-1.webp` are the same app, same page, same
pose (inner display, landscape), differing only in the SDK it was built against.
They come from two screen recordings of the simulator window with the device frame
enabled, taken one after the other.

There is no Simulator GUI in either Xcode — it moved into `DeviceHub`
(`com.apple.dt.Devices`) — so `simctl io screenshot` only ever captures the bare
screen with no chassis. Recording the window and cutting the device out is the
only way to get the frame, which is why the extraction is scripted.

`pick_frames.py` does the extraction. Two things it has to work around:

- **The filename has a narrow no-break space (U+202F) before AM/PM.** Passing the
  name through the shell's word splitting breaks it into pieces and ffmpeg cannot
  open the file, so the script globs and never quotes a literal name.
- **The device is rendered at an angle mid-rotation**, which makes its bounding box
  far larger than any settled pose. Detect the box per frame from its own dark
  pixels and ignore anything where the shape looks like a transition; picking a
  timestamp blindly lands on a half-rotated frame more often than not.

The recorder's mouse cursor lands in frame on some takes. `ffmpeg -vf delogo=`
removes it, but over the black bezel a large box smears visibly, so keep the box
tight to the cursor. A faint tail can survive at the very bottom edge — check the
encoded result rather than assuming the delogo worked.

The 27.0 figure is the one to re-take if either side is ever swapped: the post
quotes `871 × 669` and `0 34 20 34` for it, and those are the *letterboxed*
numbers, not the panel's real size. The 27.1 side reads `951 × 669` and
`0 84 34 0`. the current numbers came from

**iOS** — Xcode 27.0 (27A266a), iOS Simulator SDK, deployment target iOS 17.0.
Runtimes 18.6 / 26.5 / 27.0 / 27.1; devices iPhone 16 Pro, 17 Pro, 18 Pro,
iPhone Duo. Simulator only — no physical iOS device. Condition 2 was measured on
18.6 (iPhone 16 Pro) and re-checked on 26.5 (iPhone 17 Pro), which agree exactly.

**Android** — physical device, Android 15 (API 35), WebView 153.0.8010.36,
1080x2340 at density 314 override (dpr 1.96).

Record the runtime, device and WebView version whenever you re-measure, and update
the post's [Test matrix](https://github.com/amoshydra/blog/blob/main/content/posts/webview-safe-area-inset-override/index.mdx).
