// =========================================================
// PROJETOS - PAINEL SABINO GESSO
// =========================================================
// A aba Projetos lista diretamente os orçamentos concluídos via API.
// Não há cadastro separado de projeto.
//
// BANCO DE DADOS
//      ↓
// BACKEND
//      ↓
// GET /api/projetos
//      ↓
// ESTE ARQUIVO
//      ↓
// PROJETOS AGRUPADOS POR CLIENTE
// =========================================================


// =========================================================
// CONFIGURAÇÃO DA API
// =========================================================

const API_URL = "http://localhost:3000/api";


// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        carregarProjetos();

    }
);


// =========================================================
// CARREGAR PROJETOS
// =========================================================

async function carregarProjetos() {

    const container =
        document.getElementById(
            "projetosContainer"
        );


    if (!container) {
        return;
    }


    try {

        // =================================================
        // BUSCAR PROJETOS NO BACKEND
        // =================================================

        const token = sessionStorage.getItem("tokenAdmin");
        if (!token) {
            window.location.replace("login.html");
            return;
        }

        const resposta = await fetch(`${API_URL}/projetos`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            },
            cache: "no-store"
        });

        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }


        if (!resposta.ok) {

            throw new Error(
                "Não foi possível carregar os projetos."
            );

        }


        const dados =
            await resposta.json();


        // =================================================
        // ACEITAR DIFERENTES FORMATOS DA API
        // =================================================

        const projetos =
            Array.isArray(dados)
                ? dados
                : dados.projetos || [];


        // A API já devolve projetos vinculados aos orçamentos.
        // Orçamentos marcados como Concluído geram/atualizam o projeto no servidor.
        const projetosVisiveis = projetos;


        // =================================================
        // NENHUM PROJETO
        // =================================================

        if (projetosVisiveis.length === 0) {

            mostrarNenhumProjeto();

            return;

        }


        // =================================================
        // AGRUPAR POR CLIENTE
        // =================================================

        const clientes =
            {};


        projetosVisiveis.forEach(
            function (projeto) {

                const codigoCliente =
                    projeto.clienteCodigo ||
                    projeto.cliente_codigo ||
                    "SEM-CODIGO";


                // -----------------------------------------
                // CRIAR CLIENTE
                // -----------------------------------------

                if (
                    !clientes[codigoCliente]
                ) {

                    clientes[codigoCliente] = {

                        codigo:
                            codigoCliente,

                        nome:
                            projeto.clienteNome ||
                            projeto.cliente_nome ||
                            "Cliente não informado",

                        projetos:
                            []

                    };

                }


                // -----------------------------------------
                // ADICIONAR PROJETO
                // -----------------------------------------

                clientes[codigoCliente]
                    .projetos
                    .push(projeto);

            }
        );


        // =================================================
        // LIMPAR CARREGAMENTO
        // =================================================

        container.innerHTML = "";


        // =================================================
        // CRIAR GRUPOS DE CLIENTES
        // =================================================

        Object.values(clientes).forEach(
            function (cliente) {

                const grupo =
                    document.createElement(
                        "section"
                    );


                grupo.className =
                    "cliente-projetos";


                // =================================================
                // CABEÇALHO DO CLIENTE
                // =================================================

                const cabecalho =
                    document.createElement(
                        "div"
                    );


                cabecalho.className =
                    "cliente-cabecalho";


                cabecalho.innerHTML = `

                    <div class="cliente-identificacao">

                        <div class="cliente-nome">

                            <span class="titulo-pequeno">
                                Cliente
                            </span>

                            <h2>
                                ${escaparHTML(
                                    cliente.nome
                                )}
                            </h2>

                        </div>


                        <span class="codigo-cliente">

                            ${escaparHTML(
                                cliente.codigo
                            )}

                        </span>

                    </div>


                    <div class="quantidade-projetos">

                        <i class="bi bi-kanban"></i>

                        <span>

                            ${cliente.projetos.length}

                            ${
                                cliente.projetos.length === 1
                                    ? "projeto"
                                    : "projetos"
                            }

                        </span>

                    </div>

                `;


                grupo.appendChild(
                    cabecalho
                );


                // =================================================
                // GRID
                // =================================================

                const grid =
                    document.createElement(
                        "div"
                    );


                grid.className =
                    "projetos-grid";


                // =================================================
                // PROJETOS DO CLIENTE
                // =================================================

                cliente.projetos.forEach(
                    function (projeto) {

                        grid.appendChild(
                            criarProjeto(
                                projeto
                            )
                        );

                    }
                );


                grupo.appendChild(
                    grid
                );


                container.appendChild(
                    grupo
                );

            }
        );

    }
    catch (erro) {

        console.error(
            "Erro ao carregar projetos:",
            erro
        );


        mostrarErro();

    }

}


// =========================================================
// CRIAR CARD DO PROJETO
// =========================================================

function criarProjeto(
    projeto
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "card-projeto";


    // =====================================================
    // DADOS
    // =====================================================

    const servico = Array.isArray(projeto.servicos) && projeto.servicos.length
        ? projeto.servicos.join(", ")
        : (projeto.servico || projeto.tipo_servico || "Projeto de Gesso");


    const codigo =
        projeto.orcamentoCodigo ||
        projeto.codigoOrcamento ||
        projeto.codigo_orcamento ||
        projeto.projetoCodigo ||
        projeto.codigo ||
        "-";

    const statusProjeto = projeto.projetoStatus || projeto.status || "Em andamento";
    const statusRotulo = statusProjeto;
    const classeStatus = statusProjeto === "Concluído"
        ? "status-concluido"
        : statusProjeto === "Cancelado"
            ? "status-cancelado"
            : statusProjeto === "Pausado"
                ? "status-pausado"
                : "status-andamento";


    const area =
        projeto.area ||
        "-";


    const valor =
        formatarValor(
            projeto.valor
        );


    const data =
        formatarData(
            projeto.dataConclusao ||
            projeto.dataInicio ||
            projeto.criadoEm ||
            projeto.data ||
            projeto.dataOrcamento ||
            projeto.data_orcamento
        );


    const progresso =
        obterProgresso(
            projeto
        );


    // =====================================================
    // LINK PARA DETALHES
    // =====================================================

    const linkDetalhes =
        "detalhes-orcamento.html?codigo=" +
        encodeURIComponent(
            codigo
        );


    // =====================================================
    // HTML DO CARD
    // =====================================================

    card.innerHTML = `

        <div class="imagem-projeto">

            <img
                src="../img/logo.png"
                alt="Sabino Gesso"
            >

        </div>


        <div class="projeto-conteudo">


            <div class="projeto-titulo">

                <div>

                    <span class="titulo-pequeno">
                        Orçamento concluído
                    </span>

                    <h2>
                        ${escaparHTML(servico)}
                    </h2>

                </div>


                <span class="status ${classeStatus}">
                    ${escaparHTML(statusRotulo)}
                </span>

            </div>



            <div class="projeto-detalhes">


                <div class="detalhe-projeto">

                    <i class="bi bi-receipt"></i>

                    <span>

                        Orçamento:

                        <strong>
                            ${escaparHTML(codigo)}
                        </strong>

                    </span>

                </div>



                <div class="detalhe-projeto">

                    <i class="bi bi-rulers"></i>

                    <span>

                        Área:

                        <strong>
                            ${escaparHTML(area)}
                        </strong>

                    </span>

                </div>



                <div class="detalhe-projeto">

                    <i class="bi bi-calendar3"></i>

                    <span>

                        Data:

                        <strong>
                            ${escaparHTML(data)}
                        </strong>

                    </span>

                </div>



                <div class="detalhe-projeto">

                    <i class="bi bi-cash"></i>

                    <span>

                        Valor:

                        <strong>
                            ${escaparHTML(valor)}
                        </strong>

                    </span>

                </div>


            </div>



            <div class="progresso-projeto">

                <div class="progresso-cabecalho">

                    <span>
                        Progresso da obra
                    </span>

                    <strong>
                        ${progresso}%
                    </strong>

                </div>


                <div class="barra-progresso">

                    <div
                        class="progresso"
                        style="width: ${progresso}%"
                    ></div>

                </div>

            </div>



            <div class="projeto-rodape">


                <span class="projeto-aprovado">

                    <i class="bi bi-check-circle-fill"></i>
                    ${escaparHTML(statusRotulo)}

                </span>


                <a
                    href="${linkDetalhes}"
                    class="btn-ver-detalhes"
                >

                    <i class="bi bi-eye"></i>

                    Ver Detalhes

                </a>


            </div>


        </div>

    `;


    return card;

}


// =========================================================
// PROGRESSO
// =========================================================

function obterProgresso(
    projeto
) {

    const valor =
        Number(
            projeto.progresso
        );


    if (
        isNaN(valor)
    ) {

        return 0;

    }


    return Math.min(
        100,
        Math.max(
            0,
            valor
        )
    );

}


// =========================================================
// FORMATAÇÃO DE DATA
// =========================================================

function formatarData(
    data
) {

    if (!data) {
        return "-";
    }


    const dataObj =
        new Date(data);


    if (
        isNaN(
            dataObj.getTime()
        )
    ) {

        return "-";

    }


    return dataObj.toLocaleDateString(
        "pt-BR"
    );

}


// =========================================================
// FORMATAÇÃO DE VALOR
// =========================================================

function formatarValor(
    valor
) {

    const numero =
        Number(valor);


    if (
        isNaN(numero)
    ) {

        return "R$ 0,00";

    }


    return numero.toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );

}




// =========================================================
// MENSAGEM: NENHUM PROJETO
// =========================================================

function mostrarNenhumProjeto() {

    const container =
        document.getElementById(
            "projetosContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div class="nenhum-projeto">

            <div class="icone-vazio">

                <i class="bi bi-kanban"></i>

            </div>


            <h2>
                Nenhum orçamento concluído
            </h2>

            <p>
                Os orçamentos com status Concluído aparecerão aqui automaticamente.
            </p>

        </div>

    `;

}


// =========================================================
// ERRO
// =========================================================

function mostrarErro() {

    const container =
        document.getElementById(
            "projetosContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div class="nenhum-projeto">

            <div class="icone-vazio">

                <i class="bi bi-exclamation-triangle"></i>

            </div>


            <h2>
                Não foi possível carregar os projetos
            </h2>


            <p>
                Verifique se o servidor está funcionando
                e tente novamente.
            </p>


            <button
                type="button"
                class="btn-novo-projeto"
                onclick="carregarProjetos()"
            >

                <i class="bi bi-arrow-clockwise"></i>

                Tentar novamente

            </button>

        </div>

    `;

}


// =========================================================
// ESCAPAR HTML
// =========================================================

function escaparHTML(
    valor
) {

    return String(
        valor || ""
    )

    .replace(
        /&/g,
        "&amp;"
    )

    .replace(
        /</g,
        "&lt;"
    )

    .replace(
        />/g,
        "&gt;"
    )

    .replace(
        /"/g,
        "&quot;"
    )

    .replace(
        /'/g,
        "&#039;"
    );

}