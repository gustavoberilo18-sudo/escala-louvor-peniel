// Servidor local de teste: simula o Netlify (arquivos + função + Blobs)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
const blobs = new BlobsServer({ directory: "/tmp/blobs-dev", port: 8971, token: "dev" });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: "http://localhost:8971", uncachedEdgeURL: "http://localhost:8971", siteID: "dev", token: "dev" })).toString("base64");
const { default: fn } = await import("./netlify/functions/escala.mjs");
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8888");
  if (url.pathname === "/api/escala") {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fn(new Request(url, { method: req.method, headers: req.headers, body: ["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  const f = path.join("public", url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": tipos[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(8888, () => console.log("http://localhost:8888"));
