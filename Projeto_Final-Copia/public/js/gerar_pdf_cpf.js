
/* ============================================================
   FORMULÁRIO DE ORÇAMENTO PF - SABINO GESSO
   Metragem individual por serviço, consulta de CEP, gravação
   no banco, PDF com valores e WhatsApp.
============================================================ */

(function () {
    "use strict";

    const API_URL = "http://localhost:3000/api/orcamentos";
    const NUMERO_WHATSAPP_EMPRESA = "5511999999999";
    const IBGE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades";
    const VIACEP_URL = "https://viacep.com.br/ws";

    const UFS = [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
        "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
        "RR", "SC", "SP", "SE", "TO"
    ];

    const $ = id => document.getElementById(id);
    const somenteNumeros = valor => String(valor ?? "").replace(/\D/g, "");

    let estadosCarregamento = Promise.resolve();
    let tokenCEP = 0;
    let ultimoCEP = "";
    let cepEmConsulta = "";
    let tokenCidades = 0;
    let envioEmAndamento = false;

    function normalizarTexto(valor) {
        return String(valor ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLocaleLowerCase("pt-BR");
    }

    function moeda(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    // --------------------------------------------------------
    // MÁSCARAS
    // --------------------------------------------------------

    function aplicarMascaraCPF(valor) {
        let n = somenteNumeros(valor).slice(0, 11);
        n = n.replace(/(\d{3})(\d)/, "$1.$2");
        n = n.replace(/(\d{3})(\d)/, "$1.$2");
        n = n.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        return n;
    }

    function aplicarMascaraTelefone(valor) {
        let n = somenteNumeros(valor).slice(0, 11);

        if (n.length <= 10) {
            n = n.replace(/^(\d{2})(\d)/, "($1) $2");
            n = n.replace(/(\d{4})(\d)/, "$1-$2");
        } else {
            n = n.replace(/^(\d{2})(\d)/, "($1) $2");
            n = n.replace(/(\d{5})(\d)/, "$1-$2");
        }

        return n;
    }

    function aplicarMascaraCEP(valor) {
        let n = somenteNumeros(valor).slice(0, 8);
        if (n.length > 5) n = n.slice(0, 5) + "-" + n.slice(5);
        return n;
    }

    // --------------------------------------------------------
    // VALIDAÇÕES
    // --------------------------------------------------------

    function validarCPF(valor) {
        const cpf = somenteNumeros(valor);
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        for (let t = 9; t < 11; t++) {
            let soma = 0;
            for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
            const digito = ((soma * 10) % 11) % 10;
            if (digito !== Number(cpf[t])) return false;
        }
        return true;
    }

    function validarEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // --------------------------------------------------------
    // STATUS DO CEP
    // --------------------------------------------------------

    function mostrarStatusCep(mensagem, tipo = "info") {
        let status = $("cepStatus");

        if (!status && $("cep")) {
            status = document.createElement("small");
            status.id = "cepStatus";
            status.setAttribute("aria-live", "polite");
            status.className = "d-block mb-2";
            $("cep").insertAdjacentElement("afterend", status);
        }

        if (!status) return;

        status.textContent = mensagem;
        status.className = "d-block mb-2 " + (
            tipo === "ok" ? "text-success" :
            tipo === "erro" ? "text-danger" : "text-muted"
        );
    }

    // --------------------------------------------------------
    // ESTADOS
    // --------------------------------------------------------

    function preencherSelect(select, placeholder, itens) {
        if (!select) return;

        select.innerHTML = "";
        const base = document.createElement("option");
        base.value = "";
        base.textContent = placeholder;
        select.appendChild(base);

        itens.forEach(item => {
            const opcao = document.createElement("option");
            opcao.value = item.valor;
            opcao.textContent = item.texto;
            select.appendChild(opcao);
        });
    }

    async function carregarEstados() {
        const campoEstado = $("estado");
        if (!campoEstado) return;

        const nomes = {
            AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
            BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
            GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
            MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
            PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
            RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
            SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
        };

        // Carrega uma lista local imediatamente.
        preencherSelect(
            campoEstado,
            "Estado",
            UFS.map(uf => ({ valor: uf, texto: nomes[uf] || uf }))
        );

        campoEstado.disabled = false;
    }

    // --------------------------------------------------------
    // CIDADES PELO IBGE
    // --------------------------------------------------------

    async function carregarCidades(uf, cidadeSelecionada = "") {
        const campoCidade = $("cidade");
        if (!campoCidade) return;

        const meuToken = ++tokenCidades;
        const alvoCidade = String(cidadeSelecionada || "").trim();

        preencherSelect(
            campoCidade,
            alvoCidade ? "Carregando cidades..." : "Cidade",
            alvoCidade ? [{ valor: alvoCidade, texto: alvoCidade }] : []
        );

        if (alvoCidade) campoCidade.value = alvoCidade;
        campoCidade.disabled = !alvoCidade;

        if (!uf) {
            preencherSelect(campoCidade, "Cidade", []);
            campoCidade.disabled = true;
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const resposta = await fetch(
                `${IBGE_URL}/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,
                { signal: controller.signal }
            );

            if (!resposta.ok) {
                throw new Error(`IBGE retornou HTTP ${resposta.status}.`);
            }

            const cidades = await resposta.json();

            if (!Array.isArray(cidades)) {
                throw new Error("Lista de cidades inválida.");
            }

            if (meuToken !== tokenCidades) return;

            cidades.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

            preencherSelect(
                campoCidade,
                "Cidade",
                cidades.map(item => ({ valor: item.nome, texto: item.nome }))
            );

        } catch (erro) {
            if (meuToken !== tokenCidades) return;
            console.warn("Não foi possível carregar a lista do IBGE:", erro);
        } finally {
            clearTimeout(timeout);
        }

        if (meuToken !== tokenCidades) return;

        if (alvoCidade) {
            let opcao = Array.from(campoCidade.options).find(
                item => normalizarTexto(item.value) === normalizarTexto(alvoCidade)
            );

            if (!opcao) {
                opcao = document.createElement("option");
                opcao.value = alvoCidade;
                opcao.textContent = alvoCidade;
                campoCidade.appendChild(opcao);
            }

            campoCidade.value = opcao.value;
        }

        campoCidade.disabled = false;
    }

    // --------------------------------------------------------
    // BUSCAR CEP PELO VIACEP
    // --------------------------------------------------------

    async function buscarCEP() {
        const campoCEP = $("cep");
        if (!campoCEP) return;

        const cep = somenteNumeros(campoCEP.value);
        if (cep.length !== 8 || cep === ultimoCEP || cep === cepEmConsulta) return;

        ultimoCEP = "";
        cepEmConsulta = cep;

        const meuToken = ++tokenCEP;

        const consultaValida = () =>
            meuToken === tokenCEP && cep === somenteNumeros(campoCEP.value);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        mostrarStatusCep("Buscando endereço...", "info");

        try {
            await estadosCarregamento;
            if (!consultaValida()) return;

            const resposta = await fetch(
                `${VIACEP_URL}/${cep}/json/`,
                { signal: controller.signal }
            );

            if (!resposta.ok) {
                throw new Error(`ViaCEP retornou HTTP ${resposta.status}.`);
            }

            const dados = await resposta.json();
            if (!consultaValida()) return;

            if (dados.erro || !dados.uf || !dados.localidade) {
                mostrarStatusCep(
                    "CEP não encontrado. Preencha o endereço manualmente.",
                    "erro"
                );
                ultimoCEP = "";
                return;
            }

            const estado = $("estado");
            const cidade = $("cidade");
            const bairro = $("bairro");
            const logradouro = $("logradouro");
            const complemento = $("complemento");

            if (!estado || !cidade) {
                throw new Error("Não foram encontrados os campos de estado e cidade.");
            }

            // Preenche estado e endereço antes de esperar a lista do IBGE.
            estado.value = dados.uf;

            if (estado.value !== dados.uf) {
                const opcao = document.createElement("option");
                opcao.value = dados.uf;
                opcao.textContent = dados.uf;
                estado.appendChild(opcao);
                estado.value = dados.uf;
            }

            if (bairro) bairro.value = dados.bairro || "";
            if (logradouro) logradouro.value = dados.logradouro || "";
            if (complemento) complemento.value = dados.complemento || "";

            // Mostra a cidade imediatamente, mesmo se o IBGE estiver indisponível.
            preencherSelect(cidade, "Cidade", [
                { valor: dados.localidade, texto: dados.localidade }
            ]);

            cidade.value = dados.localidade;
            cidade.disabled = false;

            ultimoCEP = cep;

            mostrarStatusCep(
                "Endereço encontrado. Confira os dados e informe o número do imóvel.",
                "ok"
            );

            // Atualiza a lista completa em segundo plano.
            await carregarCidades(dados.uf, dados.localidade);

        } catch (erro) {
            if (!consultaValida()) return;

            ultimoCEP = "";
            console.error("Erro ao consultar CEP:", erro);

            mostrarStatusCep(
                "Não foi possível consultar o CEP. Preencha o endereço manualmente.",
                "erro"
            );
        } finally {
            clearTimeout(timeout);
            if (cepEmConsulta === cep) cepEmConsulta = "";
        }
    }

    // --------------------------------------------------------
    // COLETAR DADOS
    // --------------------------------------------------------

    function obterServicos() {
        return Array.from(
            document.querySelectorAll('input[name="servicos"]:checked')
        ).map(item => item.value);
    }

    function obterPrazo() {
        return document.querySelector('input[name="prazo"]:checked')?.value || "";
    }

    function obterDadosFormulario() {
        const estado = $("estado");
        const servicos = obterServicos();
        const outroDescricao = $("servicoOutroTexto")?.value.trim() || "";

        const precos = window.PrecosOrcamento
            ? window.PrecosOrcamento.dados()
            : {
                areaTotal: Number($("area")?.value || 0),
                valorEstimado: 0,
                visitaTecnica: null,
                servicosDetalhados: []
            };

        return {
            nome: $("nome").value.trim(),
            cpf: $("cpf").value.trim(),
            email: $("email").value.trim(),
            telefone: $("telefone").value.trim(),
            area: Number(precos.areaTotal || 0),
            prazo: obterPrazo(),
            cep: $("cep").value.trim(),
            estado: estado.value,
            estadoTexto: estado.selectedOptions[0]?.text || "",
            cidade: $("cidade").value.trim(),
            bairro: $("bairro").value.trim(),
            logradouro: $("logradouro").value.trim(),
            numero: $("numero").value.trim(),
            complemento: $("complemento").value.trim(),
            observacoes: $("observacoes")?.value.trim() || "",
            servicos,
            outroDescricao: servicos.includes("Outro") ? outroDescricao : "",
            servicosDetalhados: precos.servicosDetalhados || [],
            valorEstimado: precos.valorEstimado ?? 0,
            valorTexto: window.PrecosOrcamento
                ? window.PrecosOrcamento.textoValor()
                : "A combinar",
            visitaTecnica: precos.visitaTecnica
        };
    }

    // --------------------------------------------------------
    // VALIDAR DADOS
    // --------------------------------------------------------

    function validarDados(d) {
        if (!validarCPF(d.cpf)) return "Informe um CPF válido.";
        if (!validarEmail(d.email)) return "Informe um e-mail válido.";

        if (!d.nome) return "Informe seu nome completo.";

        const numerosTelefone = somenteNumeros(d.telefone);

        if (numerosTelefone.length !== 10 && numerosTelefone.length !== 11) {
            return "Informe um telefone válido, incluindo o DDD.";
        }

        if (!window.PrecosOrcamento) {
            return "O módulo de preços e metragens não foi carregado.";
        }

        const erroMetragem = window.PrecosOrcamento.validarMetragens();

        if (erroMetragem) return erroMetragem;

        if (!d.prazo) return "Selecione o prazo desejado.";

        if (typeof d.visitaTecnica !== "boolean") {
            return "Informe se deseja a visita técnica no local.";
        }

        if (somenteNumeros(d.cep).length !== 8) {
            return "Informe um CEP válido.";
        }

        if (!d.estado || !d.cidade || !d.bairro || !d.logradouro || !d.numero) {
            return "Preencha todos os campos obrigatórios do endereço.";
        }

        return null;
    }

    // --------------------------------------------------------
    // GERAR PDF
    // --------------------------------------------------------

    function gerarPDF(d, codigoOrcamento) {
        if (!window.jspdf?.jsPDF) {
            throw new Error("A biblioteca jsPDF não foi carregada.");
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: "mm", format: "a4" });

        const margem = 18;
        const largura = 174;
        let y = 20;

        function textoRotulado(rotulo, valor) {
            const linhas = pdf.splitTextToSize(
                `${rotulo}: ${valor || "-"}`,
                largura
            );

            const altura = linhas.length * 6;

            if (y + altura > 280) {
                pdf.addPage();
                y = 20;
            }

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            pdf.text(linhas, margem, y);

            y += altura + 1;
        }

        function titulo(texto) {
            if (y + 12 > 280) {
                pdf.addPage();
                y = 20;
            }

            y += 3;

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(12);
            pdf.text(texto, margem, y);

            y += 5;
            pdf.setDrawColor(180);
            pdf.line(margem, y, margem + largura, y);
            y += 5;
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(17);
        pdf.text("Sabino Gesso", margem, y);

        y += 8;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text(
            "Solicitação de orçamento - Pessoa Física",
            margem,
            y
        );

        y += 8;

        textoRotulado("Data", new Date().toLocaleDateString("pt-BR"));

        if (codigoOrcamento) {
            textoRotulado("Código do orçamento", codigoOrcamento);
        }

        titulo("Dados do cliente");
        textoRotulado("Nome", d.nome);
        textoRotulado("CPF", d.cpf);
        textoRotulado("E-mail", d.email);
        textoRotulado("Telefone", d.telefone);

        titulo("Serviços e valores estimados");

        const itensServicos = Array.isArray(d.servicosDetalhados)
            ? d.servicosDetalhados
            : [];

        if (itensServicos.length > 0) {
            itensServicos.forEach(item => {
                const nome = item.nome === "Outro" && item.outroDescricao
                    ? `Outro: ${item.outroDescricao}`
                    : item.nome;
                const area = Number(item.area);
                let detalhe = Number.isFinite(area) && area > 0
                    ? `${area.toLocaleString("pt-BR")} m²`
                    : "metragem não informada";

                if (item.sobConsulta || item.precoM2 == null || item.valor == null) {
                    detalhe += " — valor sob consulta";
                } else {
                    detalhe += ` × ${moeda(item.precoM2)}/m² = ${moeda(item.valor)}`;
                }
                textoRotulado(nome || "Serviço", detalhe);
            });
        } else {
            textoRotulado("Serviços", Array.isArray(d.servicos) ? d.servicos.join(", ") : "-");
        }

        const areaTotal = Number(d.area);
        textoRotulado(
            "Metragem total",
            `${Number.isFinite(areaTotal) ? areaTotal.toLocaleString("pt-BR") : "0"} m²`
        );
        textoRotulado("Prazo desejado", d.prazo);
        textoRotulado("Valor estimado", d.valorTexto);
        textoRotulado("Visita técnica", d.visitaTecnica ? "Sim" : "Não");

        titulo("Endereço da obra");
        textoRotulado("CEP", d.cep);
        textoRotulado("Estado", d.estadoTexto || d.estado);
        textoRotulado("Cidade", d.cidade);
        textoRotulado("Bairro", d.bairro);
        textoRotulado("Logradouro", d.logradouro);
        textoRotulado("Número", d.numero);
        textoRotulado("Complemento", d.complemento);

        if (d.observacoes) {
            textoRotulado("Observações", d.observacoes);
        }

        const nomeSeguro = d.nome
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "cliente";

        const codigoSeguro = codigoOrcamento
            ? "-" + String(codigoOrcamento).replace(/[^a-zA-Z0-9_-]/g, "")
            : "";

        pdf.save(`orcamento-${nomeSeguro}${codigoSeguro}.pdf`);
    }

    // --------------------------------------------------------
    // ENVIAR AO BANCO E GERAR PDF APÓS CONFIRMAÇÃO
    // --------------------------------------------------------

    async function gerarPDFEEnviar(event) {
        event.preventDefault();
        if (envioEmAndamento) return;

        const formulario = $("formOrcamentoPF");
        if (!formulario) return;

        if (!formulario.checkValidity()) {
            formulario.reportValidity();
            return;
        }

        const dados = obterDadosFormulario();
        const erroValidacao = validarDados(dados);

        if (erroValidacao) {
            alert(erroValidacao);
            return;
        }

        const botaoSubmit = formulario.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        const botaoPDF = $("btnGerarPDF");
        const textoOriginal = botaoSubmit ? botaoSubmit.textContent : "";

        envioEmAndamento = true;

        if (botaoSubmit) {
            botaoSubmit.disabled = true;
            botaoSubmit.textContent = "Enviando...";
        }

        if (botaoPDF) {
            botaoPDF.setAttribute("aria-disabled", "true");
        }

        try {
            const resposta = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dados)
            });

            const resultado = await resposta.json().catch(() => ({}));

            if (!resposta.ok) {
                throw new Error(
                    resultado.erro ||
                    resultado.mensagem ||
                    `Falha ao salvar o orçamento (HTTP ${resposta.status}).`
                );
            }

            // Usa os valores recalculados pelo servidor como fonte oficial.
            if (Array.isArray(resultado.servicosDetalhados)) {
                dados.servicosDetalhados = resultado.servicosDetalhados;
            }

            if (Number.isFinite(Number(resultado.area))) {
                dados.area = Number(resultado.area);
            }

            if (Number.isFinite(Number(resultado.valor))) {
                dados.valorEstimado = Number(resultado.valor);
                dados.valorTexto = moeda(dados.valorEstimado) + " (estimativa)" +
                    (dados.servicosDetalhados.some(item => item.sobConsulta)
                        ? " + serviços sob consulta"
                        : "");
            }

            try {
                gerarPDF(dados, resultado.codigo);

                alert(
                    "Orçamento salvo no banco e PDF gerado com sucesso." +
                    (resultado.codigo ? `\nCódigo: ${resultado.codigo}` : "")
                );

            } catch (erroPDF) {
                console.error("Erro ao gerar PDF:", erroPDF);

                alert(
                    "O orçamento foi salvo no banco, mas o PDF não pôde ser gerado.\n\n" +
                    erroPDF.message
                );
            }

        } catch (erro) {
            console.error("Erro ao enviar orçamento:", erro);

            alert(
                "Não foi possível salvar o orçamento no banco. Confira se o servidor está funcionando.\n\n" +
                erro.message
            );

        } finally {
            envioEmAndamento = false;

            if (botaoSubmit) {
                botaoSubmit.disabled = false;
                botaoSubmit.textContent = textoOriginal;
            }

            if (botaoPDF) {
                botaoPDF.removeAttribute("aria-disabled");
            }
        }
    }

    // --------------------------------------------------------
    // WHATSAPP
    // --------------------------------------------------------

    function enviarWhatsApp(event) {
        event.preventDefault();

        const formulario = $("formOrcamentoPF");

        if (!formulario.checkValidity()) {
            formulario.reportValidity();
            return;
        }

        const d = obterDadosFormulario();
        const erro = validarDados(d);

        if (erro) {
            alert(erro);
            return;
        }

        const servicos = (d.servicosDetalhados || []).map(item => {
            const nome = item.nome === "Outro" && item.outroDescricao
                ? `Outro: ${item.outroDescricao}`
                : item.nome;

            if (
                item.sobConsulta ||
                item.precoM2 == null ||
                item.valor == null
            ) {
                return `${nome}: ${item.area} m² — sob consulta`;
            }

            return `${nome}: ${item.area} m² × ${moeda(item.precoM2)}/m² = ${moeda(item.valor)}`;
        }).join("\n");

        const mensagem = [
            "Olá! Gostaria de solicitar um orçamento.",
            "",
            "*DADOS DO CLIENTE*",
            `Nome: ${d.nome}`,
            `CPF: ${d.cpf}`,
            `E-mail: ${d.email}`,
            `Telefone: ${d.telefone}`,
            "",
            "*SERVIÇOS E METRAGENS*",
            servicos,
            `Metragem total: ${d.area} m²`,
            `Prazo: ${d.prazo}`,
            `Valor estimado: ${d.valorTexto}`,
            `Visita técnica: ${d.visitaTecnica ? "Sim" : "Não"}`,
            "",
            "*ENDEREÇO*",
            `CEP: ${d.cep}`,
            `Estado: ${d.estadoTexto || d.estado}`,
            `Cidade: ${d.cidade}`,
            `Bairro: ${d.bairro}`,
            `Logradouro: ${d.logradouro}`,
            `Número: ${d.numero}`,
            `Complemento: ${d.complemento || "-"}`,
            `Observações: ${d.observacoes || "-"}`
        ].join("\n");

        window.open(
            `https://wa.me/${NUMERO_WHATSAPP_EMPRESA}?text=${encodeURIComponent(mensagem)}`,
            "_blank",
            "noopener,noreferrer"
        );
    }

    // --------------------------------------------------------
    // INICIALIZAÇÃO
    // --------------------------------------------------------

    document.addEventListener("DOMContentLoaded", () => {
        const cpf = $("cpf");
        const telefone = $("telefone");
        const cep = $("cep");
        const estado = $("estado");
        const outro = $("servicoOutro");
        const outroTexto = $("servicoOutroTexto");
        const formulario = $("formOrcamentoPF");
        const botaoWhatsApp = $("btnWhatsApp");
        const botaoGerarPDF = $("btnGerarPDF");

        estadosCarregamento = carregarEstados();

        cpf?.addEventListener("input", () => {
            cpf.value = aplicarMascaraCPF(cpf.value);
        });

        telefone?.addEventListener("input", () => {
            telefone.value = aplicarMascaraTelefone(telefone.value);
        });

        cep?.addEventListener("input", () => {
            cep.value = aplicarMascaraCEP(cep.value);
            const digitos = somenteNumeros(cep.value);

            if (digitos.length === 8) {
                buscarCEP();
            } else {
                ++tokenCEP;
                ultimoCEP = "";
                cepEmConsulta = "";
                mostrarStatusCep("", "info");
            }
        });

        cep?.addEventListener("blur", () => {
            if (somenteNumeros(cep.value).length === 8) {
                buscarCEP();
            }
        });

        estado?.addEventListener("change", () => {
            carregarCidades(estado.value);
        });

        function atualizarOutro() {
            if (!outro || !outroTexto) return;

            outroTexto.disabled = !outro.checked;
            outroTexto.required = outro.checked;

            if (!outro.checked) {
                outroTexto.value = "";
            }
        }

        outro?.addEventListener("change", atualizarOutro);
        atualizarOutro();

        formulario?.addEventListener("submit", gerarPDFEEnviar);

        // O ícone de PDF faz o mesmo fluxo: salvar e depois gerar PDF.
        botaoGerarPDF?.addEventListener("click", event => {
            event.preventDefault();

            if (envioEmAndamento) return;

            formulario?.requestSubmit();
        });

        botaoWhatsApp?.addEventListener("click", enviarWhatsApp);
    });
})();
