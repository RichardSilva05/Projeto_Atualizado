
/* ============================================================
   PREÇOS E METRAGEM INDIVIDUAL POR SERVIÇO - SABINO GESSO
   Carregar antes de gerar_pdf_cpf.js ou gerar_pdf_cnpj.js.
============================================================ */

(function () {
    "use strict";

    const SERVIDOR = "http://localhost:3000";

    const precos = Object.create(null);
    const areasMemoria = Object.create(null);

    let carregou = false;
    let falhou = false;

    const $ = id => document.getElementById(id);

    function moeda(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function obterForm() {
        return $("formOrcamentoPF") || $("formOrcamentoPJ");
    }

    function nomeOutro() {
        return $("servicoOutroTexto")?.value.trim() || "";
    }

    function servicosMarcados() {
        const form = obterForm();
        if (!form) return [];

        return Array.from(
            form.querySelectorAll('input[name="servicos"]:checked')
        );
    }

    function coletarServicosDetalhados() {
        return servicosMarcados().map(function (checkbox) {
            const entrada = $("metragem-" + checkbox.id);
            const rawArea = entrada ? entrada.value : "";

            const area = rawArea.trim() === ""
                ? 0
                : Number(rawArea.replace(",", "."));

            const nome = checkbox.value;
            const precoBruto = precos[nome];

            const precoM2 =
                precoBruto === null || precoBruto === undefined
                    ? null
                    : Number(precoBruto);

            const areaValida = Number.isFinite(area) && area > 0;

            const sobConsulta =
                precoM2 === null ||
                !Number.isFinite(precoM2) ||
                precoM2 <= 0;

            let valor = null;

            if (areaValida && !sobConsulta) {
                valor = Math.round(area * precoM2 * 100) / 100;
            }

            return {
                nome,
                area: areaValida
                    ? Math.round(area * 100) / 100
                    : 0,
                precoM2: sobConsulta ? null : precoM2,
                valor,
                sobConsulta,
                outroDescricao: nome === "Outro" ? nomeOutro() : ""
            };
        });
    }

    function calcular() {
        const itens = coletarServicosDetalhados();

        const areaTotalCentavos = itens.reduce(
            (soma, item) => soma + Math.round(item.area * 100),
            0
        );

        const totalCentavos = itens.reduce(
            (soma, item) =>
                soma + (
                    item.valor === null
                        ? 0
                        : Math.round(item.valor * 100)
                ),
            0
        );

        return {
            itens,
            areaTotal: areaTotalCentavos / 100,
            total: totalCentavos / 100,
            temValor: itens.some(item => item.valor !== null),
            sobConsulta: itens.some(item => item.sobConsulta)
        };
    }

    function linha(pai, texto, classe) {
        const p = document.createElement("p");
        p.className = classe || "mb-1";
        p.textContent = texto;
        pai.appendChild(p);
    }

    function atualizarAreaTotal() {
        const campoAreaTotal = $("area");
        if (!campoAreaTotal) return;

        const c = calcular();

        campoAreaTotal.value = c.areaTotal > 0
            ? String(
                c.areaTotal.toFixed(2).replace(/\.00$/, "")
            )
            : "";
    }

    function atualizarResumo() {
        atualizarAreaTotal();

        const caixa = $("resumoValor");
        if (!caixa) return;

        caixa.innerHTML = "";

        const titulo = document.createElement("strong");
        titulo.className = "d-block mb-2";
        titulo.textContent = "Valores estimados por serviço";

        caixa.appendChild(titulo);

        const c = calcular();

        if (c.itens.length === 0) {
            linha(
                caixa,
                "Selecione os serviços e informe a metragem de cada um.",
                "mb-0 text-muted"
            );
            return;
        }

        if (falhou) {
            linha(
                caixa,
                "Não foi possível carregar os preços agora. " +
                "As metragens podem ser preenchidas, mas os valores " +
                "precisam ser confirmados.",
                "mb-2 text-danger"
            );
        } else if (!carregou) {
            linha(
                caixa,
                "Carregando preços dos serviços...",
                "mb-2 text-muted"
            );
        }

        c.itens.forEach(function (item) {
            const nomeExibicao =
                item.nome === "Outro" && item.outroDescricao
                    ? `Outro: ${item.outroDescricao}`
                    : item.nome;

            if (!(item.area > 0)) {
                linha(
                    caixa,
                    `${nomeExibicao}: informe a metragem (m²).`,
                    "mb-1 text-danger"
                );
                return;
            }

            if (!carregou || item.sobConsulta) {
                linha(
                    caixa,
                    `${nomeExibicao}: ${item.area.toLocaleString("pt-BR")} m² — valor sob consulta.`,
                    "mb-1 text-muted"
                );
                return;
            }

            linha(
                caixa,
                `${nomeExibicao}: ` +
                `${item.area.toLocaleString("pt-BR")} m² × ` +
                `${moeda(item.precoM2)}/m² = ${moeda(item.valor)}`,
                "mb-1"
            );
        });

        if (c.areaTotal > 0) {
            linha(
                caixa,
                `Metragem total dos serviços: ${c.areaTotal.toLocaleString("pt-BR")} m²`,
                "mt-2 mb-1"
            );
        }

        if (c.temValor) {
            linha(
                caixa,
                `Total estimado: ${moeda(c.total)}` +
                    (c.sobConsulta
                        ? " + serviços sob consulta"
                        : ""),
                "fs-5 fw-bold mb-1"
            );
        } else {
            linha(
                caixa,
                "Total estimado: sob consulta",
                "fs-5 fw-bold mb-1"
            );
        }

        linha(
            caixa,
            "Estimativa sujeita à confirmação após a análise do orçamento. " +
            "Serviços sem preço cadastrado são informados sob consulta.",
            "mb-0 small text-muted"
        );
    }

    function marcarPrecosNosServicos() {
        const form = obterForm();
        if (!form) return;

        form.querySelectorAll('input[name="servicos"]')
            .forEach(function (checkbox) {
                const preco = precos[checkbox.value];

                const rotulo = form.querySelector(
                    `label[for="${checkbox.id}"]`
                );

                if (!rotulo || rotulo.querySelector(".preco-m2")) {
                    return;
                }

                const small = document.createElement("small");

                small.className = "preco-m2 text-muted ms-1";

                small.textContent =
                    preco === null || preco === undefined
                        ? "(sob consulta)"
                        : `(${moeda(preco)}/m²)`;

                rotulo.appendChild(small);
            });
    }

    function montarBlocos(form) {
        const botoes = form.querySelector(".botoes-acoes");
        const campoAreaTotal = $("area");

        // O campo antigo passa a mostrar a soma automática.
        if (campoAreaTotal) {
            campoAreaTotal.readOnly = true;
            campoAreaTotal.required = false;
            campoAreaTotal.min = "0";
            campoAreaTotal.placeholder =
                "Metragem total dos serviços (m²)";
            campoAreaTotal.setAttribute(
                "aria-label",
                "Metragem total dos serviços em metros quadrados"
            );
            campoAreaTotal.title =
                "Calculado automaticamente a partir das metragens individuais.";
        }

        if (!$("areasPorServico")) {
            const bloco = document.createElement("div");

            bloco.id = "areasPorServico";
            bloco.className = "mb-3";
            bloco.setAttribute("aria-live", "polite");

            const titulo = document.createElement("h2");
            titulo.textContent = "Metragem por serviço:";
            bloco.appendChild(titulo);

            const descricao = document.createElement("p");
            descricao.className = "text-muted small";
            descricao.textContent =
                "Marque os serviços desejados e informe a metragem de cada um separadamente.";
            bloco.appendChild(descricao);

            const lista = document.createElement("div");
            lista.id = "listaMetragensServicos";
            bloco.appendChild(lista);

            const checkOutro = $("servicoOutro");

            const linhaOutro =
                checkOutro?.closest(".d-flex.align-items-center") ||
                checkOutro?.closest(".d-flex") ||
                null;

            if (linhaOutro) {
                linhaOutro.insertAdjacentElement("afterend", bloco);
            } else if (campoAreaTotal?.closest(".row-endereco")) {
                campoAreaTotal.closest(".row-endereco")
                    .insertAdjacentElement("beforebegin", bloco);
            } else {
                form.insertBefore(bloco, botoes);
            }
        }

        if (!$("resumoValor")) {
            const caixa = document.createElement("div");

            caixa.id = "resumoValor";
            caixa.className = "border rounded p-3 mb-3";
            caixa.setAttribute("aria-live", "polite");

            const linhaArea = campoAreaTotal?.closest(".row-endereco");

            if (linhaArea) {
                linhaArea.insertAdjacentElement("afterend", caixa);
            } else {
                form.insertBefore(caixa, botoes);
            }
        }

        // Pergunta da visita técnica, caso não exista no HTML.
        if (!form.querySelector('input[name="visita"]')) {
            const visita = document.createElement("div");

            visita.id = "blocoVisita";
            visita.innerHTML =
                '<h2><i class="bi bi-geo-alt-fill"></i> Visita no local:</h2>' +
                '<span class="rotulo-pequeno">' +
                'Deseja que façamos uma visita técnica no local?</span>' +
                '<div class="d-flex flex-wrap mb-3">' +
                '<div class="form-check-pill">' +
                '<input class="form-check-input" type="radio" name="visita" ' +
                'id="visitaSim" value="Sim" required>' +
                '<label for="visitaSim">Sim, quero a visita</label></div>' +
                '<div class="form-check-pill">' +
                '<input class="form-check-input" type="radio" name="visita" ' +
                'id="visitaNao" value="Não">' +
                '<label for="visitaNao">Não preciso</label></div>' +
                '</div>';

            form.insertBefore(visita, botoes);
        }
    }

    function atualizarMetragensServicos() {
        const form = obterForm();
        const lista = $("listaMetragensServicos");

        if (!form || !lista) return;

        const marcados = servicosMarcados();

        // Guarda valores já digitados para que desmarcar/re-marcar
        // um serviço não apague a metragem durante o preenchimento.
        lista.querySelectorAll("input[data-nome-servico]")
            .forEach(function (input) {
                if (input.value !== "") {
                    areasMemoria[input.dataset.nomeServico] = input.value;
                }
            });

        lista.innerHTML = "";

        if (marcados.length === 0) {
            const aviso = document.createElement("p");

            aviso.className = "text-muted small mb-2";
            aviso.textContent = "Nenhum serviço selecionado.";

            lista.appendChild(aviso);
            atualizarResumo();
            return;
        }

        marcados.forEach(function (checkbox) {
            const nome = checkbox.value;
            const descricaoOutro = nome === "Outro"
                ? nomeOutro()
                : "";

            const exibicao = nome === "Outro" && descricaoOutro
                ? `Outro: ${descricaoOutro}`
                : nome;

            const card = document.createElement("div");
            card.className =
                "row g-2 align-items-center border rounded p-2 mb-2";

            const colunaNome = document.createElement("div");
            colunaNome.className = "col-12 col-md-7";

            const label = document.createElement("label");
            label.className = "form-label mb-0";
            label.htmlFor = "metragem-" + checkbox.id;
            label.textContent = exibicao;

            colunaNome.appendChild(label);

            const preco = precos[nome];
            const precoInfo = document.createElement("small");

            precoInfo.className = "d-block text-muted";
            precoInfo.textContent =
                preco === null || preco === undefined
                    ? "Preço por m²: sob consulta"
                    : `Preço por m²: ${moeda(preco)}`;

            colunaNome.appendChild(precoInfo);

            const colunaArea = document.createElement("div");
            colunaArea.className = "col-12 col-md-5";

            const entrada = document.createElement("input");

            entrada.type = "number";
            entrada.id = "metragem-" + checkbox.id;
            entrada.className = "form-control";
            entrada.min = "0.01";
            entrada.step = "0.01";
            entrada.max = "99999999";
            entrada.inputMode = "decimal";
            entrada.placeholder = "Metragem (m²)";
            entrada.required = true;
            entrada.dataset.nomeServico = nome;
            entrada.value = areasMemoria[nome] || "";

            entrada.addEventListener("input", function () {
                areasMemoria[nome] = entrada.value;
                atualizarResumo();
            });

            colunaArea.appendChild(entrada);

            card.appendChild(colunaNome);
            card.appendChild(colunaArea);

            lista.appendChild(card);
        });

        atualizarResumo();
    }

    async function carregarPrecos() {
        try {
            const resposta = await fetch(SERVIDOR + "/api/servicos");

            if (!resposta.ok) {
                throw new Error("Falha ao buscar preços dos serviços.");
            }

            const servicos = await resposta.json();

            if (!Array.isArray(servicos)) {
                throw new Error("Resposta inválida da API de serviços.");
            }

            servicos.forEach(function (servico) {
                precos[servico.nome] =
                    servico.precoM2 === null ||
                    servico.precoM2 === undefined
                        ? null
                        : Number(servico.precoM2);
            });

            carregou = true;

            marcarPrecosNosServicos();
            atualizarMetragensServicos();

        } catch (erro) {
            falhou = true;

            console.error(
                "Não foi possível carregar preços:",
                erro
            );
        }

        atualizarResumo();
    }

    function obterVisitaTecnica() {
        const marcada = document.querySelector(
            'input[name="visita"]:checked'
        );

        return marcada ? marcada.value === "Sim" : null;
    }

    function textoValor() {
        const c = calcular();

        if (!c.temValor) {
            return c.sobConsulta ? "Sob consulta" : "A combinar";
        }

        return moeda(c.total) + " (estimativa)" +
            (c.sobConsulta ? " + serviços sob consulta" : "");
    }

    function validarMetragens() {
        const itens = coletarServicosDetalhados();

        if (itens.length === 0) {
            return "Selecione pelo menos um serviço.";
        }

        const semMetragem = itens.find(item => !(item.area > 0));

        if (semMetragem) {
            const nome = semMetragem.nome === "Outro" &&
                semMetragem.outroDescricao
                ? "Outro: " + semMetragem.outroDescricao
                : semMetragem.nome;

            return `Informe a metragem de ${nome}.`;
        }

        const outro = itens.find(item => item.nome === "Outro");

        if (outro && !outro.outroDescricao) {
            return "Descreva o serviço selecionado em 'Outro'.";
        }

        return null;
    }

    // Interface usada pelo formulário, PDF, WhatsApp e envio ao servidor.
    window.PrecosOrcamento = {
        dados: function () {
            const c = calcular();

            return {
                visitaTecnica: obterVisitaTecnica(),
                areaTotal: c.areaTotal,
                valorEstimado: c.total,
                temValor: c.temValor,
                sobConsulta: c.sobConsulta,

                servicosDetalhados: c.itens.map(item => ({
                    nome: item.nome,
                    area: item.area,
                    outroDescricao: item.outroDescricao,
                    precoM2: item.precoM2,
                    valor: item.valor,
                    sobConsulta: item.sobConsulta
                })),

                itens: c.itens
            };
        },

        servicosDetalhados: function () {
            return this.dados().servicosDetalhados;
        },

        validarMetragens,
        textoValor,
        formatarMoeda: moeda,
        atualizar: atualizarResumo
    };

    function iniciar() {
        const form = obterForm();

        if (!form || !$("area")) return;

        montarBlocos(form);
        atualizarMetragensServicos();

        form.addEventListener("change", function (event) {
            if (event.target?.name === "servicos") {
                atualizarMetragensServicos();
            }

            if (event.target?.name === "visita") {
                atualizarResumo();
            }
        });

        $("area").addEventListener("input", atualizarResumo);

        $("servicoOutroTexto")?.addEventListener(
            "input",
            atualizarMetragensServicos
        );

        form.addEventListener("reset", function () {
            Object.keys(areasMemoria).forEach(
                nome => delete areasMemoria[nome]
            );

            setTimeout(function () {
                atualizarMetragensServicos();
                atualizarResumo();
            }, 0);
        });

        atualizarResumo();
        carregarPrecos();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar);
    } else {
        iniciar();
    }
})();
