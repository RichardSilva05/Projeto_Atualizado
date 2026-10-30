/* Relatórios Sabino Gesso — todos os indicadores vêm da API autenticada. */
const API_URL = `${window.location.origin}/api`;
const CORES_STATUS = {
    "Aguardando": "#d8a23b",
    "Em análise": "#6b7c93",
    "Aprovado": "#2f8f5b",
    "Recusado": "#9b6a83",
    "Concluído": "#3d659d",
    "Cancelado": "#c75b5b"
};

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", iniciarRelatorios);

function iniciarRelatorios() {
    if (!sessionStorage.getItem("tokenAdmin")) {
        window.location.replace("login.html");
        return;
    }

    preencherPeriodoPadrao();
    $("filtrosRelatorios").addEventListener("submit", event => {
        event.preventDefault();
        carregarRelatorios();
    });
    $("limparFiltros").addEventListener("click", () => {
        $("filtroStatus").value = "";
        preencherPeriodoPadrao();
        carregarRelatorios();
    });
    carregarRelatorios();
}

function preencherPeriodoPadrao() {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    $("dataInicio").value = dataInput(inicio);
    $("dataFim").value = dataInput(hoje);
}

function dataInput(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

async function carregarRelatorios() {
    const de = $("dataInicio").value;
    const ate = $("dataFim").value;
    const status = $("filtroStatus").value;
    const mensagem = $("mensagemRelatorios");

    if (!de || !ate || de > ate) {
        mensagem.textContent = "Informe um intervalo de datas válido: a data inicial deve ser anterior ou igual à final.";
        return;
    }

    mensagem.textContent = "Carregando relatórios…";
    const params = new URLSearchParams({ de, ate });
    if (status) params.set("status", status);

    try {
        const token = sessionStorage.getItem("tokenAdmin");
        const resposta = await fetch(`${API_URL}/relatorios?${params}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store"
        });
        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || `Falha ao carregar relatórios (HTTP ${resposta.status}).`);

        renderizarResumo(dados.resumo || {}, dados.periodo || {}, status);
        renderizarEvolucao($("graficoOrcamentos"), dados.meses || [], "quantidade", "#ec4e4e", "orçamentos", false);
        renderizarEvolucao($("graficoValores"), dados.meses || [], "valorEstimado", "#3d659d", "valor estimado", true);
        renderizarStatus(dados.status || []);
        renderizarServicos(dados.servicos || []);
        renderizarMelhoresMeses(dados.melhoresMeses || []);
        $("clientesNovosDetalhe").textContent = inteiro(dados.resumo?.novosClientes);
        $("clientesRecorrentes").textContent = inteiro(dados.resumo?.clientesRecorrentes);
        $("legendaNovosClientes").textContent = "Criados no período (independente do filtro de status)";
        mensagem.textContent = "";
    } catch (erro) {
        console.error("Erro ao carregar relatórios:", erro);
        mensagem.textContent = erro.message || "Não foi possível carregar os relatórios. Confira se o servidor está funcionando.";
        renderizarVazio();
    }
}

function renderizarResumo(resumo, periodo, status) {
    $("totalOrcamentos").textContent = inteiro(resumo.quantidadeOrcamentos);
    $("valorEstimado").textContent = moeda(resumo.valorEstimadoTotal);
    $("valorMedio").textContent = moeda(resumo.valorMedio);
    $("novosClientes").textContent = inteiro(resumo.novosClientes);
    const nomeStatus = status || "todos os status";
    $("rotuloPeriodo").textContent = `${dataBR(periodo.de)} a ${dataBR(periodo.ate)} · ${nomeStatus}`;
}

function renderizarEvolucao(alvo, meses, campo, cor, nomeMetrica, comoMoeda) {
    alvo.replaceChildren();
    if (!meses.length) {
        alvo.innerHTML = '<div class="empty-report">Sem dados para o período selecionado.</div>';
        return;
    }
    const valores = meses.map(m => Number(m[campo]) || 0);
    const maximo = Math.max(1, ...valores);
    meses.forEach((mes, i) => {
        const coluna = document.createElement("div");
        coluna.className = "monthly-column";
        const valor = valores[i];
        coluna.title = `${mes.rotulo}: ${comoMoeda ? moeda(valor) : `${inteiro(valor)} ${nomeMetrica}`}`;
        const areaBarra = document.createElement("div");
        areaBarra.className = "monthly-bar-area";
        const barra = document.createElement("div");
        barra.className = `monthly-bar${comoMoeda ? " value-bar" : ""}`;
        barra.style.backgroundColor = cor;
        barra.style.height = valor > 0 ? `${Math.max(4, valor / maximo * 100)}%` : "0%";
        barra.setAttribute("aria-label", coluna.title);
        areaBarra.appendChild(barra);
        const valorLabel = document.createElement("span");
        valorLabel.className = "monthly-value";
        valorLabel.textContent = comoMoeda ? moedaCompacta(valor) : inteiro(valor);
        const rotulo = document.createElement("span");
        rotulo.className = "monthly-label";
        rotulo.textContent = mes.rotulo || mes.mes;
        coluna.append(areaBarra, valorLabel, rotulo);
        alvo.appendChild(coluna);
    });
}

function renderizarStatus(statuses) {
    const alvo = $("distribuicaoStatus");
    alvo.replaceChildren();
    if (!statuses.length || statuses.every(s => Number(s.quantidade) === 0)) {
        alvo.innerHTML = '<div class="empty-report">Nenhum orçamento no período.</div>';
        return;
    }
    const total = statuses.reduce((soma, item) => soma + Number(item.quantidade || 0), 0);
    statuses.forEach(item => {
        const linha = document.createElement("div");
        linha.className = "status-row";
        const nome = document.createElement("span");
        nome.className = "status-name";
        nome.textContent = item.status;
        const trilho = document.createElement("div");
        trilho.className = "status-track";
        const barra = document.createElement("div");
        barra.className = "status-fill";
        barra.style.width = `${total ? Number(item.quantidade) / total * 100 : 0}%`;
        barra.style.backgroundColor = CORES_STATUS[item.status] || "#888";
        trilho.appendChild(barra);
        const valor = document.createElement("span");
        valor.className = "status-count";
        valor.textContent = `${inteiro(item.quantidade)} · ${total ? Math.round(Number(item.quantidade) * 100 / total) : 0}%`;
        linha.append(nome, trilho, valor);
        alvo.appendChild(linha);
    });
}

function renderizarServicos(servicos) {
    const corpo = $("tabelaServicos");
    corpo.replaceChildren();
    if (!servicos.length) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 4;
        celula.textContent = "Nenhum serviço registrado no filtro selecionado.";
        linha.appendChild(celula);
        corpo.appendChild(linha);
        return;
    }
    servicos.forEach(item => {
        const linha = document.createElement("tr");
        const valores = [
            item.nome,
            inteiro(item.quantidade),
            item.areaTotal == null ? "—" : `${numero(item.areaTotal)} m²`,
            item.valorTotal == null ? "Sob consulta / não registrado" : moeda(item.valorTotal)
        ];
        valores.forEach(texto => {
            const celula = document.createElement("td");
            celula.textContent = texto;
            linha.appendChild(celula);
        });
        corpo.appendChild(linha);
    });
}

function renderizarMelhoresMeses(meses) {
    const lista = $("melhoresMeses");
    lista.replaceChildren();
    if (!meses.length) {
        const li = document.createElement("li");
        li.textContent = "Sem dados suficientes para o ranking.";
        lista.appendChild(li);
        return;
    }
    meses.forEach(mes => {
        const li = document.createElement("li");
        const info = document.createElement("span");
        info.className = "best-month-main";
        const nome = document.createElement("strong");
        nome.textContent = mes.rotulo;
        const quantidade = document.createElement("small");
        quantidade.textContent = `${inteiro(mes.quantidade)} orçamentos`;
        info.append(nome, quantidade);
        const valor = document.createElement("span");
        valor.className = "best-month-value";
        valor.textContent = moeda(mes.valorEstimado);
        li.append(info, valor);
        lista.appendChild(li);
    });
}

function renderizarVazio() {
    $("totalOrcamentos").textContent = "—";
    $("valorEstimado").textContent = "—";
    $("valorMedio").textContent = "—";
    $("novosClientes").textContent = "—";
    $("clientesNovosDetalhe").textContent = "—";
    $("clientesRecorrentes").textContent = "—";
    renderizarEvolucao($("graficoOrcamentos"), [], "quantidade", "#ec4e4e", "", false);
    renderizarEvolucao($("graficoValores"), [], "valorEstimado", "#3d659d", "", true);
    $("distribuicaoStatus").innerHTML = '<div class="empty-report">Não foi possível carregar.</div>';
    $("tabelaServicos").innerHTML = '<tr><td colspan="4">Não foi possível carregar.</td></tr>';
    $("melhoresMeses").innerHTML = "<li>Não foi possível carregar.</li>";
}

function dataBR(valor) {
    if (!valor) return "—";
    const [ano, mes, dia] = String(valor).split("-");
    return `${dia}/${mes}/${ano}`;
}
function moeda(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function moedaCompacta(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
}
function inteiro(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function numero(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
