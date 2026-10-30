// ============================================================
// SERVIDOR - SABINO GESSO
// Uso: npm install express cors mysql2 express-rate-limit dotenv
//                  jsonwebtoken bcryptjs
//      node server.js
//
// Variáveis de ambiente (arquivo .env ao lado do server.js):
//   DB_HOST, DB_PORT (padrão 3307), DB_USER, DB_PASSWORD (obrigatória),
//   DB_NAME
//   JWT_SECRET   -> OBRIGATÓRIA, mínimo 32 caracteres (assina o login)
//   CORS_ORIGIN  -> origens permitidas, separadas por vírgula
//                   ex.: https://sabinogesso.com.br,https://www.sabinogesso.com.br
//   TRUST_PROXY  -> nº de proxies à frente do servidor (ex.: 1 com Nginx,
//                   Cloudflare, Render). Padrão: 0 (sem proxy)
//   NODE_ENV     -> "production" em produção
//   PORT
//
// Administradores ficam na tabela "administradores" (banco_admin.sql).
// Crie o primeiro com:  node criar_admin.js
//
// Requer express-rate-limit v7 ou superior (usa a opção "limit").
// ============================================================

try {
    require("dotenv").config();
} catch (erro) {
    // dotenv é opcional: sem ele, use variáveis de ambiente do sistema.
}


const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");

const EM_PRODUCAO = process.env.NODE_ENV === "production";

if (!process.env.DB_PASSWORD) {
    console.error(
        "ERRO: defina a variável de ambiente DB_PASSWORD antes de iniciar."
    );
    process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error(
        "ERRO: defina JWT_SECRET no .env (mínimo 32 caracteres)."
    );
    process.exit(1);
}

const app = express();

// Atrás de proxy reverso, sem isso todos os usuários teriam o mesmo IP
// e o rate limit valeria para o site inteiro.
const trustProxy = Number(process.env.TRUST_PROXY) || 0;

if (trustProxy > 0) {
    app.set("trust proxy", trustProxy);
}

// ============================================================
// CORS RESTRITO
// ============================================================

const origensPermitidas = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

if (origensPermitidas.length === 0) {
    if (EM_PRODUCAO) {
        console.error(
            "ERRO: defina CORS_ORIGIN (domínios permitidos) em produção."
        );
        process.exit(1);
    }

    console.warn(
        "AVISO: CORS_ORIGIN não definido. Liberando todas as origens " +
        "apenas porque NODE_ENV não é 'production'."
    );
}

app.use(cors({
    origin: function (origin, callback) {
        // Requisições sem Origin (mesmo domínio, curl, etc.)
        if (!origin) return callback(null, true);

        if (origensPermitidas.length === 0) {
            return callback(null, true); // somente em desenvolvimento
        }

        if (origensPermitidas.includes(origin)) {
            return callback(null, true);
        }

        const erro = new Error("Origem não permitida.");
        erro.status = 403;
        return callback(erro);
    }
}));

app.use(express.json({ limit: "20kb" }));

// Servir páginas estáticas sem expor a raiz do projeto nem o arquivo .env.
// Isso permite abrir o administrador em http://localhost:3000/admin/...
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/public", express.static(path.join(__dirname, "public")));

// ============================================================
// LIMITE DE REQUISIÇÕES
// ============================================================

const limitePost = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        erro: "Muitas solicitações. Tente novamente em alguns minutos."
    }
});

const limiteGet = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas requisições. Tente novamente mais tarde." }
});

// Limite por IP no login (além do bloqueio por conta, mais abaixo)
const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        erro: "Muitas tentativas. Tente novamente em alguns minutos."
    }
});

// Limite para ações do painel (alterar projetos etc.)
const limiteAdmin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas requisições. Tente novamente mais tarde." }
});

// ============================================================
// CONEXÃO COM O BANCO
// ============================================================

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "sabino_gesso",
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10
});

// ============================================================
// LOGIN DE ADMINISTRADOR (tabela "administradores")
// ============================================================

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;

// Hash falso: se o e-mail não existir, ainda assim gastamos o mesmo
// tempo comparando, para não revelar quais e-mails são cadastrados.
const HASH_FALSO = bcrypt.hashSync("senha-falsa-para-igualar-tempo", 12);

// POST /api/admin/login  { email, senha }  ->  { token, nome }
app.post("/api/admin/login", limiteLogin, async function (req, res) {
    const email = String((req.body || {}).email ?? "")
        .trim()
        .toLowerCase();
    const senha = String((req.body || {}).senha ?? "");

    const ERRO_GENERICO = { erro: "E-mail ou senha inválidos." };

    if (!email || !senha || email.length > 150 || senha.length > 200) {
        return res.status(401).json(ERRO_GENERICO);
    }

    try {
        const [linhas] = await pool.query(
            `SELECT id, nome, senha_hash, ativo, tentativas_falhas,
                    bloqueado_ate > NOW() AS bloqueado
             FROM administradores
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        const admin = linhas[0];

        // Conta bloqueada por tentativas erradas
        if (admin && admin.bloqueado) {
            return res.status(429).json({
                erro: `Conta bloqueada por ${MINUTOS_BLOQUEIO} minutos ` +
                      "após muitas tentativas."
            });
        }

        const senhaOk = await bcrypt.compare(
            senha,
            admin ? admin.senha_hash : HASH_FALSO
        );

        // E-mail não cadastrado
        if (!admin) {
            return res.status(401).json({
                erro: "E-mail não cadastrado.",
                campo: "email"
            });
        }

        // Senha incorreta: conta a tentativa e bloqueia após o limite
        if (!senhaOk) {
            const falhas = admin.tentativas_falhas + 1;

            if (falhas >= MAX_TENTATIVAS) {
                await pool.query(
                    `UPDATE administradores
                     SET tentativas_falhas = 0,
                         bloqueado_ate =
                             DATE_ADD(NOW(), INTERVAL ? MINUTE)
                     WHERE id = ?`,
                    [MINUTOS_BLOQUEIO, admin.id]
                );

                return res.status(429).json({
                    erro: "Senha incorreta. Conta bloqueada por " +
                          `${MINUTOS_BLOQUEIO} minutos.`,
                    campo: "senha"
                });
            }

            await pool.query(
                `UPDATE administradores
                 SET tentativas_falhas = ?
                 WHERE id = ?`,
                [falhas, admin.id]
            );

            const restantes = MAX_TENTATIVAS - falhas;

            return res.status(401).json({
                erro: "Senha incorreta. " +
                      `Restam ${restantes} tentativa(s).`,
                campo: "senha"
            });
        }

        // Senha certa, mas a conta foi desativada
        if (!admin.ativo) {
            return res.status(403).json({
                erro: "Esta conta está desativada.",
                campo: "email"
            });
        }

        await pool.query(
            `UPDATE administradores
             SET tentativas_falhas = 0, bloqueado_ate = NULL,
                 ultimo_login = NOW()
             WHERE id = ?`,
            [admin.id]
        );

        const token = jwt.sign(
            { sub: admin.id, papel: "admin" },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        return res.json({ token, nome: admin.nome });

    } catch (erro) {
        console.error("Erro no login de admin:", erro);

        return res.status(500).json({
            erro: "Erro ao fazer login. Tente novamente."
        });
    }
});

// Middleware: exige o token do login e confere se a conta segue ativa.
// Envie o cabeçalho:  Authorization: Bearer SEU_TOKEN
async function exigirAdmin(req, res, next) {
    const cabecalho = req.headers.authorization || "";
    const token = cabecalho.startsWith("Bearer ")
        ? cabecalho.slice(7)
        : "";

    try {
        const dados = jwt.verify(token, process.env.JWT_SECRET);

        if (dados.papel !== "admin" || !Number.isInteger(dados.sub)) {
            throw new Error("token inválido");
        }

        const [linhas] = await pool.query(
            "SELECT id FROM administradores WHERE id = ? AND ativo = TRUE",
            [dados.sub]
        );

        if (linhas.length === 0) {
            throw new Error("conta inativa");
        }

        req.adminId = dados.sub;
        next();

    } catch (erro) {
        return res.status(401).json({ erro: "Não autorizado." });
    }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

const PRAZOS = ["Urgente", "Até 30 dias", "Sem pressa"];

function soDigitos(valor) {
    return String(valor ?? "").replace(/\D/g, "");
}

function pad(numero, tamanho) {
    return String(numero).padStart(tamanho, "0");
}

// A área é informada por serviço; o total é a soma das áreas individuais.
// Os preços são recalculados no servidor para cada metragem.
function normalizarServicosDetalhados(nomesServicos, recebidos, descricaoOutro = "") {
    if (!Array.isArray(recebidos)) {
        throw new Error("Informe a metragem de cada serviço selecionado.");
    }

    const porNome = new Map();
    for (const item of recebidos) {
        if (!item || typeof item !== "object") continue;
        const nome = String(item.nome ?? "").trim();
        if (!nome || porNome.has(nome)) {
            throw new Error("A lista de serviços contém nomes inválidos ou repetidos.");
        }
        const valorArea = String(item.area ?? "").trim().replace(",", ".");
        const area = Number(valorArea);
        if (!Number.isFinite(area) || area <= 0 || area >= 100000000) {
            throw new Error(`Informe uma metragem válida para ${nome}.`);
        }
        porNome.set(nome, {
            nome,
            area: Math.round(area * 100) / 100,
            outroDescricao: nome === "Outro"
                ? String(item.outroDescricao || descricaoOutro || "").trim()
                : ""
        });
    }

    const unicos = [...new Set(nomesServicos.map(nome => String(nome).trim()))];
    const itens = unicos.map(nome => {
        const item = porNome.get(nome);
        if (!item) throw new Error(`Informe a metragem de ${nome}.`);
        return item;
    });
    if (itens.length !== porNome.size) {
        throw new Error("As metragens enviadas não correspondem aos serviços selecionados.");
    }
    return itens;
}

function calcularAreaTotal(servicosDetalhados) {
    const centavos = servicosDetalhados.reduce(
        (soma, item) => soma + Math.round(Number(item.area) * 100), 0
    );
    return centavos / 100;
}

function aplicarPrecosServicos(servicosDetalhados, precosPorNome) {
    return servicosDetalhados.map(item => {
        const bruto = precosPorNome[item.nome];
        const precoM2 = bruto === null || bruto === undefined ? null : Number(bruto);
        const sobConsulta = !Number.isFinite(precoM2) || precoM2 <= 0;
        const valor = sobConsulta
            ? null
            : Math.round(Number(item.area) * precoM2 * 100) / 100;
        return { ...item, precoM2: sobConsulta ? null : precoM2, valor, sobConsulta };
    });
}

function calcularValorServicos(servicosDetalhados) {
    const centavos = servicosDetalhados.reduce(
        (soma, item) => soma + (item.valor === null ? 0 : Math.round(item.valor * 100)),
        0
    );
    return centavos / 100;
}

function codigoTemporario() {
    return "TMP" + crypto.randomBytes(8).toString("hex");
}

function validarCPF(cpf) {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    for (let t = 9; t < 11; t++) {
        let soma = 0;

        for (let i = 0; i < t; i++) {
            soma += Number(cpf[i]) * (t + 1 - i);
        }

        const digito = ((soma * 10) % 11) % 10;

        if (digito !== Number(cpf[t])) {
            return false;
        }
    }

    return true;
}

// DDD entre 11 e 99; celular (11 dígitos) começa com 9
function validarTelefone(numeros) {
    if (numeros.length !== 10 && numeros.length !== 11) {
        return false;
    }

    if (!/^[1-9][1-9]/.test(numeros)) {
        return false;
    }

    if (numeros.length === 11) {
        return numeros[2] === "9";
    }

    return /^[2-9]/.test(numeros[2]);
}

function validarEntrada(d) {
    const texto = v => String(v ?? "").trim();

    const cpf = soDigitos(d.cpf);
    const cep = soDigitos(d.cep);
    const telefone = soDigitos(d.telefone);

    if (!texto(d.nome) || texto(d.nome).length > 150) {
        return "Nome inválido.";
    }

    if (!validarCPF(cpf)) {
        return "CPF inválido.";
    }

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(d.email)) ||
        texto(d.email).length > 150
    ) {
        return "E-mail inválido.";
    }

    if (!validarTelefone(telefone)) {
        return "Telefone inválido.";
    }

    if (!(Number(d.area) > 0) || Number(d.area) >= 100000000) {
        return "Área inválida.";
    }

    if (!PRAZOS.includes(d.prazo)) {
        return "Prazo inválido.";
    }

    if (cep.length !== 8) {
        return "CEP inválido.";
    }

    if (!/^[A-Za-z]{2}$/.test(texto(d.estado))) {
        return "Estado inválido.";
    }

    if (!texto(d.cidade) || texto(d.cidade).length > 100) {
        return "Cidade inválida.";
    }

    if (!texto(d.bairro) || texto(d.bairro).length > 100) {
        return "Bairro inválido.";
    }

    if (!texto(d.logradouro) || texto(d.logradouro).length > 150) {
        return "Logradouro inválido.";
    }

    if (!texto(d.numero) || texto(d.numero).length > 20) {
        return "Número inválido.";
    }

    if (texto(d.complemento).length > 150) {
        return "Complemento muito longo (máximo 150 caracteres).";
    }

    if (texto(d.observacoes).length > 2000) {
        return "Observações muito longas (máximo 2000 caracteres).";
    }

    if (!Array.isArray(d.servicos) || d.servicos.length === 0) {
        return "Selecione pelo menos um serviço.";
    }

    if (d.servicos.includes("Outro")) {
        const outro = texto(d.outroDescricao);

        if (!outro || outro.length > 150) {
            return "Descreva o outro serviço (até 150 caracteres).";
        }
    }

    try {
        normalizarServicosDetalhados(d.servicos, d.servicosDetalhados, d.outroDescricao);
    } catch (erro) {
        return erro.message;
    }

    if (typeof d.visitaTecnica !== "boolean") {
        return "Informe se deseja a visita técnica no local.";
    }

    return null;
}

function validarCNPJServidor(valor) {
    const cnpj = soDigitos(valor);

    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
        return false;
    }

    function calcularDigito(base) {
        const pesos = base.length === 12
            ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
            : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

        const soma = [...base].reduce(
            (total, digito, i) =>
                total + Number(digito) * pesos[i],
            0
        );

        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    }

    const primeiro = calcularDigito(cnpj.slice(0, 12));
    const segundo = calcularDigito(cnpj.slice(0, 12) + primeiro);

    return cnpj === cnpj.slice(0, 12) + primeiro + segundo;
}


// ============================================================
// POST /api/orcamentos/pj
// Cria um orçamento novo sem excluir os anteriores.
// ============================================================

app.post("/api/orcamentos/pj", limitePost, async function (req, res) {
    const d = req.body || {};
    const texto = valor => String(valor ?? "").trim();

    const razaoSocial = texto(d.razaoSocial);
    const nomeFantasia = texto(d.nomeFantasia);
    const responsavel = texto(d.responsavel);
    const cnpj = soDigitos(d.cnpj);
    const email = texto(d.email).toLowerCase();
    const telefone = soDigitos(d.telefone);
    const cepDigitos = soDigitos(d.cep);
    const uf = texto(d.estado).toUpperCase();
    const cidade = texto(d.cidade);
    const bairro = texto(d.bairro);
    const logradouro = texto(d.logradouro);
    const numero = texto(d.numero);
    const complemento = texto(d.complemento) || null;
    const observacoes = texto(d.observacoes) || null;
    const area = Number(d.area);
    const prazo = texto(d.prazo);
    const visitaTecnica = d.visitaTecnica === true;

    if (!razaoSocial || razaoSocial.length > 150) {
        return res.status(400).json({ erro: "Razão social inválida." });
    }

    if (!nomeFantasia || nomeFantasia.length > 150) {
        return res.status(400).json({ erro: "Nome fantasia inválido." });
    }

    if (!responsavel || responsavel.length > 150) {
        return res.status(400).json({ erro: "Responsável inválido." });
    }

    if (!validarCNPJServidor(cnpj)) {
        return res.status(400).json({ erro: "CNPJ inválido." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
        return res.status(400).json({ erro: "E-mail inválido." });
    }

    if (!validarTelefone(telefone)) {
        return res.status(400).json({ erro: "Telefone inválido." });
    }

    if (!Number.isFinite(area) || area <= 0 || area >= 100000000) {
        return res.status(400).json({ erro: "Área inválida." });
    }

    if (!PRAZOS.includes(prazo)) {
        return res.status(400).json({ erro: "Prazo inválido." });
    }

    if (typeof d.visitaTecnica !== "boolean") {
        return res.status(400).json({
            erro: "Informe se deseja a visita técnica no local."
        });
    }

    if (cepDigitos.length !== 8) {
        return res.status(400).json({ erro: "CEP inválido." });
    }

    if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({ erro: "Estado inválido." });
    }

    if (!cidade || cidade.length > 100) {
        return res.status(400).json({ erro: "Cidade inválida." });
    }

    if (!bairro || bairro.length > 100) {
        return res.status(400).json({ erro: "Bairro inválido." });
    }

    if (!logradouro || logradouro.length > 150) {
        return res.status(400).json({ erro: "Logradouro inválido." });
    }

    if (!numero || numero.length > 20) {
        return res.status(400).json({ erro: "Número inválido." });
    }

    if (complemento && complemento.length > 150) {
        return res.status(400).json({ erro: "Complemento muito longo." });
    }

    if (observacoes && observacoes.length > 2000) {
        return res.status(400).json({
            erro: "Observações muito longas (máximo 2000 caracteres)."
        });
    }

    const servicosRecebidos = Array.isArray(d.servicos)
        ? d.servicos.map(String)
        : [];

    const outroDescricao = texto(d.outroDescricao);

    if (outroDescricao.length > 150) {
        return res.status(400).json({
            erro: "A descrição do serviço deve ter até 150 caracteres."
        });
    }

    // "Outro" marcado sem descrição deve gerar erro (não ser ignorado)
    if (servicosRecebidos.includes("Outro") && !outroDescricao) {
        return res.status(400).json({
            erro: "Descreva o outro serviço."
        });
    }

    const servicosPedidos = [
        ...new Set([
            ...servicosRecebidos.filter(nome => nome !== "Outro"),
            ...(outroDescricao ? ["Outro"] : [])
        ])
    ];

    let metragemPorServico;
    try {
        metragemPorServico = normalizarServicosDetalhados(
            servicosPedidos, d.servicosDetalhados, outroDescricao
        );
    } catch (erro) {
        return res.status(400).json({ erro: erro.message });
    }
    const areaTotal = calcularAreaTotal(metragemPorServico);
    if (!(areaTotal > 0) || areaTotal >= 100000000) {
        return res.status(400).json({ erro: "Metragem total inválida." });
    }

    if (servicosPedidos.length === 0) {
        return res.status(400).json({
            erro: "Selecione pelo menos um serviço."
        });
    }

    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await pool.getConnection();
        await conexao.beginTransaction();
        transacaoIniciada = true;

        // Confere os serviços cadastrados no banco.
        const [servicosBanco] = await conexao.query(
            "SELECT id, nome, preco_m2 FROM servicos WHERE ativo = TRUE"
        );

        const mapaServicos = {};
        const mapaPrecos = {};

        servicosBanco.forEach(servico => {
            mapaServicos[servico.nome] = servico.id;
            mapaPrecos[servico.nome] = servico.preco_m2;
        });

        const servicoInvalido = servicosPedidos.find(
            nome => !Object.prototype.hasOwnProperty.call(mapaServicos, nome)
        );

        if (servicoInvalido) {
            throw new Error(
                `Serviço não cadastrado ou inativo: ${servicoInvalido}`
            );
        }

        const servicosDetalhados = aplicarPrecosServicos(metragemPorServico, mapaPrecos);
        const valor = calcularValorServicos(servicosDetalhados);

        // Reutiliza o cadastro da empresa, se o CNPJ já existir.
        // Não atualiza nem exclui o cadastro existente.
        const [clientesExistentes] = await conexao.query(
            `SELECT id, codigo, tipo_cliente
             FROM clientes
             WHERE documento = ?
             LIMIT 1
             FOR UPDATE`,
            [cnpj]
        );

        const cepFormatado =
            `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`;

        let clienteId;
        let clienteCodigo;

        if (clientesExistentes.length > 0) {
            const cliente = clientesExistentes[0];

            if (cliente.tipo_cliente !== "PJ") {
                await conexao.rollback();
                transacaoIniciada = false;

                return res.status(409).json({
                    erro: "O documento já está cadastrado como Pessoa Física."
                });
            }

            clienteId = cliente.id;
            clienteCodigo = cliente.codigo;

        } else {
            // Cria a empresa somente quando o CNPJ ainda não existe.
            const [novoCliente] = await conexao.query(
                `INSERT INTO clientes
                    (codigo, tipo_cliente, nome, documento, email, telefone,
                     nome_fantasia, responsavel)
                 VALUES (?, 'PJ', ?, ?, ?, ?, ?, ?)`,
                [
                    codigoTemporario(),
                    razaoSocial,
                    cnpj,
                    email,
                    telefone,
                    nomeFantasia,
                    responsavel
                ]
            );

            clienteId = novoCliente.insertId;
            clienteCodigo = `CLI-${pad(clienteId, 4)}`;

            await conexao.query(
                "UPDATE clientes SET codigo = ? WHERE id = ?",
                [clienteCodigo, clienteId]
            );

            // Endereço cadastral inicial da empresa.
            await conexao.query(
                `INSERT INTO enderecos
                    (cliente_id, cep, estado, cidade, bairro,
                     logradouro, numero, complemento)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    clienteId,
                    cepFormatado,
                    uf,
                    cidade,
                    bairro,
                    logradouro,
                    numero,
                    complemento
                ]
            );
        }

        // Cada envio cria uma nova linha em orcamentos.
        // (colunas nome_fantasia_informado e responsavel_informado:
        //  veja migracao_pj.sql)
        const [novoOrcamento] = await conexao.query(
            `INSERT INTO orcamentos
                (codigo, cliente_id, nome_informado,
                 nome_fantasia_informado, responsavel_informado,
                 email_informado, telefone_informado,
                 area, prazo, observacoes, valor, visita_tecnica)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigoTemporario(),
                clienteId,
                razaoSocial,
                nomeFantasia,
                responsavel,
                email,
                telefone,
                areaTotal,
                prazo,
                observacoes,
                valor,
                visitaTecnica
            ]
        );

        const orcamentoId = novoOrcamento.insertId;

        const codigo =
            `ORC-${new Date().getFullYear()}-${pad(orcamentoId, 4)}`;

        await conexao.query(
            "UPDATE orcamentos SET codigo = ? WHERE id = ?",
            [codigo, orcamentoId]
        );

        // Guarda um endereço próprio para este orçamento.
        await conexao.query(
            `INSERT INTO enderecos_orcamento
                (orcamento_id, cep, estado, cidade, bairro,
                 logradouro, numero, complemento)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orcamentoId,
                cepFormatado,
                uf,
                cidade,
                bairro,
                logradouro,
                numero,
                complemento
            ]
        );

        // Registra os serviços escolhidos para este orçamento.
        for (const item of servicosDetalhados) {
            await conexao.query(
                `INSERT INTO orcamento_servicos
                    (orcamento_id, servico_id, area, valor, outro_descricao)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    orcamentoId,
                    mapaServicos[item.nome],
                    item.area,
                    item.valor,
                    item.nome === "Outro" ? item.outroDescricao : null
                ]
            );
        }

        await conexao.commit();
        transacaoIniciada = false;

        return res.status(201).json({
            mensagem: "Orçamento PJ criado com sucesso.",
            codigo,
            clienteCodigo,
            area: areaTotal,
            valor,
            servicosDetalhados
        });

    } catch (erro) {
        if (conexao && transacaoIniciada) {
            try {
                await conexao.rollback();
            } catch (erroRollback) {
                console.error(
                    "Erro no rollback do orçamento PJ:", erroRollback
                );
            }
        }

        console.error("Erro ao salvar orçamento PJ:", erro);

        const servicoErro =
            erro.message?.startsWith("Serviço não cadastrado");

        return res.status(servicoErro ? 400 : 500).json({
            erro: servicoErro
                ? erro.message
                : "Erro ao salvar o orçamento PJ. Tente novamente."
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});


// ============================================================
// POST /api/orcamentos   (Pessoa Física)
// Nada é apagado nem sobrescrito:
// - Cliente novo: cria cadastro e endereço cadastral.
// - Cliente existente (mesmo CPF): dados do cadastro ficam
//   intactos; o novo orçamento é vinculado a ele e guarda os
//   dados de contato informados naquele envio.
// - Todo orçamento gera um registro novo, com endereço próprio.
// ============================================================

app.post("/api/orcamentos", limitePost, async function (req, res) {
    const d = req.body || {};

    const erro = validarEntrada(d);

    if (erro) {
        return res.status(400).json({ erro });
    }

    const nome = String(d.nome).trim();
    const documento = soDigitos(d.cpf);
    const email = String(d.email).trim().toLowerCase();
    const telefone = soDigitos(d.telefone);

    const cepLimpo = soDigitos(d.cep);
    const cep = `${cepLimpo.slice(0, 5)}-${cepLimpo.slice(5)}`;

    const estado = String(d.estado).trim().toUpperCase();
    const cidade = String(d.cidade).trim();
    const bairro = String(d.bairro).trim();
    const logradouro = String(d.logradouro).trim();
    const numero = String(d.numero).trim();

    const complemento = String(d.complemento ?? "").trim() || null;
    const observacoes = String(d.observacoes ?? "").trim() || null;
    const visitaTecnica = d.visitaTecnica === true;

    const servicosPedidos = [...new Set(d.servicos.map(String))];

    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await pool.getConnection();

        await conexao.beginTransaction();
        transacaoIniciada = true;

        // ----------------------------------------------------
        // VALIDAR SERVIÇOS
        // ----------------------------------------------------

        const [servicosBanco] = await conexao.query(
            "SELECT id, nome, preco_m2 FROM servicos WHERE ativo = TRUE"
        );

        const mapaServicos = {};
        const mapaPrecos = {};

        servicosBanco.forEach(s => {
            mapaServicos[s.nome] = s.id;
            mapaPrecos[s.nome] = s.preco_m2;
        });

        const invalido = servicosPedidos.find(
            s => !Object.prototype.hasOwnProperty.call(mapaServicos, s)
        );

        if (invalido) {
            await conexao.rollback();
            transacaoIniciada = false;

            return res.status(400).json({
                erro: `Serviço inválido: ${invalido}`
            });
        }

        const metragemPorServico = normalizarServicosDetalhados(
            servicosPedidos, d.servicosDetalhados, d.outroDescricao
        );
        const areaTotal = calcularAreaTotal(metragemPorServico);
        if (!(areaTotal > 0) || areaTotal >= 100000000) {
            throw new Error("Metragem total inválida.");
        }
        const servicosDetalhados = aplicarPrecosServicos(metragemPorServico, mapaPrecos);
        const valor = calcularValorServicos(servicosDetalhados);

        // ----------------------------------------------------
        // CLIENTE
        // ----------------------------------------------------

        const buscarCliente = () => conexao.query(
            `SELECT id, codigo
             FROM clientes
             WHERE documento = ?
             LIMIT 1
             FOR UPDATE`,
            [documento]
        );

        let clienteId;
        let clienteCodigo;
        let clienteNovo = false;

        let [existente] = await buscarCliente();

        if (existente.length === 0) {
            try {
                const [novo] = await conexao.query(
                    `INSERT INTO clientes
                        (codigo, tipo_cliente, nome, documento, email, telefone)
                     VALUES (?, 'PF', ?, ?, ?, ?)`,
                    [codigoTemporario(), nome, documento, email, telefone]
                );

                clienteId = novo.insertId;
                clienteNovo = true;

            } catch (erroInsert) {
                // Outro envio com o mesmo CPF foi gravado ao mesmo tempo:
                // reaproveita o cadastro dele em vez de dar erro.
                if (erroInsert.code !== "ER_DUP_ENTRY") {
                    throw erroInsert;
                }

                [existente] = await buscarCliente();

                if (existente.length === 0) {
                    throw erroInsert;
                }
            }
        }

        if (clienteNovo) {
            clienteCodigo = `CLI-${pad(clienteId, 4)}`;

            await conexao.query(
                "UPDATE clientes SET codigo = ? WHERE id = ?",
                [clienteCodigo, clienteId]
            );

            // Endereço cadastral: criado só uma vez, com o cliente.
            await conexao.query(
                `INSERT INTO enderecos
                    (cliente_id, cep, estado, cidade, bairro,
                     logradouro, numero, complemento)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    clienteId, cep, estado, cidade, bairro,
                    logradouro, numero, complemento
                ]
            );

        } else {
            clienteId = existente[0].id;
            clienteCodigo = existente[0].codigo;
        }

        // ----------------------------------------------------
        // ORÇAMENTO (sempre um registro novo)
        // ----------------------------------------------------

        const [orcamento] = await conexao.query(
            `INSERT INTO orcamentos
                (codigo, cliente_id, nome_informado, email_informado,
                 telefone_informado, area, prazo, observacoes,
                 valor, visita_tecnica)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigoTemporario(),
                clienteId,
                nome,
                email,
                telefone,
                areaTotal,
                d.prazo,
                observacoes,
                valor,
                visitaTecnica
            ]
        );

        const orcamentoId = orcamento.insertId;

        const codigo =
            `ORC-${new Date().getFullYear()}-${pad(orcamentoId, 4)}`;

        await conexao.query(
            "UPDATE orcamentos SET codigo = ? WHERE id = ?",
            [codigo, orcamentoId]
        );

        // ----------------------------------------------------
        // ENDEREÇO DO SERVIÇO
        // ----------------------------------------------------

        await conexao.query(
            `INSERT INTO enderecos_orcamento
                (orcamento_id, cep, estado, cidade, bairro,
                 logradouro, numero, complemento)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orcamentoId, cep, estado, cidade, bairro,
                logradouro, numero, complemento
            ]
        );

        // ----------------------------------------------------
        // SERVIÇOS DO ORÇAMENTO
        // ----------------------------------------------------

        for (const item of servicosDetalhados) {
            await conexao.query(
                `INSERT INTO orcamento_servicos
                    (orcamento_id, servico_id, area, valor, outro_descricao)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    orcamentoId,
                    mapaServicos[item.nome],
                    item.area,
                    item.valor,
                    item.nome === "Outro" ? item.outroDescricao : null
                ]
            );
        }

        await conexao.commit();
        transacaoIniciada = false;

        return res.status(201).json({
            mensagem: "Orçamento criado com sucesso.",
            codigo,
            clienteCodigo,
            area: areaTotal,
            valor,
            servicosDetalhados
        });

    } catch (erro) {
        if (conexao && transacaoIniciada) {
            try {
                await conexao.rollback();
            } catch (erroRollback) {
                console.error("Erro ao desfazer transação:", erroRollback);
            }
        }

        console.error("Erro ao salvar orçamento:", erro);

        return res.status(500).json({
            erro: "Erro ao salvar o orçamento. Tente novamente."
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});


// ============================================================
// GET /api/orcamentos/:codigo/detalhes (SOMENTE ADMIN LOGADO)
// Retorna o orçamento completo, dados do cliente, serviços e endereço da obra.
app.get(
    "/api/orcamentos/:codigo/detalhes",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        const codigo = String(req.params.codigo || "").trim();
        if (!codigo || codigo.length > 20) {
            return res.status(400).json({ erro: "Código de orçamento inválido." });
        }
        try {
            const [orcamentos] = await pool.query(`
                SELECT
                    o.id, o.codigo, o.area, o.prazo, o.valor, o.status,
                    o.progresso, o.observacoes, o.visita_tecnica AS visitaTecnica,
                    o.criado_em AS criadoEm, o.atualizado_em AS atualizadoEm,
                    o.nome_informado AS nomeInformado,
                    o.nome_fantasia_informado AS nomeFantasiaInformado,
                    o.responsavel_informado AS responsavelInformado,
                    o.email_informado AS emailInformado,
                    o.telefone_informado AS telefoneInformado,
                    c.codigo AS clienteCodigo, c.tipo_cliente AS tipoCliente,
                    c.nome AS clienteNome, c.nome_fantasia AS clienteNomeFantasia,
                    c.responsavel AS clienteResponsavel, c.documento AS clienteDocumento,
                    c.email AS clienteEmail, c.telefone AS clienteTelefone,
                    eo.cep, eo.estado, eo.cidade, eo.bairro, eo.logradouro,
                    eo.numero, eo.complemento
                FROM orcamentos o
                INNER JOIN clientes c ON c.id = o.cliente_id
                LEFT JOIN enderecos_orcamento eo ON eo.orcamento_id = o.id
                WHERE o.codigo = ?
                LIMIT 1
            `, [codigo]);

            if (orcamentos.length === 0) {
                return res.status(404).json({ erro: "Orçamento não encontrado." });
            }
            const orcamento = orcamentos[0];
            const [servicos] = await pool.query(`
                SELECT s.nome, os.outro_descricao, os.area, os.valor
                FROM orcamento_servicos os
                INNER JOIN servicos s ON s.id = os.servico_id
                WHERE os.orcamento_id = ?
                ORDER BY os.id
            `, [orcamento.id]);

            return res.json({
                ...orcamento,
                area: Number(orcamento.area),
                valor: Number(orcamento.valor),
                progresso: Number(orcamento.progresso),
                visitaTecnica: Boolean(orcamento.visitaTecnica),
                servicos: servicos.map(s => s.nome === "Outro" && s.outro_descricao
                    ? `Outro: ${s.outro_descricao}`
                    : s.nome),
                servicosDetalhados: servicos.map(s => ({
                    nome: s.nome === "Outro" && s.outro_descricao
                        ? `Outro: ${s.outro_descricao}`
                        : s.nome,
                    area: s.area === null ? null : Number(s.area),
                    valor: s.valor === null ? null : Number(s.valor)
                }))
            });
        } catch (erro) {
            console.error("Erro ao carregar detalhe do orçamento:", erro);
            return res.status(500).json({ erro: "Não foi possível carregar os dados do orçamento." });
        }
    }
);


// GET /api/orcamentos   (SOMENTE ADMIN LOGADO)
// Paginação opcional: ?pagina=1&limite=200 (limite máx. 500)
// ============================================================

app.get(
    "/api/orcamentos",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        try {
            const limite = Math.min(
                Math.max(parseInt(req.query.limite, 10) || 200, 1),
                500
            );
            const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
            const deslocamento = (pagina - 1) * limite;

            const [orcamentos] = await pool.query(
                `SELECT
                    o.id,
                    o.codigo,
                    o.area,
                    o.prazo,
                    o.valor,
                    o.status,
                    o.progresso,
                    o.observacoes,
                    o.visita_tecnica AS visitaTecnica,
                    o.criado_em AS criadoEm,
                    c.codigo AS clienteCodigo,
                    c.nome AS clienteNome,
                    c.tipo_cliente AS tipoCliente,
                    o.nome_informado AS nomeInformado,
                    o.email_informado AS emailInformado,
                    o.telefone_informado AS telefoneInformado,
                    e.cep,
                    e.estado,
                    e.cidade,
                    e.bairro,
                    e.logradouro,
                    e.numero,
                    e.complemento
                FROM orcamentos o
                JOIN clientes c ON c.id = o.cliente_id
                LEFT JOIN enderecos_orcamento e ON e.orcamento_id = o.id
                ORDER BY o.criado_em DESC, o.id DESC
                LIMIT ? OFFSET ?`,
                [limite, deslocamento]
            );

            const servicosPorOrcamento = {};

            if (orcamentos.length > 0) {
                const ids = orcamentos.map(o => o.id);

                const [servicos] = await pool.query(
                    `SELECT
                        os.orcamento_id,
                        s.nome,
                        os.outro_descricao,
                        os.area,
                        os.valor
                    FROM orcamento_servicos os
                    JOIN servicos s ON s.id = os.servico_id
                    WHERE os.orcamento_id IN (?)`,
                    [ids]
                );

                servicos.forEach(function (item) {
                    if (!servicosPorOrcamento[item.orcamento_id]) {
                        servicosPorOrcamento[item.orcamento_id] = [];
                    }

                    servicosPorOrcamento[item.orcamento_id].push({
                        nome: item.nome === "Outro" && item.outro_descricao
                            ? item.outro_descricao
                            : item.nome,
                        area: item.area === null ? null : Number(item.area),
                        valor: item.valor === null ? null : Number(item.valor)
                    });
                });
            }

            const resultado = orcamentos.map(function (o) {
                return {
                    ...o,
                    area: Number(o.area),
                    valor: Number(o.valor),
                    progresso: Number(o.progresso),
                    visitaTecnica: Boolean(o.visitaTecnica),
                    servicosDetalhados: servicosPorOrcamento[o.id] || [],
                    servicos: (servicosPorOrcamento[o.id] || []).map(item => item.nome)
                };
            });

            return res.json(resultado);

        } catch (erro) {
            console.error("Erro ao listar orçamentos:", erro);

            return res.status(500).json({
                erro: "Erro ao buscar os orçamentos."
            });
        }
    }
);


/* ============================================================
   PROJETOS - ÁREA ADMINISTRATIVA (SOMENTE ADMIN LOGADO)
   Usa a tabela projetos do banco sabino_gesso.
   Não exclui nem substitui orçamentos existentes.
   ATENÇÃO: estas rotas precisam ficar ANTES do tratamento de
   erros/404 abaixo, senão nunca são alcançadas.
============================================================ */

// GET /api/projetos
// A aba Projetos é somente uma visualização dos orçamentos concluídos.
// Não cria nem depende de registros na tabela projetos.
app.get(
    "/api/projetos",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        try {
            const [orcamentos] = await pool.query(`
                SELECT
                    o.id,
                    o.id AS orcamentoId,
                    o.codigo AS orcamentoCodigo,
                    'Concluído' AS projetoStatus,
                    o.progresso,
                    o.criado_em AS criadoEm,
                    DATE(o.atualizado_em) AS dataConclusao,
                    o.area,
                    o.prazo,
                    o.valor,
                    o.observacoes,
                    c.codigo AS clienteCodigo,
                    c.nome AS clienteNome,
                    c.email AS clienteEmail,
                    c.telefone AS clienteTelefone
                FROM orcamentos o
                INNER JOIN clientes c ON c.id = o.cliente_id
                WHERE o.status = 'Concluído'
                ORDER BY o.atualizado_em DESC, o.id DESC
            `);

            const ids = orcamentos.map(item => item.orcamentoId);
            const servicosPorOrcamento = {};

            if (ids.length > 0) {
                const [servicos] = await pool.query(`
                    SELECT os.orcamento_id, s.nome, os.outro_descricao, os.area, os.valor
                    FROM orcamento_servicos os
                    INNER JOIN servicos s ON s.id = os.servico_id
                    WHERE os.orcamento_id IN (?)
                `, [ids]);

                for (const item of servicos) {
                    if (!servicosPorOrcamento[item.orcamento_id]) {
                        servicosPorOrcamento[item.orcamento_id] = [];
                    }
                    servicosPorOrcamento[item.orcamento_id].push({
                        nome: item.nome === "Outro" && item.outro_descricao
                            ? `Outro: ${item.outro_descricao}`
                            : item.nome,
                        area: item.area === null ? null : Number(item.area),
                        valor: item.valor === null ? null : Number(item.valor)
                    });
                }
            }

            return res.json(orcamentos.map(item => ({
                ...item,
                progresso: 100,
                area: Number(item.area),
                valor: Number(item.valor),
                servicosDetalhados: servicosPorOrcamento[item.orcamentoId] || [],
                servicos: (servicosPorOrcamento[item.orcamentoId] || []).map(s => s.nome)
            })));
        } catch (erro) {
            console.error("Erro ao listar orçamentos concluídos:", erro);
            return res.status(500).json({
                erro: "Não foi possível carregar os orçamentos concluídos."
            });
        }
    }
);

/* ============================================================
   CLIENTES - ÁREA ADMINISTRATIVA
   GET /api/clientes
   Somente administrador autenticado.
============================================================ */

app.get(
    "/api/clientes",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        try {
            const [clientes] = await pool.query(`
                SELECT
                    c.id,
                    c.codigo,
                    c.tipo_cliente AS tipoCliente,
                    c.nome,
                    c.documento,
                    c.email,
                    c.telefone,
                    c.nome_fantasia AS nomeFantasia,
                    c.responsavel,
                    c.criado_em AS criadoEm,

                    COUNT(DISTINCT o.id) AS quantidadeOrcamentos,
                    COUNT(DISTINCT p.id) AS quantidadeProjetos,

                    (
                        SELECT GROUP_CONCAT(
                            ultimos.nomeServico
                            ORDER BY ultimos.criadoEm DESC
                            SEPARATOR ', '
                        )
                        FROM (
                            SELECT
                                o2.criado_em AS criadoEm,
                                CASE
                                    WHEN s.nome = 'Outro'
                                         AND os.outro_descricao IS NOT NULL
                                    THEN CONCAT(
                                        'Outro: ',
                                        os.outro_descricao
                                    )
                                    ELSE s.nome
                                END AS nomeServico
                            FROM orcamentos o2
                            INNER JOIN orcamento_servicos os
                                ON os.orcamento_id = o2.id
                            INNER JOIN servicos s
                                ON s.id = os.servico_id
                            WHERE o2.cliente_id = c.id
                            ORDER BY o2.criado_em DESC, o2.id DESC
                            LIMIT 2
                        ) AS ultimos
                    ) AS projetosRecentes

                FROM clientes c

                LEFT JOIN orcamentos o
                    ON o.cliente_id = c.id

                LEFT JOIN projetos p
                    ON p.orcamento_id = o.id

                GROUP BY
                    c.id,
                    c.codigo,
                    c.tipo_cliente,
                    c.nome,
                    c.documento,
                    c.email,
                    c.telefone,
                    c.nome_fantasia,
                    c.responsavel,
                    c.criado_em

                ORDER BY c.criado_em DESC, c.id DESC
            `);

            const resultado = clientes.map(cliente => ({
                ...cliente,
                quantidadeOrcamentos:
                    Number(cliente.quantidadeOrcamentos),
                quantidadeProjetos:
                    Number(cliente.quantidadeProjetos)
            }));

            return res.json(resultado);

        } catch (erro) {
            console.error("Erro ao listar clientes:", erro);

            return res.status(500).json({
                erro: "Não foi possível carregar os clientes."
            });
        }
    }
);

// ============================================================
// GET /api/clientes/:codigo/detalhes (SOMENTE ADMIN LOGADO)
// Devolve o cadastro do cliente e todo o histórico de orçamentos.
// ============================================================
app.get(
    "/api/clientes/:codigo/detalhes",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        const codigo = String(req.params.codigo || "").trim();
        if (!codigo || codigo.length > 20) {
            return res.status(400).json({ erro: "Código de cliente inválido." });
        }

        try {
            const [clientes] = await pool.query(`
                SELECT
                    c.id, c.codigo, c.tipo_cliente AS tipoCliente, c.nome,
                    c.nome_fantasia AS nomeFantasia, c.responsavel, c.documento,
                    c.email, c.telefone, c.criado_em AS criadoEm,
                    e.cep, e.estado, e.cidade, e.bairro, e.logradouro,
                    e.numero, e.complemento
                FROM clientes c
                LEFT JOIN enderecos e
                    ON e.id = (SELECT MAX(e2.id) FROM enderecos e2 WHERE e2.cliente_id = c.id)
                WHERE c.codigo = ?
                LIMIT 1
            `, [codigo]);

            if (clientes.length === 0) {
                return res.status(404).json({ erro: "Cliente não encontrado." });
            }
            const cliente = clientes[0];

            const [orcamentos] = await pool.query(`
                SELECT
                    o.id, o.codigo, o.area, o.prazo, o.valor, o.status,
                    o.progresso, o.observacoes, o.visita_tecnica AS visitaTecnica,
                    o.criado_em AS criadoEm, o.atualizado_em AS atualizadoEm,
                    o.nome_informado AS nomeInformado,
                    o.nome_fantasia_informado AS nomeFantasiaInformado,
                    o.responsavel_informado AS responsavelInformado,
                    o.email_informado AS emailInformado,
                    o.telefone_informado AS telefoneInformado,
                    eo.cep AS cepServico, eo.estado AS estadoServico,
                    eo.cidade AS cidadeServico, eo.bairro AS bairroServico,
                    eo.logradouro AS logradouroServico, eo.numero AS numeroServico,
                    eo.complemento AS complementoServico
                FROM orcamentos o
                LEFT JOIN enderecos_orcamento eo ON eo.orcamento_id = o.id
                WHERE o.cliente_id = ?
                ORDER BY o.criado_em DESC, o.id DESC
            `, [cliente.id]);

            let servicosPorOrcamento = {};
            if (orcamentos.length > 0) {
                const ids = orcamentos.map(o => o.id);
                const [servicos] = await pool.query(`
                    SELECT os.orcamento_id, s.nome, os.outro_descricao, os.area, os.valor
                    FROM orcamento_servicos os
                    INNER JOIN servicos s ON s.id = os.servico_id
                    WHERE os.orcamento_id IN (?)
                    ORDER BY os.id
                `, [ids]);
                for (const servico of servicos) {
                    if (!servicosPorOrcamento[servico.orcamento_id]) {
                        servicosPorOrcamento[servico.orcamento_id] = [];
                    }
                    servicosPorOrcamento[servico.orcamento_id].push({
                        nome: servico.nome === "Outro" && servico.outro_descricao
                            ? `Outro: ${servico.outro_descricao}`
                            : servico.nome,
                        area: servico.area === null ? null : Number(servico.area),
                        valor: servico.valor === null ? null : Number(servico.valor)
                    });
                }
            }

            return res.json({
                cliente,
                orcamentos: orcamentos.map(o => ({
                    ...o,
                    area: Number(o.area),
                    valor: Number(o.valor),
                    progresso: Number(o.progresso),
                    visitaTecnica: Boolean(o.visitaTecnica),
                    servicosDetalhados: servicosPorOrcamento[o.id] || [],
                    servicos: (servicosPorOrcamento[o.id] || []).map(s => s.nome)
                }))
            });
        } catch (erro) {
            console.error("Erro ao carregar detalhes do cliente:", erro);
            return res.status(500).json({ erro: "Não foi possível carregar os dados do cliente." });
        }
    }
);


// ============================================================
// DELETE /api/clientes/:id
// Exclui um cliente sem orçamentos vinculados.
// Somente administrador autenticado.
// ============================================================

app.delete(
    "/api/clientes/:id",
    limiteAdmin,
    exigirAdmin,
    async function (req, res) {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                erro: "ID de cliente inválido."
            });
        }

        let conexao;
        let transacaoIniciada = false;

        try {
            conexao = await pool.getConnection();

            await conexao.beginTransaction();
            transacaoIniciada = true;

            // Confere se o cliente existe e bloqueia sua linha.
            const [clientes] = await conexao.query(
                `SELECT id, codigo, nome
                 FROM clientes
                 WHERE id = ?
                 FOR UPDATE`,
                [id]
            );

            if (clientes.length === 0) {
                await conexao.rollback();
                transacaoIniciada = false;

                return res.status(404).json({
                    erro: "Cliente não encontrado."
                });
            }

            // Não permite apagar clientes com orçamentos.
            // Isso preserva orçamentos e projetos relacionados.
            const [orcamentos] = await conexao.query(
                `SELECT id
                 FROM orcamentos
                 WHERE cliente_id = ?
                 LIMIT 1`,
                [id]
            );

            if (orcamentos.length > 0) {
                await conexao.rollback();
                transacaoIniciada = false;

                return res.status(409).json({
                    erro:
                        "Este cliente possui orçamentos vinculados " +
                        "e não pode ser excluído. Preserve o histórico " +
                        "ou remova os vínculos por um procedimento específico."
                });
            }

            // Exclui os endereços cadastrais associados.
            await conexao.query(
                `DELETE FROM enderecos
                 WHERE cliente_id = ?`,
                [id]
            );

            // Exclui o cadastro do cliente.
            const [resultado] = await conexao.query(
                `DELETE FROM clientes
                 WHERE id = ?`,
                [id]
            );

            if (resultado.affectedRows !== 1) {
                await conexao.rollback();
                transacaoIniciada = false;

                return res.status(409).json({
                    erro: "Não foi possível confirmar a exclusão."
                });
            }

            await conexao.commit();
            transacaoIniciada = false;

            return res.json({
                mensagem: "Cliente excluído com sucesso.",
                id,
                codigo: clientes[0].codigo
            });

        } catch (erro) {
            if (conexao && transacaoIniciada) {
                try {
                    await conexao.rollback();
                } catch (erroRollback) {
                    console.error(
                        "Erro ao desfazer exclusão do cliente:",
                        erroRollback
                    );
                }
            }

            console.error("Erro ao excluir cliente:", erro);

            return res.status(500).json({
                erro: "Não foi possível excluir o cliente."
            });

        } finally {
            if (conexao) {
                conexao.release();
            }
        }
    }
);


// Projetos não possuem criação/edição separada: a aba é uma listagem
// dos orçamentos cujo status é Concluído.


// ============================================================
// GET /api/servicos   (PÚBLICA - usada pelos formulários)
// Devolve os serviços ativos e o preço do m² de cada um.
// precoM2 = null significa "sob consulta".
// ============================================================

app.get("/api/servicos", limiteGet, async function (req, res) {
    try {
        const [linhas] = await pool.query(
            `SELECT nome, preco_m2
             FROM servicos
             WHERE ativo = TRUE
             ORDER BY id`
        );

        return res.json(
            linhas.map(function (s) {
                return {
                    nome: s.nome,
                    precoM2: s.preco_m2 === null ? null : Number(s.preco_m2)
                };
            })
        );

    } catch (erro) {
        console.error("Erro ao listar serviços:", erro);

        return res.status(500).json({
            erro: "Não foi possível carregar os serviços."
        });
    }
});


// ============================================================
// PATCH /api/orcamentos/:id/status (SOMENTE ADMIN LOGADO)
// Concluído permanece como status do orçamento; a aba Projetos filtra por ele.
const STATUS_PAINEL = ["Aguardando", "Aprovado", "Concluído", "Cancelado"];

app.patch(
    "/api/orcamentos/:id/status",
    limiteAdmin,
    exigirAdmin,
    async function (req, res) {
        const id = Number(req.params.id);
        const status = String((req.body || {}).status ?? "").trim();

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ erro: "ID de orçamento inválido." });
        }
        if (!STATUS_PAINEL.includes(status)) {
            return res.status(400).json({
                erro: "Status inválido. Use: Aguardando, Aprovado, Concluído ou Cancelado."
            });
        }

        try {
            const [resultado] = await pool.query(
                "UPDATE orcamentos SET status = ? WHERE id = ?",
                [status, id]
            );
            if (resultado.affectedRows === 0) {
                const [existentes] = await pool.query(
                    "SELECT id FROM orcamentos WHERE id = ?",
                    [id]
                );
                if (existentes.length === 0) {
                    return res.status(404).json({ erro: "Orçamento não encontrado." });
                }
            }
            return res.json({ mensagem: "Status atualizado com sucesso.", id, status });
        } catch (erro) {
            console.error("Erro ao atualizar status do orçamento:", erro);
            return res.status(500).json({ erro: "Não foi possível atualizar o status." });
        }
    }
);


// ============================================================
// GET /api/relatorios (SOMENTE ADMIN LOGADO)
// Filtros: ?de=AAAA-MM-DD&ate=AAAA-MM-DD&status=...
// Valores são estimativas cadastradas, não recebimentos financeiros.
// ============================================================
app.get(
    "/api/relatorios",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        const permitidoStatus = [
            "Aguardando", "Em análise", "Aprovado", "Recusado", "Cancelado", "Concluído"
        ];
        const hoje = new Date();
        const fimPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
        const paraISO = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
        const de = String(req.query.de || paraISO(inicioPadrao));
        const ate = String(req.query.ate || paraISO(fimPadrao));
        const status = String(req.query.status || "").trim();
        const dataValida = valor => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
            const data = new Date(`${valor}T00:00:00.000Z`);
            return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
        };

        if (!dataValida(de) || !dataValida(ate) || de > ate) {
            return res.status(400).json({ erro: "Informe um intervalo de datas válido." });
        }
        const dataInicio = new Date(`${de}T00:00:00.000Z`);
        const dataFim = new Date(`${ate}T00:00:00.000Z`);
        const mesesAbrangidos = (dataFim.getUTCFullYear() - dataInicio.getUTCFullYear()) * 12
            + dataFim.getUTCMonth() - dataInicio.getUTCMonth();
        if (mesesAbrangidos > 35) {
            return res.status(400).json({ erro: "O período máximo do relatório é de 36 meses." });
        }
        if (status && !permitidoStatus.includes(status)) {
            return res.status(400).json({ erro: "Status de filtro inválido." });
        }

        const filtroStatus = status ? " AND o.status = ?" : "";
        const parametrosOrcamento = status ? [de, ate, status] : [de, ate];
        const whereDataStatus = `o.criado_em >= ? AND o.criado_em < DATE_ADD(?, INTERVAL 1 DAY)${filtroStatus}`;

        try {
            const [[resumoBase]] = await pool.query(`
                SELECT COUNT(*) AS quantidadeOrcamentos,
                       COALESCE(SUM(o.valor), 0) AS valorEstimadoTotal,
                       COALESCE(AVG(o.valor), 0) AS valorMedio
                  FROM orcamentos o
                 WHERE ${whereDataStatus}
            `, parametrosOrcamento);

            const [[novosBase]] = await pool.query(`
                SELECT COUNT(*) AS novosClientes
                  FROM clientes c
                 WHERE c.criado_em >= ?
                   AND c.criado_em < DATE_ADD(?, INTERVAL 1 DAY)
            `, [de, ate]);

            const [[recorrentesBase]] = await pool.query(`
                SELECT COUNT(*) AS clientesRecorrentes
                  FROM (
                        SELECT o.cliente_id
                          FROM orcamentos o
                         WHERE ${whereDataStatus}
                         GROUP BY o.cliente_id
                        HAVING COUNT(*) > 1
                  ) recorrentes
            `, parametrosOrcamento);

            // A distribuição sempre mostra todos os status no intervalo,
            // mesmo quando um status específico filtra os demais relatórios.
            const [statusRows] = await pool.query(`
                SELECT o.status, COUNT(*) AS quantidade
                  FROM orcamentos o
                 WHERE o.criado_em >= ?
                   AND o.criado_em < DATE_ADD(?, INTERVAL 1 DAY)
                 GROUP BY o.status
            `, [de, ate]);

            const [mesRows] = await pool.query(`
                SELECT DATE_FORMAT(o.criado_em, '%Y-%m') AS mes,
                       COUNT(*) AS quantidade,
                       COALESCE(SUM(o.valor), 0) AS valorEstimado
                  FROM orcamentos o
                 WHERE ${whereDataStatus}
                 GROUP BY DATE_FORMAT(o.criado_em, '%Y-%m')
                 ORDER BY mes
            `, parametrosOrcamento);

            const [servicoRows] = await pool.query(`
                SELECT CASE
                           WHEN s.nome = 'Outro' AND os.outro_descricao IS NOT NULL
                           THEN CONCAT('Outro: ', os.outro_descricao)
                           ELSE s.nome
                       END AS nome,
                       COUNT(*) AS quantidade,
                       SUM(os.area) AS areaTotal,
                       SUM(os.valor) AS valorTotal
                  FROM orcamento_servicos os
                  JOIN orcamentos o ON o.id = os.orcamento_id
                  JOIN servicos s ON s.id = os.servico_id
                 WHERE ${whereDataStatus}
                 GROUP BY nome
                 ORDER BY quantidade DESC, nome ASC
            `, parametrosOrcamento);

            const mapaMes = new Map(mesRows.map(item => [item.mes, item]));
            const meses = [];
            const cursor = new Date(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth(), 1);
            const ultimoMes = new Date(dataFim.getUTCFullYear(), dataFim.getUTCMonth(), 1);
            while (cursor <= ultimoMes) {
                const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
                const linha = mapaMes.get(chave) || {};
                meses.push({
                    mes: chave,
                    rotulo: new Date(cursor.getFullYear(), cursor.getMonth(), 1)
                        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
                    quantidade: Number(linha.quantidade || 0),
                    valorEstimado: Number(linha.valorEstimado || 0)
                });
                cursor.setMonth(cursor.getMonth() + 1);
            }

            const melhoresMeses = [...meses]
                .filter(item => item.quantidade > 0)
                .sort((a, b) => b.valorEstimado - a.valorEstimado || b.quantidade - a.quantidade)
                .slice(0, 3);

            return res.json({
                periodo: { de, ate, status: status || "Todos" },
                resumo: {
                    quantidadeOrcamentos: Number(resumoBase.quantidadeOrcamentos),
                    valorEstimadoTotal: Number(resumoBase.valorEstimadoTotal),
                    valorMedio: Number(resumoBase.valorMedio),
                    novosClientes: Number(novosBase.novosClientes),
                    clientesRecorrentes: Number(recorrentesBase.clientesRecorrentes)
                },
                status: statusRows.map(item => ({
                    status: item.status,
                    quantidade: Number(item.quantidade)
                })),
                meses,
                servicos: servicoRows.map(item => ({
                    nome: item.nome,
                    quantidade: Number(item.quantidade),
                    areaTotal: item.areaTotal === null ? null : Number(item.areaTotal),
                    valorTotal: item.valorTotal === null ? null : Number(item.valorTotal)
                })),
                melhoresMeses
            });
        } catch (erro) {
            console.error("Erro ao gerar relatórios:", erro);
            return res.status(500).json({ erro: "Não foi possível carregar os relatórios." });
        }
    }
);


// ============================================================
// GET /api/painel   (SOMENTE ADMIN LOGADO)
// Dados da Visão Geral: totais do mês e lista de clientes.
// ============================================================

app.get(
    "/api/painel",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        try {
            const [[totais]] = await pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM orcamentos)
                        AS totalOrcamentos,

                    (SELECT COUNT(*) FROM clientes
                      WHERE criado_em >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))
                        AS novosClientes,

                    (SELECT COALESCE(SUM(valor), 0) FROM orcamentos
                      WHERE status IN ('Aprovado', 'Concluído')
                        AND criado_em >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))
                        AS receitaMensal
            `);

            // Status do cliente = status do orçamento mais recente dele
            const [clientes] = await pool.query(`
                SELECT
                    c.codigo,
                    c.tipo_cliente AS tipo,
                    c.nome,
                    c.email,
                    c.telefone,
                    o.id AS orcamentoId,
                    o.codigo AS orcamentoCodigo,
                    o.status
                FROM clientes c
                LEFT JOIN orcamentos o
                    ON o.id = (
                        SELECT o2.id
                          FROM orcamentos o2
                         WHERE o2.cliente_id = c.id
                         ORDER BY o2.criado_em DESC, o2.id DESC
                         LIMIT 1
                    )
                ORDER BY c.criado_em DESC, c.id DESC
                LIMIT 50
            `);

            return res.json({
                totalOrcamentos: Number(totais.totalOrcamentos),
                novosClientes: Number(totais.novosClientes),
                receitaMensal: Number(totais.receitaMensal),
                clientes
            });

        } catch (erro) {
            console.error("Erro ao carregar o painel:", erro);

            return res.status(500).json({
                erro: "Não foi possível carregar os dados do painel."
            });
        }
    }
);


// ============================================================
// CONFIGURAÇÕES DO ADMINISTRADOR (SOMENTE ADMIN AUTENTICADO)
// Não exige migração: usa administradores.nome, email e senha_hash existentes.
// ============================================================

app.get(
    "/api/configuracoes",
    limiteGet,
    exigirAdmin,
    async function (req, res) {
        try {
            const [admins] = await pool.query(
                "SELECT id, nome, email FROM administradores WHERE id = ? AND ativo = TRUE LIMIT 1",
                [req.adminId]
            );
            if (admins.length === 0) {
                return res.status(404).json({ erro: "Administrador não encontrado." });
            }
            return res.json(admins[0]);
        } catch (erro) {
            console.error("Erro ao carregar configurações:", erro);
            return res.status(500).json({ erro: "Não foi possível carregar as configurações." });
        }
    }
);

app.put(
    "/api/configuracoes/perfil",
    limiteAdmin,
    exigirAdmin,
    async function (req, res) {
        const nome = String((req.body || {}).nome ?? "").trim();
        const email = String((req.body || {}).email ?? "").trim().toLowerCase();
        if (!nome || nome.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
            return res.status(400).json({ erro: "Informe um nome e e-mail válidos." });
        }
        try {
            await pool.query(
                "UPDATE administradores SET nome = ?, email = ? WHERE id = ? AND ativo = TRUE",
                [nome, email, req.adminId]
            );
            return res.json({ mensagem: "Perfil atualizado com sucesso.", nome, email });
        } catch (erro) {
            if (erro.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ erro: "Este e-mail já está em uso por outro administrador." });
            }
            console.error("Erro ao atualizar perfil do administrador:", erro);
            return res.status(500).json({ erro: "Não foi possível atualizar o perfil." });
        }
    }
);

app.post(
    "/api/configuracoes/administradores",
    limiteAdmin,
    exigirAdmin,
    async function (req, res) {
        const nome = String((req.body || {}).nome ?? "").trim();
        const email = String((req.body || {}).email ?? "").trim().toLowerCase();
        const senha = String((req.body || {}).senha ?? "");
        if (!nome || nome.length > 150) {
            return res.status(400).json({ erro: "Nome inválido (máximo 150 caracteres)." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
            return res.status(400).json({ erro: "E-mail inválido." });
        }
        if (senha.length < 12 || senha.length > 200) {
            return res.status(400).json({ erro: "A senha inicial deve ter entre 12 e 200 caracteres." });
        }
        try {
            const hash = await bcrypt.hash(senha, 12);
            const [resultado] = await pool.query(
                "INSERT INTO administradores (nome, email, senha_hash) VALUES (?, ?, ?)",
                [nome, email, hash]
            );
            return res.status(201).json({
                mensagem: "Administrador criado com sucesso.",
                id: resultado.insertId,
                nome,
                email
            });
        } catch (erro) {
            if (erro.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ erro: "Já existe um administrador com esse e-mail." });
            }
            console.error("Erro ao criar administrador:", erro);
            return res.status(500).json({ erro: "Não foi possível criar o administrador." });
        }
    }
);

app.put(
    "/api/configuracoes/senha",
    limiteAdmin,
    exigirAdmin,
    async function (req, res) {
        const senhaAtual = String((req.body || {}).senhaAtual ?? "");
        const novaSenha = String((req.body || {}).novaSenha ?? "");
        if (!senhaAtual || novaSenha.length < 12 || novaSenha.length > 200) {
            return res.status(400).json({ erro: "Informe a senha atual e uma nova senha de 12 a 200 caracteres." });
        }
        if (senhaAtual === novaSenha) {
            return res.status(400).json({ erro: "A nova senha deve ser diferente da senha atual." });
        }
        try {
            const [admins] = await pool.query(
                "SELECT senha_hash FROM administradores WHERE id = ? AND ativo = TRUE LIMIT 1",
                [req.adminId]
            );
            if (admins.length === 0) {
                return res.status(404).json({ erro: "Administrador não encontrado." });
            }
            const confere = await bcrypt.compare(senhaAtual, admins[0].senha_hash);
            if (!confere) {
                return res.status(400).json({ erro: "A senha atual está incorreta." });
            }
            const hash = await bcrypt.hash(novaSenha, 12);
            await pool.query(
                "UPDATE administradores SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?",
                [hash, req.adminId]
            );
            return res.json({ mensagem: "Senha alterada com sucesso." });
        } catch (erro) {
            console.error("Erro ao alterar senha do administrador:", erro);
            return res.status(500).json({ erro: "Não foi possível alterar a senha." });
        }
    }
);


// ============================================================
// TRATAMENTO DE ERROS (sempre responde em JSON)
// Precisa ficar DEPOIS de todas as rotas.
// ============================================================

app.use(function (req, res) {
    res.status(404).json({ erro: "Rota não encontrada." });
});

app.use(function (erro, req, res, next) {
    if (erro.type === "entity.parse.failed") {
        return res.status(400).json({ erro: "JSON inválido." });
    }

    if (erro.type === "entity.too.large") {
        return res.status(413).json({ erro: "Requisição muito grande." });
    }

    if (erro.status === 403) {
        return res.status(403).json({ erro: erro.message });
    }

    console.error("Erro não tratado:", erro);

    return res.status(500).json({ erro: "Erro interno do servidor." });
});


// ============================================================
// INICIAR SERVIDOR
// ============================================================

const PORTA = process.env.PORT || 3000;

app.listen(PORTA, async function () {
    console.log(`Servidor rodando em http://localhost:${PORTA}`);

    try {
        await pool.query("SELECT 1");
        console.log("Conectado ao MySQL com sucesso.");
    } catch (erro) {
        console.error(
            "NÃO foi possível conectar ao MySQL:",
            erro.code,
            "-",
            erro.message
        );
    }
});