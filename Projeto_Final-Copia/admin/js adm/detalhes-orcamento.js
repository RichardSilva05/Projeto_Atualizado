"use strict";

const API_URL = "http://localhost:3000/api";
document.addEventListener("DOMContentLoaded", carregarDetalhesOrcamento);


async function carregarDetalhesOrcamento() {
    const token = sessionStorage.getItem("tokenAdmin");
    if (!token) {
        window.location.replace("login.html");
        return;
    }
    const codigo = new URLSearchParams(window.location.search).get("codigo");
    const estado = document.getElementById("estadoPagina");
    if (!codigo) {
        mostrarErro("O link não contém o código do orçamento.");
        return;
    }
    document.getElementById("codigoCabecalho").textContent = `Código: ${codigo}`;
    try {
        const resposta = await fetch(`${API_URL}/orcamentos/${encodeURIComponent(codigo)}/detalhes`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store"
        });
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar o orçamento.");
        estado.hidden = true;
        document.getElementById("conteudoOrcamento").hidden = false;
        renderizarOrcamento(dados);
    } catch (erro) {
        console.error("Erro ao carregar detalhe do orçamento:", erro);
        mostrarErro(erro.message || "Erro ao carregar os dados.");
    }
}

function renderizarOrcamento(o) {
    document.getElementById("tituloOrcamento").textContent = `Orçamento ${o.codigo || ""}`;
    const status = document.getElementById("statusOrcamento");
    status.textContent = o.status || "Aguardando";
    status.className = `tag-status ${classeStatus(o.status)}`;

    preencherGrid("dadosOrcamento", [
        ["Data do pedido", dataBR(o.criadoEm)], ["Última atualização", dataBR(o.atualizadoEm)],
        ["Área total", o.area == null ? "—" : `${numeroBR(o.area)} m²`],
        ["Prazo solicitado", o.prazo], ["Valor", moedaBR(o.valor)],
        ["Progresso", o.progresso == null ? "—" : `${numeroBR(o.progresso)}%`],
        ["Visita técnica", o.visitaTecnica ? "Solicitada" : "Não solicitada"]
    ]);
    const nome = o.nomeFantasiaInformado || o.nomeInformado || o.clienteNomeFantasia || o.clienteNome;
    preencherGrid("dadosCliente", [
        ["Nome informado no orçamento", nome], ["Responsável", o.responsavelInformado || o.clienteResponsavel],
        ["Tipo de cliente", o.tipoCliente === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"],
        ["CPF/CNPJ", documentoBR(o.clienteDocumento)], ["E-mail informado", o.emailInformado || o.clienteEmail],
        ["Telefone informado", o.telefoneInformado || o.clienteTelefone], ["Código do cliente", o.clienteCodigo]
    ]);
    const endereco = [o.logradouro, o.numero, o.complemento, o.bairro, o.cidade, o.estado, o.cep]
        .filter(Boolean).join(", ") || "Não informado";
    const servicosDetalhados = Array.isArray(o.servicosDetalhados)
        ? o.servicosDetalhados
        : [];
    const metragemPorServico = servicosDetalhados.length
        ? servicosDetalhados.map(item => {
            const nomeServico = item.nome || "Serviço";
            const metragem = item.area == null
                ? "metragem não registrada (orçamento antigo)"
                : `${numeroBR(item.area)} m²`;
            const valorServico = item.valor == null
                ? "sob consulta / não registrado"
                : moedaBR(item.valor);
            return `${nomeServico}: ${metragem} — ${valorServico}`;
        }).join("\n")
        : "Metragem por serviço indisponível para este orçamento.";
    preencherGrid("dadosServico", [
        ["Serviços", Array.isArray(o.servicos) && o.servicos.length ? o.servicos.join(", ") : "Não informado"],
        ["Metragem por serviço", metragemPorServico],
        ["Endereço da obra", endereco]
    ]);
    if (o.observacoes) {
        document.getElementById("blocoObservacoes").hidden = false;
        document.getElementById("observacoes").textContent = o.observacoes;
    }
}

function preencherGrid(id, campos) {
    const grid = document.getElementById(id);
    grid.replaceChildren();
    campos.forEach(([rotulo, valor]) => {
        if (valor === null || valor === undefined || valor === "") return;
        const campo = document.createElement("div");
        campo.className = "campo-detalhe";
        const label = document.createElement("small");
        label.textContent = rotulo;
        const conteudo = document.createElement("strong");
        conteudo.textContent = String(valor);
        campo.append(label, conteudo);
        grid.appendChild(campo);
    });
}
function mostrarErro(texto) {
    const estado = document.getElementById("estadoPagina");
    estado.textContent = texto;
    estado.className = "estado-erro";
}
function classeStatus(status) {
    const texto = String(status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const mapa = { aguardando: "status-aguardando", aprovado: "status-aprovado", concluido: "status-concluido", cancelado: "status-cancelado", recusado: "status-recusado", "em analise": "status-analise" };
    return mapa[texto] || "";
}
function dataBR(valor) {
    if (!valor) return "—";
    const data = new Date(String(valor).replace(" ", "T"));
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleString("pt-BR");
}
function numeroBR(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";
}
function moedaBR(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
function documentoBR(valor) {
    const d = String(valor || "").replace(/\D/g, "");
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return valor || "—";
}
