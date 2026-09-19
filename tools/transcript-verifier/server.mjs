#!/usr/bin/env node
// Standalone verification service for the screen-reader-currency-announcements
// transcripts. No Astro, no dependencies.
//
//   node tools/transcript-verifier/server.mjs [--port 4180]
//
// It serves a small UI that plays each committed Google TTS clip, offers the
// predicted transcript plus a few candidate read-outs (multiple choice) and an
// "other" free-text box, and writes your choices back to
// content/posts/screen-reader-currency-announcements/transcripts.json with the
// leading "~" (predicted marker) removed.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOptions, parseNemo } from "./candidates.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SLUG = "screen-reader-currency-announcements";
const ARTIFACTS = path.join(ROOT, "public", "posts", SLUG, "artifacts");
const CLIPS_DIR = path.join(ARTIFACTS, "gtts");
const MANIFEST = path.join(ARTIFACTS, "RESULTS-gtts-locales.tsv");
const NEMO = path.join(ARTIFACTS, "RESULTS-nemo-langs.txt");
const TRANSCRIPTS = process.env.TRANSCRIPTS_PATH
  ? path.resolve(process.env.TRANSCRIPTS_PATH)
  : path.join(ROOT, "content", "posts", SLUG, "transcripts.json");
const INDEX = path.join(HERE, "index.html");

const portArgIndex = process.argv.indexOf("--port");
const PORT = Number(
  portArgIndex !== -1 ? process.argv[portArgIndex + 1] : process.env.PORT || 4180
);
const HOST = process.env.HOST || "127.0.0.1";

function readRows() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`manifest not found: ${MANIFEST}`);
  const rows = [];
  for (const line of fs.readFileSync(MANIFEST, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("locale\t")) continue;
    const [locale, form, file] = line.split("\t");
    if (locale && form && file && fs.existsSync(path.join(CLIPS_DIR, file))) {
      rows.push({ locale, form, file });
    }
  }
  return rows;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function buildData() {
  const rows = readRows();
  const transcripts = readJson(TRANSCRIPTS, {});
  const nemo = fs.existsSync(NEMO) ? parseNemo(fs.readFileSync(NEMO, "utf8")) : {};
  const clips = rows.map((row) => {
    const raw = (transcripts[row.file] ?? "").trim();
    const predicted = raw.startsWith("~");
    return {
      ...row,
      url: `/audio/${encodeURIComponent(row.file)}`,
      draft: raw.replace(/^~\s*/, ""),
      predicted,
      verified: raw.length > 0 && !predicted,
      options: buildOptions(row, transcripts, nemo),
    };
  });
  return {
    clips,
    transcriptsPath: path.relative(ROOT, TRANSCRIPTS),
    total: clips.length,
    verified: clips.filter((c) => c.verified).length,
  };
}

function writeTranscripts(updates) {
  const rows = readRows();
  const valid = new Set(rows.map((r) => r.file));
  const transcripts = readJson(TRANSCRIPTS, {});
  const applied = [];
  for (const { file, text } of updates) {
    if (!valid.has(file)) continue;
    const clean = String(text ?? "").replace(/^~\s*/, "").trim();
    if (!clean) continue;
    transcripts[file] = clean; // drops "~": the gallery now treats it as verified
    applied.push(file);
  }
  if (applied.length) {
    const tmp = `${TRANSCRIPTS}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(transcripts, null, 2)}\n`);
    fs.renameSync(tmp, TRANSCRIPTS);
  }
  return applied;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = fs.readFileSync(INDEX, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/data") {
      sendJson(res, 200, buildData());
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      const name = decodeURIComponent(url.pathname.slice("/audio/".length));
      // stays under the clips dir; refuses separators and escapes
      if (name.includes("/") || name.includes("\\") || name.includes("..")) {
        res.writeHead(400).end("bad name");
        return;
      }
      const file = path.join(CLIPS_DIR, name);
      if (!fs.existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-cache" });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const applied = writeTranscripts(Array.isArray(body.updates) ? body.updates : []);
      const data = buildData();
      sendJson(res, 200, { ok: true, applied: applied.length, ...data });
      return;
    }

    res.writeHead(404).end("not found");
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  const data = buildData();
  console.log(`transcript verifier  http://${HOST}:${PORT}`);
  console.log(`  ${data.total} clips, ${data.verified} already verified`);
  console.log(`  writing -> ${path.relative(ROOT, TRANSCRIPTS)}`);
  console.log("  ctrl-c to stop");
});
