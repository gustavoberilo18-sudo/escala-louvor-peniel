// Foto do grupo usada no cabeçalho da escala (PDF e imagem)
// GET    /api/foto            -> a foto enviada (404 se ainda não tiver; o site usa a foto padrão)
// POST   /api/foto?foco=0.2   -> corpo = JPEG; salva a foto e a posição vertical do recorte
// DELETE /api/foto            -> volta para a foto padrão
import { getStore } from "@netlify/blobs";

const CHAVE = "estado";
const MAX = 3 * 1024 * 1024;
const txt = (s, max = 40) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

async function atualizarEstado(store, mudar, log) {
  for (let i = 0; i < 6; i++) {
    let atual = await store.getWithMetadata(CHAVE, { type: "json" });
    if (atual && !atual.etag) {
      const { blobs } = await store.list({ prefix: CHAVE });
      const etag = blobs.find((b) => b.key === CHAVE)?.etag;
      atual = { data: await store.get(CHAVE, { type: "json" }), etag };
    }
    if (!atual?.data) return null;
    const estado = atual.data;
    mudar(estado);
    estado.historico = [{ ...log, ts: Date.now() }, ...(estado.historico || [])].slice(0, 300);
    estado.v = (estado.v || 0) + 1;
    estado.atualizadoEm = Date.now();
    const r = await store.setJSON(CHAVE, estado, atual.etag ? { onlyIfMatch: atual.etag } : {});
    if (r.modified) return estado;
    await new Promise((ok) => setTimeout(ok, 80 + Math.random() * 150));
  }
  return null;
}

export default async (req) => {
  const store = getStore({ name: "escala-louvor", consistency: "strong" });
  const url = new URL(req.url);
  const autor = txt(url.searchParams.get("autor")) || "Alguém";
  const aparelho = txt(url.searchParams.get("aparelho"));

  if (req.method === "GET") {
    const foto = await store.get("foto", { type: "arrayBuffer" });
    if (!foto) return new Response("sem foto", { status: 404 });
    return new Response(foto, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }

  if (req.method === "POST") {
    const buf = await req.arrayBuffer();
    const b = new Uint8Array(buf);
    if (!buf.byteLength || buf.byteLength > MAX) return Response.json({ erro: "A foto precisa ter até 3 MB." }, { status: 400 });
    if (!(b[0] === 0xff && b[1] === 0xd8)) return Response.json({ erro: "Envie uma foto em JPEG." }, { status: 400 });
    const foco = Math.max(0, Math.min(1, Number(url.searchParams.get("foco")) || 0));
    await store.set("foto", buf);
    const estado = await atualizarEstado(store, (e) => { e.foto = { v: Date.now(), foco }; },
      { acao: "Foto do grupo", detalhe: "Nova foto no cabeçalho da escala", autor, aparelho });
    return estado ? Response.json(estado) : Response.json({ erro: "Tente de novo." }, { status: 409 });
  }

  if (req.method === "DELETE") {
    await store.delete("foto");
    const estado = await atualizarEstado(store, (e) => { e.foto = { v: 0, foco: e.foto?.foco ?? 0 }; },
      { acao: "Foto do grupo", detalhe: "Voltou para a foto padrão", autor, aparelho });
    return estado ? Response.json(estado) : Response.json({ erro: "Tente de novo." }, { status: 409 });
  }

  return new Response("método não permitido", { status: 405 });
};

export const config = { path: "/api/foto" };
