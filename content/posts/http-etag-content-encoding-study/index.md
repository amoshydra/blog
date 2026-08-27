---
title: "HTTP ETags and content-encoding: how Apache's gzip breaks revalidation (a hands-on study)"
description: "What happens to the ETag when you enable gzip/brotli in Apache? Why ETag revalidation silently stops working for compressed content, the three places Apache 2.4.68 violates RFC 9110, the version history behind it, and the one-line config that fixes it."
pubDate: "2026-08-27"
heroImage: "./hero.webp"
---

This is a follow-up to the study on [ETag vs Last-Modified](../http-etag-last-modified-study/).
That one covered how Apache generates its two validators and how it evaluates
`If-None-Match` / `If-Modified-Since`. This one asks a different question:

> What happens to the `ETag` the moment you turn on content-encoding — gzip
> (`mod_deflate`) or brotli (`mod_brotli`) — and does the result still comply with
> [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110)?

The short answer: **no.** With the default configuration, Apache 2.4.68 breaks
`ETag` revalidation for compressed content in three distinct ways, each of which
contradicts a `MUST` in the spec. It's a known, partly-documented trade-off, and it
has a version history that goes back to 2.4.0.

All Apache results below were verified empirically against **2.4.68** in a podman
container. A fully reproducible setup is included at the end.

---

## The default: Apache appends `-gzip` / `-br` to the ETag

When a response is content-encoded on the fly, Apache rewrites the `ETag` before it
leaves the server. For a 315-byte file whose identity (unencoded) tag is
`"13b-658b017f9d000"`:

```sh
$ curl -sI http://localhost:18080/plain/big.txt -H 'Accept-Encoding: gzip' | tr -d '\r' | grep -iE 'HTTP|etag|vary|content-encoding|content-length'
HTTP/1.1 200 OK
ETag: "13b-658b017f9d000-gzip"
Vary: Accept-Encoding
Content-Encoding: gzip
Content-Length: 69
```

The tag is now `"13b-658b017f9d000-gzip"` — the identity tag with `-gzip` appended.
Brotli does the same with `-br`. This is the `AddSuffix` behaviour, which is the
**default** for both `DeflateAlterETag` and `BrotliAlterETag`.

The reason is sound: a gzip body and an identity body are *different
representations*, so they should have *different* validators. (More on that in a
moment — the RFC agrees.)

### The two encoders don't even agree on small files

The suffix is only added when the filter actually compresses the response. And the
two modules have different thresholds. For a 4-byte file:

```sh
$ curl -sI http://localhost:18080/plain/small.txt -H 'Accept-Encoding: gzip' | tr -d '\r' | grep -iE 'content-encoding|content-length|etag'
ETag: "4-658b017f9d000"          # not compressed -> identity tag
Content-Length: 4

$ curl -sI http://localhost:18080/plain/small.txt -H 'Accept-Encoding: br' | tr -d '\r' | grep -iE 'content-encoding|content-length|etag'
ETag: "4-658b017f9d000-br"       # compressed -> suffixed tag
Content-Encoding: br
Content-Length: 8
```

`mod_deflate` skips the 4-byte body (below its minimum), leaving the identity tag,
while `mod_brotli` has no minimum and compresses it, adding `-br`. Same file, same
request path, two different ETags depending on which encoder fires. The suffix is a
property of the *representation that was actually sent*, not of the file.

---

## The RFC already covers this exact case

This isn't an edge case the spec forgot. RFC 9110
[§8.8.3.3](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3.3),
*"Example: Entity Tags Varying on Content-Negotiated Resources"*, walks through a
resource whose representations vary on `Accept-Encoding`:

```
>> Response (identity):
ETag: "123-a"
Vary: Accept-Encoding

>> Response (gzip):
ETag: "123-b"
Vary: Accept-Encoding
Content-Encoding: gzip
```

and adds this note:

> Content codings are a property of the representation data, so a strong entity tag
> for a content-encoded representation **has to be distinct** from the entity tag of
> an unencoded representation to prevent potential conflicts during cache updates and
> range requests.

So Apache's *200* behaviour — a distinct `ETag` plus `Vary: Accept-Encoding` plus
`Content-Encoding` for the compressed representation — is **exactly what the RFC
prescribes**. Up to here, everything is correct.

The problem starts the instant a client tries to *revalidate* that cached
representation.

---

## Where it breaks: revalidation

A client that cached the gzip representation now holds `ETag: "13b-658b017f9d000-gzip"`.
To revalidate it sends that tag back:

```sh
$ curl -sI http://localhost:18080/plain/big.txt -H 'Accept-Encoding: gzip' \
    -H 'If-None-Match: "13b-658b017f9d000-gzip"' | tr -d '\r' | grep -iE 'HTTP|etag|content-length'
HTTP/1.1 200 OK
ETag: "13b-658b017f9d000-gzip"
Content-Length: 69
```

**200, with the full body re-sent.** The client already had these bytes.

What the RFC says a server must do here, from
[§13.1.2](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) (`If-None-Match`):

> 2. If the field value is a list of entity tags, the condition is **false** if one
>    of the listed tags matches the entity tag of the selected representation.
>
> An origin server that evaluates an If-None-Match condition MUST NOT perform the
> requested method if the condition evaluates to false; instead, the origin server
> MUST respond with either a) the **304 (Not Modified)** status code if the request
> method is GET or HEAD …

The selected representation (the gzip one) has entity tag
`"13b-658b017f9d000-gzip"` — that's the value Apache itself sent in the 200. The
client listed exactly that tag. The condition is false. The server **MUST** respond
`304`. Apache responds `200`.

### Why it happens

In `default_handler()` (`server/core.c`), Apache computes the identity `ETag` and
evaluates `If-None-Match` **before** the output filters run. The content filter then
runs *after* and rewrites the tag to add `-gzip`. So:

- the tag the **client is given** is `"13b-658b017f9d000-gzip"`;
- the tag the server **compares against** is `"13b-658b017f9d000"`.

Those two never match, so a client that faithfully echoes back the tag it was handed
can never get a `304`. ETag revalidation is simply dead for compressed content.

| # | Request | Apache 2.4.68 | RFC 9110 |
|---|---------|---------------|----------|
| 1 | `GET` + `AE: gzip` | 200 · `ETag: "…-gzip"` · `Vary` · `CE: gzip` | 200 ✓ |
| 2 | `GET` + `AE: gzip` + `INM: "…-gzip"` | **200** + body | **304** ✗ |
| 3 | `GET` + `AE: gzip` + `INM: "…"` (identity) | **304** · `ETag: "…"` · no `Vary` · no `CE` | 304 · `ETag: "…-gzip"` · `Vary` · `CE` ✗ |

Row 2 is the revalidation break. Row 3 is the next problem.

---

## The 304 that does come back is also wrong

The only way to coax a `304` out of Apache for a compressed asset is to revalidate
with the *identity* tag — the one the client never actually received:

```sh
$ curl -sI http://localhost:18080/plain/big.txt -H 'Accept-Encoding: gzip' \
    -H 'If-None-Match: "13b-658b017f9d000"' | tr -d '\r'
HTTP/1.1 304 Not Modified
Date: Thu, 27 Aug 2026 05:02:26 GMT
Server: Apache/2.4.68 (Unix)
Last-Modified: Mon, 10 Aug 2026 12:00:00 GMT
ETag: "13b-658b017f9d000"
Accept-Ranges: bytes
```

Compare that against the 200 to the *same* request (row 1). The 304:

- sends `ETag: "13b-658b017f9d000"` (identity) instead of `ETag: "13b-658b017f9d000-gzip"`;
- has **no** `Vary: Accept-Encoding`;
- has **no** `Content-Encoding: gzip`.

RFC 9110
[§15.4.5](https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5) (`304 Not Modified`)
is explicit about what a 304 must carry:

> The server generating a 304 response **MUST generate any of the following header
> fields that would have been sent in a 200 (OK) response to the same request**:
>
> \* Content-Location, Date, **ETag**, and **Vary**
>
> \* Cache-Control and Expires

The 200 to the same request sent `ETag: "…-gzip"` and `Vary: Accept-Encoding`. The
304 sent neither. Two more `MUST` violations.

### Why it happens

The `304` path never re-runs the content filter. In `modules/filters/mod_filter.c`,
`filter_harness()` removes the filter for any response whose status is not `200`
(unless `filter-errordocs` is set):

```c
if (f->r->status != 200
    && !apr_table_get(f->r->subprocess_env, "filter-errordocs")) {
    ap_remove_output_filter(f);
    return ap_pass_brigade(f->next, bb);
}
```

So the filter that would have added `Vary`, `Content-Encoding`, and the `-gzip`
suffix never runs on a 304 — the response keeps the pre-filter, identity headers.
Apache *did* try to fix this in 2.4.36 (a dedicated 304 branch in
`mod_deflate`/`mod_brotli`), but that branch is unreachable because the harness
strips the filter first. It's dead code.

---

## Is this a bug?

Partly. It splits into two different things:

1. **The revalidation break is a documented trade-off.** The
   [`DeflateAlterETag`](https://httpd.apache.org/docs/2.4/mod/mod_deflate.html) and
   [`BrotliAlterETag`](https://httpd.apache.org/docs/2.4/mod/mod_brotli.html)
   reference pages say, of the `AddSuffix` default, that it "prevents serving
   `304` (Not Modified) responses to conditional requests for compressed content."
   Apache knows, and ships `NoChange`/`Remove` as the escape hatches. It's a
   deliberate choice — but it's still a deviation from a `MUST`, and it's the
   *default*.

2. **The malformed 304 is a genuine latent bug.** When you *do* get a 304 (via the
   identity tag), it is not the 304 the RFC requires: wrong `ETag`, no `Vary`, no
   `Content-Encoding`. This isn't documented as intended — it's the shadowed 2.4.36
   fix described above.

There's also a real tension *inside* the RFC worth naming. §8.8.3.3 wants **distinct**
ETags for content-encoded representations (to avoid cache-update and range-request
conflicts). §13.1.2 wants revalidation to **work** (304 when the tag matches). §15.4.5
wants the 304 to carry the **same** `ETag`/`Vary` as the 200. A compliant server does
all three: give the gzip rep a distinct tag, accept that tag on revalidation, and echo
it back on the 304. Apache does only the first, because it evaluates the condition
before the filter rewrites the tag. It's an implementation limitation, not something
the spec makes impossible.

---

## A short version history

| Apache | Year | What changed |
|--------|------|--------------|
| 2.4.0 | 2012 | `mod_deflate` began suffixing ETags with `-gzip`. (2.2.x never did.) |
| 2.4.26 | 2017 | `mod_brotli` introduced — with `BrotliAlterETag` **from day one**, so brotli was configurable while deflate was not. |
| 2.4.35 | 2018 | Both content filters started skipping non-200 statuses entirely — a regression that disabled any 304 header fix-up. |
| 2.4.36 | 2018 | `mod_deflate`/`mod_brotli` gained a dedicated 304 branch (per RFC 7232 §4.1) — but the `mod_filter` harness strips the filter first, so it's unreachable. |
| 2.4.58 | 2024 | `DeflateAlterETag` added to `mod_deflate`, finally mirroring `BrotliAlterETag`. |
| 2.4.68 | current | Still non-compliant by default. No 2.5 has been released; the in-development trunk still has the same harness check. |

So updating Apache does not fix this — the behaviour is present in every current
release and in trunk.

---

## What to do about it

If ETag revalidation matters for your compressed static assets, opt out of the
suffix:

```apache
DeflateAlterETag NoChange
BrotliAlterETag  NoChange
```

The three modes, and what each trades off:

| Mode | ETag on a compressed 200 | Revalidation (`INM`) | Cost |
|------|--------------------------|----------------------|------|
| `AddSuffix` (default) | `"X-gzip"` / `"X-br"` | **broken** — always 200 | distinct tags, but compressed revalidation never 304s |
| `NoChange` | `"X"` (same as identity) | **works** — 304 | ETag no longer unique per representation |
| `Remove` | *(no ETag)* | IMS-only — `If-Modified-Since` decides | you lose ETag validation for compressed responses entirely |

`NoChange` is the pragmatic fix for most static sites: the ETag is identical across
encodings, so a client echoing back `"X"` gets a proper `304`. The trade-off is that
the tag is no longer unique per representation — but that is a `SHOULD`-level
deviation (and it's exactly how Apache behaved before 2.4.0), not a `MUST` violation,
and change detection is unaffected because the tag still tracks the identity
representation's mtime/size. Note the 304 still lacks `Vary`/`Content-Encoding` under
`NoChange`, but that's now harmless because the tag matches.

`Remove` is the nuclear option: it eliminates the inconsistency by removing the ETag
from compressed responses, at the cost of dropping ETag validation for them.

---

## Practical checklist

1. **Know that enabling gzip/br changes your ETags.** With the default `AddSuffix`,
   compressed responses carry `"…-gzip"` / `"…-br"` tags that differ from the
   identity tag.
2. **ETag revalidation is dead for compressed content by default.** A client that
   echoes back the suffixed tag it was given gets a `200`, not a `304`. If your
   bandwidth model depends on 304s, set `DeflateAlterETag NoChange` and
   `BrotliAlterETag NoChange`.
3. **A 304 from Apache for a compressed asset is not the RFC 304.** It carries the
   identity ETag and omits `Vary` and `Content-Encoding`. Don't write cache logic
   that assumes the 304 mirrors the 200's representation headers.
4. **The two encoders disagree on small files.** `mod_deflate` skips bodies below its
   minimum (identity tag, no suffix); `mod_brotli` has no minimum. The same asset can
   carry different ETags depending on which encoder fires.
5. **Don't parse the `-gzip`/`-br` suffix off the ETag** as a reliable signal — it's
   an implementation detail of `AddSuffix` and disappears under `NoChange`/`Remove`.
6. **Updating Apache won't help.** The behaviour is the default in 2.4.68 and is
   unchanged in trunk.

---

## Reproducing the results

Everything above was produced with a clean podman container
(`docker.io/library/httpd:2.4-alpine`, Apache 2.4.68, served on `localhost:18080`).

### 1. Create the files

```sh
mkdir -p htdocs/plain
printf 'x%.0s' {1..315} > htdocs/plain/big.txt     # 315 bytes
printf 'AAAA' > htdocs/plain/small.txt             # 4 bytes
touch -d '2026-08-10 12:00:00 UTC' htdocs/plain/big.txt htdocs/plain/small.txt
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
LoadModule filter_module modules/mod_filter.so
LoadModule deflate_module modules/mod_deflate.so
LoadModule brotli_module modules/mod_brotli.so

User daemon
Group daemon
ServerAdmin study@example.com
ServerName localhost
DocumentRoot "/usr/local/apache2/htdocs"

<Directory "/">
    Require all denied
</Directory>
<Directory "/usr/local/apache2/htdocs">
    Options Indexes
    AllowOverride None
    Require all granted
</Directory>

# Two gotchas that silently disable compression if you get them wrong:
#  - mod_brotli registers its filter as "BROTLI_COMPRESS", not "brotli"
#  - this image maps .js -> text/javascript, so list both JS MIME types
AddOutputFilterByType deflate text/plain text/javascript application/javascript
AddOutputFilterByType BROTLI_COMPRESS text/plain text/javascript application/javascript

# To test the fix:
# DeflateAlterETag NoChange
# BrotliAlterETag  NoChange

LogLevel core:trace8
ErrorLog /proc/self/fd/2
CustomLog /proc/self/fd/2 combined
```

### 3. Start Apache and probe it

```sh
podman rm -f httpd-etag-gz 2>/dev/null || true
podman run -d --name httpd-etag-gz \
  --mount type=bind,src=$PWD/htdocs,dst=/usr/local/apache2/htdocs \
  --mount type=bind,src=$PWD/httpd.conf,dst=/usr/local/apache2/conf/httpd.conf \
  -p 18080:8080 docker.io/library/httpd:2.4-alpine

B=http://localhost:18080/plain/big.txt
ID='13b-658b017f9d000'   # identity tag for the 315-byte file

# 1) the 200 the client caches
curl -sI "$B" -H 'Accept-Encoding: gzip' | tr -d '\r' | grep -iE 'HTTP|etag|vary|content-encoding'
#    HTTP/1.1 200 OK   ETag: "13b-658b017f9d000-gzip"   Vary: Accept-Encoding   Content-Encoding: gzip

# 2) revalidate with the SUFFIXED tag (what the client was given) -> 200, not 304
curl -s -o /dev/null -w 'INM suffixed -> %{http_code}\n' "$B" -H 'Accept-Encoding: gzip' -H "If-None-Match: \"${ID}-gzip\""
#    INM suffixed -> 200

# 3) revalidate with the IDENTITY tag -> 304, but malformed (no Vary / CE, identity ETag)
curl -sI "$B" -H 'Accept-Encoding: gzip' -H "If-None-Match: \"${ID}\"" | tr -d '\r' | grep -iE 'HTTP|etag|vary|content-encoding'
#    HTTP/1.1 304 Not Modified   ETag: "13b-658b017f9d000"   (no Vary, no Content-Encoding)
```

With `DeflateAlterETag NoChange` / `BrotliAlterETag NoChange` uncommented, case 2
returns **304** and the ETag is `"13b-658b017f9d000"` for both the 200 and the 304.

---

**Further reading**: [RFC 9110 §8.8.3.3, Entity Tags Varying on Content-Negotiated Resources](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3.3) ·
[RFC 9110 §13.1.2, If-None-Match](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) ·
[RFC 9110 §15.4.5, 304 Not Modified](https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5) ·
[Apache `DeflateAlterETag`](https://httpd.apache.org/docs/2.4/mod/mod_deflate.html) ·
[Apache `BrotliAlterETag`](https://httpd.apache.org/docs/2.4/mod/mod_brotli.html) ·
[Apache `mod_filter` source](https://github.com/apache/httpd/blob/2.4.68/modules/filters/mod_filter.c) ·
Companion post: [HTTP cache validators: ETag vs Last-Modified](../http-etag-last-modified-study/)
