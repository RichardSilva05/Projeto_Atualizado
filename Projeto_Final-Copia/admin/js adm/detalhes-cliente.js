"use strict";

const API_URL = "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", carregarDetalhesCliente);

async function carregarDetalhesCliente() {
    const token = sessionStorage.getItem("tokenAdmin");
    if (!token) {
        window.location.replace("login.html");
        return;
    }
    const codigo = new URLSearchParams(window.location.search).get("codigo");
    const dadosEl = document.getElementById("dadosCliente");
    const historicoEl = document.getElementById("historicoOrcamentos");
    if (!codigo) {
        exibirErro(dadosEl, "O link não contém o código do cliente.");
        historicoEl.replaceChildren();
        return;
    }
    document.getElementById("codigoCabecalho").textContent = `Código: ${codigo}`;
    try {
        const resposta = await fetch(
            `${API_URL}/clientes/${encodeURIComponent(codigo)}/detalhes`,
            {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                cache: "no-store"
            }
        );
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar o cliente.");
        renderizarCliente(dados.cliente);
        renderizarHistorico(dados.orcamentos || []);
    } catch (erro) {
        console.error("Erro ao carregar detalhes do cliente:", erro);
        exibirErro(dadosEl, erro.message || "Falha ao carregar os dados.");
        historicoEl.replaceChildren();
    }
}

function renderizarCliente(cliente) {
    const container = document.getElementById("dadosCliente");
    container.replaceChildren();
    const grid = document.createElement("div");
    grid.className = "dados-cliente-grid";
    const endereco = [cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.cidade, cliente.estado, cliente.cep]
        .filter(Boolean).join(", ") || "Não informado";
    const tipo = cliente.tipoCliente === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";
    const campos = [
        ["Nome", cliente.nome], ["Nome fantasia", cliente.nomeFantasia],
        ["Responsável", cliente.responsavel], ["Tipo", tipo],
        ["CPF/CNPJ", formatarDocumento(cliente.documento)], ["E-mail", cliente.email],
        ["Telefone", cliente.telefone], ["Código", cliente.codigo],
        ["Endereço cadastral", endereco], ["Cliente desde", formatarData(cliente.criadoEm)]
    ];
    campos.forEach(([rotulo, valor]) => {
        if (valor === null || valor === undefined || valor === "") return;
        grid.appendChild(criarCampo(rotulo, valor));
    });
    container.appendChild(grid);
}

function renderizarHistorico(orcamentos) {
    const container = document.getElementById("historicoOrcamentos");
    container.replaceChildren();
    if (!Array.isArray(orcamentos) || orcamentos.length === 0) {
        const vazio = document.createElement("p");
        vazio.className = "historico-vazio";
        vazio.textContent = "Este cliente ainda não possui orçamentos.";
        container.appendChild(vazio);
        return;
    }
    const resumo = document.createElement("p");
    resumo.textContent = `${orcamentos.length} orçamento(s), do mais recente ao mais antigo.`;
    container.appendChild(resumo);
    orcamentos.forEach(orcamento => container.appendChild(criarCardOrcamento(orcamento)));
}

function criarCardOrcamento(o) {
    const card = document.createElement("article");
    card.className = "orcamento-item";
    const topo = document.createElement("div");
    topo.className = "orcamento-topo";
    const titulo = document.createElement("h3");
    titulo.textContent = `Orçamento ${o.codigo || "—"}`;
    const status = document.createElement("span");
    status.className = "tag-status";
    status.textContent = o.status || "Aguardando";
    topo.append(titulo, status);
    card.appendChild(topo);

    const enderecoServico = [o.logradouroServico, o.numeroServico, o.complementoServico, o.bairroServico, o.cidadeServico, o.estadoServico, o.cepServico]
        .filter(Boolean).join(", ") || "Não informado";
    const servicos = Array.isArray(o.servicos) && o.servicos.length ? o.servicos.join(", ") : "Não informado";
    const servicosDetalhados = Array.isArray(o.servicosDetalhados) ? o.servicosDetalhados : [];
    const metragens = servicosDetalhados.length
        ? servicosDetalhados.map(item => {
            const area = item.area == null ? "metragem não registrada" : `${formatarNumero(item.area)} m²`;
            const valor = item.valor == null ? "sob consulta / não registrado" : formatarMoeda(item.valor);
            return `${item.nome || "Serviço"}: ${area} — ${valor}`;
        }).join(" | ")
        : "Não disponível para este orçamento.";
    const campos = [
        ["Enviado em", formatarData(o.criadoEm)], ["Última atualização", formatarData(o.atualizadoEm)],
        ["Serviços", servicos], ["Metragem por serviço", metragens],
        ["Área total", o.area == null ? "—" : `${formatarNumero(o.area)} m²`],
        ["Prazo", o.prazo], ["Valor", formatarMoeda(o.valor)],
        ["Progresso", o.progresso == null ? "—" : `${formatarNumero(o.progresso)}%`],
        ["Visita técnica", o.visitaTecnica ? "Solicitada" : "Não solicitada"],
        ["Endereço do serviço", enderecoServico],
        ["Nome informado no pedido", o.nomeFantasiaInformado || o.nomeInformado],
        ["Responsável informado", o.responsavelInformado],
        ["E-mail informado", o.emailInformado], ["Telefone informado", o.telefoneInformado]
    ];
    const grid = document.createElement("div");
    grid.className = "orcamento-grid";
    campos.forEach(([rotulo, valor]) => {
        if (valor === null || valor === undefined || valor === "") return;
        grid.appendChild(criarCampo(rotulo, valor));
    });
    card.appendChild(grid);
    if (o.observacoes) {
        const observacoes = document.createElement("p");
        observacoes.className = "observacoes-orcamento";
        const label = document.createElement("strong");
        label.textContent = "Observações: ";
        observacoes.append(label, document.createTextNode(o.observacoes));
        card.appendChild(observacoes);
    }
    return card;
}

function criarCampo(rotulo, valor) {
    const div = document.createElement("div");
    div.className = "campo-detalhe";
    const label = document.createElement("small");
    label.textContent = rotulo;
    const texto = document.createElement("strong");
    texto.textContent = String(valor);
    div.append(label, texto);
    return div;
}
function exibirErro(container, texto) {
    container.replaceChildren();
    const mensagem = document.createElement("p");
    mensagem.className = "estado-erro";
    mensagem.textContent = texto;
    container.appendChild(mensagem);
}
function formatarDocumento(valor) {
    const digits = String(valor || "").replace(/\D/g, "");
    if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return valor || "Não informado";
}
function formatarData(valor) {
    if (!valor) return "—";
    const data = new Date(String(valor).replace(" ", "T"));
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleString("pt-BR");
}
function formatarNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toLocaleString("pt-BR") : "—";
}
function formatarMoeda(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
