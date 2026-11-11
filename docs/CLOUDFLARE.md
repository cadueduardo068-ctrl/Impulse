# Cloudflare Workers

O Worker serve o frontend compilado e encaminha `/api` e `/api/*` para o
servidor Node do Impulsa. O Express registra `/api/auth/*` no handler oficial
do Better Auth. O Node continua acessando PostgreSQL, enviando e-mails com
a configuração existente e executando as rotinas de arquivos do projeto.

1. Hospede o backend Node em uma origem HTTPS separada que o Worker consiga
   alcançar, como `https://api.seu-dominio.com`. Use as instruções de
   [produção](OPERACAO.md) para PostgreSQL, migrações e variáveis de ambiente.
   Defina `APP_URL` com a URL pública do **Worker**, como
   `https://seu-dominio.com`. O Better Auth usa essa origem para validar
   requisições e gerar links que voltam ao site. Use essa mesma origem na
   lista de redirecionamentos do Supabase quando a integração estiver ativa.
2. No Cloudflare, abra o Worker existente e defina a variável de execução
   `IMPULSA_API_ORIGIN` com a origem HTTPS do **backend Node**. Use apenas
   esquema e hostname, com porta quando necessário. O nome em
   `wrangler.jsonc` deve corresponder ao Worker existente.
3. Configure o build como `npm run build` e o deploy como
   `npx wrangler deploy`, a partir da pasta deste projeto. O Wrangler publica
   `worker/index.ts` junto com os arquivos de `dist`. As regras
   `run_worker_first` fazem a API passar pelo Worker antes dos assets.
   Defina as credenciais de banco e de e-mail no ambiente do **Node**.
4. Confirme que `GET /api/health` no domínio do Worker retorna JSON do
   backend. Use um navegador para testar cadastro, confirmação, entrada,
   recuperação e saída com uma conta de teste. Se o Worker retornar
   `503` em JSON, confira `IMPULSA_API_ORIGIN`. Se retornar `502` em JSON,
   confira a conectividade HTTPS entre Worker e Node.

Para validar antes de publicar:

```powershell
npm run build
npm run test:worker
npx wrangler deploy --dry-run
```

Os testes usam o backend compilado, um banco PostgreSQL local isolado e
uma caixa de saída em diretório temporário. Eles verificam os métodos HTTP
e a criação real de conta sem enviar mensagens a destinatários externos.

[Configuração de assets do Workers](https://developers.cloudflare.com/workers/static-assets/binding/)
