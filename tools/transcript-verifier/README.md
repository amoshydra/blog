# Transcript verifier

A local tool for checking the transcripts in the
[screen-reader currency post](../../content/posts/screen-reader-currency-announcements/).
It plays each committed Google TTS clip, lets you choose or type what the voice
actually said, and writes your answer into `transcripts.json` with the leading
`~` (the predicted marker) removed.

It needs a clone of this repository. It is not a hosted service, and it cannot
run from the GitHub web UI, because it reads the committed artifacts and writes
back into the repository.

## Requirements

- A clone of this repository.
- Node with the version pinned in `package.json` (`volta.node`).
- No extra packages. The tool uses only the Node standard library.

## Run

```bash
pnpm verify:transcripts
# or
node tools/transcript-verifier/server.mjs --port 4180
```

Then open <http://127.0.0.1:4180>.

The server prints how many clips it found, how many already have a verified
transcript, and the file it will write to.

## What it reads and writes

| Path | Role |
|---|---|
| `public/posts/screen-reader-currency-announcements/artifacts/RESULTS-gtts-locales.tsv` | the clip manifest (locale, form, file) |
| `public/posts/screen-reader-currency-announcements/artifacts/gtts/*.mp3` | the clips |
| `public/posts/screen-reader-currency-announcements/artifacts/RESULTS-nemo-langs.txt` | NeMo read-outs, used as candidates |
| `content/posts/screen-reader-currency-announcements/transcripts.json` | the transcripts it writes |

## Where the candidates come from

`candidates.mjs` proposes a small deduped set per clip, strongest first:

1. the current draft (the `~` prediction)
2. the NVIDIA NeMo text-normalization output for the same locale and input
3. `Intl.NumberFormat` and `Intl.DisplayNames` renderings in the clip's locale,
   as a currency name, an ISO code, a symbol, or a plain decimal
4. the code spelled out, followed by the digits
5. the input, verbatim

They are prompts, not answers. A correct read-out is usually one of these
shapes, and anything else goes in the **other** box. Picking an option, or
typing your own, then pressing Save, replaces that clip's entry in
`transcripts.json` and drops the `~`, which is what makes the gallery treat the
line as verified.

## Options

| Flag or variable | Default | Meaning |
|---|---|---|
| `--port <n>` / `PORT` | `4180` | port to listen on |
| `HOST` | `127.0.0.1` | interface to bind |
| `TRANSCRIPTS_PATH` | the post's `transcripts.json` | where to write |

## Safety

The service writes a file inside the repository and binds to loopback by
default. It has no authentication. Do not expose it to a network.

## Files

| File | Purpose |
|---|---|
| `server.mjs` | the HTTP service: serves the UI, the clips, and the save endpoint |
| `index.html` | the UI |
| `candidates.mjs` | pure functions that build the candidate list; browser-safe, no Node APIs |
