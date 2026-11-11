# Instalação, implantação e recuperação

## Desenvolvimento

Node 24 LTS. `npm ci` usa o lockfile. Copie `.env.example` para `.env` e execute `npm run dev`. O banco local é PGlite, uma implementação PostgreSQL WASM no **processo Node**, com disco em `.data/postgres`. Não abra o mesmo diretório por mais de um processo. Mensagens de desenvolvimento ficam em `.data/mail` e não são expostas por HTTP. A chave local de autenticação é gerada em `.data/auth-secret`, sem aparecer nos logs. `.data` e `.env` são ignorados pelo Git.

## Produção (não realizada nesta entrega)

Use um serviço Node persistente com suporte a PostgreSQL, SMTP e HTTPS terminando em proxy reverso confiável. O backend usa Node, `pg`, `pdfkit` e `multer`. Para servir o frontend no Cloudflare Workers com um backend Node separado, consulte [a configuração do Cloudflare](CLOUDFLARE.md).

1. Instale dependências e compile com `npm ci` e `npm run build`.
2. Provisione PostgreSQL 16+ e dois papéis: migrador/dono com `BYPASSRLS`, apenas para tarefas de administração; e aplicação com `NOSUPERUSER NOBYPASSRLS`, sem propriedade de tabelas/funções. Não forneça a credencial migradora ao processo web.
3. Execute `npm run db:migrate` com a conexão do migrador. Esta versão aplica migrações na inicialização; após a primeira migração, a aplicação precisa de `SELECT` na tabela `migrations` e as migrações pendentes devem ser aplicadas pelo migrador antes de iniciar a nova versão. A conexão de aplicação não deve criar ou alterar tabelas. Provisionamento inicial da tabela `migrations` deve ser feito pelo comando de migração.
4. Conceda ao papel de aplicação `USAGE ON SCHEMA public`, `SELECT` na tabela `migrations`, CRUD nas tabelas de autenticação e domínio, e `EXECUTE` nas funções estritamente necessárias. Não conceda `CREATE` em schema public nem `BYPASSRLS`. Os helpers `app_has_role`, `resolve_quote_link`, `resolve_invitation`, `accept_team_invitation`, `resolve_company_owner` `next_quote_number`, `resolve_sandbox_subscription` e `resolve_public_catalog` têm `SECURITY DEFINER`, argumentos validados e `search_path` fixo. Restrinja EXECUTE ao papel de aplicação em sua infraestrutura. As credenciais desse papel continuam sendo segredos do servidor.
5. Configure `DATABASE_URL` com TLS e validação do certificado conforme seu provedor; não use `rejectUnauthorized=false`. Defina `NODE_ENV=production`, `APP_URL=https://seu-dominio`, `BETTER_AUTH_SECRET` aleatório com no mínimo 32 caracteres, remetente e SMTP. Produção falha ao iniciar sem esses recursos essenciais. Configure `HOST=0.0.0.0` apenas atrás da camada de rede adequada; o padrão local é loopback.
6. Configure os metadados institucionais e marca. O arquivo `public/manifest.webmanifest` também precisa refletir a marca/start URL final se mudar nome ou caminho base.
7. Ative MFA em todas as contas proprietárias/administradoras antes de alterar dados operacionais. Em produção essa verificação é obrigatória. A configuração `ENFORCE_ADMIN_MFA=false` só afeta desenvolvimento.
8. O servidor define e sobrescreve `x-impulsa-client-ip` a partir de `req.ip` antes de chamar Better Auth; o cliente não decide esse cabeçalho. Por padrão, o Express usa o endereço do socket. Configure `TRUSTED_PROXIES` somente com endereços/CIDRs dos proxies realmente confiáveis quando houver proxy reverso. Não confie indiscriminadamente em `X-Forwarded-For`. Os limites de autenticação e de domínio são persistidos no PostgreSQL.
9. Execute migrações, testes de duas empresas, fluxo conectado, convites e restauração no ambiente de staging. O teste RLS automatizado local usa papel sem bypass no PGlite; conexão com um cluster PostgreSQL externo não foi disponibilizada nesta sessão.

Cada operação privada resolve a sessão e a associação no backend, define `app.user_id`/`app.company_id` com escopo de transação e consulta por empresa. Cabeçalhos do cliente não decidem o tenant. Links públicos aleatórios resolvem um único recurso com exposição reduzida. Tokens são guardados por hash; arquivos exigem sessão mesmo com URL assinada. A verificação de origem é aplicada a mutações; webhooks validam o cabeçalho assinado e consultam a API do vendedor.

## Cobrança em testes

Use a seção Mercado Pago Assinaturas do [README](../README.md) para configurar o vendedor e comprador de teste, eventos e webhook. O servidor aceita somente credenciais de teste em ambiente de desenvolvimento e confere o estado diretamente na API do provedor antes de atualizar o plano. A integração atual reage a webhooks e não tem rotina de reconciliação periódica.

## Backup local e restauração

Estes procedimentos são **manuais**, não um serviço de backup automático. Pare o servidor antes de acessar o diretório PGlite com outro processo.

```powershell
npm run db:backup
node scripts/restore.mjs .data/backups/SEU-ARQUIVO.tar.gz .data/postgres-restaurado
# No .env, para testar a cópia restaurada:
# PGLITE_DATA_DIR=.data/postgres-restaurado
npm run dev
```

O backup é um arquivo gzip com o diretório PostgreSQL. O script restaura em um diretório **novo** dentro de `.data`, verifica a contagem de empresas e não sobrescreve o banco atual. Preserve também `BETTER_AUTH_SECRET` ou `.data/auth-secret` de forma separada e protegida para manter a leitura dos segredos MFA. A caixa de saída de e-mail não está incluída no dump e contém tokens que expiram.

Em PostgreSQL externo, use `pg_dump --format=custom` com conexão do papel autorizado e restaure via `pg_restore` em banco de staging vazio. Configure retenção, cifragem, armazenamento separado, controle de acesso e teste periódico de restauração no serviço escolhido. Esses recursos **não** são oferecidos automaticamente pelo código. TLS/criptografia em repouso e redundância dependem da infraestrutura e não foram provisionados.

## Retenção e direitos

O arquivamento lógico preserva os vínculos operacionais. Esta versão não executa expurgo automático, anonimização de snapshots ou exclusão de contas; `RETENTION_DAYS` é um parâmetro inicial documentado, não uma rotina ativada. Solicitações de privacidade ficam pendentes para análise humana. Antes de operar, definir por categoria os prazos e fundamentos, atendimento, exportação com anexos, exceções legais e exclusão em backups. Não prometer um prazo de exclusão não operacionalizado.

## Monitoramento e incidentes

O servidor registra somente tipo/código de erro de aplicação, sem corpos ou segredos. Erros de bibliotecas/infraestrutura precisam ser revisados na implantação. A trilha `audit` registra usuário/empresa/ação/recurso, sem valores de senha ou token. Defina alertas, limites do proxy, limpeza de registros de rate limit/eventos, rotação de segredos e um procedimento de incidentes. A solução não afirma segurança absoluta nem conformidade garantida.

