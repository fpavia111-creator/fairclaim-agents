# Agenti Remedy per la fatturazione medica

*Tradotto da Claude; revisione da parte di un madrelingua in attesa. Il [README](README.md) inglese fa fede.*

Trenta piccoli agenti MCP per la fatturazione medica (sanità statunitense, ciclo dei ricavi). Ognuno si occupa di **un solo compito**, come controllare le richieste di rimborso prima dell'invio, ordinare i rifiuti di un file 835, trovare le righe pagate meno del dovuto o lavorare il report dei saldi a credito, e non può agire al di fuori di esso. Leggono i file che già esportate dal gestionale, dalla clearinghouse e dai portali dei pagatori (837, 835, 999, 277CA, 271, 278 o fogli di calcolo), mascherano gli identificativi dei pazienti prima che un risultato raggiunga il modello di IA, scrivono liste di lavoro sul vostro computer e attendono una persona identificata prima di inviare, rimborsare, registrare o pagare qualsiasi cosa.

Licenza MIT · Node 20 o successivo · solo file locali · nessuna credenziale · nessuna dipendenza · solo dati di prova fittizi

## Provatelo

```bash
npx -y sage-of-claims demo          # controllo delle richieste su dati fittizi
npx -y yarrow-of-denials demo       # lista dei rifiuti da un 835 fittizio
```

Ogni agente ha una `demo` su file fittizi, un `eval` con i propri casi di test e un server MCP (`npx -y <agente> mcp --root <cartella>`) per Claude Desktop, Claude Code, Cursor e altri host MCP. I nomi delle colonne sono riconosciuti anche in italiano; i report HTML sono in italiano con `--lang it`.

## Gli agenti

**Prima dell'invio della richiesta:** `marjoram-of-registration` (anagrafica e assicurazione), `basil-of-eligibility` (risposte di idoneità 271), `mint-of-authorizations` (autorizzazioni preventive e 278), `borage-of-estimates` (stime in buona fede per pazienti non assicurati), `clover-of-charges` (visite senza addebito), `sage-of-claims` (controllo delle richieste), `dill-of-modifiers` (modificatori), `ginger-of-edits` (regole NCCI pubblicate da CMS), `anise-of-dental` (odontoiatria), `caraway-of-anesthesia` (unità di anestesia), `cumin-of-dme` (ausili e noleggi), `tarragon-of-labs` (laboratorio, CLIA), `lovage-of-telehealth` (telemedicina), `nettle-of-audits` (audit di codifica).

**Dopo l'invio:** `verbena-of-rejects` (rifiuti 999 e 277CA), `chamomile-of-ar` (crediti aperti e termini di presentazione), `fennel-of-remits` (835 rispetto ai versamenti bancari), `yarrow-of-denials` (rifiuti per causa), `rosemary-of-appeals` (bozze di ricorso), `thyme-of-underpayments` (pagamenti inferiori al contratto), `tansy-of-credits` (saldi a credito e rimborsi), `aloe-of-statements` (estratti conto dei pazienti), `savory-of-plans` (piani di pagamento).

**Gestire lo studio:** `hyssop-of-fees` (tariffario rispetto a Medicare), `laurel-of-contracts` (contratti con i pagatori), `sorrel-of-payers` (schede di valutazione dei pagatori), `lavender-of-credentialing` (abilitazioni e scadenze), `angelica-of-prices` (file di trasparenza dei prezzi ospedalieri), `mallow-of-kpis` (indicatori rispetto ai vostri obiettivi), `vervain-of-onboarding` (prontezza all'avvio di un nuovo studio).

## Dati dei pazienti

I risultati vanno a un modello di IA, quindi ogni agente maschera prima gli identificativi dei pazienti (`--phi mask`, predefinito): nomi, numeri di tessera e di cartella diventano pseudonimi stabili (`PT-3f9a1c2e`), le date di nascita diventano l'anno di nascita; indirizzi, telefoni, e-mail e numeri di previdenza sociale vengono rimossi, anche nel testo libero. I file di report sul vostro disco mantengono i nomi reali. Questo tiene le PHI lontane dal modello; non è una valutazione di conformità HIPAA. I vostri accordi (BAA) e le vostre policy restano validi.

## Come restano sicuri

- **Lista consentita per agente.** Ogni agente può chiamare solo i propri strumenti.
- **Strumenti rifiutati.** Inviare richieste, registrare pagamenti, emettere rimborsi e accedere ai portali dei pagatori sono nominati e bloccati.
- **Un clic nominativo.** Estratti conto, ricorsi, richieste di rimborso e accettazione di regole apprese attendono una persona identificata, anche in modalità Auto.
- **Una memoria che può solo stringere.** Una regola appresa si applica solo dopo l'approvazione di una persona e può solo aggiungere controlli.
- **Registro di audit** in `.remedy/`, concatenato con hash, firmato con Ed25519 se configurato. **Arresto di emergenza:** `<agente> kill`.

## Come vengono testati

Ogni agente ha test propri, gli stessi test di contratto di tutti gli altri (tra cui: nessun identificativo di paziente dei dati di prova in alcun risultato) e da 8 a 13 casi di test su file fittizi. Ogni caso con fogli di calcolo viene ripetuto come esportazione tedesca, francese, spagnola, brasiliana, italiana, giapponese, cinese e coreana, e dati ostili vengono inseriti nei file di ogni agente. [REVIEW-ver1.md](REVIEW-ver1.md) (in inglese) elenca tutte le verifiche.

## Limiti

- Ogni agente lavora solo con i file che gli fornite e non accede a nessun pagatore, clearinghouse, gestionale o banca.
- Tabelle dei codici, regole dei pagatori e tariffe sono aggiornate quanto ciò che caricate. Le regole di esempio integrate non sono la policy di alcun pagatore.
- Non è consulenza di codifica, legale, di conformità o medica. Sono le persone a decidere e agire.
