# Agentes Remedy para faturamento médico

*Traduzido pelo Claude; revisão por falante nativo pendente. O [README](README.md) em inglês é a referência.*

Trinta pequenos agentes MCP para faturamento médico (sistema de saúde dos EUA, ciclo de receita). Cada um cuida de **uma única tarefa**, como revisar guias antes do envio, classificar as glosas de um arquivo 835, encontrar linhas pagas a menor ou trabalhar o relatório de saldos credores, e não pode agir fora dela. Eles leem os arquivos que você já exporta do sistema de gestão, da câmara de compensação e dos portais das operadoras (837, 835, 999, 277CA, 271, 278 ou planilhas), mascaram os identificadores dos pacientes antes que um resultado chegue ao modelo de IA, gravam listas de trabalho na sua máquina e esperam uma pessoa identificada antes de enviar, reembolsar, lançar ou pagar qualquer coisa.

Licença MIT · Node 20 ou mais recente · apenas arquivos locais · sem credenciais · sem dependências · apenas dados de teste fictícios

## Experimente

```bash
npx -y sage-of-claims demo          # revisão de guias com dados fictícios
npx -y yarrow-of-denials demo       # lista de glosas a partir de um 835 fictício
```

Cada agente tem uma `demo` com arquivos fictícios, um `eval` com seus próprios casos de teste e um servidor MCP (`npx -y <agente> mcp --root <pasta>`) para Claude Desktop, Claude Code, Cursor e outros hosts MCP. Os nomes de colunas também são reconhecidos em português; os relatórios HTML saem em português com `--lang pt`.

## Os agentes

**Antes de a guia sair:** `marjoram-of-registration` (cadastro e convênio do paciente), `basil-of-eligibility` (respostas de elegibilidade 271), `mint-of-authorizations` (autorizações prévias e 278), `borage-of-estimates` (estimativas de boa-fé para pacientes sem convênio), `clover-of-charges` (consultas sem cobrança lançada), `sage-of-claims` (revisão de guias), `dill-of-modifiers` (modificadores), `ginger-of-edits` (edições NCCI publicadas pelo CMS), `anise-of-dental` (odontologia), `caraway-of-anesthesia` (unidades de anestesia), `cumin-of-dme` (equipamentos médicos e locações), `tarragon-of-labs` (laboratório, CLIA), `lovage-of-telehealth` (telessaúde), `nettle-of-audits` (auditorias de codificação).

**Depois que ela sai:** `verbena-of-rejects` (rejeições 999 e 277CA), `chamomile-of-ar` (contas a receber e prazos de envio), `fennel-of-remits` (835 contra depósitos bancários), `yarrow-of-denials` (glosas por causa), `rosemary-of-appeals` (rascunhos de recurso), `thyme-of-underpayments` (pagamentos a menor pelo contrato), `tansy-of-credits` (saldos credores e reembolsos), `aloe-of-statements` (extratos de pacientes), `savory-of-plans` (planos de pagamento).

**Gerir a clínica:** `hyssop-of-fees` (tabela de preços contra o Medicare), `laurel-of-contracts` (contratos com operadoras), `sorrel-of-payers` (painéis por operadora), `lavender-of-credentialing` (credenciamentos e vencimentos), `angelica-of-prices` (arquivo de transparência de preços de hospitais), `mallow-of-kpis` (indicadores contra as suas próprias metas), `vervain-of-onboarding` (prontidão para a entrada em operação de uma nova clínica).

## Dados de pacientes

Os resultados vão para um modelo de IA, então cada agente mascara antes os identificadores dos pacientes (`--phi mask`, padrão): nomes, números de carteirinha e de prontuário viram pseudônimos estáveis (`PT-3f9a1c2e`), datas de nascimento viram o ano de nascimento; endereços, telefones, e-mails e números de seguridade social são removidos, inclusive em texto livre. Os arquivos de relatório no seu disco mantêm os nomes reais. Isso mantém a PHI longe do modelo; não é uma determinação de conformidade com a HIPAA. Seus acordos (BAA) e políticas continuam valendo.

## Como eles se mantêm seguros

- **Lista de permissões por agente.** Cada agente só pode chamar as próprias ferramentas.
- **Ferramentas recusadas.** Enviar guias, lançar pagamentos, emitir reembolsos e entrar em portais de operadoras estão nomeados e bloqueados.
- **Um clique nominal.** Extratos, recursos, pedidos de reembolso e aceitar regras aprendidas esperam uma pessoa identificada, mesmo no modo Auto.
- **Memória que só aperta.** Uma regra aprendida só vale depois da aprovação de uma pessoa e só pode acrescentar verificações.
- **Log de auditoria** em `.remedy/`, encadeado por hash, assinado com Ed25519 se você configurar. **Parada de emergência:** `<agente> kill`.

## Como são testados

Cada agente tem testes próprios, os mesmos testes de contrato dos demais (entre eles: nenhum identificador de paciente dos dados de teste em nenhum resultado) e de 8 a 13 casos de teste com arquivos fictícios. Cada caso com planilhas é repetido como exportação alemã, francesa, espanhola, brasileira, italiana, japonesa, chinesa e coreana, e dados hostis são inseridos nos arquivos de cada agente. [REVIEW-ver1.md](REVIEW-ver1.md) (em inglês) lista todas as verificações.

## Limites

- Cada agente trabalha apenas com os arquivos que você fornece e não entra em nenhuma operadora, câmara de compensação, sistema de gestão ou banco.
- Tabelas de códigos, regras de operadoras e preços são tão atuais quanto o que você carregar. As regras de exemplo embutidas não são a política de nenhuma operadora.
- Não é aconselhamento de codificação, jurídico, de conformidade ou médico. Pessoas decidem e agem.
