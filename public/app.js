/* Escala de Louvor — IBN Peniel
   Estado compartilhado em /api/escala (Netlify Function + Netlify Blobs).
   Cada alteração vira uma "operação" enviada ao servidor, que aplica sobre a versão mais recente,
   então duas pessoas editando ao mesmo tempo não apagam o trabalho uma da outra. */
(() => {
"use strict";

// ---------- Constantes ----------
const API = "/api/escala";
const VOZES = [
  { cargo: "Ministro de Louvor", curto: "Ministro", funcao: "Ministro" },
  { cargo: "Backing Vocal 1", curto: "Backing 1", funcao: "Backing" },
  { cargo: "Backing Vocal 2", curto: "Backing 2", funcao: "Backing" },
  { cargo: "Backing Vocal 3", curto: "Backing 3", funcao: "Backing" },
  { cargo: "Backing Vocal 4", curto: "Backing 4", funcao: "Backing" },
];
const INSTR = [
  { cargo: "Teclado", curto: "Teclado", funcao: "Teclado" },
  { cargo: "Violão", curto: "Violão", funcao: "Violão" },
  { cargo: "Guitarra", curto: "Guitarra", funcao: "Guitarra" },
  { cargo: "Contra-Baixo", curto: "Baixo", funcao: "Contra-Baixo" },
  { cargo: "Bateria", curto: "Bateria", funcao: "Bateria" },
];
const FUNCOES = ["Ministro", "Backing", "Teclado", "Violão", "Guitarra", "Contra-Baixo", "Bateria"];
const FUNCOES_VOZ = ["Ministro", "Backing"];
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DIAS_CURTOS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
function foneInternacional(s) {
  let d = soDigitos(s);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}
function foneBonito(s) {
  const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return s || "";
}
const mesHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const mesExtenso = (m) => { const [a, n] = m.split("-").map(Number); return `${MESES[n - 1]} de ${a}`; };
const somarMes = (m, k) => { const [a, n] = m.split("-").map(Number); const d = new Date(a, n - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function aparelho() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Celular Android" : "Tablet Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Computador Windows";
  return "Computador";
}
function quando(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  const d = new Date(ts);
  const hoje = new Date();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`;
  return `${d.toLocaleDateString("pt-BR")} às ${hora}`;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// ---------- Estado ----------
function estadoVazio() {
  return { v: 0, atualizadoEm: 0, membros: [], lideranca: [
    { nome: "Luana Ramalho", whatsapp: "5533987058945" },
    { nome: "Ianka Meirelles", whatsapp: "5511944211045" },
  ], escala: {}, indisp: {}, extras: {}, ocultos: {}, ceia: {}, vagas: {}, historico: [] };
}
let servidor = ls.get("peniel_estado") || estadoVazio(); // última versão confirmada
let E = clonar(servidor);                                 // versão exibida (servidor + pendentes)
let pendentes = ls.get("peniel_pendentes", []);           // [{ops, log}]
let mes = mesHoje();
let aba = ls.get("peniel_aba", "vozes");
let online = null;
let enviando = false;
let tentativaFalha = 0;

function clonar(o) { return JSON.parse(JSON.stringify(o)); }

// Mesma lógica do servidor, para mostrar a alteração na hora
function aplicarOp(e, op) {
  const m = op.mes;
  switch (op.t) {
    case "slot": {
      const em = (e.escala[m] ||= {}); const c = (em[op.culto] ||= {});
      if (op.id) c[op.cargo] = op.id; else delete c[op.cargo];
      if (!Object.keys(c).length) delete em[op.culto];
      break;
    }
    case "lote": {
      const em = (e.escala[m] ||= {});
      for (const [culto, vagas] of Object.entries(op.slots)) {
        const c = (em[culto] ||= {});
        for (const [cargo, id] of Object.entries(vagas)) if (!c[cargo]) c[cargo] = id;
      }
      break;
    }
    case "limpar": {
      const em = e.escala[m]; if (!em) break;
      const vozes = VOZES.map((x) => x.cargo);
      for (const culto of Object.keys(em)) {
        for (const cargo of Object.keys(em[culto])) {
          const ehVoz = vozes.includes(cargo);
          if (op.tipo === "tudo" || (op.tipo === "vozes" && ehVoz) || (op.tipo === "instrumentos" && !ehVoz)) delete em[culto][cargo];
        }
        if (!Object.keys(em[culto]).length) delete em[culto];
      }
      break;
    }
    case "membro.salvar": {
      const i = e.membros.findIndex((x) => x.id === op.m.id);
      if (i >= 0) e.membros[i] = { ...op.m }; else e.membros.push({ ...op.m });
      break;
    }
    case "membro.remover": e.membros = e.membros.filter((x) => x.id !== op.id); break;
    case "lideranca": e.lideranca = op.lideres.filter((l) => l.nome); break;
    case "indisp": {
      const im = (e.indisp[m] ||= {});
      if (op.datas.length) im[op.id] = op.datas; else delete im[op.id];
      break;
    }
    case "extra.add": { const l = (e.extras[m] ||= []); if (!l.some((x) => x.id === op.culto.id)) l.push(op.culto); break; }
    case "extra.remover": e.extras[m] = (e.extras[m] || []).filter((x) => x.id !== op.id); if (e.escala[m]) delete e.escala[m][op.id]; break;
    case "culto.ocultar": { const s = new Set(e.ocultos[m] || []); op.ocultar ? s.add(op.id) : s.delete(op.id); e.ocultos[m] = [...s]; break; }
    case "ceia": mudarCeia(e, m, op.data); break;
    case "vagas": (e.vagas ||= {})[m] = { backings: op.backings, instrumentos: INSTR.map((v) => v.cargo).filter((c) => op.instrumentos.includes(c)) }; break;
    case "historico.limpar": e.historico = []; break;
  }
}

// ----- Domingo da Ceia (mesma regra do servidor) -----
function domingosDoMes(m) {
  const [a, n] = m.split("-").map(Number);
  const lista = [];
  for (let d = 1; d <= new Date(a, n, 0).getDate(); d++) if (new Date(a, n - 1, d).getDay() === 0) lista.push(`${m}-${String(d).padStart(2, "0")}`);
  return lista;
}
const ceiaPadrao = (m) => domingosDoMes(m)[1] || "nenhum";
const ceiaDoMes = (m, e = E) => (e.ceia && e.ceia[m]) || ceiaPadrao(m);
function mudarCeia(e, m, nova) {
  e.ceia ||= {};
  const antiga = ceiaDoMes(m, e);
  if (antiga === nova) return;
  const mapa = (id) => {
    if (antiga !== "nenhum" && id === `${antiga}-noite`) return antiga;
    if (antiga !== "nenhum" && id === `${antiga}-manha`) return nova !== "nenhum" ? `${nova}-manha` : null;
    if (nova !== "nenhum" && id === nova) return `${nova}-noite`;
    return id;
  };
  if (e.escala[m]) { const novo = {}; for (const [id, v] of Object.entries(e.escala[m])) { const k = mapa(id); if (k) novo[k] = v; } e.escala[m] = novo; }
  if (e.indisp[m]) for (const k of Object.keys(e.indisp[m])) e.indisp[m][k] = [...new Set(e.indisp[m][k].map(mapa).filter(Boolean))];
  if (e.ocultos[m]) e.ocultos[m] = [...new Set(e.ocultos[m].map(mapa).filter(Boolean))];
  e.ceia[m] = nova;
}

function recalcular() {
  E = clonar(servidor);
  for (const p of pendentes) for (const op of p.ops) { try { aplicarOp(E, op); } catch {} }
}

// ---------- Sincronização ----------
function mostrarStatus() {
  const el = $("#status");
  let cls = "status", txt = "Conectando…";
  if (pendentes.length && online !== false) { cls += " salvando"; txt = "Salvando…"; }
  else if (online === false && pendentes.length) { cls += " erro"; txt = "Sem internet · não salvo"; }
  else if (online === false) { cls += " erro"; txt = "Sem conexão"; }
  else if (online) { cls += " ok"; txt = "Salvo para todos"; }
  el.className = cls;
  el.lastElementChild.textContent = txt;
  el.title = servidor.atualizadoEm ? `Última alteração: ${quando(servidor.atualizadoEm)}` : "";
}

function salvarLocal() {
  ls.set("peniel_estado", servidor);
  ls.set("peniel_pendentes", pendentes);
}

let primeiraEdicao = true;
function enviar(ops, log) {
  if (!ops.length) return;
  pendentes.push({ ops, log });
  recalcular();
  salvarLocal();
  render();
  mostrarStatus();
  descarregar();
  if (primeiraEdicao && !ls.get("peniel_autor") && !ls.get("peniel_autor_pulou")) {
    primeiraEdicao = false;
    setTimeout(() => abrir("#dlgAutor"), 400);
  }
}

async function descarregar() {
  if (enviando || !pendentes.length) return;
  enviando = true;
  const lote = pendentes.slice();
  const ops = lote.flatMap((p) => p.ops);
  const logs = lote.map((p) => p.log).filter(Boolean);
  const log = logs.length === 1 ? logs[0] : logs.length ? { acao: logs[0].acao, detalhe: logs.map((l) => l.detalhe).join(" · ").slice(0, 200) } : null;
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ops, log, autor: ls.get("peniel_autor", ""), aparelho: aparelho() }),
    });
    if (r.status === 400) {
      const erro = await r.json().catch(() => ({}));
      pendentes.splice(0, lote.length);
      toast("Não foi possível salvar: " + (erro.erro || "dados inválidos"));
    } else if (!r.ok) {
      throw new Error("HTTP " + r.status);
    } else {
      servidor = await r.json();
      pendentes.splice(0, lote.length);
    }
    online = true;
    tentativaFalha = 0;
    recalcular();
    salvarLocal();
    render();
  } catch (err) {
    online = false;
    tentativaFalha++;
    setTimeout(descarregar, Math.min(30000, 2000 * 2 ** Math.min(tentativaFalha, 4)));
  } finally {
    enviando = false;
    mostrarStatus();
    if (online && pendentes.length) descarregar();
  }
}

async function buscar() {
  if (enviando || document.visibilityState === "hidden") return;
  try {
    const r = await fetch(API, { cache: "no-store" });
    if (!r.ok) throw new Error();
    const novo = await r.json();
    online = true;
    if (!enviando && (novo.v || 0) !== (servidor.v || 0)) {
      servidor = novo;
      recalcular();
      salvarLocal();
      renderSeguro();
    }
    if (pendentes.length) descarregar();
  } catch {
    online = false;
  }
  mostrarStatus();
}

// Não redesenha enquanto alguém está escolhendo um nome ou digitando
let renderAdiado = false;
function renderSeguro() {
  const a = document.activeElement;
  if (a && a.closest && a.closest("#conteudo") && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName)) { renderAdiado = true; return; }
  if (document.querySelector("dialog[open]")) { renderAdiado = true; return; }
  render();
}
document.addEventListener("focusout", () => setTimeout(() => { if (renderAdiado) { renderAdiado = false; renderSeguro(); } }, 50));
document.addEventListener("close", () => { if (renderAdiado) { renderAdiado = false; renderSeguro(); } }, true);

// ---------- Cultos do mês ----------
function cultosDoMes(m, incluirOcultos = false) {
  const [a, n] = m.split("-").map(Number);
  const dias = new Date(a, n, 0).getDate();
  const lista = [];
  const ceia = ceiaDoMes(m);
  let domingos = 0;
  for (let d = 1; d <= dias; d++) {
    const dt = new Date(a, n - 1, d);
    const ds = dt.getDay();
    const iso = `${m}-${String(d).padStart(2, "0")}`;
    if (ds === 2) lista.push({ id: iso, data: iso, nome: "Terça-feira", curto: "Terça" });
    else if (ds === 4) lista.push({ id: iso, data: iso, nome: "Quinta-feira", curto: "Quinta" });
    else if (ds === 0) {
      domingos++;
      if (iso === ceia) {
        lista.push({ id: iso + "-manha", data: iso, nome: `${domingos}º Domingo · Manhã`, curto: "Dom manhã", turno: "Manhã", ceia: true });
        lista.push({ id: iso + "-noite", data: iso, nome: `${domingos}º Domingo · Noite`, curto: "Dom noite", turno: "Noite", ceia: true });
      } else lista.push({ id: iso, data: iso, nome: "Domingo", curto: "Domingo" });
    }
  }
  for (const x of E.extras[m] || []) lista.push({ id: x.id, data: x.data, nome: x.nome, curto: x.nome, extra: true });
  lista.sort((x, y) => x.data.localeCompare(y.data) || ordem(x) - ordem(y));
  const ocultos = new Set(E.ocultos[m] || []);
  return incluirOcultos ? lista.map((c) => ({ ...c, oculto: ocultos.has(c.id) })) : lista.filter((c) => !ocultos.has(c.id));
}
const ordem = (c) => (c.id.endsWith("-manha") ? 0 : c.id.endsWith("-noite") ? 2 : c.extra ? 3 : 1);

const membro = (id) => E.membros.find((x) => x.id === id);
const nomeDe = (id) => membro(id)?.nome || "";
const temVoz = (mb) => mb.funcoes.some((f) => FUNCOES_VOZ.includes(f));
const temInstr = (mb) => mb.funcoes.some((f) => !FUNCOES_VOZ.includes(f));
function podeFuncao(mb, funcao) {
  if (funcao === "Backing") return mb.funcoes.includes("Backing") || mb.funcoes.includes("Ministro");
  return mb.funcoes.includes(funcao);
}
const indisponivel = (id, cultoId, m = mes) => (E.indisp[m]?.[id] || []).includes(cultoId);
// Vagas ativas do mês: a configuração de um mês vale para os seguintes, até alguém mudar de novo
const CFG_PADRAO = { backings: 3, instrumentos: ["Teclado", "Violão", "Guitarra", "Contra-Baixo", "Bateria"] };
function cfgVagas(m = mes) {
  const v = E.vagas || {};
  if (v[m]) return v[m];
  const ant = Object.keys(v).filter((k) => k < m).sort().pop();
  return ant ? v[ant] : CFG_PADRAO;
}
function vagasDe(tipo, m = mes) {
  const cfg = cfgVagas(m);
  const vozes = VOZES.slice(0, 1 + cfg.backings);
  const instr = INSTR.filter((v) => cfg.instrumentos.includes(v.cargo));
  return tipo === "vozes" ? vozes : tipo === "instrumentos" ? instr : [...vozes, ...instr];
}

function contagem(m, tipo) {
  const cargos = new Set(vagasDe(tipo).map((v) => v.cargo));
  const visiveis = new Set(cultosDoMes(m).map((c) => c.id));
  const cont = {};
  for (const [culto, vagas] of Object.entries(E.escala[m] || {})) {
    if (!visiveis.has(culto)) continue;
    for (const [cargo, id] of Object.entries(vagas)) if (cargos.has(cargo)) cont[id] = (cont[id] || 0) + 1;
  }
  return cont;
}

// ---------- Renderização ----------
function render() {
  $("#mesTitulo").innerHTML = `${h(MESES[Number(mes.slice(5)) - 1])}<small>${mes.slice(0, 4)}</small>`;
  $$(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba)));
  const cultos = cultosDoMes(mes);
  const preenchidas = (tipo) => cultos.reduce((s, c) => s + vagasDe(tipo).filter((v) => E.escala[mes]?.[c.id]?.[v.cargo]).length, 0);
  $("#contVozes").textContent = `${preenchidas("vozes")}/${cultos.length * vagasDe("vozes").length}`;
  $("#contInstr").textContent = `${preenchidas("instrumentos")}/${cultos.length * vagasDe("instrumentos").length}`;
  $("#contMembros").textContent = E.membros.length;
  renderLideres();
  const domingos = domingosDoMes(mes), atualCeia = ceiaDoMes(mes);
  $("#selCeia").innerHTML = domingos.map((d, i) => `<option value="${d}"${d === atualCeia ? " selected" : ""}>${ddmm(d)} · ${i + 1}º domingo${i === 1 ? " (padrão)" : ""}</option>`).join("")
    + `<option value="nenhum"${atualCeia === "nenhum" ? " selected" : ""}>Sem Ceia neste mês</option>`;

  const main = $("#conteudo");
  const foco = document.activeElement?.id;
  if (aba === "integrantes") main.innerHTML = htmlIntegrantes();
  else main.innerHTML = htmlEscala(aba);
  if (foco && document.getElementById(foco)) document.getElementById(foco).focus();
}

function renderLideres() {
  $("#lideres").innerHTML = E.lideranca.map((l) => {
    const n = foneInternacional(l.whatsapp);
    const msg = encodeURIComponent(`Olá, ${primeiroNome(l.nome)}! Paz! Gostaria de falar sobre a escala do louvor.`);
    return `<a class="lider" href="https://wa.me/${n}?text=${msg}" target="_blank" rel="noopener" title="Conversar com ${h(l.nome)} no WhatsApp"><svg><use href="#i-zap"/></svg>${h(primeiroNome(l.nome))}</a>`;
  }).join("");
}

function htmlEscala(tipo) {
  const vagas = vagasDe(tipo);
  const cultos = cultosDoMes(mes, true);
  const visiveis = cultos.filter((c) => !c.oculto);
  const ocultos = cultos.filter((c) => c.oculto);
  const candidatos = E.membros.filter(tipo === "vozes" ? temVoz : temInstr);
  let html = "";

  if (!E.membros.length) {
    html += `<div class="aviso"><svg><use href="#i-info"/></svg><div><strong>Comece pelos integrantes.</strong> Cadastre as pessoas do ministério e as funções de cada uma na aba <a href="#" data-ir="integrantes">Integrantes</a>. Depois é só escolher os nomes em cada culto.</div></div>`;
  } else if (!candidatos.length) {
    html += `<div class="aviso"><svg><use href="#i-info"/></svg><div>Ninguém cadastrado com função de ${tipo === "vozes" ? "voz (Ministro ou Backing)" : "instrumento"} ainda. Marque as funções na aba <a href="#" data-ir="integrantes">Integrantes</a>.</div></div>`;
  }

  const cfg = cfgVagas();
  const resumoVagas = tipo === "vozes"
    ? `Ministro${cfg.backings ? ` + ${cfg.backings} backing${cfg.backings > 1 ? "s" : ""}` : " sem backing"}`
    : vagas.length ? vagas.map((v) => v.cargo).join(", ") : "nenhum instrumento";
  html += `<div class="vagas-barra"><span><b>Vagas em ${h(MESES[Number(mes.slice(5)) - 1])}:</b> ${h(resumoVagas)}</span><span class="acoes"><button class="btn pequeno" data-escala-extra><svg><use href="#i-plus"/></svg>Escala extra</button><button class="btn pequeno" data-ajustar-vagas><svg><use href="#i-edit"/></svg>Escolher vagas</button></span></div>`;
  if (!vagas.length) { html += `<div class="vazio-estado">Nenhum instrumento na escala deste mês. Toque em <b>Escolher vagas</b> para incluir.</div>`; return html; }
  html += `<div class="grade">`;
  for (const c of visiveis) {
    const sel = E.escala[mes]?.[c.id] || {};
    const pessoasNoCulto = {};
    for (const [cargo, id] of Object.entries(sel)) (pessoasNoCulto[id] ||= []).push(cargo);
    const d = new Date(c.data + "T12:00");
    html += `<article class="culto${c.ceia ? " ceia" : ""}">
      <div class="culto-topo">
        <div><div class="dia">${h(c.nome)}</div><div class="data">${ddmm(c.data)}</div></div>
        <div class="tags">${c.ceia ? `<span class="tag">Ceia</span>` : ""}${c.extra ? `<span class="tag">Extra</span>` : ""}
          <button class="culto-menu" data-culto-acao="${h(c.id)}" data-extra="${c.extra ? 1 : 0}" title="${c.extra ? "Excluir esta escala extra" : "Tirar este culto da escala"}" aria-label="Remover culto"><svg><use href="#i-x"/></svg></button></div>
      </div>
      <div class="vagas">`;
    for (const v of vagas) {
      const atual = sel[v.cargo] || "";
      const selId = `s-${c.id}-${v.cargo}`.replace(/[^a-zA-Z0-9-]/g, "_");
      const aptos = candidatos.filter((mb) => podeFuncao(mb, v.funcao));
      const outros = candidatos.filter((mb) => !podeFuncao(mb, v.funcao));
      const opt = (mb) => {
        const ind = indisponivel(mb.id, c.id);
        const dup = pessoasNoCulto[mb.id] && mb.id !== atual;
        return `<option value="${h(mb.id)}"${mb.id === atual ? " selected" : ""}>${h(mb.nome)}${ind ? " (indisponível)" : dup ? " (já escalado)" : ""}</option>`;
      };
      let nota = "";
      if (atual) {
        if (!membro(atual)) nota = "Pessoa removida do cadastro";
        else if (indisponivel(atual, c.id)) nota = "Marcou que não pode nesta data";
        else if ((pessoasNoCulto[atual] || []).length > 1) nota = "Escalado(a) em duas funções neste culto";
      }
      html += `<div class="vaga"><label for="${selId}">${h(v.cargo)}</label>
        <select id="${selId}" data-culto="${h(c.id)}" data-cargo="${h(v.cargo)}" class="${atual ? (nota ? "alerta" : "") : "vazio"}">
          <option value="">— Escolher —</option>
          ${atual && !membro(atual) ? `<option value="${h(atual)}" selected>(removido)</option>` : ""}
          ${aptos.length ? `<optgroup label="${h(v.funcao === "Backing" ? "Vozes" : v.cargo)}">${aptos.map(opt).join("")}</optgroup>` : ""}
          ${outros.length ? `<optgroup label="Outros">${outros.map(opt).join("")}</optgroup>` : ""}
        </select>${nota ? `<span class="nota">${h(nota)}</span>` : ""}</div>`;
    }
    const n = vagas.filter((v) => sel[v.cargo]).length;
    html += `</div><div class="culto-pe"><span>${n} de ${vagas.length} preenchidas</span></div></article>`;
  }
  html += `</div>`;

  if (ocultos.length) {
    html += `<div class="removidos">Cultos fora da escala deste mês: ${ocultos.map((c) => `<button class="btn pequeno" data-reexibir="${h(c.id)}">${h(c.curto)} ${ddmm(c.data)} · voltar</button>`).join("")}</div>`;
  }

  // Resumo de participação
  const cont = contagem(mes, tipo);
  const linhas = candidatos.map((mb) => ({ mb, n: cont[mb.id] || 0 })).sort((x, y) => y.n - x.n || x.mb.nome.localeCompare(y.mb.nome));
  if (linhas.length) {
    const max = Math.max(1, ...linhas.map((l) => l.n));
    html += `<section class="resumo"><h3>Quem está servindo em ${h(MESES[Number(mes.slice(5)) - 1])}</h3><p>Quantas vezes cada pessoa aparece na escala de ${tipo === "vozes" ? "vozes" : "instrumentos"}. Ajuda a não sobrecarregar ninguém.</p><div class="barras">
      ${linhas.map((l) => `<div class="barra"><span title="${h(l.mb.nome)}">${h(l.mb.nome)}</span><span class="trilho"><i style="width:${(l.n / max) * 100}%"></i></span><b>${l.n}</b></div>`).join("")}
    </div></section>`;
  }
  return html;
}

function htmlIntegrantes() {
  const cont = contagem(mes, "tudo");
  const chips = FUNCOES.map((f) => `<label class="chip"><input type="checkbox" name="novaFuncao" value="${h(f)}">${h(f)}</label>`).join("");
  let html = `<section class="cartao"><h3>Cadastrar integrante</h3>
    <form id="formNovo" class="form-grade">
      <label class="campo"><span>Nome</span><input id="novoNome" maxlength="60" required placeholder="Ex: Débora Alcântara"></label>
      <label class="campo"><span>WhatsApp (opcional)</span><input id="novoZap" type="tel" inputmode="tel" placeholder="(33) 98765-4321"></label>
      <div class="campo" style="grid-column:1/-1"><span>Funções</span><div class="funcoes">${chips}</div></div>
      <div><button class="btn prim"><svg><use href="#i-plus"/></svg>Adicionar</button></div>
    </form></section>`;

  if (!E.membros.length) {
    html += `<div class="vazio-estado" style="margin-top:16px"><strong>Nenhum integrante cadastrado</strong>Adicione as pessoas do ministério acima. As funções marcadas decidem em quais vagas cada nome aparece.</div>`;
    return html;
  }
  const lista = [...E.membros].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  html += `<div class="lista-membros">`;
  for (const mb of lista) {
    const ind = (E.indisp[mes]?.[mb.id] || []).length;
    html += `<article class="membro">
      <div class="membro-topo"><div><h4>${h(mb.nome)}</h4>${mb.whatsapp ? `<div class="fone">${h(foneBonito(mb.whatsapp))}</div>` : ""}</div>
        <div class="qtd">${cont[mb.id] || 0}<small>em ${h(MESES[Number(mes.slice(5)) - 1].slice(0, 3))}</small></div></div>
      <div class="selos">${mb.funcoes.length ? mb.funcoes.map((f) => `<span class="selo${FUNCOES_VOZ.includes(f) ? " voz" : ""}">${h(f)}</span>`).join("") : `<span class="selo">Sem função marcada</span>`}${ind ? `<span class="selo indisp">${ind} data${ind > 1 ? "s" : ""} indisponível</span>` : ""}</div>
      ${mb.obs ? `<div class="fone">${h(mb.obs)}</div>` : ""}
      <div class="membro-acoes"><button class="btn pequeno" data-editar="${h(mb.id)}"><svg><use href="#i-edit"/></svg>Editar</button><button class="btn pequeno" data-indisp="${h(mb.id)}">Não posso em…</button></div>
    </article>`;
  }
  html += `</div>`;
  return html;
}

// ---------- Diálogos ----------
function abrir(sel) { const d = $(sel); if (!d.open) d.showModal(); return d; }
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-fechar]");
  if (f) {
    const d = f.closest("dialog");
    if (d.id === "dlgAutor") ls.set("peniel_autor_pulou", true);
    d.close();
  }
});
$$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

// ---------- Eventos da escala ----------
$("#conteudo").addEventListener("change", (e) => {
  const s = e.target.closest("select[data-culto]");
  if (!s) return;
  const culto = s.dataset.culto, cargo = s.dataset.cargo, id = s.value;
  const c = cultosDoMes(mes, true).find((x) => x.id === culto);
  const rot = c ? `${c.curto} ${ddmm(c.data)}` : culto;
  enviar([{ t: "slot", mes, culto, cargo, id }], id
    ? { acao: "Escala alterada", detalhe: `${rot}: ${nomeDe(id)} como ${cargo}` }
    : { acao: "Vaga liberada", detalhe: `${rot}: ${cargo} ficou vaga` });
});

$("#conteudo").addEventListener("click", (e) => {
  const ir = e.target.closest("[data-ir]");
  if (ir) { e.preventDefault(); mudarAba(ir.dataset.ir); return; }

  const ca = e.target.closest("[data-culto-acao]");
  if (ca) {
    const id = ca.dataset.cultoAcao;
    const c = cultosDoMes(mes, true).find((x) => x.id === id);
    if (ca.dataset.extra === "1") {
      if (ca.dataset.confirmar !== "1") { ca.dataset.confirmar = "1"; ca.title = "Toque de novo para excluir"; ca.style.background = "#fff"; ca.style.color = "#d10a14"; toast("Toque no X de novo para excluir esta escala extra."); return; }
      enviar([{ t: "extra.remover", mes, id }], { acao: "Escala extra excluída", detalhe: `${c?.nome || ""} ${c ? ddmm(c.data) : ""}` });
    } else {
      enviar([{ t: "culto.ocultar", mes, id, ocultar: true }], { acao: "Culto tirado da escala", detalhe: `${c?.curto || ""} ${c ? ddmm(c.data) : ""}` });
      toast("Culto tirado da escala. Dá para voltar no fim da página.");
    }
    return;
  }
  const re = e.target.closest("[data-reexibir]");
  if (re) {
    const c = cultosDoMes(mes, true).find((x) => x.id === re.dataset.reexibir);
    enviar([{ t: "culto.ocultar", mes, id: re.dataset.reexibir, ocultar: false }], { acao: "Culto voltou para a escala", detalhe: `${c?.curto || ""} ${c ? ddmm(c.data) : ""}` });
    return;
  }
  if (e.target.closest("[data-ajustar-vagas]")) { abrirVagas(); return; }
  if (e.target.closest("[data-escala-extra]")) { abrirExtra(); return; }
  const ed = e.target.closest("[data-editar]");
  if (ed) { abrirMembro(ed.dataset.editar); return; }
  const ind = e.target.closest("[data-indisp]");
  if (ind) { abrirIndisp(ind.dataset.indisp); return; }
});

$("#conteudo").addEventListener("submit", (e) => {
  if (e.target.id !== "formNovo") return;
  e.preventDefault();
  const nome = $("#novoNome").value.trim();
  if (!nome) return;
  if (E.membros.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) { toast(`${nome} já está cadastrado(a).`); return; }
  const funcoes = $$('input[name="novaFuncao"]:checked').map((i) => i.value);
  const m = { id: novoId(), nome, funcoes, whatsapp: foneInternacional($("#novoZap").value), obs: "" };
  enviar([{ t: "membro.salvar", m }], { acao: "Novo integrante", detalhe: `${nome} (${funcoes.join(", ") || "sem função"})` });
  toast(`${nome} adicionado(a).`);
  setTimeout(() => $("#novoNome")?.focus(), 0);
});

function mudarAba(a) { aba = a; ls.set("peniel_aba", a); render(); window.scrollTo({ top: 0 }); }
$$(".aba").forEach((b) => b.addEventListener("click", () => mudarAba(b.dataset.aba)));
$("#selCeia").addEventListener("change", (e) => {
  const data = e.target.value;
  const antiga = ceiaDoMes(mes);
  if (data === antiga) return;
  enviar([{ t: "ceia", mes, data }], { acao: "Domingo da Ceia", detalhe: `${mesExtenso(mes)}: ${data === "nenhum" ? "sem Ceia" : "Ceia no dia " + ddmm(data)}${antiga !== "nenhum" ? ` (antes ${ddmm(antiga)})` : ""}` });
  toast(data === "nenhum" ? "Este mês ficou sem Ceia." : `Ceia marcada para domingo, ${ddmm(data)}. Manhã e noite já aparecem na escala.`);
});
$("#mesAnt").addEventListener("click", () => { mes = somarMes(mes, -1); render(); });
$("#mesProx").addEventListener("click", () => { mes = somarMes(mes, 1); render(); });

// ---------- Integrante ----------
let editandoId = null;
function abrirMembro(id) {
  const mb = membro(id);
  if (!mb) return;
  editandoId = id;
  $("#membroTitulo").textContent = mb.nome;
  $("#mNome").value = mb.nome;
  $("#mZap").value = mb.whatsapp ? foneBonito(mb.whatsapp) : "";
  $("#mObs").value = mb.obs || "";
  $("#mFuncoes").innerHTML = FUNCOES.map((f) => `<label class="chip"><input type="checkbox" name="mFuncao" value="${h(f)}"${mb.funcoes.includes(f) ? " checked" : ""}>${h(f)}</label>`).join("");
  $("#mRemoverBox").innerHTML = `<button type="button" class="btn perigo pequeno" id="btnRemoverMembro">Remover do ministério</button>`;
  abrir("#dlgMembro");
}
$("#dlgMembro").addEventListener("click", (e) => {
  if (e.target.closest("#btnRemoverMembro")) {
    const mb = membro(editandoId);
    $("#mRemoverBox").innerHTML = `<div class="aviso" style="margin:0"><div>Remover <strong>${h(mb.nome)}</strong>? Os nomes já colocados na escala ficam marcados como "removido".<div class="acoes" style="margin-top:8px"><button type="button" class="btn pequeno" id="btnRemoverNao">Não</button><button type="button" class="btn prim pequeno" id="btnRemoverSim">Sim, remover</button></div></div></div>`;
  }
  if (e.target.closest("#btnRemoverNao")) abrirMembro(editandoId);
  if (e.target.closest("#btnRemoverSim")) {
    const mb = membro(editandoId);
    enviar([{ t: "membro.remover", id: editandoId }], { acao: "Integrante removido", detalhe: mb.nome });
    $("#dlgMembro").close();
    toast(`${mb.nome} removido(a).`);
  }
});
$("#formMembro").addEventListener("submit", (e) => {
  e.preventDefault();
  const antigo = membro(editandoId);
  const m = { id: editandoId, nome: $("#mNome").value.trim(), funcoes: $$('input[name="mFuncao"]:checked').map((i) => i.value), whatsapp: foneInternacional($("#mZap").value), obs: $("#mObs").value.trim() };
  if (!m.nome) return;
  enviar([{ t: "membro.salvar", m }], { acao: "Integrante editado", detalhe: antigo.nome === m.nome ? m.nome : `${antigo.nome} → ${m.nome}` });
  $("#dlgMembro").close();
});

let indispId = null;
function abrirIndisp(id) {
  const mb = membro(id);
  indispId = id;
  $("#indispTitulo").textContent = `${primeiroNome(mb.nome)} não pode em…`;
  $("#indispSub").textContent = mesExtenso(mes);
  const marcadas = new Set(E.indisp[mes]?.[id] || []);
  $("#indispDatas").innerHTML = cultosDoMes(mes).map((c) => `<label class="chip"><input type="checkbox" value="${h(c.id)}"${marcadas.has(c.id) ? " checked" : ""}>${h(c.curto)} ${ddmm(c.data)}</label>`).join("");
  abrir("#dlgIndisp");
}
$("#btnIndispOk").addEventListener("click", () => {
  const datas = $$("#indispDatas input:checked").map((i) => i.value);
  const mb = membro(indispId);
  enviar([{ t: "indisp", mes, id: indispId, datas }], { acao: "Disponibilidade", detalhe: `${mb.nome}: ${datas.length ? datas.length + " data(s) indisponível(is) em " + MESES[Number(mes.slice(5)) - 1] : "disponível o mês todo"}` });
  $("#dlgIndisp").close();
});

// ---------- Vagas do mês ----------
function abrirVagas() {
  const cfg = cfgVagas();
  $("#vagasMes").textContent = `${mesExtenso(mes)} em diante`;
  $$("#segBacks button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === cfg.backings)));
  $("#vagasInstr").innerHTML = INSTR.map((v) => `<label class="chip"><input type="checkbox" value="${h(v.cargo)}"${cfg.instrumentos.includes(v.cargo) ? " checked" : ""}>${h(v.cargo)}</label>`).join("");
  abrir("#dlgVagas");
}
$("#segBacks").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#segBacks button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
});
$("#btnVagasOk").addEventListener("click", () => {
  const backings = Number($('#segBacks button[aria-pressed="true"]')?.dataset.n ?? 3);
  const instrumentos = $$("#vagasInstr input:checked").map((i) => i.value);
  const fora = INSTR.map((v) => v.cargo).filter((c) => !instrumentos.includes(c));
  enviar([{ t: "vagas", mes, backings, instrumentos }], { acao: "Vagas da escala", detalhe: `${mesExtenso(mes)} em diante: ${backings} backing(s); ${instrumentos.length ? instrumentos.join(", ") : "sem instrumentos"}${fora.length ? ` (fora: ${fora.join(", ")})` : ""}` });
  $("#dlgVagas").close();
  toast("Vagas atualizadas. Vale para este mês e os próximos.");
});

// ---------- Liderança ----------
$("#btnLideranca").addEventListener("click", () => {
  const [a = {}, b = {}] = E.lideranca;
  $("#l1n").value = a.nome || ""; $("#l1w").value = a.whatsapp ? foneBonito(a.whatsapp) : "";
  $("#l2n").value = b.nome || ""; $("#l2w").value = b.whatsapp ? foneBonito(b.whatsapp) : "";
  abrir("#dlgLideranca");
});
$("#formLideranca").addEventListener("submit", (e) => {
  e.preventDefault();
  const lideres = [
    { nome: $("#l1n").value.trim(), whatsapp: foneInternacional($("#l1w").value) },
    { nome: $("#l2n").value.trim(), whatsapp: foneInternacional($("#l2w").value) },
  ].filter((l) => l.nome);
  enviar([{ t: "lideranca", lideres }], { acao: "Liderança alterada", detalhe: lideres.map((l) => l.nome).join(" e ") });
  $("#dlgLideranca").close();
});

// ---------- Mais opções ----------
$("#btnMais").addEventListener("click", () => {
  $("#maisMes").textContent = mesExtenso(mes);
  $("#limparConfirma").hidden = true;
  const tema = ls.get("peniel_tema", "");
  $$("#segTema button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === tema)));
  abrir("#dlgMais");
});
$("#dlgMais").addEventListener("click", (e) => {
  const lb = e.target.closest("[data-limpar]");
  if (lb) {
    const tipo = lb.dataset.limpar;
    const nome = { vozes: "as vozes", instrumentos: "os instrumentos", tudo: "toda a escala" }[tipo];
    const box = $("#limparConfirma");
    box.hidden = false;
    box.innerHTML = `<div>Apagar ${nome} de <strong>${h(mesExtenso(mes))}</strong> para todos? <div class="acoes" style="margin-top:8px"><button class="btn pequeno" id="limparNao">Não</button><button class="btn prim pequeno" id="limparSim" data-tipo="${tipo}">Sim, apagar</button></div></div>`;
    return;
  }
  if (e.target.closest("#limparNao")) { $("#limparConfirma").hidden = true; return; }
  const sim = e.target.closest("#limparSim");
  if (sim) {
    enviar([{ t: "limpar", mes, tipo: sim.dataset.tipo }], { acao: "Escala limpa", detalhe: `${mesExtenso(mes)} (${sim.dataset.tipo})` });
    $("#dlgMais").close();
    toast("Escala do mês apagada.");
    return;
  }
  const tb = e.target.closest("[data-tema]");
  if (tb) { aplicarTema(tb.dataset.tema); $$("#segTema button").forEach((b) => b.setAttribute("aria-pressed", String(b === tb))); }
  if (e.target.closest("#btnVagas2")) { $("#dlgMais").close(); abrirVagas(); return; }
  if (e.target.closest("#btnLideranca2")) { $("#dlgMais").close(); $("#btnLideranca").click(); return; }
  if (e.target.closest("#btnExtra")) { $("#dlgMais").close(); abrirExtra(); }
});
function abrirExtra() {
  const hoje = new Date().toISOString().slice(0, 10);
  $("#extraData").value = hoje.slice(0, 7) === mes ? hoje : `${mes}-01`;
  $("#extraData").removeAttribute("min"); $("#extraData").removeAttribute("max");
  $("#extraNome").value = "";
  abrir("#dlgExtra");
}
function aplicarTema(t) {
  if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  ls.set("peniel_tema", t);
}
aplicarTema(ls.get("peniel_tema", ""));

$("#formExtra").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = $("#extraData").value, nome = $("#extraNome").value.trim();
  if (!data || !nome) return;
  const m = data.slice(0, 7);
  const culto = { id: `${data}-x${Math.random().toString(36).slice(2, 7)}`, data, nome };
  enviar([{ t: "extra.add", mes: m, culto }], { acao: "Escala extra", detalhe: `${nome} em ${ddmm(data)}` });
  toast(`Escala extra "${nome}" criada em ${ddmm(data)}. Agora é só escolher os nomes.`);
  mes = m;
  $("#dlgExtra").close();
  render();
});

// ---------- Preenchimento automático ----------
$("#btnAuto").addEventListener("click", () => {
  if (!E.membros.length) { toast("Cadastre os integrantes primeiro."); mudarAba("integrantes"); return; }
  $("#autoResultado").hidden = true;
  const r = $(`input[name="autoTipo"][value="${aba === "instrumentos" ? "instrumentos" : "vozes"}"]`);
  if (r) r.checked = true;
  abrir("#dlgAuto");
});
$("#btnAutoOk").addEventListener("click", () => {
  const tipo = $('input[name="autoTipo"]:checked').value;
  const refazer = $('input[name="autoModo"]:checked').value === "refazer";
  const base = clonar(E.escala[mes] || {});
  const vagas = vagasDe(tipo);
  if (refazer) for (const c of Object.keys(base)) for (const v of vagas) delete base[c][v.cargo];

  const cultos = cultosDoMes(mes);
  const cont = {};
  for (const c of cultos) for (const id of Object.values(base[c.id] || {})) cont[id] = (cont[id] || 0) + 1;
  const slots = {};
  let feitas = 0, semGente = 0;
  cultos.forEach((c, i) => {
    const atual = (base[c.id] ||= {});
    const anterior = i > 0 ? new Set(Object.values(base[cultos[i - 1].id] || {})) : new Set();
    // Vagas com menos gente apta são preenchidas primeiro
    const ordemVagas = vagas.filter((v) => !atual[v.cargo])
      .map((v) => ({ v, aptos: E.membros.filter((mb) => podeFuncao(mb, v.funcao)).length }))
      .sort((a, b) => a.aptos - b.aptos).map((x) => x.v);
    for (const v of ordemVagas) {
      const noCulto = new Set(Object.values(atual));
      const opcoes = E.membros.filter((mb) => podeFuncao(mb, v.funcao) && !noCulto.has(mb.id) && !indisponivel(mb.id, c.id));
      if (!opcoes.length) { semGente++; continue; }
      const pontos = (mb) => (cont[mb.id] || 0) * 10 + (anterior.has(mb.id) ? 4 : 0)
        + (v.funcao === "Backing" && mb.funcoes.includes("Ministro") && !mb.funcoes.includes("Backing") ? 3 : 0)
        + mb.funcoes.length * 0.3 + Math.random() * 2;
      opcoes.sort((a, b) => pontos(a) - pontos(b));
      const esc = opcoes[0];
      atual[v.cargo] = esc.id;
      (slots[c.id] ||= {})[v.cargo] = esc.id;
      cont[esc.id] = (cont[esc.id] || 0) + 1;
      feitas++;
    }
  });
  const ops = [];
  if (refazer) ops.push({ t: "limpar", mes, tipo });
  if (feitas) ops.push({ t: "lote", mes, slots });
  if (!ops.length) {
    const box = $("#autoResultado"); box.hidden = false;
    box.textContent = semGente ? `Nenhuma vaga preenchida: faltam pessoas com a função certa ou disponíveis (${semGente} vaga(s)).` : "Todas as vagas já estão preenchidas.";
    return;
  }
  enviar(ops, { acao: "Preenchimento automático", detalhe: `${mesExtenso(mes)}: ${feitas} vaga(s) de ${tipo === "tudo" ? "vozes e instrumentos" : tipo}` });
  $("#dlgAuto").close();
  if (tipo !== "tudo" && aba !== tipo) mudarAba(tipo);
  toast(`${feitas} vaga(s) preenchida(s)${semGente ? ` · ${semGente} sem ninguém disponível` : ""}. Revise e ajuste à vontade.`);
});

// ---------- WhatsApp ----------
let zapTipo = "tudo";
function linhasCulto(c, tipo) {
  const sel = E.escala[mes]?.[c.id] || {};
  const out = [];
  if (tipo !== "instrumentos") {
    const min = nomeDe(sel["Ministro de Louvor"]);
    const backs = vagasDe("vozes").slice(1).map((v) => nomeDe(sel[v.cargo])).filter(Boolean);
    if (min || backs.length) out.push(`🎤 ${min ? `Ministro: ${min}` : "Ministro: a definir"}${backs.length ? ` | Backing: ${backs.join(", ")}` : ""}`);
  }
  if (tipo !== "vozes") {
    const ins = vagasDe("instrumentos").map((v) => (sel[v.cargo] ? `${v.curto}: ${nomeDe(sel[v.cargo])}` : "")).filter(Boolean);
    if (ins.length) out.push(`🎹 ${ins.join(" | ")}`);
  }
  return out;
}
function textoGrupo(tipo) {
  const titulo = { tudo: "Escala do Louvor", vozes: "Escala de Vozes", instrumentos: "Escala de Instrumentos" }[tipo];
  let t = `*MINISTÉRIO DE LOUVOR PENIEL*\n📅 *${titulo} · ${mesExtenso(mes)}*\n`;
  for (const c of cultosDoMes(mes)) {
    const d = new Date(c.data + "T12:00");
    const rot = c.ceia ? `${c.nome} (Ceia)` : c.extra ? c.nome : DIAS[d.getDay()];
    t += `\n*${ddmm(c.data)} · ${rot}*\n`;
    const l = linhasCulto(c, tipo);
    t += l.length ? l.join("\n") + "\n" : "_A definir_\n";
  }
  if (E.lideranca.length) t += `\nDúvidas ou trocas: ${E.lideranca.map((l) => `${primeiroNome(l.nome)} ${foneBonito(l.whatsapp)}`).join(" · ")}`;
  t += `\n🙏 Deus abençoe nosso servir!`;
  return t;
}
function escalaDaPessoa(id) {
  const itens = [];
  for (const c of cultosDoMes(mes)) {
    const sel = E.escala[mes]?.[c.id] || {};
    const ativos = new Set(vagasDe("tudo").map((v) => v.cargo));
    const cargos = Object.entries(sel).filter(([cg, x]) => x === id && ativos.has(cg)).map(([cargo]) => cargo);
    if (cargos.length) {
      const d = new Date(c.data + "T12:00");
      itens.push(`• ${DIAS_CURTOS[d.getDay()]} ${ddmm(c.data)}${c.ceia ? (c.id.endsWith("manha") ? " manhã (Ceia)" : " noite (Ceia)") : c.extra ? ` (${c.nome})` : ""}: ${cargos.join(" e ")}`);
    }
  }
  return itens;
}
function renderZap() {
  $("#zapMes").textContent = mesExtenso(mes);
  const txt = textoGrupo(zapTipo);
  $("#zapPrevia").textContent = txt;
  $("#zapAbrir").href = `https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`;
  const enviados = new Set(ls.get(`peniel_enviados_${mes}`, []));
  const pessoas = E.membros.map((mb) => ({ mb, itens: escalaDaPessoa(mb.id) })).filter((p) => p.itens.length).sort((a, b) => a.mb.nome.localeCompare(b.mb.nome, "pt-BR"));
  $("#zapLista").innerHTML = pessoas.length ? pessoas.map(({ mb, itens }) => {
    const msg = `Olá, ${primeiroNome(mb.nome)}! Paz do Senhor! 🙌\nSua escala no *Louvor Peniel* em *${mesExtenso(mes)}*:\n${itens.join("\n")}\n\nSe não puder em alguma data, avise a liderança o quanto antes. Deus abençoe!`;
    const n = foneInternacional(mb.whatsapp);
    const href = n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    return `<div class="pessoa-zap${enviados.has(mb.id) ? " enviado" : ""}"><div><b>${h(mb.nome)}</b><span>${itens.length} culto(s)${n ? "" : " · sem WhatsApp cadastrado"}</span></div><a class="btn zap pequeno" href="${h(href)}" target="_blank" rel="noopener" data-enviar="${h(mb.id)}"><svg><use href="#i-zap"/></svg>Enviar</a></div>`;
  }).join("") : `<div class="vazio-estado">Ninguém escalado neste mês ainda.</div>`;
}
$("#btnZap").addEventListener("click", () => { renderZap(); abrir("#dlgZap"); });
$("#segZapModo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#segZapModo button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("#zapGrupo").hidden = b.dataset.modo !== "grupo";
  $("#zapPessoas").hidden = b.dataset.modo !== "pessoas";
});
$("#segZapTipo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  zapTipo = b.dataset.tipo;
  $$("#segZapTipo button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderZap();
});
$("#zapLista").addEventListener("click", (e) => {
  const a = e.target.closest("[data-enviar]"); if (!a) return;
  const k = `peniel_enviados_${mes}`;
  const s = new Set(ls.get(k, [])); s.add(a.dataset.enviar); ls.set(k, [...s]);
  setTimeout(renderZap, 300);
});
$("#zapCopiar").addEventListener("click", async () => {
  const txt = $("#zapPrevia").textContent;
  try { await navigator.clipboard.writeText(txt); toast("Texto copiado. É só colar no grupo."); }
  catch { const r = document.createRange(); r.selectNodeContents($("#zapPrevia")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto selecionado. Use Copiar do seu aparelho."); }
});

// ---------- PDF (texto de verdade, não imagem) ----------
let logoPng = null;
let logoProp = 1;
let logoImg = null;
function prepararLogo() {
  const img = new Image();
  img.onload = () => {
    logoImg = img;
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    logoProp = img.naturalWidth / img.naturalHeight;
    try { logoPng = cv.toDataURL("image/png"); } catch {}
  };
  img.src = "logo.png";
}
prepararLogo();

// Fontes do PDF (Barlow Condensed), carregadas na primeira vez que alguém gera um PDF
let fontesPdf = null;
function carregarFontes() {
  if (fontesPdf) return fontesPdf;
  const arq = { normal: "BarlowCondensed_500Medium.ttf", semi: "BarlowCondensed_600SemiBold.ttf", forte: "BarlowCondensed_800ExtraBold.ttf" };
  fontesPdf = Promise.all(Object.entries(arq).map(async ([k, f]) => {
    const buf = await (await fetch(`vendor/fonts/${f}`)).arrayBuffer();
    let bin = ""; const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return [k, f, btoa(bin)];
  })).catch(() => (fontesPdf = null, null));
  return fontesPdf;
}

$("#btnPdf").addEventListener("click", () => {
  const r = $(`input[name="pdfTipo"][value="${aba === "instrumentos" ? "instrumentos" : "vozes"}"]`);
  if (r) r.checked = true;
  abrir("#dlgPdf");
});
$("#btnPdfOk").addEventListener("click", async () => {
  if (!window.jspdf) { toast("O gerador de PDF ainda está carregando. Tente em alguns segundos."); return; }
  const btn = $("#btnPdfOk"); btn.disabled = true;
  try {
    const tipo = $('input[name="pdfTipo"]:checked').value;
    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const fontes = await carregarFontes();
    let F = { normal: ["helvetica", "normal"], semi: ["helvetica", "bold"], forte: ["helvetica", "bold"] };
    if (fontes) {
      for (const [k, f, b64] of fontes) { doc.addFileToVFS(f, b64); doc.addFont(f, "Barlow" + k, "normal"); }
      F = { normal: ["Barlownormal", "normal"], semi: ["Barlowsemi", "normal"], forte: ["Barlowforte", "normal"] };
    }
    const tipos = (tipo === "tudo" ? ["vozes", "instrumentos"] : [tipo]).filter((t) => vagasDe(t).length);
    if (!tipos.length) { toast("Não há vagas desse tipo neste mês."); return; }
    tipos.forEach((t, i) => { if (i) doc.addPage(); paginaPdf(doc, t, F); });
    const nomeArq = { vozes: "VOZES", instrumentos: "INSTRUMENTOS", tudo: "VOZES_e_INSTRUMENTOS" }[tipo];
    const mesNome = MESES[Number(mes.slice(5)) - 1];
    doc.setProperties({ title: `Escala de ${tipo === "tudo" ? "Vozes e Instrumentos" : tipo === "vozes" ? "Vozes" : "Instrumentos"} - ${mesNome} ${mes.slice(0, 4)} - IBN Peniel` });
    doc.save(`Escala_${nomeArq}_${mesNome}_${mes.slice(0, 4)}_Peniel.pdf`);
    $("#dlgPdf").close();
    toast(tipo === "tudo" ? "PDF baixado: vozes (pág. 1) e instrumentos (pág. 2)." : `PDF de ${tipo === "vozes" ? "VOZES" : "INSTRUMENTOS"} baixado.`);
  } catch (err) {
    console.error(err);
    toast("Não foi possível gerar o PDF. Tente de novo.");
  } finally { btn.disabled = false; }
});
// ---------- Imagem JPG (mesmo desenho do PDF, feito num canvas) ----------
// Imita a parte do jsPDF que o paginaPdf usa, com unidades em milímetros.
const PT = 0.3528; // 1 ponto tipográfico em mm
class CanvasDoc {
  constructor(escala) {
    this.s = escala;
    this.cv = document.createElement("canvas");
    this.cv.width = Math.round(297 * escala); this.cv.height = Math.round(210 * escala);
    this.c = this.cv.getContext("2d");
    this.c.scale(escala, escala);
    this.c.fillStyle = "#fff"; this.c.fillRect(0, 0, 297, 210);
    this.c.textBaseline = "alphabetic";
    this.fam = "Arial"; this.peso = "400"; this.tam = 10; this.cor = "#000";
    this.fill = "#000"; this.stroke = "#000"; this.lw = 0.2;
    this.aplicarFonte();
  }
  rgb(a) { return `rgb(${a[0]},${a[1]},${a[2]})`; }
  aplicarFonte() { this.c.font = `${this.peso} ${this.tam * PT}px ${this.fam}`; }
  setFont(nome) {
    const mapa = { Barlownormal: ["PenielN", "400"], Barlowsemi: ["PenielS", "400"], Barlowforte: ["PenielF", "400"] };
    if (mapa[nome]) [this.fam, this.peso] = mapa[nome];
    else { this.fam = "Arial, Helvetica, sans-serif"; this.peso = arguments[1] === "bold" ? "700" : "400"; }
    this.aplicarFonte();
  }
  setFontSize(t) { this.tam = t; this.aplicarFonte(); }
  getFontSize() { return this.tam; }
  setTextColor(...a) { this.cor = this.rgb(a); }
  setFillColor(...a) { this.fill = this.rgb(a); }
  setDrawColor(...a) { this.stroke = this.rgb(a); }
  setLineWidth(w) { this.lw = w; }
  getTextWidth(t) { return this.c.measureText(String(t)).width; }
  splitTextToSize(t, max) {
    const linhas = []; let atual = "";
    for (const p of String(t).split(/\s+/)) {
      const tent = atual ? atual + " " + p : p;
      if (this.getTextWidth(tent) <= max || !atual) atual = tent; else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }
  text(t, x, y, o = {}) {
    const linhas = Array.isArray(t) ? t : [t];
    const c = this.c;
    c.fillStyle = this.cor;
    c.textAlign = o.align === "right" ? "right" : o.align === "center" ? "center" : "left";
    try { c.letterSpacing = o.charSpace ? `${o.charSpace}px` : "0px"; } catch {}
    const lh = this.tam * PT * (o.lineHeightFactor || 1.15);
    linhas.forEach((l, i) => c.fillText(String(l), x, y + i * lh));
  }
  rect(x, y, w, h, est = "S") { this.forma(() => this.c.rect(x, y, w, h), est); }
  roundedRect(x, y, w, h, r, _r2, est = "S") { this.forma(() => this.c.roundRect(x, y, w, h, r), est); }
  line(x1, y1, x2, y2) { const c = this.c; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = this.stroke; c.lineWidth = this.lw; c.stroke(); }
  forma(caminho, est) {
    const c = this.c; c.beginPath(); caminho();
    if (est.includes("F")) { c.fillStyle = this.fill; c.fill(); }
    if (est === "S" || est === "FD" || est === "DF") { c.strokeStyle = this.stroke; c.lineWidth = this.lw; c.stroke(); }
  }
  addImage(_src, _f, x, y, w, h) { if (logoImg) this.c.drawImage(logoImg, x, y, w, h); }
  setProperties() {}
  addPage() {}
}

let fontesCanvas = null;
function carregarFontesCanvas() {
  if (fontesCanvas) return fontesCanvas;
  const arq = { PenielN: "BarlowCondensed_500Medium.ttf", PenielS: "BarlowCondensed_600SemiBold.ttf", PenielF: "BarlowCondensed_800ExtraBold.ttf" };
  fontesCanvas = Promise.all(Object.entries(arq).map(async ([fam, f]) => {
    const ff = new FontFace(fam, `url(vendor/fonts/${f})`);
    await ff.load(); document.fonts.add(ff);
  })).then(() => true).catch(() => (fontesCanvas = null, false));
  return fontesCanvas;
}

async function gerarJpg(tipo) {
  const ok = await carregarFontesCanvas();
  const F = ok
    ? { normal: ["Barlownormal", "normal"], semi: ["Barlowsemi", "normal"], forte: ["Barlowforte", "normal"] }
    : { normal: ["helvetica", "normal"], semi: ["helvetica", "bold"], forte: ["helvetica", "bold"] };
  const d = new CanvasDoc(2400 / 297); // 2400 x 1697 px
  paginaPdf(d, tipo, F);
  return await new Promise((res) => d.cv.toBlob(res, "image/jpeg", 0.92));
}

function baixarBlob(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportarImagem(compartilhar) {
  const tipo = $('input[name="pdfTipo"]:checked').value;
  const tipos = (tipo === "tudo" ? ["vozes", "instrumentos"] : [tipo]).filter((t) => vagasDe(t).length);
  if (!tipos.length) { toast("Não há vagas desse tipo neste mês."); return; }
  const mesNome = MESES[Number(mes.slice(5)) - 1];
  const arquivos = [];
  for (const t of tipos) {
    const blob = await gerarJpg(t);
    arquivos.push(new File([blob], `Escala_${t === "vozes" ? "VOZES" : "INSTRUMENTOS"}_${mesNome}_${mes.slice(0, 4)}_Peniel.jpg`, { type: "image/jpeg" }));
  }
  if (compartilhar) {
    try {
      await navigator.share({ files: arquivos, title: `Escala do Louvor · ${mesNome}`, text: `Escala do Louvor Peniel · ${mesExtenso(mes)}` });
      $("#dlgPdf").close();
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast("Não deu para compartilhar direto. As imagens foram baixadas.");
    }
  }
  arquivos.forEach((f, i) => setTimeout(() => baixarBlob(f, f.name), i * 700));
  $("#dlgPdf").close();
  toast(arquivos.length > 1 ? "2 imagens baixadas: vozes e instrumentos." : `Imagem de ${tipos[0] === "vozes" ? "VOZES" : "INSTRUMENTOS"} baixada.`);
}

const podeCompartilhar = (() => {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] })); } catch { return false; }
})();
if (podeCompartilhar) $("#btnImgShare").hidden = false;

async function comBotao(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (err) { console.error(err); toast("Não foi possível gerar a imagem. Tente de novo."); }
  finally { btn.disabled = false; }
}
$("#btnImg").addEventListener("click", (e) => comBotao(e.currentTarget, () => exportarImagem(false)));
$("#btnImgShare").addEventListener("click", (e) => comBotao(e.currentTarget, () => exportarImagem(true)));

// PDF em cartões: um cartão por culto, com o dia em destaque e os nomes logo abaixo.
// Cada escala (vozes ou instrumentos) cabe inteira numa folha A4 deitada.
function paginaPdf(doc, tipo, F) {
  const W = 297, H = 210, M = 10;
  const COR = { verm: [209, 10, 20], vermSuave: [253, 238, 238], tinta: [30, 24, 26], cinza: [120, 108, 112], claro: [200, 192, 194], linha: [236, 230, 229], borda: [222, 214, 213], escuro: [36, 29, 31], rosaClaro: [255, 214, 217], cinzaClaro: [190, 180, 183] };
  const fonte = (k, tam, cor) => { doc.setFont(...F[k]); doc.setFontSize(tam); doc.setTextColor(...cor); };
  const cultos = cultosDoMes(mes);
  const vagas = vagasDe(tipo);
  const [ano, nm] = mes.split("-").map(Number);

  // Cabeçalho da folha
  const lh = 21;
  if (logoPng) doc.addImage(logoPng, "PNG", M, M - 2, lh * logoProp, lh);
  const tx = M + lh * logoProp + 5;
  fonte("forte", 20, COR.verm); doc.text("IGREJA BATISTA NACIONAL PENIEL", tx, M + 6.5);
  fonte("semi", 9.5, COR.cinza); doc.text("MINISTÉRIO DE LOUVOR  •  BERILO - MG", tx, M + 12);
  fonte("normal", 9, COR.cinza); doc.text("Lugar de encontro, face a face com Deus!", tx, M + 17);
  // Identificação da escala: cor própria (vozes em vermelho, instrumentos em azul), faixa no topo e selo grande
  const corTipo = tipo === "vozes" ? COR.verm : [20, 78, 150];
  const nomeTipo = tipo === "vozes" ? "ESCALA DE VOZES" : "ESCALA DE INSTRUMENTOS";
  doc.setFillColor(...corTipo); doc.rect(0, 0, W, 3.2, "F");
  fonte("forte", 17, [255, 255, 255]);
  const selW = doc.getTextWidth(nomeTipo) + 14, selH = 11.5, selX = W - M - selW, selY = M - 4.5;
  doc.setFillColor(...corTipo); doc.roundedRect(selX, selY, selW, selH, 2.2, 2.2, "F");
  doc.text(nomeTipo, selX + selW / 2, selY + 8.2, { align: "center" });
  fonte("forte", 15, COR.tinta); doc.text(`${MESES[nm - 1].toUpperCase()} ${ano}`, W - M, M + 15.5, { align: "right" });
  doc.setDrawColor(...corTipo); doc.setLineWidth(0.8); doc.line(M, M + 21, W - M, M + 21);

  // Grade de cartões
  const n = Math.max(1, cultos.length);
  const cols = n <= 12 ? 4 : n <= 15 ? 5 : n <= 16 ? 4 : n <= 20 ? 5 : 6;
  const rows = Math.ceil(n / cols);
  const gx = 5, gy = 4.5;
  const topo = M + 26, base = H - M - 5;
  const cw = (W - 2 * M - gx * (cols - 1)) / cols;
  const ch = (base - topo - gy * (rows - 1)) / rows;
  const faixa = 11;

  // Rótulos das linhas: "Backing" aparece só uma vez
  const rotulos = vagas.map((v, i) => {
    if (v.funcao === "Backing") return vagas[i - 1]?.funcao === "Backing" ? "" : "BACKING";
    return v.curto.toUpperCase();
  });
  fonte("semi", 7.2, COR.cinza);
  const colRot = Math.max(...rotulos.map((r) => doc.getTextWidth(r))) + 3.5;

  function caberNome(txt, maxW, tam, k) {
    fonte(k, tam, COR.tinta);
    let t = tam;
    while (t > 8 && doc.getTextWidth(txt) > maxW) { t -= 0.25; doc.setFontSize(t); }
    if (doc.getTextWidth(txt) > maxW) {
      const p = txt.split(/\s+/);
      if (p.length > 2) { txt = `${p[0]} ${p[p.length - 1]}`; doc.setFontSize(tam); t = tam; while (t > 8 && doc.getTextWidth(txt) > maxW) { t -= 0.25; doc.setFontSize(t); } }
      if (doc.getTextWidth(txt) > maxW) txt = doc.splitTextToSize(txt, maxW)[0];
    }
    return txt;
  }

  cultos.forEach((c, i) => {
    const x = M + (i % cols) * (cw + gx);
    const y = topo + Math.floor(i / cols) * (ch + gy);
    const d = new Date(c.data + "T12:00");
    const cor = c.ceia ? COR.verm : COR.escuro;

    // Cartão
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...(c.ceia ? COR.verm : COR.borda)); doc.setLineWidth(c.ceia ? 0.7 : 0.35);
    doc.roundedRect(x, y, cw, ch, 2.2, 2.2, "FD");
    // Faixa do dia
    doc.setFillColor(...cor);
    doc.roundedRect(x, y, cw, faixa, 2.2, 2.2, "F");
    doc.rect(x, y + faixa - 2.5, cw, 2.5, "F");
    const dia = String(d.getDate()).padStart(2, "0");
    fonte("forte", 21, [255, 255, 255]); doc.text(dia, x + 3.2, y + 8.6);
    const wDia = doc.getTextWidth(dia);
    const sem = c.extra ? c.nome.toUpperCase() : DIAS[d.getDay()] === "Terça" ? "TERÇA-FEIRA" : DIAS[d.getDay()] === "Quinta" ? "QUINTA-FEIRA" : DIAS[d.getDay()].toUpperCase();
    const sub = c.ceia ? `CEIA  •  ${c.turno.toUpperCase()}` : c.extra ? `${DIAS[d.getDay()].toUpperCase()}  •  ESCALA EXTRA` : MESES[nm - 1].toUpperCase();
    const xs = x + 3.2 + wDia + 2.6, ws = cw - (xs - x) - 2.5;
    fonte("forte", 10, [255, 255, 255]); doc.text(doc.splitTextToSize(sem, ws)[0], xs, y + 5.1);
    fonte("semi", 7.3, c.ceia ? COR.rosaClaro : COR.cinzaClaro); doc.text(doc.splitTextToSize(sub, ws)[0], xs, y + 8.9);

    // Nomes
    const sel = E.escala[mes]?.[c.id] || {};
    const corpoTopo = y + faixa + 1.2, corpoAlt = ch - faixa - 2.4;
    const lhN = corpoAlt / vagas.length;
    const tamNome = Math.min(11.5, Math.max(8.5, lhN * 2.05));
    vagas.forEach((v, k) => {
      const ly = corpoTopo + lhN * k;
      const ym = ly + lhN / 2;
      if (k > 0 && rotulos[k] !== "") {
        doc.setDrawColor(...COR.linha); doc.setLineWidth(v.funcao === "Backing" ? 0.35 : 0.2);
        doc.line(x + 3, ly, x + cw - 3, ly);
      }
      if (rotulos[k]) { fonte("semi", 7.2, c.ceia ? COR.verm : COR.cinza); doc.text(rotulos[k], x + 3.2, ym + 1.2, { charSpace: 0.25 }); }
      const nm2 = nomeDe(sel[v.cargo]);
      const xn = x + 3.2 + colRot, wn = cw - (xn - x) - 3;
      if (!nm2) { fonte("normal", 10, COR.claro); doc.text("—", xn, ym + 1.4); return; }
      const k2 = v.cargo === "Ministro de Louvor" ? "forte" : "semi";
      const t = caberNome(nm2, wn, v.cargo === "Ministro de Louvor" ? tamNome + 0.5 : tamNome, k2);
      doc.text(t, xn, ym + doc.getFontSize() * 0.13);
    });
  });

  // Rodapé
  const lid = E.lideranca.map((l) => `${l.nome}  ${foneBonito(l.whatsapp)}`).join("     •     ");
  if (lid) { fonte("semi", 8.5, COR.tinta); doc.text("LIDERANÇA:", M, H - M + 1.5); fonte("normal", 8.5, COR.cinza); doc.text(lid, M + doc.getTextWidth("LIDERANÇA: ") + 2.5, H - M + 1.5); }
  fonte("normal", 8.5, COR.cinza);
  const ceia = ceiaDoMes(mes);
  doc.text(`${ceia !== "nenhum" ? `Ceia: domingo, ${ddmm(ceia)}     •     ` : ""}Gerado em ${new Date().toLocaleDateString("pt-BR")}`, W - M, H - M + 1.5, { align: "right" });
}

// ---------- Histórico e cópias ----------
$("#btnHistorico").addEventListener("click", async () => {
  $("#autorNome").value = ls.get("peniel_autor", "");
  $("#restaurarConfirma").hidden = true;
  renderLog();
  abrir("#dlgHistorico");
  try {
    const r = await fetch(`${API}?backups=1`, { cache: "no-store" });
    const { backups } = await r.json();
    $("#copias").innerHTML = backups.length ? backups.map((d) => `<button class="btn pequeno" data-restaurar="${h(d)}">${h(d.split("-").reverse().join("/"))}</button>`).join("") : `<small style="color:var(--muted)">A primeira cópia é criada automaticamente na próxima alteração de cada dia.</small>`;
  } catch { $("#copias").innerHTML = `<small style="color:var(--muted)">Sem conexão com o servidor.</small>`; }
});
function renderLog() {
  $("#logLista").innerHTML = E.historico.length ? E.historico.slice(0, 80).map((l) => `<div class="log-item"><b>${h(l.acao)}</b><p>${h(l.detalhe)}</p><small>${h(l.autor)}${l.aparelho ? " · " + h(l.aparelho) : ""} · ${h(quando(l.ts))}</small></div>`).join("") : `<div class="vazio-estado">Nenhuma alteração registrada ainda.</div>`;
}
$("#copias").addEventListener("click", (e) => {
  const b = e.target.closest("[data-restaurar]"); if (!b) return;
  const d = b.dataset.restaurar;
  const box = $("#restaurarConfirma");
  box.hidden = false;
  box.innerHTML = `<div>Voltar todos os dados para como estavam no início do dia <strong>${h(d.split("-").reverse().join("/"))}</strong>? As mudanças feitas depois disso serão perdidas para todos.<div class="acoes" style="margin-top:8px"><button class="btn pequeno" id="restNao">Não</button><button class="btn prim pequeno" id="restSim" data-data="${h(d)}">Sim, restaurar</button></div></div>`;
});
$("#restaurarConfirma").addEventListener("click", async (e) => {
  if (e.target.closest("#restNao")) { $("#restaurarConfirma").hidden = true; return; }
  const b = e.target.closest("#restSim"); if (!b) return;
  b.disabled = true;
  try {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurar: b.dataset.data, autor: ls.get("peniel_autor", ""), aparelho: aparelho() }) });
    if (!r.ok) throw new Error();
    servidor = await r.json(); pendentes = []; recalcular(); salvarLocal(); render(); renderLog();
    $("#restaurarConfirma").hidden = true;
    toast("Cópia restaurada para todos.");
  } catch { toast("Não foi possível restaurar agora. Verifique a internet."); b.disabled = false; }
});
function salvarAutor(v) { ls.set("peniel_autor", v.trim()); toast(v.trim() ? `Você aparece como ${v.trim()} no histórico.` : "Nome apagado."); }
$("#formAutor").addEventListener("submit", (e) => { e.preventDefault(); salvarAutor($("#autorNome").value); });
$("#formAutor2").addEventListener("submit", (e) => { e.preventDefault(); salvarAutor($("#autorNome2").value); $("#dlgAutor").close(); });
$("#btnExportar").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(E, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `escala-louvor-peniel-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ---------- Início ----------
recalcular();
render();
mostrarStatus();
buscar();
setInterval(buscar, 12000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscar(); });
window.addEventListener("online", () => { descarregar(); buscar(); });
})();
