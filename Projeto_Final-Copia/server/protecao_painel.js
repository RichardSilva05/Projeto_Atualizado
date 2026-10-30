// =========================================================
// PROTEÇÃO DO PAINEL - coloque no <head> do painel.html:
//   <script src="../js/protecao_painel.js"></script>
//
// Isto só evita que alguém sem login VEJA a tela. Quem protege
// os dados de verdade é o servidor (as rotas exigem o token).
// =========================================================

(function () {

    if (!sessionStorage.getItem("tokenAdmin")) {
        window.location.replace("login.html");
    }

})();


// Para o botão "Sair" do painel, chame sairDoPainel()
function sairDoPainel() {

    sessionStorage.removeItem("tokenAdmin");
    window.location.replace("login.html");

}


// Use esta função nas chamadas à API do painel:
//   const r = await fetchAdmin(`${API_URL}/api/orcamentos`);
async function fetchAdmin(url, opcoes = {}) {

    const resposta = await fetch(url, {
        ...opcoes,
        headers: {
            ...(opcoes.headers || {}),
            Authorization:
                "Bearer " + sessionStorage.getItem("tokenAdmin")
        }
    });

    // Token vencido ou inválido: volta ao login
    if (resposta.status === 401) {
        sairDoPainel();
    }

    return resposta;

}
