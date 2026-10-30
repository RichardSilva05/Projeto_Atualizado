
"use strict";

// =========================================================
// CLIENTES - PAINEL SABINO GESSO
// =========================================================

const API_URL = "http://localhost:3000/api";

// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener("DOMContentLoaded", function () {
    const token = sessionStorage.getItem("tokenAdmin");

    if (!token) {
        window.location.replace("login.html");
        return;
    }

    configurarBusca();
    carregarClientes();
});

// =========================================================
// BUSCAR CLIENTES NA API
// =========================================================

async function carregarClientes() {
    const container = document.getElementById("clientesGrid");

    if (!container) return;

    container.innerHTML = `
        <div class="carregando-clientes">
            <i class="bi bi-arrow-repeat"></i>
            <span>Carregando clientes...</span>
        </div>
    `;

    try {
        const token = sessionStorage.getItem("tokenAdmin");

        if (!token) {
            window.location.replace("login.html");
            return;
        }

        const resposta = await fetch(`${API_URL}/clientes`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });

        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.erro || "Não foi possível carregar os clientes."
            );
        }

        const clientes = Array.isArray(dados)
            ? dados
            : Array.isArray(dados.clientes)
                ? dados.clientes
                : [];

        container.replaceChildren();

        if (clientes.length === 0) {
            mostrarNenhumCliente(container);
            return;
        }

        clientes.forEach(function (cliente) {
            container.appendChild(criarCardCliente(cliente));
        });

        // Aplica novamente a pesquisa depois de atualizar os cards.
        const campoBusca = document.getElementById("buscarCliente");

        if (campoBusca) {
            filtrarClientes(
                campoBusca.value.toLowerCase().trim()
            );
        }

    } catch (erro) {
        console.error("Erro ao carregar clientes:", erro);
        mostrarErro(container, erro.message);
    }
}

// =========================================================
// CRIAR CARD DO CLIENTE
// =========================================================

function criarCardCliente(cliente) {
    const card = document.createElement("article");
    card.className = "card-cliente";

    const nome = cliente.nome || "Cliente não informado";
    const telefone = cliente.telefone || "Não informado";
    const email = cliente.email || "Não informado";
    const codigo = cliente.codigo || "";
    const documentoBusca = String(cliente.documento || cliente.cpf || cliente.cnpj || "");
    const id = cliente.id;

    // O documento fica apenas como dado de busca e não aparece no cartão.
    card.dataset.codigoBusca = codigo;
    card.dataset.documentoBusca = documentoBusca.replace(/\D/g, "");

    const quantidadeProjetos = Number(
        cliente.quantidadeProjetos ??
        cliente.quantidade_projetos ??
        cliente.totalProjetos ??
        cliente.total_projetos ??
        0
    );

    const projetosRecentes = obterProjetosRecentes(cliente);
    const iniciais = gerarIniciais(nome);
    const classeAvatar = obterClasseAvatar(nome);

    card.innerHTML = `
        <div class="cliente-topo">

            <div class="cliente-avatar ${classeAvatar}">
                ${escaparHTML(iniciais)}
            </div>

            <div class="cliente-info">
                <h2>${escaparHTML(nome)}</h2>

                <p>
                    <i class="bi bi-telephone"></i>
                    ${escaparHTML(telefone)}
                </p>

                <p>
                    <i class="bi bi-envelope"></i>
                    ${escaparHTML(email)}
                </p>

                <p class="cliente-codigo">
                    Código: ${escaparHTML(codigo || "Não informado")}
                </p>
            </div>

            <button
                type="button"
                class="btn-menu-cliente"
                title="Ver detalhes"
                aria-label="Ver detalhes do cliente"
            >
                <i class="bi bi-three-dots-vertical"></i>
            </button>
        </div>

        <div class="projetos-recentes">
            <strong>Projetos:</strong>

            <span>
                ${quantidadeProjetos}
                ${quantidadeProjetos === 1 ? "projeto" : "projetos"}
            </span>
        </div>

        <p class="projeto">
            <i class="bi bi-file-earmark-text"></i>
            ${escaparHTML(projetosRecentes)}
        </p>

        <div class="cliente-rodape">
            <span>
                ${quantidadeProjetos}
                ${quantidadeProjetos === 1 ? "projeto" : "projetos"}
            </span>

            <div class="cliente-acoes">
                <button
                    type="button"
                    class="btn-detalhes"
                    title="Ver detalhes"
                >
                    Ver Detalhes
                </button>

                <button
                    type="button"
                    class="btn-excluir-cliente"
                    title="Excluir cliente"
                    aria-label="Excluir cliente"
                >
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        </div>
    `;

    // -----------------------------------------------------
    // BOTÃO VER DETALHES
    // -----------------------------------------------------

    const botaoDetalhes = card.querySelector(".btn-detalhes");
    const botaoMenu = card.querySelector(".btn-menu-cliente");

    function abrirDetalhes() {
        if (!codigo) {
            alert("Não foi possível identificar o código do cliente.");
            return;
        }

        abrirDetalhesCliente(codigo);
    }

    botaoDetalhes.addEventListener("click", abrirDetalhes);
    botaoMenu.addEventListener("click", abrirDetalhes);

    // -----------------------------------------------------
    // BOTÃO EXCLUIR CLIENTE
    // -----------------------------------------------------

    const botaoExcluir = card.querySelector(".btn-excluir-cliente");

    botaoExcluir.addEventListener("click", async function () {
        if (!id) {
            alert("Não foi possível identificar o ID do cliente.");
            return;
        }

        const confirmar = confirm(
            `Deseja realmente excluir o cliente "${nome}"?\n\n` +
            "A exclusão só será permitida se ele não possuir " +
            "orçamentos vinculados."
        );

        if (!confirmar) return;

        botaoExcluir.disabled = true;
        botaoExcluir.innerHTML = `
            <span class="spinner-border spinner-border-sm"
                  aria-hidden="true"></span>
        `;

        await excluirCliente(id, botaoExcluir);
    });

    return card;
}

// =========================================================
// EXCLUIR CLIENTE NO BANCO PELA API
// =========================================================

async function excluirCliente(id, botao) {
    try {
        const token = sessionStorage.getItem("tokenAdmin");

        if (!token) {
            window.location.replace("login.html");
            return;
        }

        const resposta = await fetch(
            `${API_URL}/clientes/${encodeURIComponent(id)}`,
            {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/json"
                }
            }
        );

        const dados = await resposta.json();

        if (resposta.status === 401 || resposta.status === 403) {
            sessionStorage.removeItem("tokenAdmin");
            window.location.replace("login.html");
            return;
        }

        if (!resposta.ok) {
            throw new Error(
                dados.erro || "Não foi possível excluir o cliente."
            );
        }

        alert(dados.mensagem || "Cliente excluído com sucesso.");

        // Busca novamente os dados atualizados do banco.
        await carregarClientes();

    } catch (erro) {
        console.error("Erro ao excluir cliente:", erro);

        alert(erro.message || "Erro ao conectar com o servidor.");

        botao.disabled = false;
        botao.innerHTML = '<i class="bi bi-trash3"></i>';
    }
}

// =========================================================
// PROJETOS RECENTES
// =========================================================

function obterProjetosRecentes(cliente) {
    if (Array.isArray(cliente.projetos)) {
        if (cliente.projetos.length === 0) {
            return "Nenhum projeto registrado";
        }

        return cliente.projetos
            .slice(0, 2)
            .map(function (projeto) {
                return (
                    projeto.nome ||
                    projeto.nomeProjeto ||
                    projeto.servico ||
                    projeto.tipo ||
                    "Projeto"
                );
            })
            .join(", ");
    }

    if (cliente.projetosRecentes) {
        return cliente.projetosRecentes;
    }

    if (cliente.projetos_recentes) {
        return cliente.projetos_recentes;
    }

    if (cliente.projetoRecente) {
        return cliente.projetoRecente;
    }

    return "Nenhum projeto registrado";
}

// =========================================================
// CONFIGURAR PESQUISA
// =========================================================

function configurarBusca() {
    const campo = document.getElementById("buscarCliente");

    if (!campo) return;

    campo.addEventListener("input", function () {
        filtrarClientes(campo.value.toLowerCase().trim());
    });
}

// =========================================================
// FILTRAR CLIENTES
// =========================================================

function filtrarClientes(termo) {
    const cards = document.querySelectorAll(".card-cliente");
    const textoBusca = normalizarBusca(termo);
    const codigoBusca = textoBusca.replace(/[^a-z0-9]/g, "");
    const digitosBusca = String(termo || "").replace(/\D/g, "");

    cards.forEach(function (card) {
        const textoCartao = normalizarBusca(card.textContent);
        const codigoCliente = normalizarBusca(card.dataset.codigoBusca || "")
            .replace(/[^a-z0-9]/g, "");
        const documentoCliente = card.dataset.documentoBusca || "";

        const correspondeAoTexto = textoBusca === "" || textoCartao.includes(textoBusca);
        const correspondeAoCodigo = codigoBusca.length > 0 && codigoCliente.includes(codigoBusca);
        const correspondeAoDocumento = digitosBusca.length > 0 && documentoCliente.includes(digitosBusca);

        card.style.display =
            correspondeAoTexto || correspondeAoCodigo || correspondeAoDocumento
                ? ""
                : "none";
    });
}

function normalizarBusca(valor) {
    return String(valor || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

// =========================================================
// ABRIR DETALHES
// =========================================================

function abrirDetalhesCliente(codigo) {
    if (!codigo) {
        alert("Não foi possível identificar o cliente.");
        return;
    }

    window.location.href =
        "detalhes-cliente.html?codigo=" +
        encodeURIComponent(codigo);
}

// =========================================================
// GERAR INICIAIS
// =========================================================

function gerarIniciais(nome) {
    if (!nome) return "CL";

    const partes = String(nome).trim().split(/\s+/);

    if (partes.length === 1) {
        return partes[0].substring(0, 2).toUpperCase();
    }

    return (
        partes[0][0] +
        partes[partes.length - 1][0]
    ).toUpperCase();
}

// =========================================================
// COR DO AVATAR
// =========================================================

function obterClasseAvatar(nome) {
    const classes = [
        "avatar-vermelho",
        "avatar-azul",
        "avatar-cinza",
        "avatar-laranja",
        "avatar-verde",
        "avatar-roxo"
    ];

    let valor = 0;

    for (let i = 0; i < nome.length; i++) {
        valor += nome.charCodeAt(i);
    }

    return classes[valor % classes.length];
}

// =========================================================
// NENHUM CLIENTE
// =========================================================

function mostrarNenhumCliente(container) {
    container.innerHTML = `
        <div class="nenhum-cliente">
            <i class="bi bi-people"></i>

            <h2>Nenhum cliente cadastrado</h2>

            <p>
                Os clientes cadastrados aparecerão aqui.
            </p>
        </div>
    `;
}

// =========================================================
// ERRO
// =========================================================

function mostrarErro(container, mensagem) {
    container.innerHTML = `
        <div class="nenhum-cliente">
            <i class="bi bi-exclamation-circle"></i>

            <h2>Não foi possível carregar os clientes</h2>

            <p>
                ${escaparHTML(
                    mensagem || "Verifique se o servidor está em execução."
                )}
            </p>

            <button type="button" class="btn-tentar-novamente">
                Tentar novamente
            </button>
        </div>
    `;

    const botao = container.querySelector(".btn-tentar-novamente");

    if (botao) {
        botao.addEventListener("click", carregarClientes);
    }
}

// =========================================================
// PROTEÇÃO CONTRA HTML
// =========================================================

function escaparHTML(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
