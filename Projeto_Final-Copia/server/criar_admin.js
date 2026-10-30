// ============================================================
// CRIAR / TROCAR SENHA DE ADMINISTRADOR  (rode no terminal)
//
//   node criar_admin.js            -> cria um administrador
//   node criar_admin.js --trocar   -> troca a senha de um existente
//
// Fica na mesma pasta do server.js (usa o mesmo .env).
// A senha é digitada no terminal e não aparece na tela.
// ============================================================

try { require("dotenv").config(); } catch (e) { }

const readline = require("readline");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const TROCAR = process.argv.includes("--trocar");

function perguntar(texto, oculto = false) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });

        if (oculto) {
            rl._writeToOutput = function (s) {
                if (s.includes(texto)) rl.output.write(s);
            };
        }

        rl.question(texto, resposta => {
            rl.close();
            if (oculto) process.stdout.write("\n");
            resolve(resposta);
        });
    });
}

(async function () {
    if (!process.env.DB_PASSWORD) {
        console.error("ERRO: defina DB_PASSWORD no .env.");
        process.exit(1);
    }

    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 3307,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || "sabino_gesso",
        charset: "utf8mb4"
    });

    try {
        const nome = TROCAR ? null : (await perguntar("Nome: ")).trim();
        const email = (await perguntar("E-mail: ")).trim().toLowerCase();

        if (!TROCAR && (!nome || nome.length > 150)) {
            throw new Error("Nome inválido.");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
            throw new Error("E-mail inválido.");
        }

        const senha = await perguntar("Senha (mín. 8 caracteres): ", true);
        const confirma = await perguntar("Repita a senha: ", true);

        if (senha.length < 8) throw new Error("A senha precisa ter 8+ caracteres.");
        if (senha !== confirma) throw new Error("As senhas não conferem.");

        const hash = await bcrypt.hash(senha, 12);

        if (TROCAR) {
            const [r] = await conexao.query(
                `UPDATE administradores
                    SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL
                  WHERE email = ?`,
                [hash, email]
            );

            if (r.affectedRows === 0) throw new Error("Administrador não encontrado.");

            console.log("Senha trocada com sucesso.");
        } else {
            await conexao.query(
                `INSERT INTO administradores (nome, email, senha_hash)
                 VALUES (?, ?, ?)`,
                [nome, email, hash]
            );

            console.log("Administrador criado com sucesso.");
        }

    } catch (erro) {
        if (erro.code === "ER_DUP_ENTRY") {
            console.error("ERRO: já existe um administrador com esse e-mail.");
        } else if (erro.code === "ER_NO_SUCH_TABLE") {
            console.error("ERRO: rode primeiro o banco_admin.sql.");
        } else {
            console.error("ERRO:", erro.message);
        }
        process.exitCode = 1;
    } finally {
        await conexao.end();
    }
})();
