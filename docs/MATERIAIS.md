# Materiais e fornecedores

Implementação local no mesmo projeto, mantendo autenticação, empresas, papéis, propostas, estoque e finanças existentes.

## Usar

1. Em **Configurações → Editar perfil e objetivos**, selecione profissão, município e região de atendimento. A cidade tem código oficial do IBGE; CEP é opcional. Em **Necessidades**, escolha Sim / Não / Ainda não sei para compras de materiais. A opção Não oculta o atalho, mas não bloqueia a ferramenta para uma profissão.
2. Abra **Materiais e fornecedores** pelo menu ou painel. Informe livremente o material, categoria, quantidade/unidade e características. MDF exige espessura/dimensões/acabamento/cor; parafusos exigem diâmetro/comprimento/tipo; tintas exigem volume/cor/aplicação. Nenhuma medida é presumida.
3. A cidade e o CEP partem do perfil. Os resultados têm abas de lojas, compra online, lista e salvos. A integração atual não calcula raio nem distância; não confunde distância em linha reta com trajeto. Alterar a cidade amplia a região.
4. Sem provedor, os botões abrem **pesquisas** no Mercado Livre, Amazon e mapas, identificadas como tal. Não são ofertas verificadas. Não incluem CEP, afiliado ou rastreamento promocional adicionado.
5. Salve filtros, cadastre favoritos e crie listas por projeto. É possível vincular orçamento e ordem da mesma empresa e adicionar materiais manualmente. Para marcar comprado, informe o valor total efetivamente pago. Esse registro não lança estoque/pagamento nem reescreve proposta antiga.
6. Cadastre ofertas conferidas por você com fonte/data, embalagem e valores. Campos de características da oferta começam vazios, para não presumir correspondência com o pedido. Compare até quatro opções. A quantidade de pacotes é arredondada para cima; massa, volume e comprimento compatíveis são normalizados. Sem frete confirmado para o mesmo CEP, o resultado é **Subtotal sem frete**, nunca menor custo total. Alternativas incompatíveis não recebem total comparável.

## Fontes e integração real

| Fonte                         | Estado nesta instalação                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| IBGE                          | Base pública oficial com 5.571 municípios e identificadores, obtida em 8/11/2026 e servida localmente |
| Brave Search Web / Local POIs | Adaptador real de servidor implementado; sem chave configurada não faz consulta externa               |
| Mercado Livre                 | Apenas link de pesquisa; API direta não integrada                                                     |
| Amazon                        | Apenas link de pesquisa; API direta não integrada                                                     |
| Google Maps                   | Link de pesquisa da região; sem geocodificação, rotas ou estoque                                      |

O adaptador Brave consulta páginas pela Web Search e, quando houver identificadores locais, detalhes de estabelecimentos pelo endpoint Local POIs. Usa URLs fixas do provedor, token apenas no servidor, timeout de 8 s por tentativa, até 2 tentativas, redirecionamentos recusados e respostas parciais explícitas. Nunca visita URLs arbitrárias dos resultados. Páginas retornadas não são tratadas como instruções e não recebem acesso ao banco.

Resultados de páginas online ficam como **correspondência não confirmada**, mesmo que o título pareça adequado. Páginas de pesquisa retornadas pelo índice são separadas de anúncios. Não extraímos preço/estoque/frete de trechos ambíguos nem usamos memória de IA. Endereço e contato comercial são exibidos apenas quando fornecidos pelo resultado de POI. Informar uma loja da categoria não confirma o produto exato nem o estoque. Imagens de produto não são copiadas sem direitos explícitos.

## Configurar Brave

No `.env`, configure:

```dotenv
BRAVE_SEARCH_API_KEY=chave-do-servidor
BRAVE_STORAGE_RIGHTS=false
SEARCH_CACHE_SECONDS=300
SEARCH_COMPANY_HOURLY_LIMIT=30
```

Contrate um plano apropriado e revise custos, termos, privacidade e direitos de armazenamento antes de ativar. Marque `BRAVE_STORAGE_RIGHTS=true` **somente se o contrato autorizar**. Sem isso, não há cache persistente de resultados nem favorito derivado do conteúdo do provedor; filtros e favoritos informados manualmente continuam funcionando. Cache autorizado dura de 30 a 900 segundos, informa a data original e pode ser atualizado manualmente. Requisições idênticas simultâneas compartilham a consulta em andamento. Os limites por empresa/usuário são persistentes no PostgreSQL.

A API não recebe clientes, documentos, dados financeiros ou CEP completo. Apenas material, características, marca e município/estado compõem as consultas. A preferência de preço e prazo não vira confirmação de entrega: deve ser conferida na loja. Os segredos não são devolvidos ao navegador.

## Persistência e proteção de edições

Migrações `008_materials.sql` e `009_material_links.sql`: histórico de filtros (até 100 buscas salvas por empresa), favoritos, listas, itens e referências de ofertas. RLS verifica empresa/associação. Chaves estrangeiras compostas impedem associar itens e trabalhos a outra empresa. URLs internas/literais IP/esquemas perigosos são rejeitados; o backend só consulta os endpoints fixos do Brave.

Perfil usa `profile_version`; cadastros e itens da lista usam `version`. A gravação exige a versão lida. Uma edição antiga recebe HTTP 409 e seus campos permanecem na tela; não sobrescreve a edição recente. É possível consultar a versão do servidor e escolher explicitamente carregá-la.

## Execução e encerramento local

Execute `npm run dev`. O `.env` desta instalação aponta para `.data/postgres`, cópia recuperada e verificada pelo replay completo do WAL, com a conta original e seus dados existentes. Os diretórios originais foram preservados em `.data/postgres-checkpoint-original` e `.data/postgres-before-materials` e um dump completo recuperado está em `.data/backups/impulsa-recovered-complete.tar.gz`.

Em Windows, pare o servidor corretamente com:

```powershell
node --env-file-if-exists=.env scripts/stop.mjs
```

O processo encerra as requisições, fecha o PostgreSQL e libera `.impulsa.lock`. Uma segunda instância com o mesmo diretório é recusada antes de abrir o banco. Não use `Stop-Process` como rotina nem abra o diretório com outro processo. O script de backup agora verifica o mesmo bloqueio.

## Verificação e limitações

A suíte de domínio e integração contém 27 testes. A suíte de navegador contém 13 verificações executadas e 2 repetições do fluxo de conta omitidas intencionalmente em celular/tablet. Lint, tipos e build foram executados nesta atualização. As evidências de execução estão em `test-results/`.

`tests/materials.test.ts` cobre características essenciais, quantidades fracionárias, pacotes, unidades, frete ausente/CEP divergente, compatibilidade, falhas e parcialidade do provedor, dados não confiáveis, destinos/URLs, cache autorizado, deduplicação, listas/favoritos privados, RLS, vínculos e versões. Provedores simulados aparecem exclusivamente em testes; nunca como oferta na aplicação.

`tests/browser/materials.spec.ts` percorre edição do perfil, preenchimento automático da cidade, formulário MDF, links externos, buscas salvas, oferta manual/comparação, lista vinculada, compra registrada, favoritos, persistência, conflito de edição, acessibilidade e layout em desktop/celular/tablet.

Sem credenciais reais, os adaptadores são testados com respostas controladas e indisponibilidade. Não foi possível validar busca comercial, cobertura regional ou direitos contratuais de um plano Brave real. Não há compra automática, scraping de marketplaces, cálculo de rotas, garantia de estoque ou cálculo de frete real.

## Documentação oficial consultada

- [IBGE — Localidades](https://servicodados.ibge.gov.br/api/docs/localidades) e [endpoint utilizado](https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado).
- [Brave — Web Search e fluxo de POIs](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started).
- [Brave — campos de Local POIs](https://api-dashboard.search.brave.com/api-reference/web/local_pois).
- [Brave — direitos de armazenamento por plano](https://brave.com/search/api/).
- [Mercado Livre — autenticação e autorização](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao).
- [Amazon — requisitos de acesso às APIs](https://affiliate-program.amazon.com/help/operating/policies/).

As APIs dos marketplaces não são presumidas públicas/irrestritas. Futuras integrações diretas exigem autorização, contrato e implementação específicos.
