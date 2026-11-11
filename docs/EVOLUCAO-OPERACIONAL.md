# Evolução operacional — 09/11/2026

Implementação local, sem publicação, contratação ou cobrança. Este relatório atualiza as matrizes anteriores; recursos existentes foram preservados. As contas de teste são identificadas como QA e ficam em empresas separadas. Nenhum dado ilustrativo foi inserido na empresa de visualização original.

## Auditoria inicial

| Recurso                                                                | Situação encontrada                                                         | Tratamento                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Autenticação, confirmação, recuperação, multiempresa, onboarding e PWA | Funcional localmente                                                        | Preservado e incluído nos testes de regressão                                         |
| Propostas, PDF, link revogável, aprovação e pagamentos parciais        | Funcional, execução e rastreabilidade parciais                              | Versões, versão aprovada, etapas, consumo parcial e histórico conectados              |
| CRM, agenda, catálogo e pós-venda                                      | Cadastros funcionais, rotinas parciais                                      | Funil, próximas ações, duplicidades, conflitos no servidor e campos operacionais      |
| Materiais e listas de compras                                          | Funcional, recebimento e estoque separados                                  | Recebimentos parciais, vínculo de SKU, reservas e consumo por trabalho                |
| Financeiro                                                             | Lançamentos e pagamentos funcionais; contas, parcelas e relatórios parciais | Contas manuais, transferências, recorrência corrigida, parcelas, CSV e relatórios     |
| Início, indicadores e ajuda                                            | Visão geral funcional, central operacional parcial                          | Meu dia com regras explicadas, ações e checklist; ajuda pesquisável e suporte interno |
| Instagram e estúdio Premium                                            | Funcional com edição e importação locais                                    | Preservado; não pressupõe API de IA nem publicação automática                         |
| Busca externa, entrega de e-mail e hospedagem                          | Dependente de integração                                                    | Mantida indicação explícita quando faltam credenciais                                 |
| Checkout                                                               | Suspenso por decisão do proprietário                                        | Continua bloqueado; nenhum provedor escolhido ou cobrança iniciada                    |

Não foram acrescentados indicadores com números fictícios nem telas que simulam integração bancária ou envio externo.

## Funcionalidades entregues

- Modelos de negócio combináveis no cadastro e nas configurações, menus adaptados e opção de mostrar todas as ferramentas.
- Meu dia com compromissos, atrasos, propostas sem atualização, entregas próximas, contas e estoque mínimo, condicionado às permissões. Lembretes podem ser concluídos, adiados ou dispensados; as sugestões explicam a regra utilizada.
- CRM com pessoas/empresas, possível duplicidade, origem, responsável, preferências, tags, contatos e próximas ações. Funil configurável e motivo de perda. Ganhar oportunidade não cria pagamento. Textos de acompanhamento são editáveis; copiar e abrir WhatsApp exige ação do usuário.
- Catálogo com serviços, produtos, SKU/variações, unidades, fotos e histórico. Calculadora em centavos com materiais, tempo, mão de obra, variáveis, deslocamento, taxas e margem. Expõe fórmula e premissas; distingue markup e margem. Aplicar ao catálogo é uma ação explícita e não altera documentos antigos.
- Cliente/oportunidade → proposta versionada → aprovação da versão → pedido → etapas, responsáveis, prazos, anexos, ocorrências e materiais → recebimento financeiro → pós-venda. Proteções transacionais e chaves de idempotência evitam repetições de efeitos.
- Financeiro manual: contas a pagar/receber, pagamentos parciais, categorias, vencimentos editáveis com motivo e controle de versão, parcelas com divisão exata e recorrência ancorada no dia original do mês. Contas financeiras e transferências internas separadas de receita; retiradas separadas de despesa operacional.
- CSV bancário com mapeamento, prévia, duplicidades e correspondências confirmadas. Não acessa bancos nem realiza conciliação automática.
- Compras vinculadas ao projeto e recebimento parcial no estoque. Comprar não significa receber ou pagar. Conversões de unidades exigem registro explícito; pesquisa de preços não muda custo ou estoque. Reservas e consumo pertencem ao trabalho correspondente.
- Agenda com duração, responsável, status, reagendamento, cancelamento e bloqueios. Verificação de conflitos também no servidor, serializada por empresa, inclusive para requisições simultâneas.
- Pós-venda com responsável, prioridade, prazo, histórico e condições comerciais de garantia. Não calcula direitos legais nem dispara avaliações.
- Relatórios por período com bases, atualização, registros de origem e ausência de informação explícita. Separam vendas, recebimentos, despesas, retiradas, previsão e resultado estimado com custos revisados; saldo não é chamado de lucro.
- Importação de clientes/produtos com modelo, mapeamento, prévia, erros e resultado persistido. Processamento em lotes de até 50 linhas, retomável após atualização. Linhas inválidas são identificadas; CSV exportado neutraliza fórmulas de planilha. Dados brutos de trabalhos concluídos são descartados, preservando o resultado.
- Busca/paginação no servidor, filtros salvos, arquivamento em lote com confirmação e desfazer por dez minutos. Histórico preservado para registros vinculados.
- Papéis Proprietário, Administrador, Comercial, Operação, Financeiro e Leitura, com verificação por ação no servidor. Custos, preços e exportações respeitam o papel. Convites expiram, acesso pode ser revogado e transferência de propriedade exige senhas, destinatário verificado e token de uso único com validade de uma hora.
- Ajuda pesquisável, checklist com progresso real e solicitações de suporte privadas da empresa. Não há central externa de atendimento ou notificação de atendente contratada.
- Proteção contra envio duplo, mensagens de validação em português, foco visível e aviso de alterações pendentes ao sair pelo menu ou fechar/recarregar. Esse aviso ainda não cobre toda mudança de aba interna ou fechamento de diálogo.

## Verificação

- Tipos, lint e build de cliente/servidor aprovados.
- 43 testes automatizados de regras, banco e segurança aprovados, incluindo arredondamentos, pagamentos, recorrências, reservas, repetição, conflitos simultâneos, versões históricas, importação e isolamento.
- Navegador Edge: 20 casos aprovados e sete repetições dispensadas em desktop, celular e tablet, considerando a rodada completa e as repetições dirigidas dos dois casos inicialmente falhos. O fluxo operacional longo passou em desktop e celular; o teste de autorização é executado uma vez. Um erro de pontuação no link de transferência foi corrigido e retestado, incluindo confirmação e rejeição de reutilização. O caso de materiais no tablet passou após a janela do limite de cadastros, sem enfraquecer a proteção.
- Inspeção visual de Meu dia e relatórios; verificações automáticas de acessibilidade sem violações sérias/críticas nas telas verificadas. Isso não substitui uma auditoria completa de acessibilidade.
- Importação de 53 clientes testada em transações separadas: pausa após 50, retomada das três restantes, repetição sem duplicação, descarte dos dados brutos e preservação do relatório.
- Testes usam empresas QA isoladas. Premium inclui confirmação de conta, restrição de e-mail pendente, programa Instagram, clipboard, link simples do ChatGPT, importação privada e exportações. A suíte anterior também cobre recuperação, falhas de rede e privacidade da PWA.

## Operação realmente configurada

Banco PGlite persistido localmente, migrações versionadas até 019, exclusão mútua do diretório de dados, filas CSV persistidas, limites no servidor, trilha de auditoria e erros com referência sem corpo privado. `GET /api/health` consulta o banco e retorna estado mínimo; não há serviço externo de alerta contratado.

Backup manual criado em `.data/backups/impulsa-2026-11-09T20-02-25-215Z.tar.gz`. Restauração de teste concluída em novo diretório `.data/restores/e444861b-be47-4b64-b87a-7fac26933d99`, com conferência de 31 empresas, 41 usuários, 67 cadastros e 24 propostas no instante do backup. A cópia restaurada não substituiu o banco ativo. O backup antecede os testes posteriores e não deve ser tratado como cópia atual permanente.

Para verificar outro arquivo: pare o servidor e execute `node --import tsx scripts/restore-check.mjs CAMINHO_DO_BACKUP`. Nunca abra o diretório PGlite em dois processos. Segredos de autenticação devem ser preservados separadamente conforme o manual de operação.

## Dependências, limites e bloqueadores de produção

1. Não foi feito deploy. Produção depende de PostgreSQL externo com papel sem bypass de RLS, migrações pelo migrador, HTTPS, domínio, segredos e MFA administrativo. Validar novamente concorrência e RLS no cluster escolhido.
2. SMTP não está configurado: mensagens são capturadas em arquivos locais de desenvolvimento. Confirmar remetente, entrega e recuperação em staging antes de clientes reais.
3. Busca Brave só retorna resultados reais com credencial configurada. Sem ela, os links de pesquisa são identificados; não há preços ou fretes inventados. Não houve contratação nem chamada paga nova.
4. Checkout permanece suspenso. O adaptador legado de testes não significa decisão pelo Stripe; só pode ser habilitado após decisão explícita e configuração de teste. Chaves de cobrança real continuam bloqueadas.
5. Backup automático, retenção, cópias externas, criptografia em repouso e monitoramento com alertas não foram provisionados. O ensaio local prova restauração daquele arquivo, não recuperação de desastre da futura hospedagem.
6. CSV tem limite de 1 MB e 1.000 linhas. O trabalho persiste no banco e avança por requisições autenticadas da interface; não há worker distribuído funcionando enquanto todos os navegadores estiverem fechados.
7. Arquivos permanecem no armazenamento privado existente; cotas e backup de anexos devem ser validados na hospedagem. Cotas globais de documentos/eventos, retenção/expurgo e atendimento de exclusão ainda precisam de operação definida.
8. Suporte é um registro interno, sem operador externo, SLA ou canal de notificação configurado. Lembretes são internos; não há envio automático por WhatsApp, e-mail ou integração bancária.
9. Relatórios dependem da qualidade dos lançamentos e dos custos revisados. Não há apuração tributária, contabilidade oficial ou garantia de lucro. Dados faltantes aparecem como insuficientes.

## Próximas prioridades

1. Configurar staging e validar e-mail, restauração, papel PostgreSQL restrito e MFA: são dependências para liberar uso comercial com segurança.
2. Definir cotas totais, retenção e operação de suporte/monitoramento, para sustentar clientes reais sem promessas que o código não cumpre.
3. Validar o fluxo com pequenos negócios de atividades diferentes e ajustar campos/atalhos com base no uso diário.
4. Escolher o provedor de cobrança somente após a decisão do proprietário; depois implementar homologação e reconciliação apropriadas, sem iniciar cobranças automaticamente.
