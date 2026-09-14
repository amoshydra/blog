# webview-testing-locators

This post embeds **real Android accessibility-tree dumps**. They come from a
physical device, not from a template. If you edit the demos or the prose, the XML
tabs go stale until you regenerate them, and regenerating needs an Android device
connected over adb.

## Layout

- `index.mdx` — the post.
- `snippets/<pattern>.html` — the markup in each HTML tab. These mirror the demo
  markup; keep them in sync when you change a demo.
- `snippets/<pattern>.xml` — the dump in each XML tab. Regenerate these; never
  hand-edit them.
- `public/posts/webview-testing-locators/demos/` — the live pages the frames load.

`PatternDemo.astro` resolves `snippets/<pattern>.{html,xml}` at build time with
`import.meta.glob`. A plain `pnpm build` needs no device. The device is only for
regenerating dumps.

## Regenerating the dumps (device required)

Requirements:

- `adb`, with a device attached and authorized (`adb devices`).
- A WebView host app that allows cleartext traffic and loads a URL from an intent
  extra. This post uses `com.example.androidapp` from
  [amoshydra/android-simple-webview](https://github.com/amoshydra/android-simple-webview)
  (built in Podman; see the `build-android` skill). AOSP's `com.android.htmlviewer`
  will **not** do it: it refuses `file://` access and cleartext `http://`.

Steps:

1. Serve the demo directory on the host:

   ```bash
   cd public/posts/webview-testing-locators/demos
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

2. Point the device's loopback at that server:

   ```bash
   adb reverse tcp:8000 tcp:8000
   ```

3. Launch a page. `?only=<section-id>` keeps just that section, so the dump has no
   noise from its neighbours. `?click=<element-id>` clicks one control once the
   page's own listeners are attached, which is how the open modal is captured.
   `?hold=1` stops the demo toast from clearing itself.

   ```bash
   adb shell am start -n com.example.androidapp/.MainActivity \
     --es url 'http://localhost:8000/overlays.html?only=custom&click=open-custom'
   ```

4. Dump twice and keep the second. The first dump of a fresh WebView is often a
   bare `WebView` node, which is the lazy accessibility tree, not an empty page.

   ```bash
   adb exec-out uiautomator dump /dev/tty > /dev/null
   adb exec-out uiautomator dump /dev/tty > /tmp/<pattern>.xml
   ```

5. Extract the `android.webkit.WebView` subtree, pretty-print it, and write it to
   `snippets/<pattern>.xml`.

If a demo change does not seem to take effect, the WebView cached `demo.js` or
`demo.css`: `adb shell pm clear com.example.androidapp`.

## Environment the current dumps came from

OnePlus 6T (`ONEPLUS A6013`), Android 15 (API 35), AOSP WebView `140.0.7339.207`.
Record the device and the WebView version whenever you regenerate. The HTML to
accessibility-tree mappings move between WebView versions, and this post's claims
are tied to the version above.
