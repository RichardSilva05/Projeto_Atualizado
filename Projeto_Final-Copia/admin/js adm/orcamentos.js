"use strict";

const API_URL = "http://localhost:3000/api";
const STATUS_EDITAVEIS = ["Aguardando", "Aprovado", "Concluído", "Cancelado"];
let listaOrcamentos = [];

document.addEventListener("DOMContentLoaded", () => {
    const token = sessionStorage.getItem("tokenAdmin");
    if (!token) {
        window.location.replace("login.html");
        return;
    }
    configurarOrdenacao();
    configurarNovoOrcamento();
    document.getElementById("filtroStatus")?.addEventListener("change", renderizarOrcamentos);
    carregarPainelOrcamentos();
});

function obterToken() { return sessionStorage.getItem("tokenAdmin"); }
function sairPorSessaoExpirada() {
    sessionStorage.removeItem("tokenAdmin");
    window.location.replace("login.html");
}

async function requisicaoAdmin(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        headers: {
            Accept: "application/json",
            ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
            ...(opcoes.headers || {}),
            Authorization: `Bearer ${obterToken()}`
        },
        cache: "no-store"
    });
    if (resposta.status === 401 || resposta.status === 403) {
        sairPorSessaoExpirada();
        throw new Error("Sessão expirada. Entre novamente.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Falha ao consultar o servidor.");
    return dados;
}

async function carregarTodosOrcamentos() {
    const resultado = [];
    const limite = 500;
    let pagina = 1;
    while (true) {
        const dados = await requisicaoAdmin(`${API_URL}/orcamentos?pagina=${pagina}&limite=${limite}`);
        const paginaDados = Array.isArray(dados) ? dados : dados.orcamentos;
        if (!Array.isArray(paginaDados)) throw new Error("A API retornou uma lista inválida de orçamentos.");
        resultado.push(...paginaDados);
        if (paginaDados.length < limite) break;
        pagina++;
    }
    return resultado;
}

async function carregarPainelOrcamentos() {
    const corpo = document.getElementById("corpoOrcamentos");
    if (corpo) mostrarMensagem(corpo, "Carregando orçamentos...");
    try {
        const [orcamentos, painel] = await Promise.all([
            carregarTodosOrcamentos(),
            requisicaoAdmin(`${API_URL}/painel`)
        ]);
        listaOrcamentos = orcamentos;
        atualizarResumo(orcamentos, painel);
        renderizarOrcamentos();
    } catch (erro) {
        console.error("Erro ao carregar painel de orçamentos:", erro);
        if (corpo) mostrarMensagem(corpo, erro.message || "Não foi possível carregar os dados.");
    }
}

function atualizarResumo(orcamentos, painel) {
    const contar = predicado => orcamentos.filter(predicado).length;
    definirTexto("totalOrcamentos", formatarNumero(orcamentos.length));
    definirTexto("orcamentosPendentes", formatarNumero(contar(o => statusCanonico(o.status) === "Aguardando")));
    definirTexto("orcamentosAprovados", formatarNumero(contar(o => statusCanonico(o.status) === "Aprovado")));
    definirTexto("orcamentosConcluidos", formatarNumero(contar(o => statusCanonico(o.status) === "Concluído")));
    definirTexto("orcamentosCancelados", formatarNumero(contar(o => statusCanonico(o.status) === "Cancelado")));
    definirTexto("novosClientes", formatarNumero(painel.novosClientes));
    definirTexto("receitaMensal", formatarMoeda(painel.receitaMensal));
}

function definirTexto(id, texto) {
    const alvo = document.getElementById(id);
    if (alvo) alvo.textContent = texto;
}
function formatarNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toLocaleString("pt-BR") : "0";
}
function formatarMoeda(valor) {
    const numero = Number(valor);
    return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function statusCanonico(status) {
    const texto = String(status || "Aguardando")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const mapa = {
        "pendente": "Aguardando",
        "aguardando": "Aguardando",
        "aprovado": "Aprovado",
        "concluido": "Concluído",
        "cancelado": "Cancelado",
        "em analise": "Em análise",
        "recusado": "Recusado"
    };
    return mapa[texto] || status || "Aguardando";
}

function renderizarOrcamentos() {
    const corpo = document.getElementById("corpoOrcamentos");
    if (!corpo) return;
    const filtro = document.getElementById("filtroStatus")?.value || "Todos";
    const exibidos = filtro === "Todos"
        ? listaOrcamentos
        : listaOrcamentos.filter(o => statusCanonico(o.status) === filtro);
    corpo.replaceChildren();
    if (!exibidos.length) {
        mostrarMensagem(corpo, filtro === "Todos" ? "Nenhum orçamento cadastrado." : `Nenhum orçamento com status ${filtro}.`);
        return;
    }
    exibidos.forEach(o => corpo.appendChild(criarLinhaOrcamento(o)));
}

function criarLinhaOrcamento(o) {
    const linha = document.createElement("tr");
    linha.dataset.data = normalizarData(o.criadoEm ?? o.data ?? o.created_at);
    linha.dataset.status = statusCanonico(o.status);
    const cliente = document.createElement("td");
    const nome = o.nomeFantasiaInformado || o.nomeInformado || o.clienteNome || "Cliente não informado";
    if (o.clienteCodigo) {
        const link = document.createElement("a");
        link.href = "detalhes-cliente.html?codigo=" + encodeURIComponent(o.clienteCodigo);
        link.textContent = nome;
        link.className = "link-cliente-orcamento";
        cliente.appendChild(link);
    } else cliente.textContent = nome;

    const codigo = document.createElement("td");
    codigo.textContent = o.codigo || "—";
    const data = document.createElement("td");
    data.textContent = formatarData(linha.dataset.data);
    const valor = document.createElement("td");
    valor.textContent = formatarMoeda(o.valor);
    const status = document.createElement("td");
    status.appendChild(criarControleStatus(o));
    const detalhes = document.createElement("td");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn-ver-detalhes";
    botao.textContent = "Ver Detalhes";
    botao.addEventListener("click", () => abrirDetalhes(o.codigo || o.id));
    detalhes.appendChild(botao);
    linha.append(cliente, codigo, data, valor, status, detalhes);
    return linha;
}

function criarControleStatus(orcamento) {
    const atual = statusCanonico(orcamento.status);
    if (!STATUS_EDITAVEIS.includes(atual)) {
        const texto = document.createElement("span");
        texto.className = `status ${obterClasseStatus(atual)}`;
        texto.textContent = atual;
        return texto;
    }
    const seletor = document.createElement("select");
    seletor.className = `status seletor-status-orcamento ${obterClasseStatus(atual)}`;
    seletor.setAttribute("aria-label", `Alterar status do orçamento ${orcamento.codigo || ""}`);
    STATUS_EDITAVEIS.forEach(s => {
        const opcao = document.createElement("option");
        opcao.value = s;
        opcao.textContent = s === "Aguardando" ? "Pendente" : s;
        seletor.appendChild(opcao);
    });
    seletor.value = atual;
    seletor.addEventListener("change", () => alterarStatus(seletor, orcamento, atual));
    return seletor;
}

async function alterarStatus(seletor, orcamento, anterior) {
    seletor.disabled = true;
    try {
        await requisicaoAdmin(`${API_URL}/orcamentos/${encodeURIComponent(orcamento.id)}/status`, {
            method: "PATCH", body: JSON.stringify({ status: seletor.value })
        });
        // Reconsulta orçamentos e indicadores para manter resumo/lista coerentes com o banco.
        await carregarPainelOrcamentos();
    } catch (erro) {
        seletor.value = anterior;
        seletor.className = `status seletor-status-orcamento ${obterClasseStatus(anterior)}`;
        seletor.disabled = false;
        alert(erro.message || "Não foi possível alterar o status.");
    }
}

function obterClasseStatus(status) {
    const c = {
        "Aguardando": "status-aguardando", "Aprovado": "status-aprovado",
        "Concluído": "status-concluido", "Cancelado": "status-cancelado",
        "Em análise": "status-analise", "Recusado": "status-recusado"
    };
    return c[status] || "status-aguardando";
}
function normalizarData(valor) { return valor ? String(valor).replace(" ", "T") : ""; }
function formatarData(valor) {
    if (!valor) return "—";
    const data = new Date(normalizarData(valor));
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}
function abrirDetalhes(codigo) {
    if (!codigo) return alert("Não foi possível identificar o orçamento.");
    window.location.href = "detalhes-orcamento.html?codigo=" + encodeURIComponent(codigo);
}
function configurarNovoOrcamento() {
    document.getElementById("btnNovoOrcamento")?.addEventListener("click", event => {
        event.preventDefault();
        window.location.href = "novo-orcamento.html";
    });
}
function configurarOrdenacao() {
    const th = document.getElementById("colunaData");
    if (!th) return;
    th.setAttribute("role", "button");
    th.setAttribute("tabindex", "0");
    th.addEventListener("click", ordenarPorData);
    th.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); ordenarPorData();
        }
    });
}
function ordenarPorData() {
    const corpo = document.getElementById("corpoOrcamentos");
    const th = document.getElementById("colunaData");
    if (!corpo || !th) return;
    const linhas = [...corpo.querySelectorAll("tr")].filter(tr => tr.dataset.data !== undefined);
    const crescente = !th.classList.contains("ordem-crescente");
    th.classList.toggle("ordem-crescente", crescente);
    linhas.sort((a, b) => crescente
        ? new Date(a.dataset.data) - new Date(b.dataset.data)
        : new Date(b.dataset.data) - new Date(a.dataset.data));
    linhas.forEach(tr => corpo.appendChild(tr));
}
function mostrarMensagem(corpo, mensagem) {
    corpo.replaceChildren();
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 6;
    celula.className = "sem-orcamentos";
    celula.textContent = mensagem;
    linha.appendChild(celula);
    corpo.appendChild(linha);
}
