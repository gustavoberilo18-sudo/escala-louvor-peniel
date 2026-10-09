// API da Escala de Louvor Peniel
// Guarda todo o estado em Netlify Blobs (armazenamento permanente e gratuito).
// GET  /api/escala          -> estado completo
// POST /api/escala {ops,log,autor,aparelho} -> aplica as operações e devolve o estado novo
import { getStore } from "@netlify/blobs";

const CHAVE = "estado";
const CARGOS = [
  "Ministro de Louvor", "Backing Vocal 1", "Backing Vocal 2", "Backing Vocal 3", "Backing Vocal 4",
  "Teclado", "Violão", "Guitarra", "Contra-Baixo", "Bateria",
];
const FUNCOES = ["Ministro", "Backing", "Teclado", "Violão", "Guitarra", "Contra-Baixo", "Bateria"];
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_CULTO = /^\d{4}-\d{2}-\d{2}(-[a-z0-9]{1,16})?$/;
const RE_ID = /^[a-z0-9]{1,40}$/i;

function estadoVazio() {
  return {
    v: 0,
    atualizadoEm: 0,
    membros: [],
    lideranca: [
      { nome: "Luana Ramalho", whatsapp: "5533987058945" },
      { nome: "Ianka Meirelles", whatsapp: "5511944211045" },
    ],
    escala: {},   // { "2026-10": { "2026-10-13": { "Teclado": "idMembro" } } }
    indisp: {},   // { "2026-10": { "idMembro": ["2026-10-13", ...] } }
    extras: {},   // { "2026-10": [ { id, data, nome } ] }
    ocultos: {},  // { "2026-10": ["2026-10-15"] }
    ceia: {},     // { "2026-10": "2026-10-18" } ou "nenhum"; sem valor = 2º domingo
    vagas: {},    // { "2026-10": { backings: 3, instrumentos: ["Violão", ...] } } vale para os meses seguintes
    historico: [],
  };
}


// ----- Domingo da Ceia -----
function segundoDomingo(mes) {
  const [a, n] = mes.split("-").map(Number);
  let cont = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(a, n - 1, d));
    if (dt.getUTCMonth() !== n - 1) break;
    if (dt.getUTCDay() === 0 && ++cont === 2) return `${mes}-${String(d).padStart(2, "0")}`;
  }
  return "nenhum";
}
function ehDomingoDoMes(data, mes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data.slice(0, 7) !== mes) return false;
  const [a, n, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, n - 1, d));
  return dt.getUTCMonth() === n - 1 && dt.getUTCDay() === 0;
}
// Ao trocar o domingo da Ceia, as vagas acompanham: a noite fica no mesmo dia, a manhã vai para o novo domingo
function mudarCeia(e, mes, nova) {
  e.ceia ||= {};
  const antiga = e.ceia[mes] || segundoDomingo(mes);
  if (antiga === nova) return;
  const mapa = (id) => {
    if (antiga !== "nenhum" && id === `${antiga}-noite`) return antiga;
    if (antiga !== "nenhum" && id === `${antiga}-manha`) return nova !== "nenhum" ? `${nova}-manha` : null;
    if (nova !== "nenhum" && id === nova) return `${nova}-noite`;
    return id;
  };
  if (e.escala[mes]) {
    const novo = {};
    for (const [id, v] of Object.entries(e.escala[mes])) { const k = mapa(id); if (k) novo[k] = v; }
    e.escala[mes] = novo;
  }
  if (e.indisp[mes]) {
    for (const k of Object.keys(e.indisp[mes])) e.indisp[mes][k] = [...new Set(e.indisp[mes][k].map(mapa).filter(Boolean))];
  }
  if (e.ocultos[mes]) e.ocultos[mes] = [...new Set(e.ocultos[mes].map(mapa).filter(Boolean))];
  e.ceia[mes] = nova;
}

const txt = (s, max = 80) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const fone = (s) => String(s ?? "").replace(/\D/g, "").slice(0, 15);

function aplicarOp(e, op) {
  if (!op || typeof op !== "object") return;
  const mes = op.mes;
  if (mes !== undefined && !RE_MES.test(mes)) throw new Error("mês inválido");

  switch (op.t) {
    case "slot": {
      if (!RE_CULTO.test(op.culto) || !CARGOS.includes(op.cargo)) throw new Error("vaga inválida");
      const m = (e.escala[mes] ||= {});
      const c = (m[op.culto] ||= {});
      if (op.id && RE_ID.test(op.id)) c[op.cargo] = op.id;
      else delete c[op.cargo];
      if (!Object.keys(c).length) delete m[op.culto];
      break;
    }
    case "lote": {
      const m = (e.escala[mes] ||= {});
      for (const [culto, vagas] of Object.entries(op.slots || {})) {
        if (!RE_CULTO.test(culto)) continue;
        const c = (m[culto] ||= {});
        for (const [cargo, id] of Object.entries(vagas || {})) {
          if (CARGOS.includes(cargo) && RE_ID.test(id) && !c[cargo]) c[cargo] = id;
        }
      }
      break;
    }
    case "limpar": {
      const m = e.escala[mes];
      if (!m) break;
      const vozes = CARGOS.slice(0, 5);
      for (const culto of Object.keys(m)) {
        for (const cargo of Object.keys(m[culto])) {
          const ehVoz = vozes.includes(cargo);
          if (op.tipo === "tudo" || (op.tipo === "vozes" && ehVoz) || (op.tipo === "instrumentos" && !ehVoz)) {
            delete m[culto][cargo];
          }
        }
        if (!Object.keys(m[culto]).length) delete m[culto];
      }
      break;
    }
    case "membro.salvar": {
      const d = op.m || {};
      if (!RE_ID.test(d.id) || !txt(d.nome)) throw new Error("integrante inválido");
      const membro = {
        id: d.id,
        nome: txt(d.nome, 60),
        funcoes: (Array.isArray(d.funcoes) ? d.funcoes : []).filter((f) => FUNCOES.includes(f)),
        whatsapp: fone(d.whatsapp),
        obs: txt(d.obs, 120),
      };
      const i = e.membros.findIndex((x) => x.id === d.id);
      if (i >= 0) e.membros[i] = membro;
      else if (e.membros.length < 300) e.membros.push(membro);
      break;
    }
    case "membro.remover": {
      e.membros = e.membros.filter((x) => x.id !== op.id);
      break;
    }
    case "lideranca": {
      e.lideranca = (op.lideres || []).slice(0, 4)
        .map((l) => ({ nome: txt(l.nome, 60), whatsapp: fone(l.whatsapp) }))
        .filter((l) => l.nome);
      break;
    }
    case "indisp": {
      if (!RE_ID.test(op.id)) throw new Error("integrante inválido");
      const m = (e.indisp[mes] ||= {});
      const datas = (op.datas || []).filter((d) => RE_CULTO.test(d)).slice(0, 40);
      if (datas.length) m[op.id] = datas;
      else delete m[op.id];
      break;
    }
    case "extra.add": {
      const c = op.culto || {};
      if (!RE_CULTO.test(c.id) || !/^\d{4}-\d{2}-\d{2}$/.test(c.data)) throw new Error("culto inválido");
      const lista = (e.extras[mes] ||= []);
      if (!lista.some((x) => x.id === c.id) && lista.length < 20) lista.push({ id: c.id, data: c.data, nome: txt(c.nome, 40) || "Culto Especial" });
      break;
    }
    case "extra.remover": {
      e.extras[mes] = (e.extras[mes] || []).filter((x) => x.id !== op.id);
      if (e.escala[mes]) delete e.escala[mes][op.id];
      break;
    }
    case "culto.ocultar": {
      if (!RE_CULTO.test(op.id)) throw new Error("culto inválido");
      const lista = new Set(e.ocultos[mes] || []);
      op.ocultar ? lista.add(op.id) : lista.delete(op.id);
      e.ocultos[mes] = [...lista];
      break;
    }
    case "ceia": {
      if (op.data !== "nenhum" && !ehDomingoDoMes(op.data, mes)) throw new Error("domingo inválido");
      mudarCeia(e, mes, op.data);
      break;
    }
    case "vagas": {
      const b = Math.max(0, Math.min(4, parseInt(op.backings, 10) || 0));
      const instr = (op.instrumentos || []).filter((x) => CARGOS.slice(5).includes(x));
      (e.vagas ||= {})[mes] = { backings: b, instrumentos: CARGOS.slice(5).filter((x) => instr.includes(x)) };
      break;
    }
    case "foto.foco": {
      const foco = Math.max(0, Math.min(1, Number(op.foco) || 0));
      e.foto = { v: e.foto?.v || 0, foco };
      break;
    }
    case "historico.limpar": {
      e.historico = [];
      break;
    }
    default:
      throw new Error("operação desconhecida");
  }
}

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore({ name: "escala-louvor", consistency: "strong" });

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.has("backups")) {
      const { blobs } = await store.list({ prefix: "backup/" });
      return json({ backups: blobs.map((b) => b.key.slice(7)).sort().reverse().slice(0, 60) });
    }
    const estado = (await store.get(CHAVE, { type: "json" })) || estadoVazio();
    return json(estado);
  }

  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }
  // Restaurar uma cópia de segurança diária
  if (corpo.restaurar) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corpo.restaurar)) return json({ erro: "data inválida" }, 400);
    const copia = await store.get(`backup/${corpo.restaurar}`, { type: "json" });
    if (!copia) return json({ erro: "cópia não encontrada" }, 404);
    const atual = (await store.get(CHAVE, { type: "json" })) || estadoVazio();
    copia.v = (atual.v || 0) + 1;
    copia.atualizadoEm = Date.now();
    copia.historico = [{
      acao: "Cópia restaurada",
      detalhe: `Dados voltaram para o dia ${corpo.restaurar.split("-").reverse().join("/")}`,
      autor: txt(corpo.autor, 40) || "Alguém",
      aparelho: txt(corpo.aparelho, 40),
      ts: Date.now(),
    }, ...(atual.historico || [])].slice(0, 300);
    await store.setJSON(CHAVE, copia);
    return json(copia);
  }

  const ops = Array.isArray(corpo.ops) ? corpo.ops.slice(0, 400) : [];
  if (!ops.length) return json({ erro: "nenhuma alteração" }, 400);

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    let atual = await store.getWithMetadata(CHAVE, { type: "json" });
    if (atual && !atual.etag) {
      // Alguns ambientes não devolvem a etag na leitura: pega pela listagem (antes de reler os dados)
      const { blobs } = await store.list({ prefix: CHAVE });
      const etag = blobs.find((b) => b.key === CHAVE)?.etag;
      atual = { data: await store.get(CHAVE, { type: "json" }), etag };
    }
    const estado = atual?.data || estadoVazio();
    const antes = JSON.stringify(estado);

    try {
      for (const op of ops) aplicarOp(estado, op);
    } catch (err) {
      return json({ erro: err.message }, 400);
    }

    if (corpo.log && corpo.log.acao) {
      estado.historico.unshift({
        acao: txt(corpo.log.acao, 60),
        detalhe: txt(corpo.log.detalhe, 200),
        autor: txt(corpo.autor, 40) || "Alguém",
        aparelho: txt(corpo.aparelho, 40),
        ts: Date.now(),
      });
      estado.historico = estado.historico.slice(0, 300);
    }
    estado.v = (estado.v || 0) + 1;
    estado.atualizadoEm = Date.now();

    const opcoes = atual?.etag ? { onlyIfMatch: atual.etag } : atual?.data ? {} : { onlyIfNew: true };
    const r = await store.setJSON(CHAVE, estado, opcoes);

    if (r.modified) {
      // Uma cópia de segurança por dia (o estado como estava antes da primeira alteração do dia)
      const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      if (atual?.data) {
        await store.set(`backup/${dia}`, antes, { onlyIfNew: true }).catch(() => {});
      }
      return json(estado);
    }
    await new Promise((ok) => setTimeout(ok, 60 + Math.random() * 140));
  }
  return json({ erro: "Muitas pessoas salvando ao mesmo tempo. Tente de novo." }, 409);
};

export const config = { path: "/api/escala" };
