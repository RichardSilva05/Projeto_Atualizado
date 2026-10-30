document.addEventListener("DOMContentLoaded", function () {
    const codigoCliente = document.getElementById("codigoCliente");
    const btnBuscarCliente = document.getElementById("btnBuscarCliente");
    const btnSalvarOrcamento = document.getElementById("btnSalvarOrcamento");
    const dadosCliente = document.getElementById("dadosCliente");
    const mensagemCliente = document.getElementById("mensagemCliente");
    const usarEnderecoCliente = document.getElementById("usarEnderecoCliente");

    let clienteAtual = null;

    btnBuscarCliente.addEventListener("click", buscarCliente);

    codigoCliente.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            buscarCliente();
        }
    });

    usarEnderecoCliente.addEventListener("change", function () {
        if (!clienteAtual) return;

        if (this.checked) {
            preencherEndereco(clienteAtual.endereco);
            bloquearEndereco(true);
        } else {
            limparEndereco();
            bloquearEndereco(false);
        }
    });

    btnSalvarOrcamento.addEventListener("click", salvarOrcamento);
    bloquearEndereco(true);

    function buscarCliente() {
        const codigo = codigoCliente.value.trim().toUpperCase();
        mensagemCliente.textContent = "";
        mensagemCliente.className = "mensagem-cliente";

        if (!codigo) {
            limparCliente();
            mensagemCliente.textContent = "Digite o código do cliente.";
            mensagemCliente.classList.add("erro");
            return;
        }

        const clientes = JSON.parse(localStorage.getItem("clientes")) || [];
        const cliente = clientes.find(function (item) {
            return String(item.codigo || "").toUpperCase() === codigo;
        });

        if (!cliente) {
            limparCliente();
            mensagemCliente.textContent = "Cliente não encontrado. Confira o código informado.";
            mensagemCliente.classList.add("erro");
            return;
        }

        clienteAtual = cliente;

        document.getElementById("codigoClienteEncontrado").textContent = cliente.codigo;
        document.getElementById("clienteNome").textContent = cliente.nome || "";
        document.getElementById("clienteDocumento").value = cliente.documento || "";
        document.getElementById("clienteTelefone").value = cliente.telefone || "";
        document.getElementById("clienteEmail").value = cliente.email || "";

        preencherEndereco(cliente.endereco);

        dadosCliente.hidden = false;
        mensagemCliente.textContent = "Cliente localizado com sucesso.";
        mensagemCliente.classList.add("sucesso");

        usarEnderecoCliente.checked = true;
        bloquearEndereco(true);
    }

    function preencherEndereco(endereco) {
        endereco = endereco || {};
        document.getElementById("cep").value = endereco.cep || "";
        document.getElementById("estado").value = endereco.estado || "";
        document.getElementById("cidade").value = endereco.cidade || "";
        document.getElementById("bairro").value = endereco.bairro || "";
        document.getElementById("logradouro").value = endereco.logradouro || "";
        document.getElementById("numero").value = endereco.numero || "";
        document.getElementById("complemento").value = endereco.complemento || "";
    }

    function limparEndereco() {
        ["cep", "estado", "cidade", "bairro", "logradouro", "numero", "complemento"]
            .forEach(id => document.getElementById(id).value = "");
    }

    function bloquearEndereco(bloquear) {
        ["cep", "estado", "cidade", "bairro", "logradouro", "numero", "complemento"]
            .forEach(id => document.getElementById(id).readOnly = bloquear);
    }

    function limparCliente() {
        clienteAtual = null;
        dadosCliente.hidden = true;
        usarEnderecoCliente.checked = false;
        limparEndereco();
        bloquearEndereco(false);
    }

    function salvarOrcamento() {
        if (!clienteAtual) {
            alert("Primeiro informe e busque um código de cliente.");
            codigoCliente.focus();
            return;
        }

        const obrigatorios = [
            "servico", "area", "prazo", "cep", "estado",
            "cidade", "bairro", "logradouro", "numero"
        ];

        let valido = true;

        obrigatorios.forEach(function (id) {
            const campo = document.getElementById(id);
            if (!campo.value.trim()) {
                campo.classList.add("campo-erro");
                valido = false;
            } else {
                campo.classList.remove("campo-erro");
            }
        });

        if (!valido) {
            alert("Preencha todos os campos obrigatórios do orçamento.");
            return;
        }

        const orcamentos = JSON.parse(localStorage.getItem("orcamentos")) || [];

        const orcamento = {
            codigo: gerarCodigoOrcamento(orcamentos),
            clienteCodigo: clienteAtual.codigo,
            clienteNome: clienteAtual.nome,
            servico: document.getElementById("servico").value,
            area: document.getElementById("area").value,
            prazo: document.getElementById("prazo").value,
            enderecoServico: {
                cep: document.getElementById("cep").value.trim(),
                estado: document.getElementById("estado").value.trim(),
                cidade: document.getElementById("cidade").value.trim(),
                bairro: document.getElementById("bairro").value.trim(),
                logradouro: document.getElementById("logradouro").value.trim(),
                numero: document.getElementById("numero").value.trim(),
                complemento: document.getElementById("complemento").value.trim()
            },
            observacoes: document.getElementById("observacoes").value.trim(),
            valor: 0,
            status: "Aguardando",
            data: new Date().toISOString()
        };

        orcamentos.push(orcamento);
        localStorage.setItem("orcamentos", JSON.stringify(orcamentos));

        alert("Orçamento cadastrado com sucesso!\n\nCódigo: " + orcamento.codigo);
        window.location.href = "orcamentos.html";
    }

    function gerarCodigoOrcamento(orcamentos) {
        let maiorNumero = 0;

        orcamentos.forEach(function (orcamento) {
            const numero = parseInt(String(orcamento.codigo || "").replace("ORC-", ""), 10);
            if (!isNaN(numero) && numero > maiorNumero) maiorNumero = numero;
        });

        return "ORC-" + String(maiorNumero + 1).padStart(4, "0");
    }
});
