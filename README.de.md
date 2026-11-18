# Fairclaim-Agenten für die medizinische Abrechnung

*Von Claude übersetzt; Prüfung durch Muttersprachler steht aus. Die englische [README](README.md) ist maßgeblich.*

Dreißig kleine MCP-Agenten für die medizinische Abrechnung (US-Gesundheitswesen, Revenue Cycle). Jeder ist für **eine Aufgabe** zuständig, etwa Abrechnungen vor dem Versand prüfen, die Ablehnungen in einer 835-Datei sortieren, unterbezahlte Positionen finden oder Guthaben von Patienten abarbeiten, und kann nicht darüber hinaus handeln. Sie lesen die Dateien, die Sie bereits aus Praxisverwaltung, Clearinghouse und Kostenträger-Portalen exportieren (837, 835, 999, 277CA, 271, 278 oder Tabellen), maskieren Patientenkennungen, bevor ein Ergebnis das KI-Modell erreicht, schreiben Arbeitslisten auf Ihrem Rechner und warten auf eine namentlich genannte Person, bevor etwas gesendet, erstattet, gebucht oder bezahlt wird.

MIT-Lizenz · Node 20 oder neuer · nur lokale Dateien · keine Zugangsdaten · keine Abhängigkeiten · nur fiktive Testdaten

## Ausprobieren

```bash
npx -y fairclaim-claim-scrubber demo          # Abrechnungsprüfung mit fiktiven Daten
npx -y fairclaim-denial-worklist demo       # Ablehnungs-Arbeitsliste aus einer fiktiven 835
```

Jeder Agent hat eine `demo` mit fiktiven Dateien, ein `eval` mit eigenen Testfällen und einen MCP-Server (`npx -y <agent> mcp --root <ordner>`) für Claude Desktop, Claude Code, Cursor und andere MCP-Hosts. Spaltennamen werden auch auf Deutsch erkannt; HTML-Berichte gibt es mit `--lang de` auf Deutsch.

## Die Agenten

**Bevor die Abrechnung hinausgeht:** `fairclaim-patient-registration` (Stammdaten und Versicherung), `fairclaim-eligibility-checks` (271-Anspruchsprüfungen), `fairclaim-prior-authorizations` (Vorabgenehmigungen und 278), `fairclaim-good-faith-estimates` (Kostenvoranschläge für Selbstzahler), `fairclaim-charge-capture` (Besuche ohne Leistungserfassung), `fairclaim-claim-scrubber` (Abrechnungsprüfung), `fairclaim-modifier-checks` (Modifikatoren), `fairclaim-ncci-edits` (NCCI-Prüfregeln von CMS), `fairclaim-dental-claims` (Zahnmedizin), `fairclaim-anesthesia-claims` (Anästhesie-Einheiten), `fairclaim-dme-claims` (Hilfsmittel und Mietgeräte), `fairclaim-lab-claims` (Labor, CLIA), `fairclaim-telehealth-claims` (Telemedizin), `fairclaim-coding-audits` (Kodier-Audits).

**Nachdem sie hinausgegangen ist:** `fairclaim-claim-rejections` (999- und 277CA-Rückweisungen), `fairclaim-ar-aging` (offene Forderungen und Einreichfristen), `fairclaim-remit-deposits` (835 gegen Bankeingänge), `fairclaim-denial-worklist` (Ablehnungen nach Ursache), `fairclaim-denial-appeals` (Widerspruchsentwürfe), `fairclaim-underpayments` (Unterzahlungen gegen den Vertrag), `fairclaim-credit-balances` (Guthaben und Erstattungen), `fairclaim-patient-statements` (Patientenrechnungen), `fairclaim-payment-plans` (Ratenpläne).

**Die Praxis führen:** `fairclaim-fee-schedule` (Gebührenordnung gegen Medicare), `fairclaim-payer-contract-rates` (Kostenträgerverträge), `fairclaim-payer-scorecards` (Kostenträger-Scorecards), `fairclaim-provider-credentialing` (Zulassungen und Fristen), `fairclaim-price-transparency` (Preistransparenzdatei für Kliniken), `fairclaim-revenue-kpis` (Kennzahlen gegen Ihre eigenen Ziele), `fairclaim-practice-go-live` (Startbereitschaft einer neuen Praxis).

## Patientendaten

Ergebnisse gehen an ein KI-Modell. Deshalb maskiert jeder Agent Patientenkennungen vorher (`--phi mask`, Standard): Namen, Versicherten- und Aktennummern werden zu stabilen Pseudonymen (`PT-3f9a1c2e`), Geburtsdaten zum Geburtsjahr; Adressen, Telefonnummern, E-Mails und Sozialversicherungsnummern werden entfernt, auch im Fließtext. Berichtsdateien auf Ihrer Festplatte behalten die echten Namen. Das hält PHI vom Modell fern; es ist keine Feststellung der HIPAA-Konformität. Ihre Verträge (BAA) und Richtlinien gelten weiter.

## Wie sie sicher bleiben

- **Freigabeliste je Agent.** Jeder Agent darf nur seine eigenen Werkzeuge aufrufen.
- **Verweigerte Werkzeuge.** Abrechnungen einreichen, Zahlungen buchen, Erstattungen auslösen und Anmeldungen bei Kostenträger-Portalen sind benannt und gesperrt.
- **Ein namentlicher Klick.** Rechnungen, Widersprüche, Erstattungsanträge und das Übernehmen gelernter Regeln warten auf eine namentlich genannte Person, auch im Auto-Modus.
- **Gedächtnis, das nur verschärft.** Gelernte Kostenträger-Regeln gelten erst nach Zustimmung einer Person und können Prüfungen nur hinzufügen.
- **Prüfprotokoll** unter `.remedy/`, über Hashes verkettet, auf Wunsch mit Ed25519 signiert. **Not-Aus:** `<agent> kill`.

## Wie sie getestet werden

Jeder Agent hat eigene Tests, dieselben Vertragstests wie alle anderen (darunter: keine Patientenkennung aus den Testdaten in irgendeinem Ergebnis) und 8 bis 13 Testfälle mit fiktiven Dateien. Jeder Fall mit Tabellen läuft zusätzlich als deutscher, französischer, spanischer, brasilianischer, italienischer, japanischer, chinesischer und koreanischer Export, und in die Dateien jedes Agenten werden feindliche Daten eingeschleust. [REVIEW-ver1.md](REVIEW-ver1.md) (englisch) listet alle Prüfungen.

## Grenzen

- Jeder Agent arbeitet nur mit den Dateien, die Sie ihm geben, und meldet sich bei keinem Kostenträger, Clearinghouse, Praxissystem oder Bank an.
- Codetabellen, Kostenträger-Regeln und Gebühren sind so aktuell wie das, was Sie laden. Eingebaute Beispielregeln sind keine Richtlinie eines Kostenträgers.
- Keine Kodier-, Rechts-, Compliance- oder medizinische Beratung. Menschen entscheiden und handeln.
