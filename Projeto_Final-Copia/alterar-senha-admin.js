require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Email do administrador: ", (emailDigitado) => {
  rl.stdoutMuted = true;
  rl.question("Nova senha: ", async (senha) => {
    rl.close();

    let db;

    try {
      const email = emailDigitado.trim().toLowerCase();

      if (!senha || senha.length < 12) {
        throw new Error("Use uma senha com pelo menos 12 caracteres.");
      }

      db = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });

      const [admins] = await db.execute(
        "SELECT id FROM administradores WHERE email = ?",
        [email]
      );

      if (!admins.length) {
        throw new Error("Administrador não encontrado.");
      }

      const hash = await bcrypt.hash(senha, 12);

      await db.execute(
        `UPDATE administradores
         SET senha_hash = ?, tentativas_falhas = 0,
             bloqueado_ate = NULL
         WHERE email = ?`,
        [hash, email]
      );

      console.log("Senha alterada com sucesso!");
    } catch (erro) {
      console.error("Erro:", erro.message);
      process.exitCode = 1;
    } finally {
      if (db) await db.end();
    }
  });
});
