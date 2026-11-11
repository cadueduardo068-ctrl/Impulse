# Atualização consolidada · 8/11/2026

## O que mudou

O projeto React/Express, a identidade visual e os registros existentes foram preservados. As migrações 010–013 acrescentam catálogo e programa de divulgação; não substituem tabelas anteriores. Foi criado backup local antes da migração. Não houve publicação, contratação, checkout novo ou ativação de cobrança.

O cadastro abre automaticamente seis etapas: área, atividade, município IBGE, perfil, compras e objetivos. Áreas, atividades, categorias, produtos, características, opções e dependências vêm do banco. Há seleção de materiais habituais e observações iniciais, além de configurar depois ou dispensar materiais. O perfil continua editável e usa controle de versão para impedir sobrescrita de outra aba.

Contas sem confirmação têm sessão limitada ao próprio perfil inicial e à verificação. Leitura e escrita operacionais, busca externa, arquivos, convites e Premium são recusados no servidor. A conclusão do perfil não confirma o endereço de e-mail.

O programa Instagram Premium possui configuração de perfil, identidade visual, trinta sugestões editáveis, roteiro e checklist por publicação e registro manual de métricas. Não publica no Instagram, não conecta contas nem exige senha externa. Os dados registrados não comprovam causalidade ou retorno comercial.

O estúdio oferece duas ferramentas: prompt preparado por regras locais para uso manual no ChatGPT e composição com templates exportável em PNG/JPEG. Abrir o ChatGPT usa somente `https://chatgpt.com/`, sem parâmetros, transferência, API de imagens ou automação. O estado passa de preparado a copiado somente após sucesso do clipboard; falhas oferecem seleção manual sem declarar cópia. Importar o arquivo final registra a arte importada. Fotos de referência têm prévia e download locais. Exportar uma composição envia a foto ao servidor, com informação explícita; o original não é armazenado separadamente.

Artes são privadas, com PNG/JPEG validados pelo conteúdo, limite de entrada de 5 MB, limite de decodificação de 20 milhões de pixels, remoção de metadados na normalização, quota de 50 MB/100 arquivos de artes e associação composta entre empresa e documento. Consultas, arquivos e exportações do programa verificam associação, papel e Premium no servidor. O service worker continua sem armazenar respostas privadas.

## Busca: resultados reais e atalhos

O adaptador de servidor existente é **Brave Search Web e Local POIs**. Quando configurado com chave e plano adequados, consulta páginas e detalhes de estabelecimentos reais. Isso não verifica automaticamente anúncios, estoque, preço, disponibilidade, frete ou prazo. O cache exige autorização contratual explícita; não se presume gratuidade.

**Nesta instalação não há chave Brave**, portanto não foi feita consulta externa real de produção. O fallback retorna zero resultados e atalhos claramente identificados. Testes do adaptador usam respostas controladas, sem apresentá-las como ofertas reais do usuário.

**Mercado Livre e Amazon** continuam disponíveis por links de pesquisa preenchidos com as características escolhidas. **Google Maps** é um atalho por município. Não há API direta de marketplace, cálculo de trajeto ou confirmação de entrega por CEP. Faixa de preço e prazo são preservados e identificados como filtros que não podem ser aplicados a resultados sem esses dados. Comparações manuais distinguem embalagem, unidade, subtotal e total; frete desconhecido não vira zero.

Categorias e atributos são configuráveis, inclusive revenda/fabricação de roupas, MDF e produtos de outras áreas. A cobertura inicial não é completa. O usuário pode pesquisar produto não cadastrado e solicitar inclusão. Unidades novas são comparadas apenas por identidade, sem inventar conversões.

## E-mail: causa e correção

Provedor de autenticação: **Better Auth 1.7.18**, com adaptador Drizzle/PostgreSQL. O envio é **Nodemailer/SMTP** quando configurado. No ambiente encontrado havia somente configuração de persistência local; **SMTP_HOST e MAIL_FROM não estavam configurados**. Por isso a mensagem foi capturada em `.data/mail`, sem tentativa de entrega à caixa do usuário. Não foi encontrada evidência de envio externo nem de rejeição por spam.

A tela pendente distingue captura local e SMTP. Confirmação expira em uma hora; a biblioteca valida assinatura, prazo e vínculo com o usuário/endereço. Reabrir confirmação já usada não cria uma nova sessão. O reenvio e a correção têm cooldown de um minuto por conta/endereço e limites adicionais. Corrigir endereço não confirmado usa sessão recente, conferência de senha e fluxo oficial de troca de e-mail; o novo endereço também precisa ser confirmado. Recuperação de senha permanece no provedor, com invalidação de sessões após redefinição.

Mensagens reais possuem HTML responsivo e alternativa em texto. SMTP exige remetente explícito e TLS; erros não são declarados como entrega concluída. Não há credenciais, remetentes ou registros DNS fictícios.

Diagnóstico sem revelar senha, com o ambiente configurado:

```powershell
node --env-file-if-exists=.env scripts/diagnose-mail.mjs
```

Sem SMTP, o diagnóstico informa captura local. Com SMTP, testa conexão/autenticação e procura SPF/DMARC no domínio do remetente. DKIM só é consultado quando `DKIM_SELECTOR` foi informado pelo provedor. Encontrar TXT ou autenticar no SMTP não comprova alinhamento completo nem entrega na caixa. Faltam domínio/remetente/provedor reais para conferir DNS e logs de entrega. Não envie credenciais pelo chat; configure-as no ambiente do servidor.

## Acesso Premium e administração

Premium exige `completo` com assinatura ativa ou concessão temporária de servidor, concedida por administrador da plataforma. Ser proprietário de uma empresa não concede administração global. Não há liberação por localStorage, parâmetro de URL ou botão público. Planos Essencial R$49 e Completo R$99 e adaptador de cobrança de testes foram preservados, sem ativação.

Para autorizar um **operador de plataforma já cadastrado e com e-mail confirmado**, um operador do ambiente pode executar, com o servidor parado:

```powershell
node --env-file-if-exists=.env scripts/stop.mjs
# Aguarde a mensagem de banco fechado e a liberação de .impulsa.lock.
node --env-file-if-exists=.env --import tsx scripts/platform-admin.mjs email-do-operador
node --env-file-if-exists=.env dist-server/index.js
```

Em PostgreSQL externo, execute o provisionamento com papel migrador/autorizado, separado do runtime sem BYPASSRLS. Não rode duas instâncias PGlite no mesmo diretório. O script não cria senha nem promove automaticamente a conta de visualização.

Após entrar, o operador vê **Administração da plataforma** (`/app/catalogo`). O editor estruturado mantém itens e características com versões; unidades podem ser acrescentadas e solicitações revisadas. A concessão Premium exige empresa, prazo de 1–90 dias e motivo, com auditoria. MFA é obrigatório para essa administração em produção. O usuário comum só vê informação de recurso bloqueado e a assinatura.

## Como testar

1. Abra `http://localhost:3000/cadastro` e crie uma conta sua. Ela começa sem registros operacionais. Avance nas seis etapas e recarregue para conferir progresso salvo. Sem SMTP, abra localmente o link da mensagem correspondente em `.data/mail`; esses arquivos são sensíveis e não devem ser publicados.
2. Antes de confirmar, tentar `/app/materiais` ou uma API operacional deve manter o bloqueio. Corrija o e-mail ou solicite reenvio pela tela pendente. Após confirmar, os módulos ficam disponíveis conforme papel/plano.
3. Em Configurações, escolha Marcenaria e materiais; em Materiais, selecione MDF, suas quatro características, quantidade e município. Em Roupas e moda, compare categorias de revenda e fabricação. Prefira opções que representem o produto real; “outra” exige complemento. O resumo é revisável antes da consulta.
4. Teste fallback sem credenciais, salve busca, registre oferta manual identificada como tal e compare preço de embalagem/frete. Não use registros de teste como ofertas comerciais reais.
5. Com concessão administrativa, abra `/app/instagram`, salve configuração, crie o plano e edite os dias. Registre métricas manuais identificadas corretamente.
6. Em `/app/artes`, prepare e copie instruções, abra o link simples do ChatGPT e envie a referência manualmente. Confira fallback de clipboard quando o navegador negar acesso. Importe PNG/JPEG e exporte uma composição no editor. Uma segunda empresa não deve conseguir consultar esses arquivos, inclusive conhecendo seus IDs.

Testes locais de QA com conta separada e claramente identificada (nunca executados em produção ou PostgreSQL externo): com servidor parado, `node --env-file-if-exists=.env --import tsx scripts/prepare-growth-e2e.mjs`. Essa fixture recebe uma concessão auditada de um dia exclusivamente para os testes. Credenciais aleatórias ficam somente em arquivo ignorado `.data/e2e-growth.json`, sem aparecer no console. Não cria liberação pública. Reinicie o servidor antes do Playwright.

## Verificações

Lint, TypeScript e build concluídos. A rodada completa de navegador executou **17 testes com sucesso**, com **4 repetições intencionalmente ignoradas** dos fluxos longos já executados no desktop. Foram verificados desktop, celular e tablet, com leitura visual das capturas. A suíte em memória passou nos 33 testes anteriores ao último teste adicional de validação do perfil; o resultado final atualizado é informado na entrega.

Os testes abrangem catálogo/dependências, restrição de não confirmados, grants/expiração, RLS entre empresas, prompts locais, PNG/JPEG, cadastro, correção/confirmação, progresso, IBGE, favoritos/listas/comparação e ciclo comercial existente. Os testes de navegador exercitam desktop, celular e tablet, além de acessibilidade, PWA e ausência de cache privado. Consulte o resultado da execução na entrega; não confunda testes controlados com validação de entrega SMTP ou busca paga real.

## Referências e limites externos

Revisão em 8/11/2026:

- [ChatGPT · Image generation](https://learn.chatgpt.com/docs/image-generation): referência manual e dependência dos recursos da conta. Nenhum suporte de transferência automática por URL foi adotado.
- [Ajuda oficial do Instagram](https://help.instagram.com/502981923235522) e [espelho oficial Meta](https://www.facebook.com/help/instagram/502981923235522): responderam com limitação de acesso/login. Não foram contornados. A interface informa que menus precisam ser conferidos pelo usuário na própria conta; não afirma que instruções detalhadas foram verificadas.
- Better Auth: comportamento conferido no código da versão instalada, especialmente `email-verification.mjs`, `update-user.mjs` e `sign-in.mjs`.
- [Sharp](https://sharp.pixelplumbing.com/api-constructor/) para composição e limites de imagem. O servidor não recebe SVG de usuário nem busca URL arbitrária para compor fotos.
- Fontes/limitações do adaptador e IBGE: [MATERIAIS.md](MATERIAIS.md).

## Pendências para produção

SMTP/remetente/domínio e logs de entrega; SPF/DKIM/DMARC e alinhamento; chave/plano/direitos de armazenamento Brave; PostgreSQL externo com papéis separados; HTTPS, backups e restauração operacional; dados institucionais e canais de suporte/privacidade; definição de retenção e atendimento às solicitações; contratos de fornecedores e revisão jurídica. O checkout permanece sem configuração nesta instalação. Nenhuma publicação ou contratação foi feita automaticamente.
