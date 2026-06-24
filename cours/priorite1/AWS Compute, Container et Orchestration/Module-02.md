# M2 — EC2, pricing et cycle de vie

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer les **quatre modèles d'achat** d'EC2 (On-Demand, Spot, Reserved Instances, Savings Plans), leur **mécanique tarifaire**, leur **engagement**, et choisir le bon modèle pour un workload donné.
- Comprendre le mécanisme des **Spot Instances** (marché de capacité résiduelle, interruption en 2 minutes) et savoir **quels workloads** peuvent en tirer parti.
- Distinguer **Standard RI** vs **Convertible RI**, **All Upfront / Partial Upfront / No Upfront**, et la différence entre **Reserved Instances** et **Savings Plans** modernes (Compute / EC2 Instance / SageMaker).
- Décrire le **cycle de vie d'une EC2** : `pending`, `running`, `stopping`, `stopped`, `shutting-down`, `terminated`, `rebooting`, `hibernated`.
- **Distinguer `stop` et `terminate`** (item N2 explicite) : qu'arrive-t-il au volume EBS, à l'IP, à l'instance, à la facture ? Quand utiliser l'un, quand utiliser l'autre.
- Connaître l'**hibernation** (variante de stop) et savoir quand y recourir.
- **Comparer le coût** d'un workload donné sur les 3 modèles On-Demand / Spot / RI et présenter un raisonnement chiffré.

## Durée estimée

1 jour.

## Pré-requis

- M1 (AMI, familles, types d'instances, User Data).
- AWS CLI v2 configurée.
- Permissions IAM EC2 (`ec2:RunInstances`, `ec2:StopInstances`, `ec2:TerminateInstances`, `ec2:Describe*`).
- Une calculatrice ou un tableur — plusieurs exercices sont des comparaisons de coûts.

---

## 1. Pourquoi la tarification est un sujet stratégique

### 1.1 — La facture EC2, premier poste de coût AWS dans la majorité des comptes

Dans un compte AWS d'entreprise, **EC2 + services associés** (EBS, transferts réseau, ELB) représente très souvent **40 à 70 %** du total mensuel. Une réduction de 30 % sur le compute, c'est typiquement **10 à 25 %** de la facture totale.

Trois ordres de grandeur pour fixer les idées :

| Workload                                    | Prix On-Demand 24/7 | Économie possible avec Spot / RI / SP |
| ------------------------------------------- | ------------------- | ------------------------------------- |
| Petit dev `t3.medium` 8 h/jour              | ~10 $/mois          | Quelques $ — peu d'enjeu.             |
| Production `m6i.large × 4` 24/7             | ~310 $/mois         | 70-220 $ d'économies/mois selon mix.  |
| Cluster batch `c7g.4xlarge × 20`, 4 h/jour  | ~1 100 $/mois       | 700-900 $ d'économies avec Spot.      |
| Cluster ML training `p4d.24xlarge × 4` 24/7 | ~95 000 $/mois      | 30-60 % avec RI 3 ans + capacité.     |

**Le sujet "pricing" n'est pas une optimisation marginale.** Le **mauvais mix** de modèles peut tripler la facture sans changer un seul caractère de code.

### 1.2 — L'analogie de l'hôtellerie

Penser à AWS comme un **opérateur hôtelier mondial** :

- **On-Demand** = nuit d'hôtel **au tarif catalogue**. Aucun engagement, on paie le plein tarif, on libère la chambre quand on veut.
- **Spot** = **chambre invendue** bradée à -70 % la veille pour minuit. L'hôtel peut **vous reprendre la chambre** avec 2 minutes de préavis si un client plein tarif arrive (rare en pratique sur la même nuit, fréquent sur certains hôtels). Excellent rapport qualité/prix si le voyage est flexible.
- **Reserved Instance / Savings Plan** = **abonnement annuel** signé avec l'hôtelier : "je vous garantis 1 chambre / 12 mois, et en échange vous me faites -40 %". L'engagement réduit le prix mais lie pendant un an (ou trois).

Aucune des trois options n'est universellement meilleure. Le **bon mix** dépend du workload :

- Workload imprévisible / ponctuel → On-Demand.
- Workload tolérant à l'interruption (batch, dev, test) → Spot.
- Workload **stable** sur 1 an minimum (prod base, BDD primaire) → Reserved / SP.

### 1.3 — Anti-patterns récurrents

| Anti-pattern                                                            | Conséquence                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Tout en On-Demand** y compris la prod stable depuis 2 ans.            | 30-60 % de surcoût évitable.                                                                    |
| **Tout en Spot** y compris la base de données primaire.                 | Interruption brutale → cluster cassé, données en cours d'écriture perdues.                      |
| **Reserved 3 ans** sur un type d'instance qu'on remplace 8 mois après.  | Engagement bloqué, RI inutilisée. Pour les besoins évolutifs : Convertible RI ou Savings Plans. |
| **Stopper une EC2 "pour faire des économies"** alors qu'elle a une EIP. | L'EIP attachée à une instance arrêtée est facturée (~3,6 $/mois). EBS aussi.                    |
| **Terminate sans backup** d'un EBS critique.                            | Perte de données définitive (sauf si `DeleteOnTermination: false` ou snapshot préalable).       |

Le module donne les outils pour éviter ces pièges, avec deux axes : **modèles d'achat** (sections 2-7) et **cycle de vie** (sections 8-9).

---

## 2. Les quatre modèles d'achat — vue d'ensemble

### 2.1 — Tableau synthétique

| Modèle                 | Engagement    | Prix vs On-Demand   | Disponibilité capacité    | Cas d'usage type                                                   |
| ---------------------- | ------------- | ------------------- | ------------------------- | ------------------------------------------------------------------ |
| **On-Demand**          | Aucun         | Référence (= 100 %) | Garantie (sauf limites)   | Charge imprévisible, dev / test, démarrage de projet.              |
| **Spot**               | Aucun         | -50 à -90 %         | **Interruptible** (2 min) | Batch, CI, training ML, workers fault-tolerant, dev nocturne.      |
| **Reserved Instances** | 1 an ou 3 ans | -30 à -75 %         | Garantie (réservation)    | Workload stable connu à 12+ mois : DB primaire, backend prod 24/7. |
| **Savings Plans**      | 1 an ou 3 ans | -30 à -72 %         | Garantie (engagement $/h) | Variante moderne et flexible des RI.                               |

Quatre conclusions à retenir :

1. **Spot est de loin la plus grosse économie**, au prix de l'interruptibilité.
2. **RI et SP demandent un engagement long** (1 ou 3 ans) — qu'on ne signe que pour une charge **stable**.
3. **On-Demand reste l'outil par défaut** quand on ne sait pas encore.
4. **Le mix** (On-Demand + Spot + SP) est presque toujours la bonne réponse en production réelle, pas un modèle unique.

### 2.2 — Le mode capacité (Capacity Reservation) — à part

Il existe aussi un **Capacity Reservation** : on **réserve une capacité** (vCPU dans une AZ donnée) **sans engagement de prix**. C'est utile quand on veut être **sûr** qu'AWS aura le matériel disponible (par exemple pour un DRP testable à n'importe quel moment), mais on paye le prix On-Demand. À mentionner, peu utilisé hors cas spécifiques.

---

## 3. On-Demand — la référence

### 3.1 — Mécanique

Avec **On-Demand**, on paye à la **seconde** (Linux et certains Windows) ou à l'**heure** (anciennes générations Windows), **sans engagement**. Le tarif est **public**, fixe selon (région, type d'instance, OS), et il **inclut** :

- Le compute (vCPU + RAM).
- Le réseau de base (la bande passante intra-AZ et inter-AZ, mais pas le trafic Internet ni inter-région).
- L'usage de la plateforme (hyperviseur, hardware, support, support).

Ne sont **pas inclus** :

- Le **volume EBS** (facturé séparément).
- Le **trafic Internet sortant** (~0,09 $/GB après le free tier).
- Les **EIP** non rattachées.
- Les **licences Windows / Marketplace** (intégrées au prix horaire si l'AMI est Windows AWS-managed, sinon facturées en sus).

### 3.2 — Granularité de facturation

- **Linux et Ubuntu (et OS open source)** : facturation **à la seconde**, avec un minimum de 60 secondes. Lancer pour 30 s coûte 60 s.
- **Windows et certains commerciaux** : facturation à l'**heure entamée**. Démarrer 5 minutes et arrêter coûte 1 heure pleine.

Conséquence : un job batch Linux d'1 min coûte 1 min ; en Windows il coûte 1 h. Cela influence le choix d'OS pour des workloads ultra-courts.

### 3.3 — Quand choisir On-Demand

- **Charge imprévisible** ou nouvelle : on ne sait pas si elle durera 3 mois ou 3 ans.
- **Premier déploiement** : avant d'avoir des métriques d'usage, pas de RI/SP.
- **Charge ponctuelle** : un pic événementiel, un crawl, un import one-shot.
- **Workload qui ne tolère pas l'interruption** mais dont la durée est trop courte pour justifier un engagement.

C'est le bon **point de départ** d'un projet. On bascule progressivement vers Spot et SP **après** avoir observé la charge réelle (typiquement 1 à 3 mois).

### 3.4 — Anti-patterns On-Demand

| Anti-pattern                                              | Conséquence                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Garder une EC2 On-Demand 24/7 pendant 3 ans sans RI/SP.   | 30-60 % de surcoût.                                                           |
| Laisser une EC2 idle "au cas où".                         | On paye à la seconde même à 0 % de CPU. Arrêter (stop) ou terminer.           |
| Lancer un `xlarge` "pour être tranquille" et rester idle. | Vérifier le monitoring (M3) et **dimensionner par le bas**.                   |
| Démarrer 100 instances Linux pour 30 s chacune.           | Facturation minimum 60 s/instance = 100 min facturées pour 50 min de travail. |

---

## 4. Spot — la capacité résiduelle bradée

### 4.1 — Mécanique

**Spot Instances** = des EC2 lancées sur la **capacité non utilisée** d'AWS, vendue avec une **décote massive** (-50 à -90 % vs On-Demand selon le type et la région). En contrepartie, AWS **peut récupérer** la capacité à tout moment, en donnant **2 minutes de préavis** à l'instance.

Trois faits qui font basculer beaucoup d'équipes vers Spot quand elles découvrent :

1. **L'économie** : pour un workload tolérant à l'interruption, c'est typiquement -70 % par rapport à On-Demand. Sur 100 000 $/an de compute, ça fait 70 000 $.
2. **Le préavis de 2 minutes** : remonté via l'IMDS (`/latest/meta-data/spot/instance-action`) ou CloudWatch Event — utilisable pour draining propre.
3. **La probabilité d'interruption** : très variable selon le type et la région. Certains types/régions sont rarement interrompus (5 % par jour) ; d'autres très fréquemment (60 % par jour). Le **Spot Placement Score** d'AWS aide à choisir.

### 4.2 — Qu'est-ce qui change techniquement

- **Demande** : on demande des instances Spot via `aws ec2 run-instances --instance-market-options '{"MarketType":"spot"}'` ou via un Spot Fleet / EC2 Fleet pour la gestion de plusieurs types.
- **Prix** : fixé par AWS, fluctue lentement (plus volatile sur les types rares). On peut fixer un prix maximum (`MaxPrice`) ; au-delà, l'instance n'est pas lancée ou est interrompue. **Par défaut, le maxPrice = prix On-Demand**, ce qui veut dire "je veux Spot, mais je ne paierai jamais plus cher qu'On-Demand" (toujours vrai en pratique).
- **Interruption** : AWS envoie un signal `instance-action: terminate` (ou `stop` / `hibernate` si configuré). L'instance reçoit 2 minutes pour finir proprement.

### 4.3 — Workloads qui tolèrent Spot

| Workload                                         | Spot adapté ?                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **CI/CD runners** (GitHub Actions, GitLab)       | **Oui** — un job interrompu redémarre, perte au pire de 5-30 min de calcul.                  |
| **Batch processing** (ETL, encoding, scientific) | **Oui** — moyennant un orchestrateur qui re-soumet les tâches (Batch, Step Functions, Argo). |
| **Workers de queue** (SQS consumers, Kinesis)    | **Oui** — les messages non ack'd repartent en queue après interruption.                      |
| **ML training distribué** avec checkpoints       | **Oui** — checkpoint régulier permet de redémarrer depuis le dernier état.                   |
| **Dev / staging** non critique                   | **Oui** — accepter la coupure occasionnelle vs le prix.                                      |
| **Tests automatisés long-running**               | **Oui** — si on accepte de relancer.                                                         |
| **Auto-scaling de stateless web app**            | **Oui** — derrière un Load Balancer, mixer Spot (capacité) + On-Demand (base).               |
| **Base de données primaire** (PostgreSQL, MySQL) | **Non** — interruption = corruption potentielle, downtime critique.                          |
| **Stateful session (sticky)**                    | **Non** — l'utilisateur perd sa session.                                                     |
| **API critique single-instance**                 | **Non** — un seul preavis de 2 min n'aide pas si on est seul. À distribuer.                  |

### 4.4 — Détecter et gérer l'interruption

Dans le User Data ou un service systemd, surveiller l'IMDS :

```bash
#!/bin/bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

while true; do
  ACTION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    -w "%{http_code}" -o /tmp/spot-action \
    http://169.254.169.254/latest/meta-data/spot/instance-action)

  if [ "$ACTION" = "200" ]; then
    # Interruption imminente : déregistrer du LB, drainer, sauvegarder l'état
    aws elbv2 deregister-targets --target-group-arn $TG_ARN --targets Id=$INSTANCE_ID
    /opt/myapp/drain.sh
    exit 0
  fi

  sleep 5
done
```

CloudWatch Events publie aussi un event `EC2 Spot Instance Interruption Warning` qu'on peut router vers Lambda / SNS.

### 4.5 — Stratégies pour minimiser les interruptions

- **Diversifier les types et AZ** : un Spot Fleet qui peut prendre `m6i.large`, `m6a.large`, `m6g.large` dans 3 AZ a beaucoup moins de chances d'être complètement interrompu en même temps.
- **Choisir des types peu populaires** : un `m6id.xlarge` est interrompu moins souvent qu'un `t3.medium` (très demandé).
- **Allouer en `capacity-optimized`** : AWS sélectionne les pools avec la **plus grande capacité disponible**, minimisant la probabilité d'interruption.
- **Mixer Spot + On-Demand** : un Auto Scaling Group "MixedInstancesPolicy" peut tenir 30 % d'On-Demand comme socle et 70 % de Spot.

### 4.6 — Anti-patterns Spot

| Anti-pattern                                                      | Conséquence                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Spot sur la **base de données primaire**.                         | Corruption au prochain reclaim.                                                              |
| Spot sans **graceful shutdown** (réception du `instance-action`). | Travail perdu, jobs orphelins.                                                               |
| Spot **un seul type, une seule AZ**.                              | Quand le pool tombe, tout tombe en même temps.                                               |
| `MaxPrice` artificiellement bas pour "économiser plus".           | L'instance ne se lance pas quand le prix Spot dépasse le `MaxPrice` — capacité indisponible. |
| Persistance sur **Instance Store** seul (volatile).               | Reclaim → données perdues. EBS attaché obligatoire si on doit conserver des données.         |

---

## 5. Reserved Instances — l'engagement classique

### 5.1 — Mécanique

Une **Reserved Instance (RI)** est un **engagement de paiement** sur **1 ou 3 ans** en échange d'une réduction (-30 à -75 % vs On-Demand). On engage **sur un type d'instance précis**, dans une **région** (et optionnellement une **AZ**), pour une **durée fixe**.

Trois remarques :

1. C'est un **engagement financier**, pas une réservation d'instance physique. Le tarif réduit s'applique automatiquement à toute instance correspondante qui tourne dans le compte.
2. La **réservation s'applique au type exact** (sauf "instance flexibility" — voir 5.4).
3. Les RI sont **non remboursables** si on n'utilise pas la capacité ; en revanche, on peut **les revendre** sur le Reserved Instance Marketplace.

### 5.2 — Les axes de configuration

**Engagement temporel** :

- **1 an** : économie modeste mais souplesse.
- **3 ans** : économie maximale, engagement fort.

**Modalité de paiement** :

- **All Upfront** : tout payé d'avance → meilleur prix.
- **Partial Upfront** : une partie d'avance, le reste en mensualités.
- **No Upfront** : 100 % mensualités → moins d'économies.

**Scope** :

- **Regional RI** : applicable à n'importe quelle AZ de la région, mais **sans réservation de capacité**.
- **Zonal RI** : applicable à une AZ précise, **avec réservation de capacité** dans cette AZ (utile pour garantir la dispo).

**Type de RI** :

- **Standard RI** : ne peut pas être modifié (sauf taille / OS sous conditions). Plus grosse économie.
- **Convertible RI** : peut être échangée contre une RI de configuration différente (autre famille, taille, OS) à condition que la valeur soit supérieure ou égale. Économie plus modeste mais flexibilité.

### 5.3 — Ordre de grandeur

| Engagement                      | Économie vs On-Demand approximative |
| ------------------------------- | ----------------------------------- |
| 1 an, No Upfront                | ~25 %                               |
| 1 an, Partial Upfront           | ~30 %                               |
| 1 an, All Upfront               | ~35 %                               |
| 3 ans, No Upfront               | ~50 %                               |
| 3 ans, Partial Upfront          | ~58 %                               |
| 3 ans, All Upfront              | ~63 %                               |
| 3 ans, All Upfront, Convertible | ~54 %                               |

Toujours vérifier sur le [Pricing Calculator](https://calculator.aws/) pour le type exact en région cible.

### 5.4 — Instance flexibility (Regional RI)

Une **Regional RI Standard** offre une **flexibilité par taille à l'intérieur d'une famille**. Une RI `m5.large` peut s'appliquer comme :

- 1 × `m5.large` = 1 unité.
- 2 × `m5.large` ou 1 × `m5.xlarge` = 2 unités.
- 4 × `m5.large` ou 2 × `m5.xlarge` ou 1 × `m5.2xlarge` = 4 unités.

AWS répartit automatiquement. La RI n'est **pas perdue** si on remplace 2 × `m5.large` par 1 × `m5.xlarge`. Cette flexibilité ne vaut **que à l'intérieur d'une famille / OS**.

### 5.5 — Quand choisir RI

- Workload **stable** depuis au moins 6-12 mois, prévu pour rester ≥ 1 an.
- Type d'instance **connu et fixé** (sinon préférer Convertible RI ou Savings Plan).
- Budget validé pour un engagement long.
- Particulièrement intéressant pour : **bases de données primaires**, **socle de production stateful**, **services 24/7** dont la charge est cyclique mais centrée sur un type d'instance.

### 5.6 — Anti-patterns RI

| Anti-pattern                                                            | Conséquence                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Standard RI 3 ans** sur un workload qui change après 6 mois.          | Engagement bloqué, paie pour rien (sauf à revendre, perte).                          |
| Acheter une RI **avant** d'avoir 1 mois de monitoring stable.           | Risque d'être à côté.                                                                |
| RI **zonale** sur un service multi-AZ.                                  | Seule la part en AZ ciblée bénéficie ; les autres sont On-Demand.                    |
| Convertible RI **convertie sans regarder la valeur** (échange à perte). | Conversion accidentelle d'une RI à 100 $/mois en RI à 60 $/mois — différence perdue. |

---

## 6. Savings Plans — la variante moderne et flexible

### 6.1 — Mécanique

Les **Savings Plans** (SP), introduits en 2019, sont une **alternative plus flexible** aux RI. Au lieu de s'engager sur un **type d'instance précis**, on s'engage sur un **montant en $/heure** de consommation compute pendant 1 ou 3 ans.

Trois variantes :

| Type de SP               | Couverture                                                                                       | Économie max  |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------- |
| **Compute Savings Plan** | EC2 + Fargate + Lambda. **Toute famille, toute région, tout OS**. Maximum de flexibilité.        | ~66 % (3 ans) |
| **EC2 Instance SP**      | EC2 uniquement, **une famille dans une région**. Plus restrictif, économies un poil supérieures. | ~72 % (3 ans) |
| **SageMaker SP**         | Instances SageMaker uniquement. (Hors parcours.)                                                 | ~64 %         |

### 6.2 — Pourquoi SP plutôt que RI ?

Trois raisons :

1. **Pas besoin de choisir le type exact** — on s'engage sur des **dollars** par heure (par exemple "je m'engage à dépenser 5 $/h en compute"). Si on change de `m5.large` à `m6i.large` à `c7g.large` au fil du temps, la couverture suit.
2. **Couvre Lambda et Fargate** (avec le Compute SP). Cela rend une partie du serverless plus prévisible.
3. **Plus simple à gérer** : un seul engagement vs une dizaine de RI à suivre.

### 6.3 — Quand choisir SP plutôt que RI

| Situation                                                         | Choix recommandé                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Workload qui peut évoluer en type d'instance dans le temps.       | **Compute SP**                                        |
| Mélange EC2 + Fargate + Lambda dans la facture.                   | **Compute SP**                                        |
| Workload **figé** sur un type connu pour 3 ans.                   | **EC2 Instance SP** ou Standard RI All Upfront.       |
| Besoin de **capacité réservée** dans une AZ précise.              | **Zonal RI** (les SP ne réservent pas de capacité).   |
| Comptabilité qui exige des "Reservations" listables comme actifs. | **RI** (apparaissent comme des actifs amortissables). |

En 2026, **la pratique recommandée par AWS** et la communauté est : commencer avec des **Compute Savings Plans** pour la majorité du compute, et garder des **RI Zonal** pour les cas où la capacité doit être garantie (DR testable, picks de saison annuels).

### 6.4 — Méthode pour estimer l'engagement

Quatre étapes :

1. **Observer 1-3 mois** de facture EC2/Fargate/Lambda (via Cost Explorer).
2. **Identifier le "socle"** : la part de consommation **toujours présente** (la baseline). C'est ce qu'on veut couvrir.
3. **Souscrire un SP** pour environ **70-80 % de la baseline** — on garde une marge pour éviter de couvrir des heures non consommées.
4. **Re-évaluer trimestriellement** et ajouter du SP au fur et à mesure que la baseline grandit.

AWS propose des **recommandations de SP** directement dans la console Cost Explorer, basées sur l'historique du compte.

---

## 7. Méthode de mix — production réelle

Aucune production sérieuse n'utilise un seul modèle. Le **mix typique** :

| Pourcentage de la flotte | Modèle                  | Raison                                                                   |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------ |
| 50-70 %                  | **Savings Plans** ou RI | Couvre la **baseline stable** (capacité minimale).                       |
| 10-30 %                  | **Spot**                | Couvre les **pics** et tout ce qui est tolérant à l'interruption.        |
| 10-30 %                  | **On-Demand**           | Tampon de sécurité, parts nouvelles, workloads non éligibles aux autres. |

### 7.1 — Exemple : backend web Auto Scaling

Une appli web qui scale entre 3 et 30 instances `c7g.large` selon le trafic :

- **3 instances en RI Zonal 3 ans All Upfront** : baseline minimale absolue, économie max.
- **+ 5 instances couvertes par un Compute SP 1 an** : couvre la charge moyenne supplémentaire.
- **Au-delà, Auto Scaling Group MixedInstancesPolicy** : 30 % On-Demand + 70 % Spot (capacity-optimized, plusieurs types).

Résultat : un backend qui scale, qui tolère l'interruption Spot grâce à la base On-Demand, et qui paye en moyenne 40-50 % du prix "tout On-Demand".

### 7.2 — Visualiser le coût

Dans **Cost Explorer**, regarder le rapport "Coverage" et "Utilization" :

- **Coverage** : quelle part de votre consommation est couverte par RI/SP. Cible : 70-80 % en baseline.
- **Utilization** : pour chaque RI/SP, dans quelle proportion il est consommé. Cible : 95 %+.

Une **utilization basse** indique un sur-engagement (acheté trop de RI). Une **coverage basse** indique un sous-engagement (on paye trop d'On-Demand).

---

## 8. Cycle de vie d'une EC2

Une instance EC2 passe par plusieurs **états** au cours de sa vie. Les connaître permet de comprendre les transitions et les conséquences sur la facture.

### 8.1 — Diagramme des états

```graphviz
  run-instances
      │
      ▼
  ┌───────────┐
  │ pending   │
  └─────┬─────┘
        │
        ▼
  ┌───────────┐    stop-instances     ┌───────────┐
  │ running   │ ────────────────────► │ stopping  │
  │           │                       │           │
  │           │ ◄──────────────────── │           │
  │           │   start-instances     └─────┬─────┘
  └─────┬─────┘                             │
        │                                   ▼
        │                             ┌───────────┐
        │                             │ stopped   │
        │                             └─────┬─────┘
        │ terminate-instances               │ terminate-instances
        ▼                                   ▼
  ┌───────────┐                       ┌───────────┐
  │shutting-  │                       │shutting-  │
  │down       │                       │down       │
  └─────┬─────┘                       └─────┬─────┘
        ▼                                   ▼
  ┌─────────────────────────────────────────┐
  │ terminated                              │
  └─────────────────────────────────────────┘
```

Variantes :

- **rebooting** : transition courte (quelques secondes) ; pas vraiment un état persistant. L'instance reste running du point de vue facturation.
- **hibernating** / **hibernated** : alternative à stop qui préserve la RAM (voir 8.5).

### 8.2 — Les 8 états — récapitulatif

| État            | Description                                                                                  | Facturé ?                                          |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pending`       | AWS provisionne l'host, démarre la VM. Quelques dizaines de secondes.                        | Non                                                |
| `running`       | L'instance tourne, l'OS est démarré.                                                         | **Oui** (compute + EBS)                            |
| `rebooting`     | Reboot OS (état très court, similaire à running).                                            | **Oui**                                            |
| `stopping`      | AWS quitte gracieusement l'OS et libère le host.                                             | Oui (compute si demande de stop juste après start) |
| `stopped`       | OS éteint, EBS conservé. L'instance peut être redémarrée plus tard.                          | Non (compute) — Oui (EBS)                          |
| `shutting-down` | Transition vers la suppression définitive.                                                   | Non                                                |
| `terminated`    | Instance définitivement supprimée. EBS racine supprimé sauf si `DeleteOnTermination: false`. | Non                                                |
| `hibernated`    | OS et RAM dumpés sur l'EBS racine, host libéré (variante de stopped).                        | Non (compute) — Oui (EBS, plus volumineux)         |

### 8.3 — Démarrer et arrêter — commandes

```bash
# Lancement (M1)
aws ec2 run-instances ... --query 'Instances[0].InstanceId'

# Arrêter (graceful, conserve l'EBS)
aws ec2 stop-instances --instance-ids i-0123

# Redémarrer après arrêt
aws ec2 start-instances --instance-ids i-0123

# Reboot OS (similaire à `reboot` Linux)
aws ec2 reboot-instances --instance-ids i-0123

# Terminer (irréversible)
aws ec2 terminate-instances --instance-ids i-0123

# Hiberner (option, voir 8.5)
aws ec2 stop-instances --instance-ids i-0123 --hibernate
```

### 8.4 — Reboot ≠ stop/start

Distinction subtile mais importante :

- **Reboot** : équivalent d'un `sudo reboot` Linux. **Même host**, **même IP publique**, **même Instance Store** (les disques éphémères sont conservés). Facturation continue.
- **Stop/Start** : VM **éteinte**, **host libéré**, redémarrage **sur un autre host** au start. **Instance Store perdu**, **IP publique éphémère perdue** (sauf EIP). Compteur de boot remis à zéro.

Si on a besoin d'appliquer une mise à jour kernel : reboot suffit.
Si on veut changer le type d'instance ou résoudre un problème matériel : stop + modify-instance-attribute + start.

### 8.5 — Hibernate — la variante "préserver la RAM"

L'**hibernation** est un mode où, au lieu d'éteindre l'OS, AWS **dump la RAM** sur l'EBS racine et libère le host. Au redémarrage, la RAM est restaurée → on retrouve l'OS **exactement dans l'état où on l'a quitté** (processus en cours, caches chauds, etc.).

Conditions :

- Type d'instance compatible (la plupart des familles modernes ≤ 150 GB de RAM).
- AMI compatible (Amazon Linux 2/2023, Ubuntu récents).
- Volume racine **EBS chiffré** et de **taille suffisante** pour absorber le dump (RAM + ~10 %).
- Activé **à la création** de l'instance (`--hibernation-options Configured=true`).

**Cas d'usage** :

- Apps avec long temps de warmup (charger 50 GB en RAM prend 20 min) → hibernation évite de tout recharger.
- Workstations EC2 utilisées en journée et hibernées la nuit pour économiser.

**Limites** :

- Pas compatible avec toutes les AMIs / instances.
- L'EBS racine grossit (RAM dumpée) → facturation EBS plus élevée.
- Au reveil, l'IP éphémère change (sauf EIP).

---

## 9. Stop vs Terminate (item N2 explicite)

C'est **l'item N2 explicite** du module : distinguer `stop` et `terminate`.

### 9.1 — Tableau comparatif

| Aspect                        | `stop`                                                                   | `terminate`                                                            |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **OS**                        | Arrêté gracieusement (équivalent `shutdown -h`).                         | Arrêté gracieusement puis l'instance disparaît.                        |
| **Host AWS**                  | Libéré. Au start, l'instance va sur un autre host.                       | Libéré définitivement.                                                 |
| **Volume EBS racine**         | **Conservé**.                                                            | **Supprimé** si `DeleteOnTermination=true` (défaut), conservé sinon.   |
| **EBS supplémentaires**       | Conservés.                                                               | Supprimés ou conservés selon `DeleteOnTermination` de chaque volume.   |
| **Instance Store**            | **Perdu** (volatil).                                                     | **Perdu**.                                                             |
| **IP publique auto-assignée** | **Perdue**, nouvelle IP au start.                                        | **Perdue**.                                                            |
| **Elastic IP**                | **Conservée**, **toujours facturée** (et attachée à l'instance arrêtée). | **Conservée si non release**, **facturée**. À release après terminate. |
| **IP privée**                 | Conservée si on a un ENI primaire (cas standard).                        | Libérée.                                                               |
| **Instance ID**               | Conservé.                                                                | Conservé pour 1 heure dans le DescribeInstances puis disparaît.        |
| **Compute facturé**           | **Non**.                                                                 | **Non**.                                                               |
| **EBS facturé**               | **Oui** (même arrêté).                                                   | Non (si supprimé) ; oui si conservé.                                   |
| **Réversibilité**             | Oui — `start-instances`.                                                 | **Non**. L'instance est définitivement perdue.                         |
| **Cas d'usage**               | Pause temporaire, économie compute pendant non-usage.                    | Fin de vie, ressource jetable.                                         |

### 9.2 — Choisir l'un ou l'autre — méthode

**Choisir `stop`** quand :

- On veut **économiser le compute pendant une pause** (nuit, week-end).
- L'instance contient une configuration ou des données **encore utiles** (mais sauvegarder via snapshot reste la bonne pratique).
- On va **redémarrer dans quelques heures à quelques jours**.

**Choisir `terminate`** quand :

- L'instance est **jetable** : test, POC, instance créée pour un job ponctuel.
- L'**Auto Scaling** réduit la flotte (scale-in).
- On a **migré** vers un nouveau modèle / nouvelle AMI et l'ancienne instance ne sert plus.
- On a snapshoté ce qui était utile.

### 9.3 — Le piège du stop "économique"

Beaucoup d'équipes pensent que stopper une EC2 = arrêter la facture. C'est partiellement vrai :

- ✅ Plus de facture **compute** (le coût horaire EC2).
- ❌ La facture **EBS** continue (~0,08 $/GiB-mois pour gp3, ~0,10 $ pour io2).
- ❌ La facture **EIP** continue si attachée (~3,6 $/mois) et continue **toujours** depuis 2024 (toutes IPv4 publiques sont facturées).
- ❌ La facture **snapshot** si on a des snapshots associés.

Pour une instance arrêtée 24/7 avec 30 GB d'EBS gp3 et une EIP :

- Compute : 0 $
- EBS gp3 30 GB : ~2,4 $/mois
- EIP : ~3,6 $/mois
- **Total : ~6 $/mois pour rien**

Sur une flotte de 50 instances oubliées en stopped, c'est **300 $/mois**. Ce qui semble nul à l'unité fait beaucoup à l'échelle.

### 9.4 — Préserver les données critiques avant terminate

Avant un `terminate-instances` sur une instance contenant des données utiles :

```bash
# 1. Snapshoter l'EBS racine (et les autres volumes)
aws ec2 describe-instances --instance-ids i-0123 \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[].Ebs.VolumeId' --output text

aws ec2 create-snapshot --volume-id vol-0abc --description "Backup before terminate"

# 2. Vérifier le snapshot
aws ec2 describe-snapshots --snapshot-ids snap-0xyz --query 'Snapshots[0].State'

# 3. Si on veut conserver l'EBS au-delà de la mort de l'instance, désactiver DeleteOnTermination AVANT terminate :
aws ec2 modify-instance-attribute --instance-id i-0123 \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"DeleteOnTermination":false}}]'

# 4. Terminate
aws ec2 terminate-instances --instance-ids i-0123
```

### 9.5 — Termination Protection

Pour éviter un `terminate` accidentel sur une instance critique :

```bash
# Activer la protection
aws ec2 modify-instance-attribute --instance-id i-0123 \
  --disable-api-termination

# Pour terminer plus tard, il faudra d'abord la désactiver.
```

Pratique recommandée pour les bases de données primaires, les instances de prod stateful.

### 9.6 — Shutdown depuis l'OS — attention

Si on fait un `sudo shutdown -h now` dans une EC2 :

- **Par défaut**, cela revient à `stop` (l'instance passe en `stopped`).
- Si l'instance a `InstanceInitiatedShutdownBehavior=terminate`, **cela termine l'instance**. À configurer avec précaution.

```bash
# Vérifier le comportement
aws ec2 describe-instance-attribute --instance-id i-0123 \
  --attribute instanceInitiatedShutdownBehavior

# Modifier vers stop (souvent ce qu'on veut)
aws ec2 modify-instance-attribute --instance-id i-0123 \
  --instance-initiated-shutdown-behavior stop
```

---

## 10. Comparer le coût d'un workload — méthode chiffrée

### 10.1 — Le tableau de calcul

Pour un workload donné, comparer **systématiquement** les trois modèles principaux :

| Modèle               | Prix horaire | Heures/mois | Coût mensuel | Économie vs OD |
| -------------------- | ------------ | ----------- | ------------ | -------------- |
| On-Demand            | A            | H           | A × H        | —              |
| Spot                 | A × 0,3 env. | H           | A × H × 0,3  | -70 %          |
| RI 1 an All Upfront  | A × 0,65     | H           | A × H × 0,65 | -35 %          |
| RI 3 ans All Upfront | A × 0,4      | H           | A × H × 0,4  | -60 %          |
| Compute SP 3 ans     | A × 0,45     | H           | A × H × 0,45 | -55 %          |

Pour H, deux scénarios à toujours considérer :

- **24/7** : H = 730 (heures par mois en moyenne).
- **Horaires de bureau** : H = 8 h × 5 j × 52 sem / 12 ≈ 173.

### 10.2 — Exemple concret — backend web `m6i.large`

Prix On-Demand en `eu-west-1` : **0,107 $/h**.

| Modèle                    | Heures/mois | Coût mensuel | Coût annuel |
| ------------------------- | ----------- | ------------ | ----------- |
| On-Demand 24/7            | 730         | ~78 $        | ~940 $      |
| On-Demand 9 h × 5 j (dev) | 196         | ~21 $        | ~252 $      |
| Spot 24/7 (~30 % du prix) | 730         | ~24 $        | ~280 $      |
| RI 1 an All Upfront       | 730         | ~50 $        | ~602 $      |
| RI 3 ans All Upfront      | 730         | ~31 $        | ~376 $      |
| Compute SP 3 ans          | 730         | ~35 $        | ~423 $      |

**Lecture** :

- Si l'instance tourne 24/7 et est jugée stable pour 3 ans : **RI 3 ans All Upfront** (~31 $/mois). Vs On-Demand 24/7 : **45 $ d'économies/mois** soit ~540 $/an.
- Si elle ne tourne que pendant les horaires de bureau : **rester en On-Demand** ; un RI couvrirait des heures inutilisées.
- Si elle est tolérante à l'interruption : **Spot 24/7** (~24 $/mois) — pratiquement le meilleur ratio.

### 10.3 — Outils

- [AWS Pricing Calculator](https://calculator.aws/) — interface officielle de simulation.
- [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) — recommandations Savings Plans basées sur l'historique.
- [Spot Instance Advisor](https://aws.amazon.com/ec2/spot/instance-advisor/) — prix Spot moyens et fréquence d'interruption par type.
- [Spot Placement Score](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-placement-score.html) — capacité disponible sur tel type / telle région.

---

## 11. Exercices pratiques

### Exercice 1 — Comparer les modèles sur un workload donné (≈ 30 min)

**Objectif.** Maîtriser le calcul de coût, item N2 explicite.

**Cas.** Backend Node.js, `m6i.large` en `eu-west-1`, prévu pour tourner 24/7 sur une durée d'au moins 2 ans.

Construire un tableau comparant :

- On-Demand 24/7.
- Spot 24/7 (utiliser le Spot Instance Advisor pour estimer le tarif réel courant).
- RI 1 an All Upfront.
- RI 3 ans All Upfront.
- Compute Savings Plans 3 ans No Upfront.

Pour chacun, donner : prix horaire, coût mensuel, coût total sur 2 ans, économie vs OD.

**Livrable.** Tableau + 2 lignes de recommandation argumentée.

### Exercice 2 — Lancer une Spot Instance et observer (≈ 45 min)

**Objectif.** Manipuler concrètement Spot.

**Étapes :**

1. Lancer une `t3.medium` Spot avec un `MaxPrice` égal au prix On-Demand (défaut) :

   ```bash
   aws ec2 run-instances \
     --image-id $AMI_ID --instance-type t3.medium \
     --instance-market-options 'MarketType=spot' \
     --key-name tp-m1-key --security-group-ids $SG_ID --subnet-id $SUBNET_ID \
     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tp-m2-spot}]'
   ```

2. Comparer son **prix horaire réel** vs On-Demand via `aws ec2 describe-spot-price-history`.
3. Lire la **state d'interruption** via l'IMDS (`/spot/instance-action`). Devrait répondre 404 tant qu'AWS n'interromp pas.
4. Terminer l'instance.

**Livrable.** Capture du prix Spot observé + une phrase sur l'écart vs On-Demand.

### Exercice 3 — Stop vs Terminate sur le terrain (≈ 30 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Lancer une `t3.micro`. Noter son **IP publique** et son **instance-id**.
2. **Stopper** l'instance. Attendre `stopped`. Vérifier que l'instance existe toujours dans `describe-instances`. Noter que l'**IP publique** est `null`.
3. **Démarrer** à nouveau. Attendre `running`. Constater une **nouvelle IP publique** différente.
4. **Stopper** à nouveau, puis **terminer**. Attendre `terminated`. Vérifier que l'instance disparaît de la liste après ~1 h ou n'est plus en `running`.
5. Lister tous les **volumes EBS** : confirmer que le volume racine de l'instance terminée a bien été supprimé (`DeleteOnTermination=true` par défaut).

**Livrable.** Captures CLI pour chaque étape avec annotations.

### Exercice 4 — Mix de modèles pour un Auto Scaling Group (≈ 30 min, papier)

**Objectif.** Concevoir un mix réaliste.

**Cas.** Service web :

- Min 4 instances, max 30, type `c7g.large`.
- Charge typique : 6-10 instances en journée, 4 la nuit.
- SLA 99,9 %.
- Workload **stateless** (sessions en Redis externe).

Proposer :

1. Combien de RI ou SP, et lesquels (type, durée, scope) ?
2. Combien de Spot acceptable et avec quelle politique de fallback ?
3. Combien d'On-Demand comme tampon ?

**Livrable.** Schéma + tableau + estimation mensuelle vs un scénario "tout On-Demand".

### Exercice 5 — Hibernation d'une instance (≈ 30 min)

**Objectif.** Manipuler l'hibernation.

**Étapes :**

1. Lancer une `t3.medium` Ubuntu **avec hibernation** :

   ```bash
   aws ec2 run-instances ... \
     --hibernation-options Configured=true \
     --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"Encrypted":true}}]'
   ```

2. SSH dans l'instance, lancer un process qui charge un gros fichier en RAM (`dd if=/dev/zero of=/dev/shm/big bs=1M count=1024`).
3. Hiberner : `aws ec2 stop-instances --instance-ids i-0123 --hibernate`.
4. Attendre `stopped`. Redémarrer. SSH. Vérifier que **le fichier en RAM est toujours là**.
5. Comparer avec un stop classique (où la RAM est effacée).
6. Terminer.

**Livrable.** Captures + une phrase sur l'usage idéal de l'hibernation.

### Mini-défi — Audit d'un compte (≈ 45 min, conceptuel)

**Cas.** On hérite d'un compte AWS d'une équipe. Première mission : identifier les économies possibles.

Lister :

1. Toutes les instances `running` 24/7 depuis ≥ 30 jours non couvertes par RI/SP.
2. Toutes les instances `stopped` depuis ≥ 30 jours (candidate à `terminate`).
3. Toutes les EIP non attachées.
4. Tous les volumes EBS détachés depuis ≥ 30 jours.

Proposer un **plan d'action** chiffré (économie cible mensuelle).

**Livrable.** Tableau d'actions + estimation.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer les **4 modèles d'achat** EC2 (OD, Spot, RI, SP) et leur engagement.
- [ ] Décrire **On-Demand** : facturation, granularité Linux vs Windows.
- [ ] Expliquer la **mécanique Spot** : capacité résiduelle, préavis 2 minutes, économies.
- [ ] Citer **4 workloads** adaptés à Spot et **2 inadaptés**.
- [ ] Décrire les axes de configuration d'une **RI** (durée, upfront, scope, standard/convertible).
- [ ] Distinguer **RI** et **Savings Plans** sur 3 axes (scope, flexibilité, couverture serverless).
- [ ] Expliquer le **mix typique** OD + Spot + SP en production.
- [ ] Citer les **8 états** d'une EC2 (`pending`, `running`, `rebooting`, `stopping`, `stopped`, `shutting-down`, `terminated`, `hibernated`).
- [ ] **Distinguer `stop` et `terminate`** : que devient le compute, l'EBS, l'IP, l'instance, la facture.
- [ ] Expliquer **pourquoi `stop` n'est pas gratuit** (EBS, EIP).
- [ ] Décrire ce qu'est l'**hibernation** et un cas où elle est utile.
- [ ] Décrire la **Termination Protection** et quand l'activer.
- [ ] Pour un workload donné, **chiffrer rapidement** le coût en OD vs RI 3 ans vs Spot.

### Items du glossaire visés

**N2 atteint** :

- _différence entre On-Demand, Spot et Reserved Instance pour un EC2_ — sections 2 à 5.
- _différence entre les statuts terminate et shutdown dans un EC2_ — section 9 (et section 8 pour le cycle de vie complet).

**Bonus N3** abordé en surface (non couvert en profondeur) :

- _conditions de mise en place d'un Auto Scaling Group_ — discuté en section 7.1, à approfondir en M3 / Networking M8.

---

## 13. Ressources complémentaires

### Documentation AWS

- [Amazon EC2 instance purchasing options](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-purchasing-options.html)
- [Spot Instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-spot-instances.html)
- [Reserved Instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-reserved-instances.html)
- [Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/what-is-savings-plans.html)
- [Instance lifecycle](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
- [Hibernate your Amazon EC2 instance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Hibernate.html)
- [Termination protection](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/terminating-instances.html#Using_ChangingDisableAPITermination)

### Outils

- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/)
- [Spot Instance Advisor](https://aws.amazon.com/ec2/spot/instance-advisor/)
- [Spot Placement Score](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-placement-score.html)
- [Compute Optimizer](https://aws.amazon.com/compute-optimizer/) — recommande des rightsizing automatiques basés sur le monitoring.

### Études de cas et blogs

- [How to reduce your AWS bill](https://aws.amazon.com/blogs/aws-cost-management/)
- [Spot at scale — Netflix](https://netflixtechblog.com/) — articles sur leur usage massif de Spot.
- [FinOps Foundation](https://www.finops.org/) — pratiques de gouvernance financière du cloud.

### Pour aller plus loin

- **M3 (Métriques et monitoring)** — identifier le rightsizing nécessaire et la baseline pour les RI/SP.
- **M11 (ECS Fargate)** — équivalent serverless en container ; couvert par Compute Savings Plans.
- **AWS Identity M3** — instance profile, prérequis pour des EC2 sans clés AWS statiques.
