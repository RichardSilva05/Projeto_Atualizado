// ============================================================
// PATCH DO server.js - LOGIN DE ADMIN COM BANCO (substitui o
// patch_admin_login.js anterior, que usava e-mail fixo no .env)
//
// 1) Instale:   npm install jsonwebtoken bcryptjs
//
// 2) Acrescente no .env:
//      JWT_SECRET=uma_frase_longa_e_aleatoria_com_40_caracteres_ou_mais
//    (ADMIN_EMAIL e ADMIN_PASSWORD_HASH NÃO são mais necessários)
//
// 3) No server.js:
//    a) cole os "require" e o bloco abaixo DEPOIS de "const pool = ..."
//       (precisa do pool e do rateLimit já declarados)
//    b) na rota GET /api/orcamentos troque  exigirToken  por  exigirAdmin
//    c) nas rotas /api/projetos (GET, POST, PATCH) acrescente exigirAdmin:
//         app.get("/api/projetos", exigirAdmin, async function ...
//    d) mova o bloco PROJETOS para ANTES do handler de 404
// ============================================================

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("ERRO: defina JWT_SECRET (mínimo 32 caracteres).");
    process.exit(1);
}

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;

// Hash falso: se o e-mail não existir, ainda assim gastamos o mesmo
// tempo comparando, para não revelar quais e-mails são cadastrados.
const HASH_FALSO = bcrypt.hashSync("senha-falsa-para-igualar-tempo", 12);

// Limite por IP (além do bloqueio por conta, abaixo)
const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Tente novamente em alguns minutos." }
});

// POST /api/admin/login  { email, senha }  ->  { token, nome }
app.post("/api/admin/login", limiteLogin, async function (req, res) {
    const email = String((req.body || {}).email ?? "").trim().toLowerCase();
    const senha = String((req.body || {}).senha ?? "");

    const ERRO_GENERICO = { erro: "E-mail ou senha inválidos." };

    if (!email || !senha || email.length > 150 || senha.length > 200) {
        return res.status(401).json(ERRO_GENERICO);
    }

    try {
        const [linhas] = await pool.query(
            `SELECT id, nome, senha_hash, ativo, tentativas_falhas,
                    bloqueado_ate, bloqueado_ate > NOW() AS bloqueado
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

        if (!admin || !admin.ativo || !senhaOk) {
            if (admin) {
                const falhas = admin.tentativas_falhas + 1;

                if (falhas >= MAX_TENTATIVAS) {
                    await pool.query(
                        `UPDATE administradores
                         SET tentativas_falhas = 0,
                             bloqueado_ate = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                         WHERE id = ?`,
                        [MINUTOS_BLOQUEIO, admin.id]
                    );
                } else {
                    await pool.query(
                        "UPDATE administradores SET tentativas_falhas = ? WHERE id = ?",
                        [falhas, admin.id]
                    );
                }
            }

            return res.status(401).json(ERRO_GENERICO);
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

// Middleware: exige o token do login e confere se a conta segue ativa
async function exigirAdmin(req, res, next) {
    const cab = req.headers.authorization || "";
    const token = cab.startsWith("Bearer ") ? cab.slice(7) : "";

    try {
        const dados = jwt.verify(token, process.env.JWT_SECRET);

        if (dados.papel !== "admin" || !Number.isInteger(dados.sub)) {
            throw new Error("token inválido");
        }

        const [linhas] = await pool.query(
            "SELECT id FROM administradores WHERE id = ? AND ativo = TRUE",
            [dados.sub]
        );

        if (linhas.length === 0) throw new Error("conta inativa");

        req.adminId = dados.sub;
        next();

    } catch (e) {
        return res.status(401).json({ erro: "Não autorizado." });
    }
}


const dados = await resposta.json();

if (!resposta.ok) {
    throw new Error(dados.erro || "Falha no login.");
}

localStorage.setItem("token", dados.token);

window.location.href = "painel.html";
