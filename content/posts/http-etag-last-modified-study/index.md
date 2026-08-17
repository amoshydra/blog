---
title: "HTTP cache validators: ETag vs Last-Modified (a hands-on study)"
description: "How Apache generates ETag and Last-Modified, how it evaluates If-None-Match and If-Modified-Since (the RFC 9110 rule vs Apache's actual AND logic), what happens when the two validators disagree, and the CDN mystery where If-None-Match unexpectedly did nothing."
pubDate: "2026-08-18"
heroImage: "./hero.webp"
---

This post is a practical study of Apache's two HTTP cache validators, `ETag` and
`Last-Modified`, and of the conditional-request headers clients use to revalidate
cached copies: `If-None-Match` and `If-Modified-Since`.

It answers three questions:

1. How does Apache generate `ETag` and `Last-Modified` for static files?
2. How does it decide between `304` and `200` when a client sends one or both
   preconditions — and where does that differ from what
   [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#section-13) prescribes?
3. Why can the same asset behave differently in production, when it is served
   behind a CDN?

All Apache results were verified empirically against **2.4.68** in a podman
container, and cross-checked on **2.4.57**. The production observation is reproduced
on an anonymous Apache origin behind a CDN. A fully reproducible setup is included
at the end.

---

## The two validators

For a static file, Apache reads `stat(2)` metadata and produces two headers.

### Last-Modified

```http
Last-Modified: Mon, 10 Aug 2026 12:00:00 GMT
```

- Derived from the file **mtime**, formatted as an
  [RFC 1123](https://www.rfc-editor.org/rfc/rfc1123) HTTP date (the `HTTP-date`
  format from [RFC 9110 §5.6.7](https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7)).
- 1-second granularity. Sub-second parts of the mtime are dropped. Three files
  whose mtime differed by 0.25 s, 0.5 s and 1.0 s produced the *identical* header.
- In HTTP terms it is a *weak* validator (see
  [RFC 9110 §8.8.3](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3)): it can
  only say what a clock saw, not what changed.

### ETag

```http
ETag: "4-658b017f9d000"
```

- Built from file attributes as a hex string. The **default** is `FileETag MTime Size`
  (the inode was part of the default before Apache 2.4, then removed):

  ```
  [W/]"<size-hex>-<mtime-microseconds-hex>"
  ```

- The mtime component is in **microseconds** (`apr_time_t`), so the ETag can change
  *within the same second* — something `Last-Modified` can never express. This is why
  ETag is the *stronger* validator.
- **Weak tags**: if a file's mtime is within 1 second of the request time (i.e. it is
  being written *right now*), Apache emits `W/"..."` instead of a strong tag, so a
  half-written file never gets cached under a strong validator.

The [FileETag](https://httpd.apache.org/docs/2.4/mod/core.html#fileetag) directive
controls which attributes are used (all observed live):

| Directive | Example ETag on a 4-byte file | Notes |
|---|---|---|
| *(none — default)* | `"4-658b017f9d000"` | `MTime Size`, no inode |
| `FileETag INode MTime Size` | `"380d-4-658b017f9d000"` | opt-in; inode first |
| `FileETag Size` | `"4"` | changes only when size changes |
| `FileETag MTime` | `"658b017f9d000"` | changes only when mtime changes |
| `FileETag None` | *(no ETag header)* | only Last-Modified remains |
| `FileETag Digest` | `"4lEhcqv4zJ9n/dSetsrPLfcbutM="` | base64(SHA1 of the bytes) |

`FileETag Digest` hashes the *content*, so it can detect byte-level changes that
plain metadata cannot. The cost: Apache must read and hash the file on every request.

---

## How conditional requests are evaluated

A client that has a cached copy revalidates by sending one or both preconditions:

- `If-None-Match: "<etag>"` — "give me 304 if my ETag still matches"
- `If-Modified-Since: <date>` — "give me 304 if nothing changed since <date>"

**RFC 9110** says: evaluate
[`If-None-Match` (§13.1.2)](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2)
first, and **ignore [`If-Modified-Since` (§13.1.3)](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.3)
entirely** when the request contains an `If-None-Match` with a
current value. Rationale: an ETag is a stronger validator than a timestamp, so it must
win when they disagree.

**What Apache 2.4 actually does** is different: its
[`ap_meets_conditions()`](https://github.com/apache/httpd/blob/2.4.68/modules/http/http_protocol.c)
evaluation **ANDs** the conditions — it returns 304 **only if every condition
present agrees** "not modified". Any single disagreement forces a `200` with the
full body.

Test setup: file with `ETag: E` and `Last-Modified: T1`.
`T0` is an older date, `T2` a newer one.

| # | Request headers | Apache 2.4.68 result | RFC 9110 would say |
|---|-----------------|:---:|:---:|
| 1 | `If-None-Match: E` | **304** | 304 |
| 2 | `If-Modified-Since: T1` | **304** | 304 |
| 3 | `INM E + IMS T1` (both agree) | **304** | 304 |
| 4 | `INM E + IMS T2` (newer date) | **304** | 304 |
| 5 | `INM E + IMS T0` (**older** date) | **200** | **304** ← INM is current, IMS is ignored |
| 6 | `INM "wrong" + IMS T1` | **200** | **304** ← INM not current, IMS consulted |
| 7 | `INM "wrong" + IMS T0` | **200** | 200 |

Rows 5 and 6 are the interesting ones. Apache's AND logic sends a `200` whenever the
two validators disagree — it never risks a "wrong" 304, at the cost of re-sending bytes
the client already has. RFC prefers the bandwidth optimization and trusts the ETag.
Both are safe; they just disagree about which way to err.

This AND behaviour was identical on Apache 2.4.68 and 2.4.57. Apache 2.2, by
contrast, falls through to `If-Modified-Since` when `If-None-Match` doesn't match —
matching the RFC result in row 6.

---

## When the two validators disagree

### ETag changed, Last-Modified did not

A rewrite inside the same second moves the microsecond mtime — the **ETag changes**,
the **Last-Modified header does not**:

```sh
$ touch -d '2026-08-10 12:00:00.500000 UTC' app.js
$ curl -sI http://localhost:18080/default-mtimesize/app.js | grep -iE 'etag|last-modified'
ETag: "4-658b018017120"          # was "4-658b017f9d000"
Last-Modified: Mon, 10 Aug 2026 12:00:00 GMT   # unchanged
```

Consequences:

| Client revalidates with | Result | Meaning |
|---|---|---|
| `If-None-Match` (old tag) | **200** + body | ETag notices the change — correct |
| `If-Modified-Since: <old LM>` only | **304** | **Last-Modified is blind** — stale content served |

This is the classic argument for ETag: a pure-`If-Modified-Since` client can be told
"not modified" right after the bytes changed.

### Last-Modified changed, ETag did not

With `FileETag Size`, a `touch` bumps the mtime while the bytes stay identical: the
ETag stays put, the Last-Modified moves. Since the content really is identical, this
is benign — INM clients get a correct 304; IMS-only clients just waste a round trip
getting a 200 with the same bytes back.

### The metadata blind spot (the one that actually bites)

The default `MTime Size` ETag is **metadata, not content**. If a file is overwritten
*in place* with the same byte length and the mtime is preserved — exactly what
`rsync -a` / `cp -p` and some backup/CI tooling do — nothing Apache looks at changes:

```
ETag: "4-658b017f9d000"      identical
Last-Modified: T1            identical
bytes: "AAAA" → "????"       DIFFERENT
```

Both an INM client and an IMS client get **304 with stale content**. The fix,
verified: `FileETag Digest` catches the same rewrite (INM → 200 with new body),
because the content hash actually changed. `Last-Modified` remains blind either way.

---

## The mystery: production didn't match my local Apache

This is the production behaviour that motivated the study, reproduced here on an
anonymous production asset. It's a bundled JS file served by an **Apache origin
behind a CDN**:

```sh
$ curl -sI 'https://cdn.example/assets/js/auth.9f31a2c7.js' | grep -iE 'server|etag|last-modified|x-cache'
HTTP/2 200
server: Apache
last-modified: Mon, 03 Aug 2026 04:58:30 GMT
etag: "a17c2-6581b2f4a8100"
x-cache-status: Miss from child, Miss from parent
```

The ETag format is Apache's and the origin identifies as `Apache` — good. Now the
probes (`E` = the exact ETag, `LM` = the exact Last-Modified, `OLD` = an earlier date):

| # | Request headers | Result | Interpretation |
|---|---|---|:---:|
| A | `If-Modified-Since: OLD` only | **200** | timestamp validation works |
| B | `INM garbage + IMS OLD` | **200** | both say "modified" |
| C | `INM garbage + IMS LM` | **304** | IMS matches → 304 |
| D | `If-None-Match: * + IMS OLD` | **200** | even `*` had no effect |
| 1 | `INM <exact E> + IMS OLD` | **200** | INM didn't override IMS |
| 2 | `INM <exact E>` only | **200** | **exact-tag revalidation ignored** |
| 3 | `INM garbage` only | **200** | no other condition → 200 |

Here's the thing: with the *exact* matching ETag and nothing else (`#2`), a stock
Apache would answer **304**. It answered 200. And `If-None-Match: *` (`#D`) should
always match — it also produced 200. The only header that flipped the response on
this path was `If-Modified-Since`.

**Conclusion for this asset:** the `If-None-Match` header is being stripped or
neutralized somewhere between you and the origin (the CDN edge). The origin received
only the timestamp and decided purely on `If-Modified-Since`. The observed `304`s on
this asset are **timestamp decisions** — ETag revalidation is effectively dead on this
path, and none of those 304s are evidence of Apache's `If-None-Match` logic.

This is worth knowing for two reasons:

1. **You can't diagnose origin behaviour through a CDN.** `If-None-Match` is
   exactly the header many CDNs rewrite or drop while serving stale-while-revalidate
   or custom revalidation policies.
2. **When a CDN kills ETag revalidation, correctness collapses to timestamp
   precision.** The sub-second and in-place-rewrite blind spots from the previous
   sections start to apply to *everyone*, not just IMS-only clients.

### Is this limited to this one site? — a broader sweep

The same probe set was run against public static assets on several other large web
properties served through similar CDN estates: a handful of banks, one major retailer,
plus two properties on a *different* CDN estate as a control. All requests were plain
unauthenticated conditional GETs; site names are omitted.

| Property (anonymised) | Edge marker | Origin / tag style | INM fresh-echo | INM `*` | IMS == Last-Modified |
|---|---|---|---|:---:|:---:|
| Bank A asset edge | Envoy proxy banner | opaque weak tag | 200 | 200 | 304 |
| Bank B static CDN | CDN asset subdomain | Apache-style `size-mtime` tag | 200 | 200 | 304 |
| Bank C static CDN | same estate | nginx-style tag | 200 | 200 | 304 |
| Bank D (icon) | same estate | Apache-style tag | 200 | 200 | 304 |
| Major retailer | CDN-vendor banner on site home | tag from object storage | 200 | 200 | 304 |
| Electronics maker (fully confirmed) | `cache-status` header on the asset itself | Apache + net-storage tags (two assets) | 200 | 200 | 304 |
| Payment site (other estate) | other-CDN banner | opaque weak tag | **304** | **304** | 304 |
| App host (other estate) | other-CDN banner | engine-style tag | **304** | **304** | 304 |

Observations:

- The "INM dead / IMS decides" result is **not unique to the original site**. It
  reproduces across several banks, a major retailer, and a hardware vendor — spanning
  Apache-, nginx-, and object-storage-style origins — so it is not a quirk of one
  company's configuration. For two of the electronics-maker's assets the
  `cache-status` header was present on the asset response itself, so that row is
  confirmed at the asset level, not just inferred from the site's home page.
- It is not even exclusive to the original CDN estate: an **Envoy-bannered** asset
  edge behaved identically. Combined, this looks like a widely-adopted edge posture —
  *"revalidate on timestamps, ignore `If-None-Match`"* — set deliberately at the edge,
  independent of what the origin would do.
- On the **other estate (control group)**, the same probes behave per RFC/nginx: an
  exact match returns 304, `If-None-Match: *` returns 304, and a matching tag beats a
  stale `If-Modified-Since`. Honoring the ETag is the norm there — so the difference
  is the edge's policy, not the HTTP spec and not the origin.

Method notes and caveats:

- Edge attribution for the bank CDN subdomains is *inferred* — those hosts strip
  `Server`/cache-status headers. The retailer's site home and the electronics-maker's
  asset responses did expose the CDN's cache-status banner, confirming the vendor at
  those endpoints. Treat the table as indicative, not a census.
- Each tag was captured in the same step in which it was echoed back, and
  `If-None-Match: *` was used as the "is this header even processed?" control. One
  dynamically-generated bundle on the control host changes its ETag on every request
  (per-node microsecond mtimes) and initially *looked* "INM-dead" — only the `*`
  control revealed the header was being processed all along.

### How to test this yourself

> Capture the tag on the fly and echo it back in the same cycle — never reuse an ETag
> captured earlier in the session. And don't trust a single `#exact INM` run: on
> dynamically generated bundles the ETag can change between requests, which makes a
> working `If-None-Match` *look* dead. `#INM *` is the control that tells you whether
> the header is processed at all.

```sh
URL="https://your-site.example/assets/your-file.js"
LM=$(curl -sI "$URL" | tr -d '\r' | grep -i '^last-modified' | sed 's/^[Ll]ast-Modified: //')
OLD="Mon, 01 Aug 2026 04:58:30 GMT"   # older than Last-Modified

# exact INM: capture and echo in the same cycle (freshly captured = no false negatives)
E=$(curl -sI "$URL" | tr -d '\r' | grep -i '^etag' | cut -d' ' -f2)
curl -s -o /dev/null -w '#exact INM only -> %{http_code}\n' "$URL" -H "If-None-Match: $E"
curl -s -o /dev/null -w '#INM *          -> %{http_code}\n' "$URL" -H 'If-None-Match: *'
curl -s -o /dev/null -w '#IMS OLD only   -> %{http_code}\n' "$URL" -H "If-Modified-Since: $OLD"
curl -s -o /dev/null -w '#IMS LM only    -> %{http_code}\n' "$URL" -H "If-Modified-Since: $LM"
```

Interpretation:

| Probe | Expected if ETag reaches the origin | Got 200 instead? |
|---|---|---|
| `#exact INM only` | **304** (a matching tag alongside a normal 2.4 origin) | edge is dropping/rewriting `If-None-Match` |
| `#INM *` | **304** (`*` matches any existing representation) | edge is dropping/rewriting `If-None-Match` |
| `#IMS OLD only` | **200** (older than Last-Modified → "modified") | — |
| `#IMS LM only` | **304** (timestamp unchanged) | timestamp handling is broken |

If the first two come back 200 while the last two behave as shown, your edge is
ignoring `If-None-Match` and revalidating purely on timestamps — exactly the mystery
above. Note that stripping can also be deliberate CDN behaviour rather than a bug, and
results may differ per point-of-presence or cache-fill state, so re-run a few times
before concluding. The origin's Apache version also matters: 2.2 falls through to
`If-Modified-Since` (RFC-style), while 2.4 applies the AND logic.

---

## Practical checklist

1. **Prefer `If-None-Match` over `If-Modified-Since`** at the application layer —
   it's the only validator that sees sub-second rewrites (microsecond mtime) and
   content changes.
2. **Remember Apache 2.4 ANDs the two conditions.** When a client sends both, a
   "wrong" ETag or a stale `If-Modified-Since` forces a 200. That's conservative and
   safe, but it contradicts the "INM wins" rule in
   [RFC 9110 §13.1.2](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) — don't
   write tests assuming the RFC result.
3. **`FileETag Digest` for assets that get overwritten in place** with preserved
   size/mtime (rsync, backups, CI). It's the only mode that survives that class of
   rewrite.
4. **Don't parse ETags** — component order and contents changed across Apache
   versions; treat them as opaque.
5. **When debugging through a CDN, verify the validator actually traverses it**
   before blaming origin behaviour (see the probe recipe above).
6. **Default `ETag` has no inode** since Apache 2.4 (`FileETag MTime Size`) — an
   inode-based tag would thrash across replicated filesystems, but it's also the only
   cheap way to detect "file replaced by another file" without hashing contents.

## Reproducing the Apache results

Everything in the Apache sections was produced with a clean podman container
(`docker.io/library/httpd:2.4-alpine`, served on `localhost:18080`). No special
config is required for the default-mode results — only the `<Directory>` blocks below
opt into the alternate `FileETag` modes.

### 1. Create the files

```sh
mkdir -p htdocs/default-mtimesize htdocs/size htdocs/digest
printf 'AAAA' > htdocs/default-mtimesize/app.js
printf 'AAAA' > htdocs/size/app.js
printf 'AAAA' > htdocs/digest/app.js
touch -d '2026-08-10 12:00:00 UTC' htdocs/*/app.js   # fixed mtime (GNU coreutils)
```

### 2. httpd.conf

```
ServerRoot "/usr/local/apache2"
Listen 8080

LoadModule mpm_event_module modules/mod_mpm_event.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule unixd_module modules/mod_unixd.so
LoadModule mime_module modules/mod_mime.so
LoadModule dir_module modules/mod_dir.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule headers_module modules/mod_headers.so

User daemon
Group daemon
ServerAdmin study@example.com
ServerName localhost

DocumentRoot "/usr/local/apache2/htdocs"
<Directory "/usr/local/apache2/htdocs">
    Options Indexes
    AllowOverride None
    Require all granted
</Directory>

# /default-mtimesize has NO FileETag block -> core default (MTime Size)
<Directory "/usr/local/apache2/htdocs/size">
    FileETag Size
</Directory>
<Directory "/usr/local/apache2/htdocs/digest">
    FileETag Digest
</Directory>

LogLevel core:trace8
ErrorLog /proc/self/fd/2
CustomLog /proc/self/fd/2 combined
```

### 3. Start Apache and probe it

```sh
podman rm -f httpd-etag 2>/dev/null || true
podman run -d --name httpd-etag \
  --mount type=bind,src=$PWD/htdocs,dst=/usr/local/apache2/htdocs \
  --mount type=bind,src=$PWD/httpd.conf,dst=/usr/local/apache2/conf/httpd.conf \
  -p 18080:8080 docker.io/library/httpd:2.4-alpine

# default mode -> size-mtime ETag, no inode
curl -sI http://localhost:18080/default-mtimesize/app.js | grep -iE 'etag|last-modified'
#   ETag: "4-658b017f9d000"   Last-Modified: Mon, 10 Aug 2026 12:00:00 GMT

E='"4-658b017f9d000"'
T1="Mon, 10 Aug 2026 12:00:00 GMT"; OLD="Mon, 09 Aug 2026 12:00:00 GMT"

# both validators present -> Apache ANDs them
curl -s -o /dev/null -w 'both match     -> %{http_code}\n' http://localhost:18080/default-mtimesize/app.js \
     -H "If-None-Match: $E" -H "If-Modified-Since: $T1"                # 304
curl -s -o /dev/null -w 'INM ok+IMS old -> %{http_code}\n' http://localhost:18080/default-mtimesize/app.js \
     -H "If-None-Match: $E" -H "If-Modified-Since: $OLD"                # 200 (RFC 9110: 304)
curl -s -o /dev/null -w 'INM wrong+IMS   -> %{http_code}\n' http://localhost:18080/default-mtimesize/app.js \
     -H 'If-None-Match: "wrong"' -H "If-Modified-Since: $T1"            # 200 (RFC 9110: 304)

# sub-second mtime rewrite: ETag changes, Last-Modified does not
touch -d '2026-08-10 12:00:00.500000 UTC' htdocs/default-mtimesize/app.js
curl -sI http://localhost:18080/default-mtimesize/app.js | grep -i etag  # ETag has changed

# metadata blind spot: same size + restored mtime -> identical ETag, different bytes
printf '????' > htdocs/default-mtimesize/app.js
touch -d '2026-08-10 12:00:00 UTC' htdocs/default-mtimesize/app.js
curl -s -o /dev/null -w 'cached INM -> %{http_code}\n' http://localhost:18080/default-mtimesize/app.js \
     -H "If-None-Match: $E"                                            # 304 -> stale content

# the same rewrite under FileETag Digest IS detected
D1=$(curl -sI http://localhost:18080/digest/app.js | tr -d '\r' | grep -i '^etag' | cut -d' ' -f2)
printf '????' > htdocs/digest/app.js
touch -d '2026-08-10 12:00:00 UTC' htdocs/digest/app.js
curl -s -o /dev/null -w 'digest rewrite -> %{http_code}\n' http://localhost:18080/digest/app.js \
     -H "If-None-Match: $D1"                                           # 200 -> new body served
```

The `touch -d ... .500000` step needs GNU coreutils (Linux); on macOS/podman-desktop
on other hosts adjust the syntax. Conditional logic was cross-checked on Apache 2.4.57
as well as 2.4.68.

---

**Further reading**: [`FileETag` reference](https://httpd.apache.org/docs/2.4/mod/core.html#fileetag) ·
[RFC 9110 §13, Conditional Requests](https://www.rfc-editor.org/rfc/rfc9110#section-13) ·
[RFC 9110 §13.1.2, If-None-Match](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) ·
[RFC 9110 §13.1.3, If-Modified-Since](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.3) ·
[RFC 1123](https://www.rfc-editor.org/rfc/rfc1123) ·
[Apache `ap_meets_conditions()`](https://github.com/apache/httpd/blob/2.4.68/modules/http/http_protocol.c).