// =========================================================
// LOGIN DE ADMINISTRADOR - SABINO GESSO
// =========================================================

// >>> Troque pelo endereço do seu servidor quando hospedar <<<
const API_URL = "http://localhost:3000";

function validarEmail(email) {

    const regex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(email);

}


function mostrarErro(mensagem, campo = null) {

    alert(mensagem);

    if (campo) {
        campo.focus();
    }

}


async function autenticar(event) {

    event.preventDefault();

    const campoEmail =
        document.getElementById("email");

    const campoSenha =
        document.getElementById("senha");

    const botao =
        document.querySelector(".btn-entrar");

    const emailValor =
        campoEmail.value.trim();

    const senhaValor =
        campoSenha.value;


    // =====================================================
    // E-MAIL
    // =====================================================

    if (emailValor === "") {

        mostrarErro(
            "Por favor, informe o e-mail.",
            campoEmail
        );

        return;

    }

    if (!validarEmail(emailValor)) {

        mostrarErro(
            "Informe um e-mail válido.",
            campoEmail
        );

        return;

    }


    // =====================================================
    // SENHA
    // =====================================================

    if (senhaValor === "") {

        mostrarErro(
            "Por favor, informe a senha.",
            campoSenha
        );

        return;

    }


    // =====================================================
    // AUTENTICAÇÃO NO SERVIDOR
    // =====================================================

    const textoOriginal = botao.textContent;

    botao.disabled = true;
    botao.textContent = "Entrando...";

    try {

        const resposta = await fetch(
            `${API_URL}/api/admin/login`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: emailValor,
                    senha: senhaValor
                })
            }
        );

        const dados = await resposta.json().catch(() => ({}));

        if (!resposta.ok) {

            // O servidor informa qual campo está errado
            const erroNoEmail = dados.campo === "email";

            // Limpa só a senha; o e-mail fica para o usuário corrigir
            campoSenha.value = "";

            mostrarErro(
                dados.erro || "Não foi possível entrar.",
                erroNoEmail ? campoEmail : campoSenha
            );

            return;

        }

        // Guarda o token só enquanto a aba estiver aberta
        sessionStorage.setItem("tokenAdmin", dados.token);

        window.location.href = "orcamentos.html";

    } catch (erro) {

        mostrarErro(
            "Não foi possível conectar ao servidor."
        );

    } finally {

        botao.disabled = false;
        botao.textContent = textoOriginal;

    }

}


// Remove da barra de endereço qualquer dado na URL (ex.: ?email=...&senha=...)
// e esvazia os campos. Evita que credenciais fiquem no histórico.
function limparUrlECampos() {

    if (window.location.search || window.location.hash) {
        window.history.replaceState(
            null,
            "",
            window.location.pathname
        );
    }

    const campoSenha = document.getElementById("senha");

    if (campoSenha) {
        campoSenha.value = "";
    }

}

// Voltar pelo botão "Voltar" do navegador pode restaurar a senha digitada
window.addEventListener("pageshow", function (evento) {

    if (evento.persisted) {
        limparUrlECampos();
    }

});


document.addEventListener("DOMContentLoaded", function () {

    limparUrlECampos();

    // Já está logado? Vai direto ao painel.
    if (sessionStorage.getItem("tokenAdmin")) {
        window.location.replace("orcamentos.html");
        return;
    }

    const formulario =
        document.getElementById("formLogin");

    if (formulario) {

        formulario.addEventListener("submit", autenticar);

    }

});