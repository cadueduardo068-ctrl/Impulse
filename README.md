# Impulsa

SaaS de gestão em português para lojas, prestadores e pequenos fabricantes. Projeto local independente em React, TypeScript, Express, Better Auth, Drizzle e PostgreSQL. As migrações rodam no início e o banco local usa PGlite, com persistência no disco do servidor.

## Rodar no Windows

Requer Node.js 24 LTS. Abra um terminal nesta pasta.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Nesta cópia, acesse [http://localhost:4317](http://localhost:4317). Em uma instalação com o exemplo padrão, acesse [http://localhost:3000](http://localhost:3000). Se a porta padrão estiver em uso, defina `PORT=4317` e `APP_URL=http://localhost:4317` juntos no arquivo `.env`. Execute uma instância por diretório de PGlite. Para encerrar o servidor com segurança, use `node --env-file-if-exists=.env scripts/stop.mjs`.

`npm run build` gera `dist/` e `dist-server/`. `npm start` serve o código compilado. Para uma futura implantação em Node, configure PostgreSQL externo, HTTPS, SMTP e as variáveis documentadas em `.env.example`. Nesta cópia, os cadastros novos ficam em `.data/workspace`. O banco usado nos testes ficou em `.data/postgres`. A pasta `.data/` também guarda segredos e links de autenticação locais.

## Usar

- Crie uma conta, avance no cadastro guiado e abra o link de confirmação. Sem SMTP, leia o arquivo da mensagem em `.data/mail/`. Uma conta recém-criada começa sem dados operacionais.
- Em **Orçamentos**, selecione um cliente, salve a proposta e envie o link revogável. O cliente pode aprovar ou pedir ajustes no celular. A proposta aprovada vira projeto, ordem ou pedido com reserva de materiais e valor a receber.
- Para um perfil de comércio, abra **Pedidos** e selecione as variações do catálogo. O pedido reserva SKUs com estoque controlado. Concluir consome a reserva. A devolução devolve a quantidade ao estoque físico. Registre pagamentos parciais e eventuais reembolsos no **Financeiro**.
- Em **Operação → Materiais e fornecedores**, teste MDF, roupas para revenda ou tecidos e aviamentos. A busca parte da cidade do negócio. A seção permite editar a região, abrir atalhos de busca, salvar listas, comparar opções e registrar o custo pago. Veja [Materiais e fornecedores](docs/MATERIAIS.md).
- Em **Crescimento**, a área de Instagram e o editor de artes usam concessão administrativa temporária ou assinatura Premium ativa. Os prompts são preparados localmente. A pessoa publica na própria conta e escolhe se copia texto ou anexa imagens no ChatGPT.
- A demonstração é pública e ilustrativa. O aplicativo tem instalação PWA e tela offline. Alterações precisam de conexão.

## Configurar integrações

### E-mail

Configure `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `MAIL_FROM` conforme o serviço. Verifique domínio e remetente no painel do provedor. Rode `node --env-file-if-exists=.env scripts/diagnose-mail.mjs` para checar conexão, autenticação e DNS. Para validar entrega, crie uma conta com caixa de entrada acessível, confira confirmação e recuperação, abra os links no endereço definido em `APP_URL` e verifique os eventos de entrega, rejeição e bloqueio no painel SMTP. Consulte [diagnóstico de e-mail](docs/ATUALIZACAO-CONSOLIDADA.md).

### Busca de materiais

Defina `BRAVE_SEARCH_API_KEY` no servidor. Os adaptadores usam Brave Web Search para produtos online e Web Search + Local POIs para lojas próximas. A tabela consultada anuncia US$ 5 por 1.000 consultas de busca, com créditos mensais conforme o plano. Confira a cobertura e o contrato antes de ativar `BRAVE_STORAGE_RIGHTS`. Para verificar, pesquise “MDF branco 18 mm” em São Paulo nos modos **Lojas próximas** e **Produtos online**, abra a URL de um resultado de cada tipo e confira origem, data e endereço quando fornecido. Mercado Livre, Amazon e mapas continuam disponíveis como atalhos. Os resultados do índice web ficam como correspondência a confirmar e o frete só pode ser comparado com informação confirmada para o CEP. [Preços Brave](https://api-dashboard.search.brave.com/documentation/pricing) · [Web Search](https://api-dashboard.search.brave.com/app/documentation/web-search) · [Local POIs](https://api-dashboard.search.brave.com/api-reference/web/local_pois)

### Mercado Pago Assinaturas

A integração aceita apenas modo de desenvolvimento, um Access Token `TEST-`, comprador de teste e URL HTTPS. Em ambiente de homologação, configure a aplicação do vendedor de teste ligado ao proprietário. Preencha `MERCADO_PAGO_TEST_TOKEN`, `MERCADO_PAGO_TEST_SELLER_ID`, `MERCADO_PAGO_TEST_PAYER_EMAIL` e `MERCADO_PAGO_WEBHOOK_SECRET` no servidor. Use o e-mail da conta compradora de teste `@testuser.com`. No painel do Mercado Pago, registre a URL HTTPS `/api/billing/webhook` para os tópicos `subscription_preapproval`, `subscription_authorized_payment` e `payment`. A aplicação só habilita o checkout com todos esses dados.

Em **Configurações → Planos e assinatura**, o proprietário revisa a recorrência e segue para o checkout hospedado. A aprovação do pagamento é conferida pelo servidor na API do vendedor e vinculada à empresa por identificador e referência gerados no servidor. O retorno do navegador sozinho não libera Premium. Antes de validar a integração, confira pendência, aprovação, renovação, cancelamento, estorno e reenvio de notificações na conta de teste. [Assinatura pendente](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments) · [Notificações](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)

Para demonstrar Premium localmente, encerre o servidor e execute `node --env-file-if-exists=.env --import tsx scripts/prepare-growth-e2e.mjs`. O comando cria um administrador e uma empresa de teste exclusivos no PGlite local e registra a concessão com prazo e auditoria. O arquivo `.data/e2e-growth.json` contém as credenciais da conta de QA. Para autorizar um administrador existente em um ambiente controlado, consulte `scripts/platform-admin.mjs`.

## Verificar

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# Com Edge instalado, a fixture Premium preparada e o servidor de QA rodando:
$env:IMPULSA_TEST_URL = 'http://localhost:4317'
npm run test:e2e -- --project desktop
npm run test:e2e -- --project mobile
npm run test:e2e -- --project tablet
```

Para repetir a validação nesta cópia, defina PGLITE_DATA_DIR=.data/postgres no terminal de QA e use a porta 4317. Aponte IMPULSA_TEST_URL para a porta do servidor de QA se usar outra. Em execuções consecutivas, a proteção antispam pode aplicar o limite de cadastros no mesmo IP. Aguarde a janela de 60 segundos antes de repetir o projeto afetado. Os testes unitários e de integração usam banco em memória.

Consulte o [relatório desta entrega](docs/ENTREGA.md) para ver as verificações efetivas e os limites atuais. Os outros relatórios em `docs/` registram a evolução da base usada neste projeto.




### Usar o SMTP do Supabase para as mensagens de acesso

O Impulsa mantém o Better Auth para contas, senhas, sessões e permissões. Quando
`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` estão preenchidas no ambiente do
servidor, o Supabase Auth entrega os links de confirmação, reenvio e
recuperação usando o SMTP do projeto. O Supabase pode registrar o destinatário
em **Authentication → Users** para entregar o link. O Impulsa não usa esse
registro como conta de acesso nem compartilha a senha do usuário com o Supabase.

1. Em **Authentication → URL Configuration**, coloque a origem do Impulsa
   em **Site URL**. Para o servidor local desta cópia, use
   `http://localhost:4317`. Na hospedagem, use o endereço HTTPS do site.
2. Em **Redirect URLs**, adicione
   `http://localhost:4317/confirmar-email/**` para teste local. Adicione
   também `https://seu-dominio/confirmar-email/**` para produção. Use a mesma
   origem definida em `APP_URL` no servidor do Impulsa.
3. Habilite o provedor **Email** e novos cadastros no Supabase Auth. Confira o
   SMTP e o remetente que você já configurou. Nos modelos **Magic Link** e
   **Confirm signup**, use `{{ .ConfirmationURL }}` como destino do botão
   para manter o redirecionamento seguro. Um texto genérico como **Continuar
   no Impulsa** serve tanto para confirmação quanto para recuperação.
4. Reinicie o Impulsa e confira cadastro, reenvio e recuperação com um
   endereço real. Se a mensagem não chegar, veja os registros de
   **Authentication** no Supabase e o status de entrega no painel do
   provedor SMTP.

A recuperação retorna a mesma mensagem para endereços cadastrados e
desconhecidos. A página de confirmação solicita um clique antes de continuar
para proteger o uso único do link. Convites de equipe e avisos operacionais
continuam usando o SMTP direto do Impulsa, se configurado.

[URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls) ·
[Modelos de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates) ·
[SMTP no Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
