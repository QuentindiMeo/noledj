# M6 — Optimisation des coûts

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Raisonner sur le **coût total de possession** (TCO) d'une architecture, au-delà de la facture cloud mensuelle.
- Identifier les **principaux postes de coût** d'un système et reconnaître les **trois ou quatre leviers** qui pèsent vraiment.
- Conduire une **revue de coût** d'une infrastructure existante et proposer des **alternatives moins coûteuses** sans dégrader la valeur métier.
- Distinguer les **économies réelles** des **fausses bonnes idées** (optimisations qui transfèrent le coût ailleurs).
- Mettre en place une **culture FinOps** légère : visibilité des coûts, attribution par feature ou par équipe, alerting sur dérive.
- Rédiger le **dossier d'architecture final** (mini-projet du parcours) en intégrant l'axe coût aux autres trade-offs.

## Durée estimée

1 jour pour le module + 3 à 5 jours pour le mini-projet du parcours.

## Pré-requis

- M1 à M5 (vocabulaire architecture, trade-offs, CQRS, décisions techniques, régulation).
- Notions de base sur les services cloud (le parcours AWS approfondit ; ce module reste cloud-agnostique).
- Capacité à lire une facture cloud (au moins en survol).

---

## 1. Pourquoi l'architecte doit penser coût

### Le coût n'est pas un sujet "ops"

Trois croyances erronées encore courantes :

1. _"Le coût, c'est le problème des ops / du DAF."_ — Faux. Une décision d'architecture mauvaise au démarrage produit une facture qui **double tous les six mois**. Aucune équipe ops ne peut rattraper une mauvaise architecture.
2. _"On optimisera plus tard quand on aura du volume."_ — En pratique, plus tard signifie jamais : refactorer une architecture coûteuse demande des mois et reste impopulaire en face de nouvelles features.
3. _"Le cloud, ça coûte ce que ça coûte."_ — Une architecture cloud peut coûter **5× à 50×** ce qu'elle devrait, sans bénéfice métier supplémentaire. C'est l'écart entre une architecture bien pensée et une architecture par accumulation.

### L'analogie de la maison

**Analogie.** Une maison. Le **prix d'achat** est ce qu'on voit dans l'annonce. Mais la **vraie facture** comprend les taxes, l'assurance, l'entretien, le chauffage, l'eau, et le coût des travaux qu'on n'a pas anticipés. Une maison "abordable" mal isolée peut coûter le double sur 10 ans qu'une maison plus chère bien construite.

Pareil pour une architecture : le **prix d'exécution mensuel** n'est qu'une partie. Pour évaluer honnêtement le coût, il faut intégrer **tout** ce que l'architecture impose : développement, exploitation, support, formation, dette technique.

### Pourquoi maintenant

Sur les neuf premiers mois du projet Noledj :

- **M2** a montré que chaque architecture a un coût d'entrée et un coût récurrent.
- **M4** a montré que les choix techniques se justifient par des contraintes, dont le coût.
- Les modules **AWS** (à venir dans le parcours) outillent concrètement le coût service par service.

Ce module relie tout cela : comment **arbitrer le coût** en architecte, sans rentrer dans le détail de chaque service cloud.

---

## 2. Total Cost of Ownership — au-delà de la facture cloud

### 2.1 — Les sept postes du TCO

Le **TCO** (_Total Cost of Ownership_) d'un système se décompose typiquement en sept postes :

| Poste                                | Exemple                                            | Visibilité              |
| ------------------------------------ | -------------------------------------------------- | ----------------------- |
| **1. Infrastructure**                | Compute, stockage, réseau, bases managées          | Très visible (facture)  |
| **2. Logiciel et licences**          | Licences propriétaires, SaaS externes              | Visible (factures)      |
| **3. Développement initial**         | Salaires des devs sur la phase de build            | Visible                 |
| **4. Exploitation / maintenance**    | Ops, astreintes, support, patches sécurité         | Souvent sous-estimée    |
| **5. Évolutions**                    | Coût marginal d'ajouter une feature                | Invisible jusqu'à mesure |
| **6. Migration / sortie**            | Coût de partir d'un fournisseur, refonte           | Cachée jusqu'à la sortie |
| **7. Coûts cachés**                  | Formations, recrutement spécialisé, dette technique | Quasi-invisible         |

L'erreur fondamentale est de réduire le TCO au **poste 1** (la facture cloud). Les postes 4 à 7 représentent souvent **plus de la moitié** du coût réel sur la durée de vie d'un système.

### 2.2 — L'horizon temporel change tout

Une architecture A coûte 10 000 €/mois en infra mais 1 jour de dev pour ajouter une feature.
Une architecture B coûte 3 000 €/mois en infra mais 5 jours de dev par feature.

Sur 5 ans, avec 50 features développées :

- A : 10 000 × 60 mois + 50 × 1 jour × 600 € = **630 000 €**.
- B : 3 000 × 60 mois + 50 × 5 jours × 600 € = **330 000 €**.

B gagne. Mais si on développe 200 features :

- A : 600 000 + 120 000 = **720 000 €**.
- B : 180 000 + 600 000 = **780 000 €**.

A gagne. **Le facteur clé n'est pas la facture cloud, c'est la cadence d'évolution**.

**Règle.** Avant d'optimiser le compute, mesurer le **volume d'évolution** prévu. Si c'est un produit en croissance, optimiser le **temps de développement** prime sur le coût d'infrastructure.

### 2.3 — Le coût caché du "moins cher au démarrage"

Trois pièges classiques d'une optimisation prématurée du poste 1 :

- **Self-hosting d'une base** au lieu d'un service managé. Économie de 200 €/mois en infra, perte de 5 jours/an en patches et backups → 3 000 € de salaires perdus.
- **Stack hétérogène** pour économiser sur certains composants. Chaque techno supplémentaire coûte 1 à 3 mois d'onboarding par nouveau dev.
- **Architecture serverless agressive** (Lambda + DynamoDB) sans usage qui le justifie. Coût initial très bas, mais difficulté à debugger, dette de portabilité, lock-in fort.

L'économie sur le poste 1 doit se mesurer **net** des coûts induits sur les postes 4 à 7.

---

## 3. Les grandes catégories de coût cloud

Sans rentrer dans le détail des services AWS (à venir dans le parcours), comprendre les **quatre familles** suffit pour la plupart des arbitrages d'architecte.

### 3.1 — Compute

Tout ce qui exécute du code : VM, conteneurs, fonctions serverless.

- **VM dédiées** (EC2, Compute Engine) — coût horaire, paiement même à l'arrêt si on ne stoppe pas.
- **Conteneurs managés** (ECS Fargate, Cloud Run, Container Apps) — coût pendant l'exécution, scaling élastique.
- **Fonctions serverless** (Lambda, Cloud Functions) — coût à l'invocation + durée. Très bas pour un usage rare, **plus cher** que des VM pour un usage continu.
- **Bare metal** — pour des besoins très spécifiques (performance, conformité).

**Coût type d'erreur.** Laisser tourner des environnements de dev/staging 24/7 alors qu'ils sont utilisés 40h/semaine = **3,5×** le coût nécessaire.

### 3.2 — Stockage

Tout ce qui persiste : disques, bases, blob storage.

- **Disque attaché** (EBS, Persistent Disk) — coût au Go provisionné, indépendant du remplissage.
- **Blob storage** (S3, Cloud Storage, Blob Storage) — coût au Go stocké + au nombre d'opérations + à la sortie réseau.
- **Bases managées** (RDS, Aurora, Cosmos DB, DynamoDB) — coût mixte (compute + stockage + I/O).
- **Backups et archives** — couches dédiées (S3 Glacier, Archive Storage), coût stockage très bas mais récupération payante et lente.

**Coût type d'erreur.** Conserver tous les logs et toutes les données brutes en stockage chaud, pendant 5 ans, sans politique de lifecycle. Sur un volume modeste, ça reste discret ; sur un volume conséquent, ça représente l'essentiel de la facture stockage.

### 3.3 — Réseau

Coût souvent **opaque** mais structurellement important.

- **Trafic sortant internet** (egress) — le plus cher, plusieurs cents par Go selon les régions.
- **Trafic inter-régions** — souvent payant des deux côtés (sortant + entrant).
- **Trafic inter-AZ** dans une même région — payant chez AWS, gratuit chez certains providers.
- **NAT Gateway** — coût horaire + coût par Go traité, parfois oublié.
- **VPC endpoints** — payants, mais souvent **moins chers** qu'un NAT Gateway pour les flux vers les services AWS.
- **CDN** (CloudFront, Cloud CDN) — réduit le coût egress du backend en mettant le contenu en cache au plus près des utilisateurs.

**Coût type d'erreur.** Architecture multi-région naïve avec réplication continue entre régions sans avoir besoin du DR multi-région.

### 3.4 — Services managés et SaaS

Le plus opaque des quatre. Chaque service a sa propre logique tarifaire.

- **Bases managées** — typiquement 2× à 5× le coût d'une VM équivalente, mais incluent backups, HA, monitoring, patches.
- **Search managé** (OpenSearch, Algolia) — coût mensuel fixe + coûts d'index et de requêtes.
- **Files managées** (SQS, SNS, Kinesis) — coût à la requête, parfois faramineux si le débit est élevé.
- **Observabilité** (CloudWatch, Datadog, Honeycomb) — **piège majeur** : facturation à l'événement ingéré.
- **SaaS B2B** (Stripe, SendGrid, Twilio, Auth0) — facture séparée, à intégrer dans le TCO.

**Coût type d'erreur.** Datadog ou un équivalent en mode "tout est observé" sur un système non rationalisé peut coûter **plus cher que l'infra qu'il observe**.

---

## 4. Les leviers d'optimisation — par ordre d'impact

Tous les leviers ne se valent pas. Voici l'ordre dans lequel on les explore quand on revoit un système.

### 4.1 — Levier 1 : supprimer ce qui n'est pas utilisé

Le plus rentable, le plus oublié. Toute architecture mature accumule :

- Des **environnements** qui ne servent plus (anciens staging, démos clients passés).
- Des **services** déployés pour une migration qui n'a jamais eu lieu.
- Des **bases de données** secondaires qu'on n'ose plus toucher.
- Des **snapshots** et **volumes orphelins** datant de tests anciens.
- Des **load balancers** sans cible saine.
- Des **adresses IP élastiques** non attachées (souvent payantes à l'inactivité).

**Méthode** : passer une journée par trimestre à faire l'inventaire des ressources et **supprimer ce qui n'est pas attribué** à un système actif.

Gain typique sur un compte non audité depuis un an : 10 à 30 % de la facture totale.

### 4.2 — Levier 2 : right-sizing

Beaucoup de ressources sont **sur-dimensionnées**. Les raisons :

- Dimensionnement initial conservateur.
- Pic ponctuel ancien qui a justifié l'agrandissement, jamais redescendu.
- Recommandation par défaut du provider (souvent généreuse).
- Peur du **risque** côté ops.

**Méthode** : récupérer les métriques CPU, RAM, I/O, network sur 30 jours. Identifier les ressources où :

- CPU moyen < 20 % et p95 < 50 %.
- RAM moyenne < 30 %.
- I/O presque toujours à zéro.

Redimensionner par paliers (passer à la classe inférieure, puis observer). Gain typique : 20 à 40 % sur les ressources sur-dimensionnées.

### 4.3 — Levier 3 : modèles d'achat

Sur les fournisseurs cloud, le **paiement à la demande** est le mode le plus cher. Plusieurs alternatives :

- **Reserved Instances / Committed Use** — engagement 1 ou 3 ans contre 30 à 60 % de remise. Adapté aux workloads **stables et identifiés**.
- **Savings Plans** — engagement en valeur (dollars/heure) plutôt qu'en type d'instance. Plus flexible.
- **Spot Instances** — capacité interruptible, jusqu'à 90 % de remise. Adapté aux workloads **tolérants à l'interruption** (batch, CI, traitements rejouables).

**Règle**. Une fois la base stable, **couvrir 70 à 80 % de la consommation prévisible** en Reserved / Savings Plans. Laisser les pics et l'inconnu en on-demand.

### 4.4 — Levier 4 : architecture événementielle vs polling

Le **polling actif** (un service qui interroge un autre toutes les N secondes) consomme :

- Du compute (le code de polling tourne).
- Du réseau (chaque requête).
- Souvent des appels API payants (DynamoDB, etc.).

Le passage à un **modèle événementiel** (le service réagit aux events, ne polle plus) peut réduire **drastiquement** le coût pour la même fonctionnalité métier.

Exemple typique : un job qui scrute une table DynamoDB toutes les 5 secondes pour détecter de nouveaux items → bascule sur DynamoDB Streams + Lambda déclenchée par event. Économie possible : 90 % sur ce flux.

### 4.5 — Levier 5 : lifecycle du stockage

Les données ont une **valeur qui décroît** avec le temps. La plupart des stockages cloud offrent des **classes** :

- **Chaud** — accès fréquent, coût stockage élevé, récupération gratuite et rapide.
- **Tiède** — accès rare, coût stockage modéré.
- **Froid / Archive** — accès très rare, coût stockage très bas, récupération payante et lente (de quelques minutes à plusieurs heures).

**Méthode** : pour chaque catégorie de donnée, définir une **politique de lifecycle automatique** :

```
0 - 30 jours    : chaud  (accès fréquent)
31 - 180 jours  : tiède  (accès rare, lecture audit)
181 jours - 7 ans : froid (conservation légale)
> 7 ans         : supprimer (cf. M5 — rétention)
```

Gain typique sur un volume mature : 50 à 80 % sur le poste stockage.

### 4.6 — Levier 6 : managed vs self-hosted

Choix structurant. Règle générale :

- Pour **les services standards** (PostgreSQL, Redis, Elasticsearch) avec une charge stable et une équipe ops compétente → **self-hosted** peut être 2 à 4× moins cher.
- Pour **une petite équipe sans DBA** → **managed** est presque toujours moins cher en TCO, malgré la facture supérieure (poste 4 du TCO dominé par les salaires).

Le calcul doit inclure :

- Salaires ops + astreintes.
- Coût d'un incident (downtime, perte de données).
- Coût des patches et upgrades.
- Coût de la formation et du recrutement.

### 4.7 — Levier 7 : environnements non-prod

Dev, staging, QA, sandbox, démos. Ces environnements ont rarement besoin :

- De tourner 24/7 (mettre en veille la nuit et le week-end = -65 % du coût compute).
- D'être en haute disponibilité (single AZ, pas de réplica).
- D'avoir des classes d'instance équivalentes à la prod.
- De conserver des données longues durées (rétention courte sur les non-prod).

Gain typique : 50 à 80 % sur le coût des environnements non-prod.

### 4.8 — Levier 8 : choisir le bon service pour le bon usage

Un même besoin peut être servi par plusieurs services à des coûts radicalement différents.

Exemples :

- File de messages : Kinesis vs SQS vs Kafka self-hosted vs EventBridge. Selon le débit et le pattern d'accès, le rapport peut être de 1 à 20.
- Stockage de logs : CloudWatch Logs vs S3 + Athena vs Loki self-hosted. Sur un volume conséquent, S3 + Athena est typiquement **5 à 10× moins cher** que CloudWatch Logs.
- Search : OpenSearch managé vs Algolia vs Meilisearch self-hosted vs PostgreSQL full-text. Tous viables selon le contexte.

**Méthode** : pour chaque service "par défaut" choisi, vérifier si **une alternative** ne servirait pas le même besoin pour 30 à 80 % du coût.

### 4.9 — Levier 9 : architecture sans cache vs avec cache

Les **caches** (Redis, Memcached, CloudFront, en-tête HTTP) déplacent la charge des bases et des compute coûteux vers du cache bon marché.

Sur une requête de read intensive :

- Sans cache : chaque requête frappe la base, qui doit être dimensionnée pour le pic.
- Avec cache (hit ratio 95 %) : la base est dimensionnée pour 5 % du trafic, économie sur la taille de l'instance.

À pondérer par le coût du cache et la complexité d'invalidation. Cf. POO M5 (DIP) et M3 (CQRS) — les architectures bien découpées rendent l'ajout d'un cache transparent.

### 4.10 — Levier 10 : observabilité raisonnée

L'observabilité est devenue le **deuxième ou troisième poste** de coût dans beaucoup d'architectures modernes. Quelques règles :

- **Sampling** des logs et traces — on n'a pas besoin de tout indexer.
- **Niveau de log adaptatif** — `INFO` en non-prod, `WARN` en prod, ramener à `DEBUG` à la demande.
- **Rétention courte** par défaut, longue uniquement sur ce qui a une valeur d'audit.
- **Outils self-hosted** (Grafana + Loki + Tempo) à comparer aux SaaS quand le volume est conséquent.

Gain typique : 40 à 70 % sur la facture observabilité.

---

## 5. Fausses bonnes idées — les économies illusoires

### 5.1 — "On reprend tout self-hosted"

Sortir d'un cloud managé pour économiser semble logique. Calcul à faire :

- Coût des serveurs ou colocation.
- Salaires d'au moins **un ETP DBA / SRE** dédié.
- Coût des incidents non maîtrisés en interne.
- Coût d'opportunité (l'ingénieur qui fait de l'ops ne fait pas de feature).

En dessous de **5 millions d'euros par an** de facture cloud, le self-hosting est **rarement** rentable.

### 5.2 — "On scale vertically en mettant tout sur une grosse instance"

Une grosse instance coûte généralement **plus** que la somme de petites instances équivalentes. Surtout, elle ne tolère pas la panne.

### 5.3 — "On supprime les backups, on a un snapshot par mois"

Vrai gain de quelques euros, vraie perte de garantie. Une perte de données coûte **toujours** plus que des backups.

### 5.4 — "On désactive le monitoring, ça coûte cher"

Sans monitoring, on **passe à côté** de pannes longues, de dérives de coût silencieuses, de problèmes de performance. La facture finale est plus salée. Garder du monitoring **bien dimensionné** plutôt que de tout couper.

### 5.5 — "On migre sur un cloud moins cher"

Migrer entre clouds coûte typiquement 6 à 18 mois d'engineering, avec un risque opérationnel élevé. Les économies marginales sur la facture compute sont rarement à la hauteur. Une migration cloud se justifie par des **raisons structurantes** (conformité, dépendance, stratégie), pas par une économie de 15 %.

### 5.6 — "On passe en serverless, c'est gratuit"

Le serverless est très économique pour les workloads **rares ou imprévisibles**. Sur des workloads **continus** et **prévisibles**, il peut coûter **5 à 10×** plus cher qu'une VM équivalente. Faire le calcul avant de migrer.

---

## 6. La culture FinOps — version architecte

**FinOps** est la discipline qui aligne finance, engineering et business sur la gestion des coûts cloud. Pour un architecte, retenir trois pratiques :

### 6.1 — Visibilité

- **Tags / labels** systématiques sur toutes les ressources : `team`, `env`, `feature`, `cost_center`.
- **Dashboard mensuel** de la facture, par équipe, par feature.
- **Alerting** sur dérive : un service dont la facture grimpe de 30 % en un mois doit faire lever un signal.

### 6.2 — Attribution

- Chaque équipe / feature a sa **part de la facture** clairement identifiée.
- Les **discussions de roadmap** intègrent le coût d'exploitation prévisible.
- Le **coût marginal** d'une nouvelle feature est estimé avant lancement.

### 6.3 — Itération

- Une **revue de coût** trimestrielle systématique (cf. exercice 5).
- Une **boucle de feedback** entre équipes ops et équipes produit.
- Des **objectifs de coût par feature** quand cela a du sens (ex : "le coût d'inférence par utilisateur ne doit pas dépasser 0,02 €").

FinOps n'est pas un projet ; c'est une discipline continue. Comme la sécurité, son absence se paye à terme.

---

## 7. Coût vs autres axes — arbitrages

Le coût n'est pas seul. Trois arbitrages structurants à conscientiser :

### 7.1 — Coût vs performance

Une architecture peut être 2× plus rapide pour 3× le prix. Question : **les utilisateurs payent-ils pour la différence** ? Sur un site marchand, une latence p95 sous 200 ms convertit mieux qu'une latence à 800 ms — payer plus peut se justifier. Sur un outil interne d'admin, c'est rarement le cas.

### 7.2 — Coût vs fiabilité

Le multi-AZ double approximativement le coût compute. Une stratégie multi-région le quadruple. Question : **quel niveau de SLA** vise-t-on ? Un système à 99,5 % SLA n'a pas besoin du multi-région ; un système financier critique à 99,99 % oui.

### 7.3 — Coût vs vitesse de livraison

Des outils managés (Vercel, Netlify, Render, Supabase) accélèrent fortement la livraison mais coûtent plus cher que l'équivalent self-hosted. Question : **a-t-on besoin de gagner les semaines d'engineering** ? En startup, oui. En entreprise mature, moins.

**Règle.** Toute optimisation de coût doit nommer **ce qu'elle sacrifie** sur les autres axes. Si rien n'est sacrifié, l'optimisation aurait dû être faite dès le départ — il y avait du gaspillage pur.

---

## 8. Méthode de revue de coût d'une infra

Une revue de coût d'une infrastructure existante se conduit en **cinq étapes**, idéalement en une journée.

### Étape 1 — Cartographier

Lister tous les services présents dans la facture, avec leur **part du total** :

```
Service                     Coût mensuel     Part
EC2                         3 200 €          32 %
RDS                         2 100 €          21 %
CloudWatch                  1 400 €          14 %
S3                          1 100 €          11 %
NAT Gateway                   800 €           8 %
Data transfer                 600 €           6 %
ECR                           400 €           4 %
Autre                         400 €           4 %
Total                       10 000 €         100 %
```

**Règle de Pareto.** Les 3 à 5 premiers postes représentent 70 à 90 % de la facture. Concentrer l'effort là.

### Étape 2 — Détecter les anomalies

Pour chaque poste majeur, vérifier :

- Existe-t-il des **ressources orphelines** non attribuées à un système actif ?
- Le **dimensionnement** correspond-il à l'usage mesuré ?
- Existe-t-il des **doublons** (deux services qui font le même travail) ?
- Les **environnements non-prod** consomment-ils plus que la prod ?

### Étape 3 — Identifier les leviers

Pour chaque anomalie, identifier un **levier** parmi ceux de la section 4. Estimer le **gain potentiel** en pourcentage du poste.

### Étape 4 — Prioriser

Classer les actions par **ratio gain / effort** :

- Quick wins (gain élevé, effort < 1 jour) — à faire dans la semaine.
- Chantiers structurels (gain élevé, effort > 1 mois) — à planifier dans le trimestre.
- Optimisations marginales — à laisser sauf si tout le reste est fait.

### Étape 5 — Mesurer

Ne pas se contenter d'agir : **mesurer** l'effet réel sur la facture le mois suivant. Une optimisation qui ne se voit pas n'a probablement pas eu lieu (ou a été compensée par une dérive ailleurs).

---

## 9. Exercices pratiques

### Exercice 1 — Calculer un TCO sur 3 ans (≈ 45 min)

Soit deux architectures proposées pour le même service :

**Option A — Managé serverless.** Lambda + DynamoDB + API Gateway. Facture cloud estimée à 1 200 €/mois. Aucun ops dédié. Vitesse de livraison : 5 jours par feature.

**Option B — Conteneurs sur Kubernetes self-hosted.** EKS + PostgreSQL self-hosted + Redis self-hosted. Facture cloud 500 €/mois. Un mi-temps SRE dédié (= 2 500 €/mois). Vitesse : 7 jours par feature.

Sur 3 ans, avec 8 features livrées par trimestre (96 features total). Salaire dev moyen : 600 €/jour.

Calculer le **TCO sur 3 ans** des deux options. Quel est le seuil de vitesse de livraison pour lequel l'option B devient préférable ?

### Exercice 2 — Identifier les leviers sur une facture (≈ 60 min)

Une équipe vient avec la facture suivante :

| Service                          | Coût mensuel  |
| -------------------------------- | ------------- |
| EC2 (production)                 | 4 000 €       |
| EC2 (dev + staging 24/7)         | 2 500 €       |
| RDS PostgreSQL multi-AZ          | 3 000 €       |
| CloudWatch Logs (rétention 5 ans) | 2 200 €       |
| NAT Gateway (1 par AZ × 3)       | 900 €         |
| S3 (logs bruts, sans lifecycle)  | 800 €         |
| Data transfer egress             | 1 200 €       |
| Adresses IP élastiques non attachées | 150 €     |
| Snapshots EBS orphelins (depuis 18 mois) | 200 € |
| Total                            | 14 950 €      |

Identifier au moins **6 leviers** d'optimisation, avec pour chacun :

- Le levier (cf. section 4).
- Le gain estimé en € / mois.
- L'effort estimé (heures / jours).
- Le risque éventuel.

**Critère de réussite.** Au moins **3 quick wins** (effort < 1 jour, gain > 200 €/mois) identifiés.

### Exercice 3 — Repérer les fausses bonnes idées (≈ 30 min)

Pour chaque proposition, dire si l'économie est **réelle**, **illusoire** ou **dépendante du contexte**. Justifier.

1. _"On migre toute notre DB RDS en self-hosted PostgreSQL pour économiser 1 800 €/mois."_ (Équipe : 5 devs, pas de DBA.)
2. _"On désactive les backups quotidiens, on garde seulement un snapshot mensuel."_
3. _"On passe les environnements de dev et staging en arrêt automatique le soir et le week-end."_
4. _"On migre de CloudWatch Logs vers S3 + Athena pour les logs applicatifs."_
5. _"On réécrit tout en Lambda + DynamoDB pour ne plus payer EC2 24/7."_ (App qui sert 5 000 utilisateurs / jour en continu.)
6. _"On désactive le monitoring sur les environnements de dev."_
7. _"On passe sur un cloud moins cher en Europe de l'Est."_ (Équipe française, pas de besoin réglementaire spécifique.)

### Exercice 4 — Cycle de vie d'un type de donnée (≈ 30 min)

Soit une plateforme d'analyse vidéo. Chaque vidéo générée par l'utilisateur produit :

- Le fichier source MP4 (≈ 200 Mo en moyenne).
- Une version transcodée HD (≈ 80 Mo).
- Une version transcodée mobile (≈ 30 Mo).
- Un thumbnail JPG (≈ 200 Ko).
- Un fichier de métadonnées JSON (≈ 5 Ko).

Profil d'accès observé : 80 % des vues d'une vidéo se font dans les 7 jours suivant sa publication. Les vidéos de plus de 6 mois ont moins de 1 % des vues totales.

Concevoir une **politique de lifecycle** pour chaque type d'asset, en jouant sur les classes de stockage (chaud / tiède / froid) et les durées de transition. Estimer en ordre de grandeur l'économie par rapport à un stockage "tout chaud pendant 5 ans".

### Exercice 5 — Mini-revue de coût sur projet réel (≈ 60 min)

Prendre un projet personnel ou un projet sur lequel on a de la visibilité côté coût (compte AWS perso, projet open-source avec un budget public, simulation). Dérouler la méthode de la **section 8** :

1. Cartographier la facture (top 5 postes).
2. Identifier 3 à 5 anomalies.
3. Pour chacune, proposer un levier et un gain estimé.
4. Prioriser en quick wins / chantiers / marginaux.
5. Définir une **métrique** qui permettra de mesurer le succès dans 30 jours.

Format : 1 page, structuré comme une note interne.

---

## 10. Mini-projet final du parcours — dossier d'architecture (≈ 3 à 5 jours)

Ce mini-projet est le **livrable de synthèse** de l'ensemble du parcours **Architecture Logicielle**. Il mobilise M1 (vocabulaire), M2 (trade-offs), M3 (CQRS), M4 (décisions techniques + ADR), M5 (régulation), et M6 (coûts).

### 10.1 — Choix du cas d'usage

Trois cas possibles. Choisir celui qui parle le plus, ou en proposer un proche de son contexte professionnel :

**Cas 1 — Plateforme de e-learning interne pour 5 000 employés.** Catalogue de 200 formations vidéo, suivi de progression, certifications, génération de rapports RH. Pic de connexions le lundi matin et le mois de la rentrée. Données personnelles (parcours pro, évaluations). Budget cible : 4 000 €/mois.

**Cas 2 — Marketplace artisanale niche.** Plateforme de mise en relation entre artisans et particuliers (devis, paiement, avis). 500 artisans actifs, 50 000 visiteurs / mois. Données de paiement et données nominatives. Budget cible : 2 000 €/mois.

**Cas 3 — Application de suivi santé pour cabinet médical.** Cabinet de 15 médecins suivant 8 000 patients. Dossier médical, ordonnances, prise de rendez-vous, téléconsultation. Hébergement HDS obligatoire. Budget cible : non plafonné mais à justifier.

### 10.2 — Livrable attendu

Un **dossier d'architecture** de **8 à 12 pages**, structuré comme suit :

#### Section 1 — Contexte et périmètre (1 page)

- Description du cas d'usage.
- Acteurs concernés (utilisateurs internes, externes, administrateurs).
- Contraintes connues (techniques, réglementaires, budgétaires, temporelles).
- Hypothèses non-négociables.

#### Section 2 — Options d'architecture (2 à 3 pages)

Proposer **deux à trois options** structurellement différentes :

- Option A — typiquement la plus simple (monolithe modulaire, stack mainstream).
- Option B — alternative qui privilégie un axe (souvent scalabilité, ou time-to-market).
- (Option C — optionnelle, alternative radicale.)

Pour chaque option, décrire :

- L'architecture en quelques diagrammes (1 schéma global + 1 zoom sur un point clé).
- Le type d'architecture (au sens M1 : n-tier, en couche, hexagonale, microservice — souvent une combinaison).
- Le SGBD et les choix techniques principaux (au sens M4).
- Les trade-offs sur les quatre axes (couplage, complexité op., TTM, coût) au sens M2.

#### Section 3 — Conformité données (1 page)

- Cartographie des données personnelles et sensibles (au sens M5).
- Choix structurants liés à la régulation (chiffrement, anonymisation, rétention).
- Cas particuliers du cas d'usage (HDS pour le cas 3, PCI-DSS pour les paiements du cas 2, etc.).

#### Section 4 — Estimation des coûts (2 pages)

Pour chaque option :

- TCO sur **3 ans**, ventilé par les 7 postes (cf. section 2.1).
- Hypothèses de volume et de croissance.
- Identification des **3 principaux postes de coût** et des leviers d'optimisation associés.

Présenter sous forme de tableau comparatif.

#### Section 5 — Risques (1 page)

Top 5 des risques par option :

- Risque (description en une phrase).
- Probabilité (faible / moyenne / élevée).
- Impact (faible / moyen / élevé).
- Plan de mitigation (1 à 2 lignes).

#### Section 6 — Recommandation (1 page)

- Option recommandée.
- Justification structurée par les **quatre axes** (couplage, complexité op., TTM, coût) + les axes spécifiques (conformité, risques).
- Compromis assumés.
- Conditions de réévaluation (chiffrées ou datées).

#### Section 7 — Décisions structurantes (1 à 2 pages)

Produire **2 à 3 ADR** d'une page chacun pour les décisions les plus structurantes (typiquement : choix d'architecture macro, choix de SGBD, et un troisième pertinent selon le cas).

Format : selon la section 6 du M4.

### 10.3 — Critères de validation

Le dossier est validé lorsque :

- [ ] Toutes les sections sont présentes et tiennent dans les limites de pages indiquées.
- [ ] Au moins **deux options** sont proposées et comparées sérieusement (pas une option de paille).
- [ ] Le TCO est calculé sur **3 ans** et inclut au moins **5 des 7 postes**.
- [ ] La **conformité données** est traitée — pas uniquement mentionnée.
- [ ] Au moins **2 ADR** complets et numérotés accompagnent le dossier.
- [ ] La recommandation explicite ses **compromis** et ses **conditions de réévaluation**.
- [ ] Le dossier est **lisible** par un commanditaire non-technique (chef de produit, direction).

### 10.4 — Modes d'usage

Le dossier peut être consommé de trois manières :

- **Vue exécutive** — sections 1, 6 et 7 (recommandation et ADR) pour un sponsor non-technique.
- **Vue architecte** — l'intégralité, pour le pair qui reprendra le projet.
- **Vue ops / SRE** — sections 2, 4, 5 (architecture, coût, risques) pour planifier la mise en œuvre.

---

## 11. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant raisonne en **TCO** plutôt qu'en facture cloud isolée.
- [ ] Il identifie les **3 ou 4 leviers** qui pèsent vraiment sur une facture donnée et sait les prioriser.
- [ ] Il distingue les **vraies économies** des **fausses bonnes idées**.
- [ ] Il a conduit une **revue de coût** sur une infrastructure (exercice 5).
- [ ] Il a produit le **dossier d'architecture final** (mini-projet, section 10).
- [ ] Il sait quand le coût **doit céder le pas** à la performance, à la fiabilité ou à la vitesse de livraison.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : capacité à proposer des **alternatives** permettant de **réduire les coûts** d'une architecture.
- **N3** (amorce) : conseiller sur l'**utilisation du cloud ou du on-premise** selon le contexte — la grille du levier 6 (managed vs self-hosted) ouvre cette discussion.

Le parcours **Architecture Logicielle** est désormais complet sur le périmètre **Confirmé** (N2) — départ 1, cible 1,5. Le passage vers **Senior** (N3 : DMZ, dimensionnement, déploiement progressif, séparation d'environnements, indicateurs qualité d'architecture, choix de protocole) se fait en pratique au fil des projets et au contact des modules **AWS** et **POO** approfondis.

---

## 12. Ressources complémentaires

### TCO et FinOps

- **FinOps Foundation** — [finops.org](https://www.finops.org). Cadre méthodologique de référence, documentation gratuite, certifications.
- **J.R. Storment, Mike Fuller** — _Cloud FinOps_ (2ᵉ édition, 2023). La référence en livre. Lire les chapitres 1 à 8.
- **Vantage** — _Cloud Cost Handbook_ (2024, gratuit en ligne). Pragmatique, orienté ingénieur. [handbook.vantage.sh](https://handbook.vantage.sh).
- **AWS Well-Architected Framework — Cost Optimization Pillar** — [aws.amazon.com/architecture/well-architected](https://aws.amazon.com/architecture/well-architected/). Six principes structurants, transposables aux autres clouds.

### Outils et calculatrices

- **AWS Pricing Calculator** — [calculator.aws](https://calculator.aws). Pour estimer en amont. Transposable mentalement aux autres clouds.
- **AWS Cost Explorer + Compute Optimizer** — outils natifs pour la revue de coût existante.
- **GCP Pricing Calculator**, **Azure Pricing Calculator** — équivalents.
- **Infracost** — [infracost.io](https://www.infracost.io). Estimation du coût directement depuis le code Terraform.
- **Komiser, OpenCost, Kubecost** — outils open-source pour la visibilité multi-cloud / Kubernetes.

### Approfondissement par sujet

- **Brendan Gregg** — _Systems Performance_ (2ᵉ édition, 2020). Le right-sizing demande de comprendre où va vraiment le compute.
- **Charity Majors et al.** — _Observability Engineering_ (2022). Pour pondérer l'observabilité sans la sacrifier.
- **Adrian Cockcroft** — articles sur les architectures à coût optimisé (ex-Netflix, ex-AWS). [adrianco.medium.com](https://adrianco.medium.com).
- **Corey Quinn** — _Last Week in AWS_, podcast et newsletter. Lucide et drôle sur les pièges tarifaires du cloud. [lastweekinaws.com](https://www.lastweekinaws.com).

### Le parcours en synthèse

- **Documentation interne** : `resources/priority1/Architecture Logicielle.md` — relire en clôture du parcours pour mesurer le chemin parcouru et identifier les items **N3** qui appellent une montée en compétence ultérieure.
- **Documentation interne** : `resources/parcours.md` — pour situer ce module dans l'ensemble du parcours Noledj et préparer l'enchaînement avec **AWS Identity → Compute → Networking → Database**.
