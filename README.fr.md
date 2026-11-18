# Agents Fairclaim pour la facturation médicale

*Traduit par Claude ; relecture par un locuteur natif en attente. Le [README](README.md) anglais fait foi.*

Trente petits agents MCP pour la facturation médicale (système de santé américain, cycle de revenus). Chacun est responsable d'**une seule tâche**, par exemple contrôler les demandes de remboursement avant envoi, trier les refus d'un fichier 835, trouver les lignes sous-payées ou traiter les soldes créditeurs, et ne peut pas agir au-delà. Ils lisent les fichiers que vous exportez déjà de votre logiciel de gestion, de votre chambre de compensation et des portails des payeurs (837, 835, 999, 277CA, 271, 278 ou tableurs), masquent les identifiants des patients avant qu'un résultat n'atteigne le modèle d'IA, écrivent des listes de travail sur votre machine et attendent une personne nommée avant tout envoi, remboursement, comptabilisation ou paiement.

Licence MIT · Node 20 ou plus récent · fichiers locaux uniquement · aucun identifiant de connexion · aucune dépendance · données de test fictives uniquement

## Essayer

```bash
npx -y fairclaim-claim-scrubber demo          # contrôle de demandes sur des données fictives
npx -y fairclaim-denial-worklist demo       # liste des refus à partir d'un 835 fictif
```

Chaque agent a une `demo` sur des fichiers fictifs, un `eval` avec ses propres cas de test et un serveur MCP (`npx -y <agent> mcp --root <dossier>`) pour Claude Desktop, Claude Code, Cursor et d'autres hôtes MCP. Les noms de colonnes sont aussi reconnus en français ; les rapports HTML existent en français avec `--lang fr`.

## Les agents

**Avant l'envoi de la demande :** `fairclaim-patient-registration` (dossier patient et assurance), `fairclaim-eligibility-checks` (réponses d'éligibilité 271), `fairclaim-prior-authorizations` (autorisations préalables et 278), `fairclaim-good-faith-estimates` (estimations pour patients non assurés), `fairclaim-charge-capture` (visites sans acte saisi), `fairclaim-claim-scrubber` (contrôle des demandes), `fairclaim-modifier-checks` (modificateurs), `fairclaim-ncci-edits` (règles NCCI publiées par CMS), `fairclaim-dental-claims` (dentaire), `fairclaim-anesthesia-claims` (unités d'anesthésie), `fairclaim-dme-claims` (équipement médical et locations), `fairclaim-lab-claims` (laboratoire, CLIA), `fairclaim-telehealth-claims` (télésanté), `fairclaim-coding-audits` (audits de codage).

**Après l'envoi :** `fairclaim-claim-rejections` (rejets 999 et 277CA), `fairclaim-ar-aging` (créances ouvertes et délais de dépôt), `fairclaim-remit-deposits` (835 rapprochés des dépôts bancaires), `fairclaim-denial-worklist` (refus par cause), `fairclaim-denial-appeals` (projets de recours), `fairclaim-underpayments` (sous-paiements selon le contrat), `fairclaim-credit-balances` (soldes créditeurs et remboursements), `fairclaim-patient-statements` (relevés patients), `fairclaim-payment-plans` (échéanciers de paiement).

**Piloter le cabinet :** `fairclaim-fee-schedule` (barème comparé à Medicare), `fairclaim-payer-contract-rates` (contrats avec les payeurs), `fairclaim-payer-scorecards` (tableaux de bord par payeur), `fairclaim-provider-credentialing` (habilitations et échéances), `fairclaim-price-transparency` (fichier de transparence des prix des hôpitaux), `fairclaim-revenue-kpis` (indicateurs comparés à vos propres objectifs), `fairclaim-practice-go-live` (préparation au démarrage d'un nouveau cabinet).

## Données des patients

Les résultats sont envoyés à un modèle d'IA ; chaque agent masque donc d'abord les identifiants des patients (`--phi mask`, par défaut) : noms, numéros d'assuré et de dossier deviennent des pseudonymes stables (`PT-3f9a1c2e`), les dates de naissance deviennent l'année de naissance ; adresses, téléphones, e-mails et numéros de sécurité sociale sont supprimés, y compris dans le texte libre. Les fichiers de rapport sur votre disque gardent les vrais noms. Cela tient les PHI à l'écart du modèle ; ce n'est pas une attestation de conformité HIPAA. Vos accords (BAA) et vos règles continuent de s'appliquer.

## Comment ils restent sûrs

- **Liste blanche par agent.** Chaque agent ne peut appeler que ses propres outils.
- **Outils refusés.** Envoyer des demandes, comptabiliser des paiements, émettre des remboursements et se connecter aux portails des payeurs sont nommés et bloqués.
- **Un clic nominatif.** Relevés, recours, demandes de remboursement et acceptation de règles apprises attendent une personne nommée, même en mode Auto.
- **Une mémoire qui ne fait que resserrer.** Une règle apprise ne s'applique qu'après accord d'une personne et ne peut qu'ajouter un contrôle.
- **Journal d'audit** sous `.remedy/`, chaîné par hachage, signé en Ed25519 si vous le configurez. **Arrêt d'urgence :** `<agent> kill`.

## Comment ils sont testés

Chaque agent a ses propres tests, les mêmes tests de contrat que tous les autres (dont : aucun identifiant de patient des données de test dans aucun résultat) et 8 à 13 cas de test sur des fichiers fictifs. Chaque cas avec tableur est rejoué comme un export allemand, français, espagnol, brésilien, italien, japonais, chinois et coréen, et des données hostiles sont injectées dans les fichiers de chaque agent. [REVIEW-ver1.md](REVIEW-ver1.md) (en anglais) liste toutes les vérifications.

## Limites

- Chaque agent travaille uniquement avec les fichiers que vous lui donnez et ne se connecte à aucun payeur, chambre de compensation, logiciel de gestion ou banque.
- Les tables de codes, règles des payeurs et barèmes sont aussi à jour que ce que vous chargez. Les règles d'exemple intégrées ne sont la politique d'aucun payeur.
- Ni conseil de codage, ni conseil juridique, de conformité ou médical. Les personnes décident et agissent.
