document.addEventListener("DOMContentLoaded", function () {

    const API_URL = "http://localhost:3000/api";


    const formPerfil = document.getElementById("formPerfil");
    const formSenha = document.getElementById("formSenha");

    const notificacaoEmail = document.getElementById("notificacaoEmail");
    const notificacaoSms = document.getElementById("notificacaoSms");


    carregarConfiguracoes();


    /*
    ==========================================================
    CARREGAR CONFIGURAÇÕES
    ==========================================================
    */

    async function carregarConfiguracoes() {

        try {

            const resposta = await fetch(
                `${API_URL}/configuracoes`
            );


            if (!resposta.ok) {

                throw new Error(
                    "Não foi possível carregar as configurações."
                );

            }


            const dados = await resposta.json();


            /*
            --------------------------------------------------
            PERFIL
            --------------------------------------------------
            */

            document.getElementById("nome").value =
                dados.nome || "";

            document.getElementById("email").value =
                dados.email || "";

            document.getElementById("telefone").value =
                dados.telefone || "";


            /*
            --------------------------------------------------
            NOTIFICAÇÕES
            --------------------------------------------------
            */

            notificacaoEmail.checked =
                Boolean(dados.notificacaoEmail);

            notificacaoSms.checked =
                Boolean(dados.notificacaoSms);


        } catch (erro) {

            console.error(
                "Erro ao carregar configurações:",
                erro
            );

            mostrarMensagem(
                "Não foi possível carregar as configurações.",
                "erro"
            );

        }

    }



    /*
    ==========================================================
    SALVAR PERFIL
    ==========================================================
    */

    formPerfil.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const dados = {

                nome:
                    document.getElementById("nome").value.trim(),

                email:
                    document.getElementById("email").value.trim(),

                telefone:
                    document.getElementById("telefone").value.trim()

            };


            if (!dados.nome || !dados.email) {

                mostrarMensagem(
                    "Preencha nome e email.",
                    "erro"
                );

                return;

            }


            try {

                const resposta = await fetch(
                    `${API_URL}/configuracoes/perfil`,
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify(dados)
                    }
                );


                if (!resposta.ok) {

                    throw new Error(
                        "Erro ao salvar o perfil."
                    );

                }


                mostrarMensagem(
                    "Perfil atualizado com sucesso!",
                    "sucesso"
                );


            } catch (erro) {

                console.error(
                    "Erro ao salvar perfil:",
                    erro
                );

                mostrarMensagem(
                    "Não foi possível salvar o perfil.",
                    "erro"
                );

            }

        }
    );



    /*
    ==========================================================
    SALVAR NOTIFICAÇÕES
    ==========================================================
    */

    notificacaoEmail.addEventListener(
        "change",
        salvarNotificacoes
    );


    notificacaoSms.addEventListener(
        "change",
        salvarNotificacoes
    );


    async function salvarNotificacoes() {

        const dados = {

            notificacaoEmail:
                notificacaoEmail.checked,

            notificacaoSms:
                notificacaoSms.checked

        };


        try {

            const resposta = await fetch(
                `${API_URL}/configuracoes/notificacoes`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify(dados)
                }
            );


            if (!resposta.ok) {

                throw new Error(
                    "Erro ao salvar notificações."
                );

            }


            mostrarMensagem(
                "Preferências de notificação atualizadas.",
                "sucesso"
            );


        } catch (erro) {

            console.error(
                "Erro ao salvar notificações:",
                erro
            );

            mostrarMensagem(
                "Não foi possível salvar as preferências.",
                "erro"
            );

        }

    }



    /*
    ==========================================================
    ALTERAR SENHA
    ==========================================================
    */

    formSenha.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const senhaAtual =
                document.getElementById("senhaAtual").value;

            const novaSenha =
                document.getElementById("novaSenha").value;


            if (!senhaAtual || !novaSenha) {

                mostrarMensagem(
                    "Preencha os campos de senha.",
                    "erro"
                );

                return;

            }


            if (novaSenha.length < 6) {

                mostrarMensagem(
                    "A nova senha deve possuir pelo menos 6 caracteres.",
                    "erro"
                );

                return;

            }


            try {

                const resposta = await fetch(
                    `${API_URL}/configuracoes/senha`,
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({

                            senhaAtual:
                                senhaAtual,

                            novaSenha:
                                novaSenha

                        })
                    }
                );


                const resultado =
                    await resposta.json();


                if (!resposta.ok) {

                    throw new Error(
                        resultado.mensagem ||
                        "Não foi possível alterar a senha."
                    );

                }


                mostrarMensagem(
                    "Senha alterada com sucesso!",
                    "sucesso"
                );


                formSenha.reset();


            } catch (erro) {

                console.error(
                    "Erro ao alterar senha:",
                    erro
                );

                mostrarMensagem(
                    erro.message ||
                    "Não foi possível alterar a senha.",
                    "erro"
                );

            }

        }
    );



    /*
    ==========================================================
    MENSAGEM
    ==========================================================
    */

    function mostrarMensagem(
        mensagem,
        tipo
    ) {

        let elemento =
            document.getElementById(
                "mensagemConfiguracoes"
            );


        if (!elemento) {

            elemento =
                document.createElement("div");

            elemento.id =
                "mensagemConfiguracoes";

            elemento.style.position =
                "fixed";

            elemento.style.top =
                "20px";

            elemento.style.right =
                "20px";

            elemento.style.zIndex =
                "9999";

            elemento.style.padding =
                "14px 20px";

            elemento.style.borderRadius =
                "8px";

            elemento.style.fontSize =
                "14px";

            elemento.style.boxShadow =
                "0 4px 15px rgba(0,0,0,0.15)";

            document.body.appendChild(elemento);

        }


        elemento.textContent =
            mensagem;


        if (tipo === "sucesso") {

            elemento.style.background =
                "#28a745";

            elemento.style.color =
                "#fff";

        } else {

            elemento.style.background =
                "#dc3545";

            elemento.style.color =
                "#fff";

        }


        elemento.style.display =
            "block";


        clearTimeout(
            elemento._timeout
        );


        elemento._timeout =
            setTimeout(function () {

                elemento.style.display =
                    "none";

            }, 3000);

    }

});