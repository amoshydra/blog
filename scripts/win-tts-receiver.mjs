#!/usr/bin/env node
// Tiny upload receiver for the Windows TTS run.
//
//   node scripts/win-tts-receiver.mjs [inbox-dir] [--port 4182]
//
// A Windows guest on NAT reaches the host at 10.0.2.2 and PUTs each WAV:
//   curl.exe -T C:\tts-out\en-US_USD123p45.wav http://10.0.2.2:4182/en-US_USD123p45.wav
// The body is written verbatim to <inbox>/<name>. GET /list lists what arrived.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = Number(portIdx !== -1 ? args[portIdx + 1] : process.env.PORT || 4182);
const positional = args.filter((a, i) => a !== "--port" && i !== portIdx + 1);
const INBOX = positional[0] || process.env.INBOX || "/tmp/win-tts-inbox";

fs.mkdirSync(INBOX, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    return;
  }
  if (req.method === "GET" && url.pathname === "/list") {
    const wavs = fs.readdirSync(INBOX).filter((f) => f.endsWith(".wav"));
    res.writeHead(200, { "content-type": "text/plain" }).end(`${wavs.join("\n")}\n`);
    return;
  }
  // Serve helper scripts from this directory, so the guest can fetch the
  // generator over the network instead of hunting for the TTSSETUP drive.
  if (req.method === "GET" && url.pathname !== "/") {
    const name = decodeURIComponent(url.pathname.slice(1));
    if (name && !name.includes("/") && !name.includes("\\") && !name.includes("..")) {
      const file = path.join(HERE, name);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${name}"`,
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
  }
  if (req.method === "PUT") {
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
      res.writeHead(400).end("bad name\n");
      return;
    }
    const dest = path.join(INBOX, name);
    const ws = fs.createWriteStream(dest);
    req.pipe(ws);
    ws.on("finish", () => {
      console.log(`saved ${name} (${fs.statSync(dest).size} bytes)`);
      res.writeHead(201).end("saved\n");
    });
    ws.on("error", (e) => {
      console.error(`error ${name}: ${e}`);
      res.writeHead(500).end(String(e));
    });
    return;
  }
  res.writeHead(404).end("not found\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`win-tts receiver listening on 0.0.0.0:${PORT}`);
  console.log(`  guest reaches it at http://10.0.2.2:${PORT}/`);
  console.log(`  writing -> ${INBOX}`);
});
