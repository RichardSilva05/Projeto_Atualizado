// =========================================================
// BUSCAR ENDEREÇO PELO CEP
// =========================================================

const campoCep = document.getElementById("cep");

if (campoCep) {

    campoCep.addEventListener("blur", buscarCep);

    campoCep.addEventListener("input", function () {

        // Remove caracteres não numéricos
        this.value = this.value.replace(/\D/g, "");

    });

}

async function buscarCep() {

    const cep =
        document.getElementById("cep")
        ?.value
        .replace(/\D/g, "");

    if (cep.length !== 8) {
        return;
    }

    try {

        // SUA API AQUI
        const resposta = await fetch(
            `https://viacep.com.br/ws/${cep}/json/`
        );

        const dados = await resposta.json();

        if (dados.erro) {

            alert("CEP não encontrado.");
            limparEndereco();
            return;

        }

        // Preenche os campos
        document.getElementById("estado").value =
            dados.uf || "";

        document.getElementById("cidade").value =
            dados.localidade || "";

        document.getElementById("bairro").value =
            dados.bairro || "";

        document.getElementById("logradouro").value =
            dados.logradouro || "";

        // Foca no número
        document.getElementById("numero").focus();

    }
    catch (erro) {

        console.error(erro);

        alert(
            "Erro ao consultar o CEP."
        );

    }

}


// =========================================================
// LIMPAR ENDEREÇO
// =========================================================

function limparEndereco() {

    document.getElementById("estado").value = "";
    document.getElementById("cidade").value = "";
    document.getElementById("bairro").value = "";
    document.getElementById("logradouro").value = "";

}