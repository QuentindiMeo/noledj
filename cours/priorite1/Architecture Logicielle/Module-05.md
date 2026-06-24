# M5 — Réglementation des données

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer les **principes structurants du RGPD** qui ont un impact direct sur l'architecture logicielle, sans réciter le texte de loi.
- Distinguer rigoureusement **donnée personnelle**, **donnée sensible**, **donnée pseudonymisée** et **donnée anonymisée** — la confusion entre les deux derniers étant l'erreur architecturale la plus coûteuse.
- Identifier les **droits des personnes** (accès, rectification, effacement, portabilité, opposition) et traduire chacun en **mécanismes techniques** dans une application.
- Définir une **politique de conservation** des données et la concrétiser par des **purges automatiques** et des **rétentions différenciées** par type de donnée.
- Auditer un projet existant via une **checklist de conformité** orientée architecture (pas juridique).
- Reconnaître les approches **Privacy by Design** et **Privacy by Default** et savoir lesquelles relèvent de l'architecte logiciel.

## Durée estimée

1 jour à 1,5 jour.

## Pré-requis

- M1 à M4 (vocabulaire architecture, trade-offs, CQRS, décisions techniques).
- Notions de base sur les **logs**, le **stockage**, les **sauvegardes**.
- Connaissance d'au moins **un SGBD** (cf. M4) pour visualiser les implémentations.

> **Avertissement.** Ce module est rédigé du point de vue de l'**architecte logiciel**, pas du juriste. Il ne se substitue pas à un **DPO** (Délégué à la Protection des Données) ou à un conseil juridique. Son objectif : permettre une **conversation utile** entre tech et conformité, et **éviter les erreurs structurantes** détectables dès la phase d'architecture.

---

## 1. Pourquoi un dev doit comprendre la régulation

### Le coût d'une mauvaise architecture régulatoire

Découvrir trois ans après le lancement qu'une fonctionnalité n'est pas conforme coûte typiquement :

- **Un refactor structurel** : si les données personnelles sont éparpillées sur 50 tables, le _droit à l'effacement_ exige de modifier la moitié du code.
- **Une amende**. En France, la CNIL prononce des amendes jusqu'à **4 % du chiffre d'affaires mondial** ou **20 millions d'euros** (le plus élevé des deux).
- **Une perte de confiance**. Une fuite mal gérée détruit la marque plus vite que n'importe quel bug.
- **Une perte de marché**. Plusieurs marchés (administration publique, santé, éducation) exigent une attestation RGPD lors des appels d'offres.

**Conséquence pour l'architecte.** Le RGPD est une **contrainte d'architecture** au même titre que la performance, la fiabilité ou la sécurité. Le traiter en post-it juridique à la fin du projet revient à le traiter mal.

**Analogie.** L'accessibilité d'un bâtiment. On peut faire les plans en oubliant les rampes d'accès, les ascenseurs, les portes adaptées — et "ajouter ça à la fin". Le résultat sera un bâtiment où ces aménagements ressemblent à des bricolages, coûteux, mal intégrés. Penser l'accessibilité **dès l'esquisse** ne coûte presque rien et donne un résultat élégant. C'est la même logique pour la conformité données.

### Ce que ce module n'est pas

- Un cours de droit. La loi évolue ; ce module donne le **squelette stable** des principes.
- Un guide CNIL exhaustif. La CNIL produit des fiches détaillées par secteur.
- Un substitut au DPO. L'architecte **dialogue** avec le DPO, ne le remplace pas.

---

## 2. RGPD en 10 minutes — vue architecte

### 2.1 — Le périmètre

Le **RGPD** (Règlement Général sur la Protection des Données, _GDPR_ en anglais) est entré en application le **25 mai 2018** dans toute l'Union européenne. Il s'applique :

- À toute organisation qui **traite des données personnelles** de **résidents européens**, quelle que soit la nationalité de l'organisation. Un acteur américain qui collecte des données d'utilisateurs en France est soumis au RGPD.
- À **tout traitement** de données personnelles : collecte, stockage, lecture, modification, transmission, suppression. Le simple fait de **lire** une donnée personnelle est un traitement.

### 2.2 — Qui est qui

Le RGPD distingue plusieurs rôles. À retenir :

- **Personne concernée** (_data subject_) — la personne dont on parle. C'est elle qui a des droits.
- **Responsable de traitement** (_controller_) — l'entité qui décide pourquoi et comment les données sont traitées. C'est généralement l'entreprise qui commande le système.
- **Sous-traitant** (_processor_) — l'entité qui traite les données **pour le compte** du responsable. Un fournisseur cloud (AWS, OVH), un fournisseur SaaS (Stripe, SendGrid) est sous-traitant.
- **DPO** (Délégué à la Protection des Données, _Data Protection Officer_) — la personne en charge de la conformité au sein de l'organisation. Obligatoire pour certaines structures (administration publique, traitement à grande échelle de données sensibles).

L'architecte logiciel n'est généralement **aucun** de ces rôles formellement. Il **dialogue** avec le responsable et le DPO pour traduire les exigences en code.

### 2.3 — Les sept principes fondateurs

L'article 5 du RGPD énumère sept principes. Quatre ont un impact **direct** sur l'architecture :

1. **Licéité, loyauté, transparence** — on doit pouvoir expliquer **pourquoi** chaque donnée est collectée.
2. **Limitation des finalités** — une donnée collectée pour X **ne peut pas** être utilisée pour Y sans nouvelle base légale.
3. **Minimisation** — on collecte **strictement** ce qui est nécessaire à la finalité. Pas plus.
4. **Exactitude** — les données doivent être exactes et tenues à jour.
5. **Limitation de la conservation** — on ne garde une donnée que **le temps nécessaire** à sa finalité. Au-delà : suppression, anonymisation, ou archivage.
6. **Intégrité et confidentialité** — sécurité technique et organisationnelle (chiffrement, contrôle d'accès, logs).
7. **Responsabilité** — on doit pouvoir **prouver** la conformité (registre des traitements, documentation).

**Ce que ces principes excluent en architecture** :

- Collecter "au cas où" — interdit (minimisation).
- Réutiliser des données analytiques pour faire du marketing — interdit (limitation des finalités).
- Stocker à vie "au cas où on en aurait besoin" — interdit (limitation de la conservation).
- Ne pas chiffrer une base contenant des données personnelles — risqué (intégrité et confidentialité).

### 2.4 — Les six bases légales

Le RGPD exige une **base légale** pour traiter des données. Six options, dont quatre fréquemment rencontrées :

- **Consentement** — la personne a explicitement accepté. _Doit_ être libre, spécifique, éclairé, univoque, et **retirable** à tout moment.
- **Contrat** — le traitement est nécessaire à l'exécution d'un contrat (typique pour un compte utilisateur, une commande).
- **Obligation légale** — la loi impose la collecte (déclarations fiscales, dossiers médicaux).
- **Intérêt légitime** — l'organisation a un intérêt légitime qui ne lèse pas la personne (typique pour la sécurité, certaines analyses internes).
- **Sauvegarde des intérêts vitaux** — rare en système d'information classique.
- **Mission d'intérêt public** — administration publique.

**Implication architecturale.** Pour chaque traitement de donnée personnelle, le système doit pouvoir indiquer **sur quelle base légale** il repose. Si le consentement est utilisé, il faut pouvoir **prouver** qu'il a été obtenu, et permettre son **retrait** (en pratique : un endpoint, une UI, une révocation propagée).

---

## 3. Quatre concepts à ne pas confondre

### 3.1 — Donnée personnelle vs donnée non personnelle

Une **donnée personnelle** est toute information permettant d'identifier, directement ou indirectement, une personne physique. La définition est **large** :

- Nom, prénom, email, téléphone, adresse — évident.
- Photo, vidéo, voix — évident.
- Pseudo, identifiant utilisateur, identifiant interne **lié à une personne** — moins évident.
- **Adresse IP**, identifiant de cookie, identifiant publicitaire mobile — souvent oublié.
- Données de localisation — toujours.
- Données biométriques (empreinte, reconnaissance faciale) — sensibles (cf. 3.2).
- Identifiant de session **lié à un compte** — oui.
- Identifiant interne **anonyme** (UUID généré aléatoirement, sans lien réversible vers une personne) — non.

**Test rapide.** Si on peut, en combinant la donnée avec une autre source à laquelle on a (ou pourrait avoir) accès, retrouver une personne — c'est une donnée personnelle.

### 3.2 — Donnée personnelle vs donnée sensible

Une **donnée sensible** (catégorie particulière, article 9) est une donnée personnelle **plus** :

- Origine raciale ou ethnique.
- Opinions politiques.
- Convictions religieuses ou philosophiques.
- Appartenance syndicale.
- Données génétiques ou biométriques (à des fins d'identification).
- Données concernant la santé.
- Données concernant la vie sexuelle ou l'orientation sexuelle.

Les données sensibles sont **interdites par défaut**, sauf exception (consentement explicite, obligation légale, intérêt public majeur, traitement médical par professionnel de santé, etc.). Architecturalement, **traiter des données sensibles** déclenche des exigences renforcées : chiffrement, contrôle d'accès strict, journalisation des accès, hébergement certifié (HDS pour la santé en France).

### 3.3 — Pseudonymisation vs anonymisation

C'est la **distinction la plus mal comprise** dans l'industrie. Erreur fréquente : appeler "anonymisée" une donnée qui est seulement pseudonymisée — ce qui invalide toute la stratégie de conformité.

#### Pseudonymisation

On **remplace** un identifiant direct (nom, email) par un identifiant artificiel (UUID, hash), tout en **conservant** une table de correspondance qui permet de revenir à la personne d'origine.

```
Table source                Table pseudonymisée            Mapping (séparé, chiffré)
┌──────┬──────────┐         ┌──────┬──────────┐            ┌──────┬─────────┐
│ id   │ email    │  →      │ id   │ ext_id   │            │ id   │ ext_id  │
├──────┼──────────┤         ├──────┼──────────┤            ├──────┼─────────┤
│ 12   │ a@x.com  │         │ 12   │ u-a1b2c3 │            │ 12   │ u-a1b2c3│
└──────┴──────────┘         └──────┴──────────┘            └──────┴─────────┘
```

**Les données pseudonymisées restent des données personnelles** au sens du RGPD. Tous les droits et obligations s'appliquent. La pseudonymisation est une **mesure de sécurité** (recommandée, parfois imposée), pas une exonération.

#### Anonymisation

On **supprime irréversiblement** tout lien entre la donnée et la personne. Aucune méthode (même avec accès aux autres bases) ne doit permettre d'identifier la personne.

**Les données réellement anonymisées sortent du périmètre du RGPD.** Mais l'anonymisation **vraie** est techniquement difficile :

- Supprimer le nom et l'email ne suffit pas.
- Conserver date de naissance + code postal + sexe permet d'identifier ≈ 87 % de la population américaine (étude Sweeney, 2000) — équivalent en Europe.
- Conserver l'**adresse IP** ou des **identifiants de device** détruit l'anonymisation.
- L'agrégation avec **k-anonymité** (chaque enregistrement est indiscernable d'au moins `k-1` autres) est une technique classique pour anonymiser des jeux statistiques.

#### Comparaison

| Critère                          | Pseudonymisation               | Anonymisation                  |
| -------------------------------- | ------------------------------ | ------------------------------ |
| **Réversibilité**                | Oui (avec la clé)              | Non (par construction)         |
| **Statut RGPD**                  | Donnée personnelle             | Hors RGPD                      |
| **Effort technique**             | Modéré                         | Très élevé (jusqu'à impossible) |
| **Usage typique**                | Limiter l'exposition interne   | Statistiques publiques, exports |
| **Conservation possible**        | Sous conditions, durée limitée | Sans limite                    |

**Règle d'architecte.** Ne jamais affirmer qu'une donnée est "anonymisée" sans avoir vérifié qu'il est **réellement impossible** de remonter à la personne en croisant avec **n'importe quelle source disponible**. En cas de doute : on parle de **pseudonymisation**, on applique les obligations RGPD.

### 3.4 — En pratique dans un système

Schéma typique d'un système qui traite plusieurs catégories :

```
┌──────────────────────────────────────────────────────────┐
│  Base opérationnelle (données personnelles + sensibles)  │
│  - chiffrement at rest                                   │
│  - accès journalisé                                      │
│  - rétention courte                                      │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ pipeline ETL — pseudonymisation
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Base analytique (données pseudonymisées)                │
│  - reste donnée personnelle (RGPD)                       │
│  - rétention plus longue                                 │
│  - accès analytique élargi                               │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ pipeline — agrégation + k-anonymité
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Tableaux de bord publics (données anonymisées)          │
│  - hors RGPD                                             │
│  - rétention sans limite                                 │
└──────────────────────────────────────────────────────────┘
```

Plus on s'éloigne de la source, plus la donnée est **distante de la personne**, et plus les contraintes s'allègent. C'est l'**inverse** d'un système qui mélangerait tout dans un même lac de données.

---

## 4. Droits des personnes — traduction architecturale

Le RGPD donne **huit droits** aux personnes. Six ont un impact technique direct.

### 4.1 — Droit d'accès (art. 15)

> "Quelles données avez-vous sur moi ?"

**Implication architecturale.** Pour chaque utilisateur, le système doit pouvoir **collecter, en un délai raisonnable** (1 mois maximum), **toutes** les données le concernant : profil, activité, logs, métriques, données dérivées.

**Conséquence sur l'architecture.**

- Centraliser les données personnelles autour d'un **identifiant unique** par personne.
- Documenter tous les **endroits** où des données personnelles transitent (cf. registre des traitements).
- Prévoir un **endpoint ou un job** dédié qui agrège ces données pour une personne donnée.

### 4.2 — Droit de rectification (art. 16)

> "Cette donnée est fausse, corrigez-la."

**Implication architecturale.** L'utilisateur doit pouvoir **demander la correction**. Un endpoint suffit la plupart du temps. Attention aux **caches** et aux **réplications** : une rectification doit se propager partout où la donnée a été dupliquée.

### 4.3 — Droit à l'effacement (art. 17, "droit à l'oubli")

> "Effacez toutes mes données."

**C'est le droit le plus coûteux à architecturer.** Il impose de pouvoir, sur demande, supprimer **toutes** les données personnelles d'une personne, partout où elles sont stockées :

- Base principale.
- Bases secondaires (analytique, reporting, archive).
- **Sauvegardes** (cas particulier, voir plus bas).
- **Logs** (idéalement on évite de logger des données personnelles).
- Caches distribués (Redis, Memcached).
- Indices de recherche (Elasticsearch).
- Pipelines en file de messages encore en cours.
- Données chez les **sous-traitants** (fournisseurs SaaS, providers cloud).

**Cas des sauvegardes.** La CNIL admet que les sauvegardes soient **rotative** : on ne réécrit pas une sauvegarde pour supprimer une donnée, mais on s'assure que la donnée **ne survit pas** au cycle de rotation. Concrètement : si on garde 90 jours de sauvegardes, une suppression doit propager à toutes les sauvegardes au plus tard 90 jours après.

**Erreur classique.** Avoir une fonction `DELETE FROM users WHERE id = ...` qui ne supprime que la table principale. Les emails des commandes restent. Les logs de connexion restent. Les exports CSV passés circulent encore. Le système est non conforme — alors que le développeur a "fait sa part".

**Bonne pratique.** Construire l'effacement comme un **process orchestré** :

```python
class UserErasureService:
    def erase(self, user_id: UserId, requested_at: datetime) -> ErasureReport:
        # Vérifications préalables : obligations légales de conservation
        # qui empêcheraient l'effacement (factures = 10 ans, etc.)
        retention_blockers = self._check_legal_retention(user_id)
        if retention_blockers:
            return ErasureReport.partial(reason=retention_blockers)

        # Effacement orchestré
        self._main_db.delete_user(user_id)
        self._analytic_db.pseudonymize_user(user_id)
        self._cache.invalidate_user(user_id)
        self._search_index.remove_user(user_id)
        self._email_provider.unsubscribe(user_id)
        self._publish_event(UserErased(user_id, requested_at))
        # Les sauvegardes seront cyclées naturellement.

        return ErasureReport.complete()
```

L'effacement est un **use case de premier ordre**, pas un script ad hoc.

### 4.4 — Droit à la limitation du traitement (art. 18)

> "Ne touchez plus à mes données, mais ne les effacez pas."

Cas typique : un litige en cours empêche l'effacement, mais l'utilisateur ne veut plus que ses données soient utilisées.

**Implication architecturale.** Pouvoir marquer un utilisateur comme **"limité"** et propager cette information dans le code (les jobs analytiques, le marketing, etc., l'ignorent).

### 4.5 — Droit à la portabilité (art. 20)

> "Donnez-moi mes données dans un format réutilisable."

**Implication architecturale.** Export des données personnelles dans un format **structuré, couramment utilisé et lisible par machine** (JSON, CSV, XML). Idéalement avec un schéma documenté.

À ne pas confondre avec le droit d'accès (4.1) : l'accès dit "qu'est-ce que vous avez ?", la portabilité dit "donnez-le-moi dans un format que je peux importer ailleurs".

### 4.6 — Droit d'opposition (art. 21)

> "Arrêtez d'utiliser mes données pour ça."

Particulièrement appliqué au **marketing direct** et au **profilage**. Une opposition au marketing doit être **immédiate** et propagée à tous les canaux (email, push, SMS).

### 4.7 — Synthèse — les 6 droits dans l'architecture

| Droit                  | Capacité à implémenter                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| **Accès**              | Endpoint / job d'export utilisateur.                                   |
| **Rectification**      | Endpoints d'édition + propagation aux caches.                          |
| **Effacement**         | Process orchestré multi-systèmes + rotation des sauvegardes.           |
| **Limitation**         | Flag utilisateur "limité" respecté par les jobs.                       |
| **Portabilité**        | Export dans un format machine-readable documenté.                      |
| **Opposition**         | Désabonnements granulaires propagés en temps réel.                     |

---

## 5. Conservation des données — au-delà du slogan

### 5.1 — Le principe

Article 5(1)(e) du RGPD : on garde une donnée personnelle **uniquement** pendant la durée nécessaire à la finalité, puis on la supprime, l'anonymise, ou la transfère en archive.

**En pratique** : une donnée passe par **trois phases** :

```
┌──────────────────┐  durée d'utilité  ┌──────────────────┐  durée légale  ┌──────────────────┐
│  Base active     │ ─────────────→    │  Archive         │ ──────────→    │  Suppression     │
│  (chaud)         │                   │  (froid)         │                │  ou anonymisation │
└──────────────────┘                   └──────────────────┘                └──────────────────┘
```

- **Base active** — la donnée est utilisée pour la finalité courante. Durée = celle de l'usage.
- **Archive intermédiaire** — la donnée n'est plus utilisée mais doit être conservée pour une **obligation légale** (factures = 10 ans, comptabilité = 10 ans, dossiers médicaux = 20 à 30 ans selon le contexte, données fiscales = 6 à 10 ans, etc.). Accès **restreint**, journalisé.
- **Suppression ou anonymisation finale** — au-delà de la durée légale.

### 5.2 — Durées typiques

Quelques ordres de grandeur (à valider avec un juriste pour chaque cas) :

| Catégorie                        | Durée d'archive typique                       |
| -------------------------------- | --------------------------------------------- |
| Données de prospection           | 3 ans après le dernier contact                |
| Compte client actif              | Durée de la relation contractuelle            |
| Compte client inactif            | 3 ans après la dernière activité              |
| Factures, devis                  | 10 ans (obligation comptable)                 |
| Dossier médical (général)        | 20 ans après le dernier acte                  |
| Données de paie                  | 5 à 10 ans selon le pays                      |
| Logs de connexion / sécurité     | 1 an (recommandation CNIL en France)          |
| Données analytiques agrégées     | Pas de limite si véritablement anonymisées    |
| Données de candidature non retenue | 2 ans maximum                                |

### 5.3 — Implémentation technique

**Trois mécanismes** à implémenter côté architecture :

1. **Étiquetage de chaque table / champ** avec une **politique de rétention**.
2. **Jobs de purge périodiques** qui appliquent la politique.
3. **Audit** de la bonne exécution des purges.

Exemple concret :

```python
class RetentionPolicy:
    table: str
    column_event_time: str       # le champ qui sert de date de référence
    duration: timedelta
    action: Literal["delete", "anonymize", "archive"]

POLICIES = [
    RetentionPolicy("user_sessions", "created_at", timedelta(days=365), "delete"),
    RetentionPolicy("prospect", "last_contact_at", timedelta(days=3*365), "delete"),
    RetentionPolicy("invoices", "issued_at", timedelta(days=10*365), "archive"),
    RetentionPolicy("analytics_raw", "captured_at", timedelta(days=90), "anonymize"),
]


class RetentionJob:
    def run(self) -> None:
        for policy in POLICIES:
            cutoff = datetime.now(timezone.utc) - policy.duration
            self._apply(policy, cutoff)
            self._log_audit(policy, cutoff)
```

**Erreur classique.** Avoir une politique de rétention écrite dans un PDF, jamais implémentée. C'est le cas le plus fréquent en audit CNIL. Le PDF n'est qu'une **intention** ; l'architecture doit en faire une **réalité automatique**.

### 5.4 — Pièges récurrents

- **Données dérivées oubliées.** Une suppression de compte ne supprime pas automatiquement les sessions, les notifications en file, les events Kafka, les exports comptables, etc.
- **Backups muets.** Le PDF dit "purge à 3 ans" ; les backups gardent tout depuis le début du projet.
- **Champs JSON.** Une colonne `metadata: JSONB` peut contenir n'importe quoi — y compris des données personnelles auxquelles personne ne pense lors de la purge.
- **Logs.** Les fichiers de logs applicatifs contiennent souvent des données personnelles (emails dans les stack traces, IP dans les access logs). Ils doivent être purgés selon la politique applicable.

---

## 6. Privacy by Design et Privacy by Default

### 6.1 — Privacy by Design

Concept formalisé par Ann Cavoukian (2009), repris à l'article 25 du RGPD. Sept principes, dont **quatre s'adressent à l'architecte** :

1. **Proactivité, pas réactivité** — prévoir les risques avant qu'ils n'arrivent.
2. **Privacy comme paramètre par défaut** — le système est conforme **sans** action de l'utilisateur.
3. **Privacy intégrée à la conception** — pas un patch tardif.
4. **Sécurité de bout en bout** — chiffrement, contrôle d'accès, logs, dès la collecte jusqu'à la suppression.

### 6.2 — Implication architecturale

Quelques choix structurants qui matérialisent Privacy by Design :

- **Modèle de données séparant** clairement les données personnelles des autres (cf. section 3.4).
- **Identifiants techniques** (UUID interne) **distincts** des identifiants métier (email, n° de sécurité sociale). Ne jamais utiliser une donnée personnelle comme clé primaire.
- **Chiffrement at rest** sur toutes les bases contenant des données personnelles. Sur AWS : RDS chiffré, EBS chiffré, S3 SSE.
- **Chiffrement in transit** systématique (TLS, mTLS pour les services internes).
- **Contrôle d'accès minimal** — chaque service ne lit que ce dont il a besoin (moindre privilège, cf. AWS Identity M6).
- **Journalisation des accès** — qui a lu quoi, quand. Indispensable pour les données sensibles.
- **Endpoints d'erasure** considérés comme des **use cases métier** de premier ordre, pas comme des scripts.
- **Anonymisation** des données analytiques avant d'élargir leur diffusion.

### 6.3 — Privacy by Default

Subtilement différent : le système, **dans sa configuration initiale**, ne traite que ce qui est strictement nécessaire. L'utilisateur **n'a pas** à activer la confidentialité — elle est par défaut, on **opt-in** pour partager plus.

**Exemples** :

- Un profil utilisateur est **privé par défaut** ; il devient public sur action explicite.
- Les cookies non essentiels sont **désactivés** tant que l'utilisateur n'a pas consenti.
- Les notifications marketing sont **désactivées** par défaut.
- La géolocalisation est demandée à l'usage, pas à l'installation.

---

## 7. Au-delà du RGPD — quelques mentions utiles

L'architecte qui travaille sur des systèmes internationaux croisera d'autres réglementations. À savoir nommer :

| Régulation                         | Zone                          | Particularité                                                  |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| **RGPD**                           | Union européenne              | Le plus large, base de comparaison.                            |
| **CCPA / CPRA**                    | Californie (USA)              | Droit d'opt-out de la vente de données.                        |
| **HIPAA**                          | États-Unis, santé             | Données médicales, exigences strictes (chiffrement, audit).    |
| **LPD / nLPD**                     | Suisse                        | Proche du RGPD, depuis 2023.                                   |
| **LGPD**                           | Brésil                        | Inspiré du RGPD.                                               |
| **PIPL**                           | Chine                         | Restrictions fortes sur les transferts internationaux.         |
| **PDPA**                           | Singapour, Thaïlande, etc.    | Variations locales.                                            |

**Pour la France** :

- **CNIL** — autorité de régulation, publie des fiches, des référentiels sectoriels (santé, RH, vidéosurveillance, etc.).
- **HDS** (Hébergeur de Données de Santé) — certification obligatoire pour héberger des données de santé en France. Impacte le choix de fournisseur cloud.
- **SecNumCloud** — qualification ANSSI pour les services cloud souverains, souvent exigée par les administrations.

L'architecte n'a pas à connaître ces régulations par cœur — il doit savoir qu'**elles existent** et savoir **quand demander un avis** au DPO ou à un juriste.

---

## 8. Checklist de conformité — version architecte

Une checklist à dérouler en 1 à 2 heures sur un projet existant. Elle ne remplace pas un audit DPO — elle identifie les **trous architecturaux** détectables côté tech.

### 8.1 — Inventaire (à faire d'abord, sinon le reste est inutile)

- [ ] Existe-t-il un **registre des traitements** ? Est-il à jour ?
- [ ] Est-on capable de **lister toutes les bases / tables** qui contiennent des données personnelles ?
- [ ] Pour chaque base : sait-on **quels champs sont personnels** ? Quels champs sont sensibles ?
- [ ] Existe-t-il une **cartographie** des flux de données personnelles entre services ?

### 8.2 — Minimisation et finalités

- [ ] Chaque champ personnel a-t-il une **finalité documentée** ?
- [ ] Existe-t-il des **champs personnels jamais utilisés** ? (Si oui : à supprimer.)
- [ ] Existe-t-il des **finalités** qui réutilisent des données collectées pour autre chose, sans base légale claire ?

### 8.3 — Conservation

- [ ] Existe-t-il une **politique de rétention** documentée ?
- [ ] Cette politique est-elle **implémentée** (jobs de purge, archivage automatique) ?
- [ ] Les **sauvegardes** suivent-elles cette politique (cyclage automatique) ?
- [ ] Existe-t-il un **audit** régulier de l'application des purges ?

### 8.4 — Droits des personnes

- [ ] Y a-t-il un **endpoint ou un mécanisme** pour répondre à un droit d'accès ?
- [ ] Y a-t-il un **process orchestré** pour le droit à l'effacement, qui couvre **toutes** les bases / caches / indices ?
- [ ] L'effacement gère-t-il les **obligations légales** de conservation (factures, etc.) ?
- [ ] Le droit à la **portabilité** est-il couvert (export structuré, format documenté) ?
- [ ] Les **désabonnements** marketing se propagent-ils sur tous les canaux ?

### 8.5 — Sécurité

- [ ] Toutes les bases contenant des données personnelles sont-elles **chiffrées at rest** ?
- [ ] Toutes les communications sont-elles **chiffrées in transit** (TLS) ?
- [ ] Le **contrôle d'accès** suit-il le principe de moindre privilège ?
- [ ] Les **accès aux données sensibles** sont-ils journalisés ?
- [ ] Les **logs applicatifs** évitent-ils de contenir des données personnelles ?
- [ ] Les **identifiants techniques** sont-ils distincts des identifiants métier (pas d'email comme clé primaire) ?

### 8.6 — Sous-traitants

- [ ] La liste des **sous-traitants** (SaaS, cloud) qui traitent des données est-elle à jour ?
- [ ] A-t-on signé des **DPA** (Data Processing Agreements) avec chacun ?
- [ ] Les **transferts hors UE** sont-ils encadrés (clauses contractuelles types, _Data Privacy Framework_, etc.) ?

### 8.7 — Documentation

- [ ] Existe-t-il une **politique de confidentialité** publiée et à jour ?
- [ ] Les **collectes de consentement** sont-elles tracées (date, périmètre, version des CGU) ?
- [ ] Existe-t-il une **procédure** de réponse aux **violations de données** (notification CNIL en 72h) ?

**Score indicatif.** Plus de 5 cases non cochées sur cette checklist = priorité haute à un audit DPO complet. Plus de 10 cases non cochées = risque réglementaire significatif.

---

## 9. Exercices pratiques

### Exercice 1 — Donnée personnelle ? Sensible ? Anonyme ? (≈ 25 min)

Classer chacune des données ci-dessous en : **donnée personnelle**, **donnée sensible**, **donnée pseudonymisée**, **donnée anonymisée**, ou **donnée non personnelle**.

1. Adresse IP `82.124.x.x` stockée dans les access logs.
2. UUID `a4f3-...` généré par le système, sans table de correspondance avec un utilisateur.
3. UUID `a4f3-...` avec table de correspondance dans une base séparée.
4. Statistique agrégée : "12 % des utilisateurs entre 25 et 35 ans utilisent la feature X".
5. Statistique : "Le seul utilisateur de la région X cliqué sur Y" (un seul utilisateur dans la région).
6. Date de naissance.
7. Carte de fidélité d'enseigne.
8. Test sérologique (positif / négatif).
9. Habitudes alimentaires (préférences végétariennes, halal, casher).
10. Identifiant de transaction Stripe.

### Exercice 2 — Architecturer un droit à l'effacement (≈ 60 min)

Soit un système d'e-commerce :

- Base PostgreSQL : tables `users`, `orders`, `addresses`, `payments`, `reviews`, `sessions`.
- Elasticsearch indexe `users` et `reviews` pour la recherche.
- Redis cache `users` (TTL 1h) et `sessions` (TTL 24h).
- Pipeline Kafka envoie chaque commande à un service de facturation (qui stocke dans sa propre base).
- Logs applicatifs centralisés sur CloudWatch, retention 30 jours.
- Sauvegardes PostgreSQL quotidiennes, retention 90 jours.
- Fournisseur email Mailgun (avec liste des destinataires, historique des envois sur 6 mois).

Décrire le **process orchestré** d'effacement d'un utilisateur. Lister explicitement :

- Toutes les **étapes techniques**.
- Les **données conservées légalement** malgré l'effacement (et pourquoi).
- Les **délais** acceptables pour chaque étape.
- Les **points de vigilance** (concurrence, idempotence, traces résiduelles).

Format attendu : 1 page maximum, en bullets ou en pseudo-code.

### Exercice 3 — Auditer une politique de rétention (≈ 45 min)

Soit le tableau de rétention théorique suivant pour une app SaaS RH :

| Table                       | Champs               | Durée prévue       |
| --------------------------- | -------------------- | ------------------ |
| `employees`                 | nom, email, fonction | Vie du contrat     |
| `payslips`                  | salaire, primes      | 5 ans              |
| `recruitment_applications`  | CV, candidatures     | 2 ans              |
| `analytics_events`          | event, user_id, etc. | Sans limite        |
| `connection_logs`           | IP, user_id, date    | 1 an               |

Identifier :

1. Les **lignes problématiques** au regard du RGPD ou des obligations légales françaises.
2. Pour chaque ligne problématique, proposer une **correction**.
3. Une **stratégie technique** pour implémenter ces rétentions (jobs, archivage, anonymisation).

### Exercice 4 — Pseudonymisation correcte (≈ 30 min)

Une équipe affirme avoir "**anonymisé**" un export d'utilisateurs en :

- Supprimant les colonnes `nom` et `email`.
- Hashant la colonne `téléphone` avec SHA-256.
- Conservant la colonne `date_de_naissance`, `code_postal`, `genre`, `pays`.

**Question 1.** L'export est-il vraiment anonymisé ? Justifier en 5 à 10 lignes.

**Question 2.** Proposer trois améliorations pour soit (a) aller vers une **pseudonymisation propre**, soit (b) aller vers une **anonymisation réelle**, selon la finalité.

### Exercice 5 — Checklist sur un projet réel (≈ 90 min)

Choisir un projet existant (perso, professionnel, open-source) et dérouler la **checklist** de la section 8.

Produire un **rapport** d'une page :

- Score global (nombre de cases cochées / total).
- Top 3 des **risques majeurs** identifiés.
- Top 3 des **chantiers prioritaires** à lancer.

Si le projet est purement personnel et sans donnée personnelle réelle (ex : un site de blog statique sans commentaires), choisir un autre projet ou en imaginer un crédible.

---

## 10. Mini-défi de synthèse — audit de conformité d'un projet existant (≈ 3 h)

Reprendre l'exercice 5 et en faire un **audit complet** de 2 à 3 pages, structuré comme un livrable destiné au responsable produit ou au DPO :

1. **Présentation du projet** (5 lignes) — quoi, qui, quel volume.
2. **Cartographie des données personnelles** — tableau des tables / champs / catégories (personnel, sensible, etc.) / finalités / bases légales.
3. **Résultats de la checklist** (section 8) — case par case, avec un statut (✅ / ⚠️ / ❌) et un commentaire d'une ligne.
4. **Top 3 risques majeurs** — pour chacun : description, impact potentiel (amende, perte de confiance, etc.), criticité (haute / moyenne / basse).
5. **Plan de remédiation** — pour chaque risque : action proposée, effort estimé (jours / semaines), responsable suggéré.
6. **Points à clarifier avec le DPO** — questions que l'architecte ne peut pas trancher seul.

**Critères de validation.**

- Le document tient sur **3 pages maximum**.
- Aucune affirmation type "tout va bien" sans preuve.
- Les risques sont **chiffrés** quand c'est possible (volume de données, nombre d'utilisateurs concernés).
- Au moins **deux** points sont identifiés comme nécessitant une expertise externe.

---

## 11. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant cite les **7 principes RGPD** et identifie ceux qui impactent l'architecture.
- [ ] Il distingue **pseudonymisation** et **anonymisation** sans hésiter et illustre par un exemple.
- [ ] Il sait traduire les **6 droits techniques** des personnes en **mécanismes d'architecture**.
- [ ] Il peut concevoir une **politique de rétention** réaliste et son **implémentation technique**.
- [ ] Il a déroulé la **checklist** de la section 8 sur un projet réel et produit un audit de 3 pages.
- [ ] Il sait quand **demander un DPO** plutôt que trancher seul.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : connaissance de la **réglementation générale de la protection des données** : conservation, anonymisation.
- **N1** (consolidé) : capacité à mettre en place une **matrice de droits** (en lien avec les droits des personnes et le moindre privilège).
- Préfigure **N3** : conseiller sur la **stratégie de séparation des environnements** (les données personnelles ne migrent pas en dev / staging sans pseudonymisation).

---

## 12. Ressources complémentaires

### Texte et autorités

- **Règlement (UE) 2016/679 — RGPD** — texte officiel. [eur-lex.europa.eu](https://eur-lex.europa.eu/eli/reg/2016/679/oj). Lecture intégrale facultative ; les articles **5, 9, 15-22, 25, 32** suffisent comme socle d'architecte.
- **CNIL** — [cnil.fr](https://www.cnil.fr). Fiches sectorielles, guide _Sécurité des données personnelles_, modèle de registre des traitements.
- **EDPB** (European Data Protection Board) — guidelines harmonisées au niveau européen.

### Architecture & conception

- **CNIL** — _Guide RGPD du développeur_. Pratique et concret, gratuit. [cnil.fr/fr/la-cnil-publie-un-nouveau-guide-rgpd-pour-les-developpeurs](https://www.cnil.fr/).
- **CNIL** — _Méthodologie d'analyse d'impact (PIA)_. Outil et méthode pour le DPIA, obligatoire dans certains cas.
- **Ann Cavoukian** — _Privacy by Design — The 7 Foundational Principles_ (2009, PDF court). Référence du concept.
- **Latanya Sweeney** — _Simple Demographics Often Identify People Uniquely_ (2000). Étude qui démontre la difficulté de l'anonymisation réelle.
- **NIST** — _De-Identification of Personal Information_ (NISTIR 8053, 2015). Méthodes techniques d'anonymisation et de pseudonymisation.

### Mise en œuvre technique

- **OWASP** — _Privacy Risks_, _Cheat Sheet Series_. [owasp.org](https://owasp.org). Recommandations techniques sur chiffrement, gestion des logs, etc.
- **Documentation AWS** — _GDPR Compliance on AWS_. [aws.amazon.com/compliance/gdpr-center](https://aws.amazon.com/compliance/gdpr-center/). Pratiquement applicable aux trois grands cloud providers, par transposition.
- **Documentation HashiCorp Vault** — pour la gestion des secrets et la pseudonymisation par token (utile en architecture moderne).

### Approfondissement

- **Bruce Schneier** — _Data and Goliath_ (2015). Pour la culture générale de l'architecte sur l'écosystème de la donnée personnelle.
- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — item N2 mentionnant la réglementation et la conservation des données.
