# Metragens por serviço e detalhes de orçamento

## O que foi ajustado

- Os formulários CPF/PF e CNPJ/PJ geram PDFs com cada serviço em uma linha, a metragem individual e a metragem total. O formulário CPF agora aponta para seu endpoint correto (`POST /api/orcamentos`) e usa seus campos próprios; o CNPJ usa `POST /api/orcamentos/pj`.
- O servidor valida as metragens recebidas, calcula o valor por serviço no servidor e grava cada área em `orcamento_servicos.area` e cada valor calculado em `orcamento_servicos.valor`; as colunas `orcamentos.area` e `orcamentos.valor` continuam guardando os totais.
- `GET /api/orcamentos/:codigo/detalhes`, o histórico de cliente e a rota de projetos devolvem as áreas por serviço. A página de detalhes do orçamento exibe cliente, status, endereço, serviços, área total e metragem individual.
- A aba Projetos representa orçamentos concluídos; o botão Ver Detalhes agora abre a mesma página de detalhes do orçamento. O histórico de cada cliente também exibe as áreas por serviço.

## Aplicar no banco

O schema que você enviou já prevê `orcamento_servicos.area` e `orcamento_servicos.valor`, e no fim contém uma verificação idempotente que cria as colunas apenas se estiverem ausentes. Se essa seção já foi executada, não é necessária nenhuma alteração adicional no banco. O arquivo `migracao_metragem_por_servico.sql` no pacote é uma alternativa idempotente para o caso de as colunas ainda faltarem. Orçamentos antigos não guardam a metragem/valor individual e aparecerão como não registrados; os novos serão gravados corretamente.

Depois da migração, substitua os arquivos modificados no projeto e reinicie o servidor. As URLs da API permanecem configuradas como `http://localhost:3000`, conforme a configuração existente do projeto.

## Arquivos principais

- `server.js`
- `public/js/gerar_pdf_cpf.js` e `public/js/gerar_pdf_cnpj.js`
- `admin/js adm/detalhes-orcamento.js`, `admin/js adm/detalhes-cliente.js` e `admin/js adm/projetos.js`
- `admin/css adm/detalhes-orcamentos.css`
- `migracao_metragem_por_servico.sql`

## Acesso ao administrador local

O `server.js` atualizado também serve as páginas das pastas `admin` e `public`. Inicie com `npm start` e abra `http://localhost:3000/admin/view%20adm/login.html` no navegador. Não abra o HTML por `file:///`. A antiga página `painel.html` não existe mais: após o login, o sistema abre `orcamentos.html`, que reúne a lista de orçamentos e os indicadores do painel.

## Aba Relatórios

A aba usa `GET /api/relatorios` com filtro de datas e status e mostra: quantidade de orçamentos, valor estimado total e médio, novos clientes, evolução mensal, distribuição por status, serviços mais solicitados (com metragem/valor quando registrados), clientes recorrentes e meses de maior valor estimado. O intervalo padrão é de 12 meses e a API limita o filtro a 36 meses. A distribuição por status considera todos os status no período; os demais dados de orçamento seguem o filtro escolhido. Valores são estimativas cadastradas, não receita efetivamente recebida.
