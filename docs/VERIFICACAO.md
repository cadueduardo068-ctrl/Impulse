# Verificação da entrega

Verificação local em 8 de novembro de 2026, Windows, Node 24.22.0. Microsoft Edge automatizado com Playwright. Nenhum serviço foi publicado e nenhum pagamento real foi iniciado.

## Comandos

| Verificação                                                    | Resultado                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                 | Passou                                                                                              |
| `npm run typecheck`                                            | Passou                                                                                              |
| `npm test`                                                     | 13 testes passaram em 4 arquivos                                                                    |
| `npm run build`                                                | Passou; cliente dividido em chunks e servidor Node gerados                                          |
| `npm run test:e2e` com a versão compilada                      | 10 testes passaram; 2 repetições do fluxo de integração omitidas intencionalmente em celular/tablet |
| `node scripts/backup.mjs`                                      | Dump PostgreSQL local criado com o servidor parado                                                  |
| `node scripts/restore.mjs ... .data/postgres-restore-verified` | Restaurou em diretório novo e confirmou a contagem de empresas                                      |

O inicializador npm do Windows travou durante a primeira instalação. Os comandos foram concluídos usando o CLI do npm diretamente por Node, conforme alternativa documentada no README. Os resultados finais acima correspondem à aplicação compilada, não apenas ao servidor Vite de desenvolvimento.

## O que os testes cobrem

### Domínio e banco

- Conversão de valores brasileiros em centavos, soma sem erro binário, margem distinta de markup, limites e totais negativos.
- Duas empresas: negação de acesso cruzado e vínculos de registros privados estrangeiros.
- Papéis: colaborador sem financeiro/exportação; financeiro sem escrita operacional.
- RLS com papel PostgreSQL `NOSUPERUSER NOBYPASSRLS`: leitura filtrada, bloqueio de inserção cruzada, criação de empresa/associação e numeração de propostas pelo colaborador sob papel restrito.
- Orçamento → aprovação → reserva → recebível → pagamento parcial → conclusão → consumo/pós-venda. Reprocessamentos não duplicam ordem, recebível, pagamento, baixa ou tarefa.
- Reversão de toda a conversão quando não há estoque suficiente e preservação dos preços antigos após alteração do catálogo.
- Escrita bloqueada depois do teste, leitura/exportação mantidas e rate limit persistente.
- Redação básica de dados no contrato de integração e rejeição de parâmetros adicionais.
- Webhook Stripe assinado: rejeição de assinatura inválida/preço divergente e idempotência de eventos. Usa fixtures assinadas localmente; não consulta o Stripe.

### Navegador e HTTP

- Cadastro real pelo formulário, termos/opção promocional inicialmente desmarcados, aceite versionado no servidor, confirmação de e-mail local e onboarding de cinco passos.
- Conta começa sem receitas/clientes artificiais. Cadastro de cliente pelo formulário grava no backend.
- Fluxo operacional e financeiro via API autenticada na mesma conta, PDF válido, upload de PDF e download assinado/autenticado.
- Compartilhamento público expõe itens/preços da proposta, sem custos/clientId; revogação torna o link inacessível.
- Segunda conta não acessa a empresa/arquivo; origem forjada é recusada. Convite concede acesso de colaborador, financeiro/exportação continuam proibidos e revogação remove o acesso imediatamente.
- MFA TOTP ativado pela biblioteca real; login passa a exigir segundo fator e código de recuperação funciona.
- Solicitação de privacidade/exportação e recuperação de senha com revogação da sessão anterior.
- Home e dashboard em 1280 × 720, celular emulado 390 × 664 e tablet 820 × 1180; sem transbordamento horizontal nos pontos medidos.
- Fotos carregadas e erros JavaScript/console verificados. A indisponibilidade de rede provocada deliberadamente no teste offline é distinguida dos erros de aplicação.
- Manifest/standalone, service worker ativo, cache sem `/api`, fallback offline verdadeiro sem simular sucesso de alterações.
- Auditoria axe WCAG A/AA/2.1 AA nas telas de **cadastro e painel**, nomes de controles, teclado e preferência de movimento reduzido. A auditoria automatizada não certifica acessibilidade de todas as telas.

As capturas de revisão são geradas em `test-results/`. Os artefatos e contas E2E usam dados fictícios explícitos e não devem ser confundidos com empresas clientes ou indicadores do produto.

## Limites da verificação

- Sem credenciais de PostgreSQL externo, SMTP, Stripe ou IA: nenhum teste real contra esses provedores foi executado. PostgreSQL/RLS foi exercitado pelo motor PostgreSQL embarcado, inclusive sob papel restrito.
- Não foi testada instalação manual em aparelhos físicos iOS/Android, nem publicação em lojas.
- Não houve pentest, teste de carga, avaliação jurídica, certificação de acessibilidade ou auditoria de infraestrutura.
- Funcionalidades pendentes estão enumeradas em [ESCOPO.md](ESCOPO.md). A existência de um formulário persistente não significa que automações externas, tributação, folha, comissões, geolocalização ou catálogo público estejam entregues.
- Backup/restauração testados são locais e manuais. Não há backup automático provisionado, criptografia em repouso ou redundância de infraestrutura prometidos.

## Atualização — materiais e fornecedores

A funcionalidade nova, as fontes, os contratos de busca e a verificação ampliada estão em [MATERIAIS.md](MATERIAIS.md). O editor de perfil agora usa versões e os cadastros existentes também recusam edições antigas. Foram adicionados testes de exclusividade do banco local, especificações, comparação, provedores, cache licenciado e listas privadas. O encerramento gracioso local é feito com `node --env-file-if-exists=.env scripts/stop.mjs`.
