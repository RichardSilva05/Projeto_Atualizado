// =========================================================
// SAIR / PROTEÇÃO DAS PÁGINAS DO PAINEL
// Carregado no <head> de cada página do painel.
// =========================================================

// Sem login: volta para a tela de login antes de mostrar a página.
// (Isto só esconde a tela; quem protege os dados é o servidor.)
(function () {

    if (!sessionStorage.getItem("tokenAdmin")) {
        window.location.replace("login.html");
    }

})();


// Depois de sair, o botão "Voltar" do navegador pode mostrar a página
// guardada em cache. Aqui conferimos o login de novo nesse caso.
window.addEventListener("pageshow", function (evento) {

    if (evento.persisted && !sessionStorage.getItem("tokenAdmin")) {
        window.location.replace("login.html");
    }

});


// Usado no menu: onclick="return confirmarSaida()"
// Se o usuário confirmar, apaga o token e o link segue para login.html.
function confirmarSaida() {

    const confirmou = window.confirm("Deseja realmente sair?");

    if (confirmou) {
        sessionStorage.removeItem("tokenAdmin");
    }

    return confirmou;

}