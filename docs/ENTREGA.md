# Entrega local do Impulsa

O projeto foi montado em uma pasta separada a partir do código que já estava no workspace. Usa instalação própria via lockfile e um banco PGlite local independente. O código também aceita PostgreSQL externo. A verificação desta entrega usou PGlite.

## Fluxos

| Fluxo | O que esta versão entrega |
| --- | --- |
| Conta e cadastro | Better Auth com cadastro, confirmação e recuperação. Cadastro guiado editável e persistido. A conta pendente pode preencher o perfil. As operações privadas exigem confirmação e associação à empresa. |
| Serviço e fabricação | Cliente, orçamento, PDF e link revogável com validade. O cliente externo pode pedir ajustes ou aprovar pelo celular. A empresa gera uma revisão e converte a proposta aprovada em trabalho com reserva e conta a receber. |
| Comércio | Cadastro de variações com SKU próprio. Pedido direto, reserva e baixa de estoque, devolução parcial, recebimentos parciais e catálogo público por adesão. Registre reembolsos no Financeiro quando aplicável. |
| Meu dia e finanças | Pendências calculadas a partir dos registros, com adiamento e ações. Contas a pagar e receber, saldos, pagamentos parciais e transferências internas. Relatórios informam quando faltam custos para estimar resultado. |
| Materiais | Categorias e campos dependentes, municípios IBGE e atalhos locais e online. A proposta preenche material e quantidade na busca. Listas, favoritos, comparação de embalagem e custo pago persistem. |
| Premium | Área de Instagram, calendário, editor e exportação, instruções editáveis para ChatGPT e importação de arte privada. Concessão temporária auditada. A base também oferece equipe, modelos de WhatsApp, relatórios e compras, com divisão Básico/Premium parcial. |
| Interface | Site público com exemplos identificados, comparação de planos, FAQ, ajuda e privacidade. Tema claro/escuro, barra recolhível, navegação móvel e PWA. |

## Integrações e limites

- **E-mail.** A confirmação, correção e recuperação foram exercitadas com a caixa de saída local. O diagnóstico confirmou ausência de SMTP. Entrega a uma caixa real, remetente e DNS dependem de configuração.
- **Busca.** Os dois adaptadores usam Brave Web Search e Local POIs. Os testes locais verificam a base IBGE, os links externos de pesquisa e resultados controlados do adaptador. Faltou chave para verificar chamadas reais ou cobertura de uma busca no Brasil. As páginas do índice não confirmam preço, estoque, embalagem, vendedor, frete ou prazo. As comparações exata e alternativa usam os dados estruturados das ofertas conferidas manualmente.
- **Mercado Pago.** O checkout está em configuração pendente. A assinatura das notificações, o vínculo com empresa/vendedor, o valor do pagamento, a renovação, a repetição, o estorno e o cancelamento foram exercitados com respostas controladas. A sessão hospedada e as notificações reais do sandbox ainda precisam de validação com conta compradora, vendedor e endereço HTTPS de teste. A aplicação só permite a integração em teste.
- **Divisão dos planos.** Modelos personalizados de PDF, automação de acompanhamento e a matriz completa de permissões avançadas continuam pendentes. O checkout de teste é separado do registro de recebimentos dos clientes da empresa.
- **Produção.** Publicação, cobranças reais, SMTP externo e cluster PostgreSQL gerenciado ficaram para uma etapa posterior.

Os passos para instalar, testar e conectar os provedores estão no [README](../README.md).

## Verificação executada

- Instalação independente com `npm ci`, lint, checagem TypeScript e build concluídos. O Vite emitiu um aviso de tamanho do pacote JavaScript principal.
- 43 testes de unidade e integração passaram. A cobertura inclui isolamento no banco e atualização de cobrança com respostas controladas do provedor.
- No Edge, foram exercitados onboarding, recuperação, isolamento entre empresas, Premium por concessão, PWA, responsividade e contraste do painel e do diálogo. A rodada final sobre a versão compilada teve 9 testes aprovados e 3 exclusões planejadas por viewport. Incluiu pedido e aprovação anônima por link no celular, conversão, recebimento, estoque, catálogo público e revogação, além dos atalhos de busca no mapa, Mercado Livre e Amazon.
- Os dados de QA ficaram separados do banco local configurado para uso. As migrações foram aplicadas em um banco limpo.
