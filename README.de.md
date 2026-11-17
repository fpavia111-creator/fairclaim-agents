# Remedy-Agenten für die medizinische Abrechnung

*Von Claude übersetzt; Prüfung durch Muttersprachler steht aus. Die englische [README](README.md) ist maßgeblich.*

Dreißig kleine MCP-Agenten für die medizinische Abrechnung (US-Gesundheitswesen, Revenue Cycle). Jeder ist für **eine Aufgabe** zuständig, etwa Abrechnungen vor dem Versand prüfen, die Ablehnungen in einer 835-Datei sortieren, unterbezahlte Positionen finden oder Guthaben von Patienten abarbeiten, und kann nicht darüber hinaus handeln. Sie lesen die Dateien, die Sie bereits aus Praxisverwaltung, Clearinghouse und Kostenträger-Portalen exportieren (837, 835, 999, 277CA, 271, 278 oder Tabellen), maskieren Patientenkennungen, bevor ein Ergebnis das KI-Modell erreicht, schreiben Arbeitslisten auf Ihrem Rechner und warten auf eine namentlich genannte Person, bevor etwas gesendet, erstattet, gebucht oder bezahlt wird.

MIT-Lizenz · Node 20 oder neuer · nur lokale Dateien · keine Zugangsdaten · keine Abhängigkeiten · nur fiktive Testdaten

## Ausprobieren

```bash
npx -y sage-of-claims demo          # Abrechnungsprüfung mit fiktiven Daten
npx -y yarrow-of-denials demo       # Ablehnungs-Arbeitsliste aus einer fiktiven 835
```

Jeder Agent hat eine `demo` mit fiktiven Dateien, ein `eval` mit eigenen Testfällen und einen MCP-Server (`npx -y <agent> mcp --root <ordner>`) für Claude Desktop, Claude Code, Cursor und andere MCP-Hosts. Spaltennamen werden auch auf Deutsch erkannt; HTML-Berichte gibt es mit `--lang de` auf Deutsch.

## Die Agenten

**Bevor die Abrechnung hinausgeht:** `marjoram-of-registration` (Stammdaten und Versicherung), `basil-of-eligibility` (271-Anspruchsprüfungen), `mint-of-authorizations` (Vorabgenehmigungen und 278), `borage-of-estimates` (Kostenvoranschläge für Selbstzahler), `clover-of-charges` (Besuche ohne Leistungserfassung), `sage-of-claims` (Abrechnungsprüfung), `dill-of-modifiers` (Modifikatoren), `ginger-of-edits` (NCCI-Prüfregeln von CMS), `anise-of-dental` (Zahnmedizin), `caraway-of-anesthesia` (Anästhesie-Einheiten), `cumin-of-dme` (Hilfsmittel und Mietgeräte), `tarragon-of-labs` (Labor, CLIA), `lovage-of-telehealth` (Telemedizin), `nettle-of-audits` (Kodier-Audits).

**Nachdem sie hinausgegangen ist:** `verbena-of-rejects` (999- und 277CA-Rückweisungen), `chamomile-of-ar` (offene Forderungen und Einreichfristen), `fennel-of-remits` (835 gegen Bankeingänge), `yarrow-of-denials` (Ablehnungen nach Ursache), `rosemary-of-appeals` (Widerspruchsentwürfe), `thyme-of-underpayments` (Unterzahlungen gegen den Vertrag), `tansy-of-credits` (Guthaben und Erstattungen), `aloe-of-statements` (Patientenrechnungen), `savory-of-plans` (Ratenpläne).

**Die Praxis führen:** `hyssop-of-fees` (Gebührenordnung gegen Medicare), `laurel-of-contracts` (Kostenträgerverträge), `sorrel-of-payers` (Kostenträger-Scorecards), `lavender-of-credentialing` (Zulassungen und Fristen), `angelica-of-prices` (Preistransparenzdatei für Kliniken), `mallow-of-kpis` (Kennzahlen gegen Ihre eigenen Ziele), `vervain-of-onboarding` (Startbereitschaft einer neuen Praxis).

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
