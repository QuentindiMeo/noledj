# M6 — Lambda, limitations et Layers

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer les **limites quantitatives** principales d'une Lambda (temps d'exécution 15 min, mémoire 128 MB → 10 GB, payload sync 6 MB, payload async 256 KB, `/tmp` 10 GB, deployment ZIP 250 MB, image 10 GB) et identifier celles qui sont **soft** (quota modifiable) vs **hard** (limites de la plateforme).
- Décrire précisément le mécanisme du **cold start** (item N2 explicite) : init du sandbox, init du runtime, init du code, première invocation — et mesurer chaque phase.
- Citer les **stratégies de réduction du cold start** : init lazy / précoce, **SnapStart**, **Provisioned Concurrency**, choix de runtime (Python > Java), packaging (ZIP < image Docker), réduction du bundle.
- Comprendre la **relation RAM/CPU** (item N2) et savoir **rightsizer** une Lambda via mesure (REPORT log line, Power Tuner).
- Définir une **Lambda Layer** (item N2 explicite), savoir **quand l'utiliser** (mutualisation de deps lourdes ou de runtime custom) et **quand ne pas l'utiliser** (deps mono-fonction, dev cycle rapide).
- **Construire** et **référencer** une Layer pour ajouter `pandas` à plusieurs Lambdas sans gonfler chaque bundle.
- Comprendre la **concurrency** (reserved, provisioned, burst) et savoir prévenir le **throttling** quand on s'approche du quota du compte.

## Durée estimée

1 jour.

## Pré-requis

- M4 (Lambda fondamentaux) et M5 (déclencheurs).
- AWS CLI v2 configurée.
- Permissions IAM : `lambda:*`, `iam:PassRole`, `s3:PutObject`, `s3:GetObject` (pour héberger les Layers).
- Python 3.x localement (pour construire la Layer pandas).
- Docker installé (pour l'exercice container).

---

## 1. Pourquoi connaître les limites est un prérequis

### 1.1 — Le contrat de Lambda

> Lambda offre une **disponibilité quasi totale** et un **scaling automatique** en échange de **limites strictes**. Connaître ces limites avant le code évite de **redécouvrir** chacune au pire moment.

Trois exemples vécus très souvent :

- "Notre job ETL marchait bien, et puis un jour il a dépassé 15 minutes" → migration en urgence vers Step Functions ou Batch.
- "Notre API était rapide en dev, en prod première requête prend 4 secondes" → cold start non anticipé, le SLO p99 est cassé.
- "Notre Lambda fait 251 MB après ajout d'OpenCV" → impossible de déployer en ZIP, refactor obligatoire.

Chaque limite a son **piège** caractéristique. Ce module les passe en revue, puis introduit les **Layers** — le mécanisme AWS pour mutualiser proprement les dépendances entre Lambdas.

### 1.2 — L'analogie du conteneur de livraison

Penser à Lambda comme un **conteneur jetable de livraison express** :

- Le conteneur a une **taille fixe** (mémoire, /tmp, payload).
- Il a une **durée maximale** d'usage (15 minutes).
- Il **scale en quantité** : 1000 conteneurs simultanés sans souci, 100 000 → file d'attente.
- Pour **mutualiser le contenu** entre conteneurs (ex : palette commune à plusieurs livraisons), on utilise une **Layer** — comme une **palette pré-emballée** réutilisable.

Le métier consiste à choisir la **bonne taille** de conteneur et à **emballer efficacement**.

### 1.3 — Anti-patterns récurrents

| Anti-pattern                                                     | Conséquence                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "On va juste laisser à 128 MB pour économiser."                  | Latence × 3, durée × 3, coût souvent **plus élevé** que 512 MB.                               |
| "Le cold start, on verra plus tard."                             | Premier incident SLO en prod : utilisateur attend 5 s la première fois — déclenche un ticket. |
| Lambda qui **fait dormir 10 min** pour "attendre".               | 10 min payées à ne rien faire. **Step Functions** a un `Wait` natif gratuit.                  |
| Une Layer pour **chaque fonction**.                              | Re-déploiement compliqué, Layers non mutualisées — sert à rien.                               |
| Layer qui **inclut le code applicatif**.                         | Mauvais usage : le code change vite, les deps non. Mélanger ralentit le cycle de dev.         |
| Pas de **réservation de concurrence** sur une fonction critique. | Une autre Lambda du compte sature le quota → tout est throttlé.                               |

---

## 2. Les limites quantitatives

### 2.1 — Le tableau exhaustif

| Catégorie                     | Limite                                    | Soft ?   | Note                                           |
| ----------------------------- | ----------------------------------------- | -------- | ---------------------------------------------- |
| **Mémoire**                   | 128 MB → **10 240 MB**                    | Hard     | Step de 1 MB depuis 2024.                      |
| **Timeout**                   | 1 s → **900 s (15 min)**                  | Hard     | Au-delà : Step Functions, Fargate, Batch.      |
| **Ephemeral storage `/tmp`**  | 512 MB → **10 240 MB**                    | Hard     | Au-delà : EFS-mount ou S3.                     |
| **Payload sync**              | 6 MB request **et** response              | Hard     | Pour gros payload : S3 + URL signée.           |
| **Payload async**             | 256 KB                                    | Hard     | Idem.                                          |
| **ZIP direct**                | 50 MB (compressed)                        | Hard     | Forcer un passage par S3 au-delà.              |
| **ZIP décompressé**           | 250 MB                                    | Hard     | Sinon image Docker.                            |
| **Image Docker**              | 10 GB                                     | Hard     |                                                |
| **Concurrent executions**     | **1000** par compte / région (par défaut) | **Soft** | Ouvrable via support ticket à 10 000+.         |
| **Burst concurrency**         | 500 à 3000 par minute (selon région)      | Hard     | Vitesse de montée en charge initiale.          |
| **Variables d'environnement** | 4 KB total                                | Hard     | Pour plus : Parameter Store / Secrets Manager. |
| **Variables d'env (nombre)**  | Pas de limite explicite                   | —        | Mais collectivement ≤ 4 KB.                    |
| **Layers**                    | **5** par fonction                        | Hard     | Combinées ≤ 250 MB décompressé (avec le code). |
| **Function policy**           | 20 KB                                     | Hard     | Beaucoup d'`add-permission` saturent vite.     |
| **Function name**             | 64 caractères                             | Hard     |                                                |
| **Function ARN**              | 256 caractères                            | Hard     |                                                |
| **Tags par fonction**         | 50                                        | Hard     |                                                |
| **File descriptors**          | 1024                                      | Hard     | Important pour I/O lourd (sockets, fichiers).  |
| **Threads / processus**       | 1024                                      | Hard     |                                                |
| **Test event size (console)** | 6 MB                                      | Hard     |                                                |

### 2.2 — Quotas — savoir où les regarder

```bash
# Lister les quotas du service Lambda dans la région
aws service-quotas list-service-quotas --service-code lambda \
  --query 'Quotas[].{Name:QuotaName, Value:Value, Adjustable:Adjustable}' \
  --output table

# Augmenter un quota (concurrent executions)
aws service-quotas request-service-quota-increase \
  --service-code lambda \
  --quota-code L-B99A9384 \
  --desired-value 5000
```

À retenir : `Adjustable: true` = on peut demander à AWS. `Adjustable: false` = limite dure de la plateforme.

### 2.3 — Soft limits courantes à ouvrir

| Limite                           | Valeur par défaut | Cible courante en prod sérieuse |
| -------------------------------- | ----------------- | ------------------------------- |
| Concurrent executions            | 1000              | 5000-10 000                     |
| Storage for functions and layers | 75 GB             | 250 GB                          |

Ces deux limites sont les plus fréquemment ouvertes via ticket support, sans frais.

---

## 3. Cold start (item N2 explicite)

### 3.1 — Définition

> Un **cold start** survient quand AWS doit **provisionner un nouvel environnement d'exécution** pour répondre à une invocation, parce qu'aucun environnement existant n'est disponible (premier appel, scale-out, ou environnement expiré après inactivité).

Le **warm start**, à l'inverse, réutilise un environnement déjà initialisé : seul le handler est appelé. Beaucoup plus rapide.

### 3.2 — Anatomie d'un cold start

Quatre phases consécutives, dont seules les 4ᵉ phases sont communes au warm start :

```graphviz
   ┌────────────────────────────────────────────────────────────┐
   │  1. Init Firecracker        (sandbox VM allouée)           │ ~80-200 ms
   ├────────────────────────────────────────────────────────────┤
   │  2. Init Runtime            (python / node / java...)      │ ~50-300 ms
   ├────────────────────────────────────────────────────────────┤
   │  3. Init Code               (imports, init module-scope)   │ Variable (50 ms-2 s)
   ├────────────────────────────────────────────────────────────┤
   │  4. Invoke Handler          (notre code applicatif)        │ Variable
   └────────────────────────────────────────────────────────────┘
   Phases 1+2+3 = INIT phase     facturée à 100% du compute provisionné
   Phase 4      = HANDLER phase  facturée selon durée réelle
```

Quelques ordres de grandeur (Python 3.12, 512 MB) :

| Profil                                 | Cold start total | Warm start |
| -------------------------------------- | ---------------- | ---------- |
| `boto3` simple, 0 dépendance externe   | ~250-400 ms      | ~5-20 ms   |
| `boto3` + `requests`                   | ~400-600 ms      | ~10-50 ms  |
| `pandas` importé en haut de fichier    | ~1500-2500 ms    | ~10-50 ms  |
| Image Docker custom (Python 3.12)      | ~1500-3000 ms    | ~10-50 ms  |
| Java 21 Spring Boot (sans SnapStart)   | ~2000-5000 ms    | ~10-100 ms |
| Java 21 Spring Boot avec **SnapStart** | ~200-500 ms      | ~10-100 ms |

### 3.3 — Quand le cold start se produit-il

Six déclencheurs typiques :

1. **Première invocation** du jour (la fonction n'a aucun environnement chaud).
2. **Scale-out** : 1 environnement chaud reçoit la 1ʳᵉ requête, la 2ᵉ requête simultanée crée un nouvel env (cold).
3. **Après inactivité** : un environnement chaud est suspendu après ~5-15 min d'inactivité (variable), puis recyclé.
4. **Après mise à jour** de la fonction : tous les environnements sont éphémèrement remplacés.
5. **Migration interne** : AWS recycle régulièrement les environnements.
6. **Changement de configuration** : mémoire, env vars, role, VPC → tous les envs sont remplacés.

### 3.4 — Mesurer son cold start

Lire le log REPORT après chaque invocation :

```log
REPORT RequestId: abc-123 Duration: 234.50 ms Billed Duration: 235 ms
Memory Size: 512 MB Max Memory Used: 110 MB
Init Duration: 423.18 ms        ← présent UNIQUEMENT sur cold start
```

L'**`Init Duration`** est la somme des phases 1-3 (provisioning + runtime + init du code). Le total visible côté client = `Init Duration + Duration`.

Via X-Ray (le service de tracing AWS, activable en `Tracing: Active`), on voit chaque phase séparément.

### 3.5 — Stratégies de réduction — par ordre d'effort croissant

**Niveau 0 — gratuit, à appliquer toujours** :

- **Init hors handler** : tout ce qui peut être fait au scope module (créer le client `boto3`, charger un fichier de config, compiler un regex) se fait **une fois** par environnement, partagé sur tous les warm starts.
- **Imports minimaux** : `from boto3 import client` au lieu de `import boto3` plein ; surtout, ne pas importer `pandas`, `numpy`, etc. si on s'en sert pas.
- **Bundle minimal** : si une fonction n'utilise pas pandas, elle ne doit pas l'embarquer même si la sœur Lambda l'utilise → c'est exactement à ça que servent les Layers (section 9).

**Niveau 1 — choix de packaging** :

- **ZIP plutôt qu'image Docker** quand le bundle tient en < 250 MB.
- **ARM (Graviton)** : 20 % moins cher et souvent un peu plus rapide à init.
- Runtime "rapide" : Python, Node.js et Go ont des init courtes (< 200 ms). Java et .NET sont plus lourds.

**Niveau 2 — SnapStart** (Java, Python depuis 2024, Node.js depuis 2024) :

- AWS prend un **snapshot mémoire** de la fonction post-init et redémarre depuis ce snapshot.
- **Réduit le cold start de 10× à 50×** pour les Java Spring Boot, fortement pour Python avec beaucoup d'imports.
- Activation : `--snap-start ApplyOn=PublishedVersions` à la création / update.
- Demande de publier une **version** pour bénéficier de SnapStart (le snapshot est pris sur une version figée).
- **Pas compatible** : function URLs sans version, certains traitements crypto qui dépendent du `urandom` au boot (workaround : forcer une réinit).

```bash
aws lambda update-function-configuration \
  --function-name tp-m6-fn \
  --snap-start 'ApplyOn=PublishedVersions'

aws lambda publish-version --function-name tp-m6-fn
```

**Niveau 3 — Provisioned Concurrency** :

- Demander à AWS de **garder N environnements toujours chauds**.
- Aucune cold start pour les `N` premières invocations simultanées.
- **Facturé** au temps **provisionné** (que la Lambda tourne ou pas) — typiquement 0,5 × le prix normal × 24h.
- Bon choix pour des **picks de trafic prévisibles** ou des **API critiques** où le SLO p99 ne tolère pas un cold start.

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name tp-m6-fn \
  --qualifier prod \
  --provisioned-concurrent-executions 5
```

### 3.6 — Anti-patterns cold start

| Anti-pattern                                                   | Conséquence                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Tout init **dans** le handler.                                 | Cold start incompressible, chaque invocation paie deux fois.   |
| `import boto3` + `import pandas` même si pandas inutilisé.     | 1-2 secondes de cold start perdues.                            |
| Provisioned Concurrency à 100 sur une fonction peu sollicitée. | Coût constant pour rien. Utiliser Auto Scaling sur PC.         |
| SnapStart non testé sur du code crypto.                        | Mêmes seeds aléatoires → collisions cryptographiques (faille). |
| Lambda VPC-attached avec NAT mal sizé.                         | Cold start aggravé. ENI fini → erreurs `EFOSE`.                |

---

## 4. Temps d'exécution (item N2 explicite)

### 4.1 — La limite de 15 minutes

Une Lambda **ne peut pas dépasser 900 secondes** (15 minutes). Au-delà, AWS la **tue** et retourne une erreur `Task timed out after 900.00 seconds`.

C'est une limite **dure**, pas négociable.

### 4.2 — Conséquences

- **Pas de jobs longs** : un import de 30 GB ne se fait pas en Lambda. Découper ou changer de service.
- **Pas de polling indéfini** : un consumer de file qui boucle 30 min ne passe pas. Préférer un event source mapping.
- **Pas de calculs lourds atomiques** : un training ML qui prend 20 min → Batch ou Step Functions.

### 4.3 — Configurer un timeout réaliste

**Bonne pratique** : régler le timeout au **double du p99** observé, jamais au max systématiquement.

```bash
# Une Lambda dont le p99 est à 800 ms : timeout 2-3 s suffit
aws lambda update-function-configuration \
  --function-name tp-m6-fn --timeout 3
```

Avantages :

- Si la fonction part en boucle infinie ou bloque sur un service externe, elle **meurt vite** au lieu de consommer 15 min payées à rien.
- Détecter plus tôt les régressions de performance.

### 4.4 — Alternatives quand 15 min ne suffit pas

| Besoin                                     | Service alternatif                                          |
| ------------------------------------------ | ----------------------------------------------------------- |
| Pipeline de plusieurs étapes courtes.      | **Step Functions** (M9) — chaîner des Lambdas.              |
| Job batch lourd (CPU/GPU, dur à découper). | **AWS Batch** (M8) — orchestration de jobs sur Fargate/EC2. |
| Container long-running.                    | **ECS Fargate** (M11) — container 24/7 ou planifié.         |
| HTTP request synchrone > 29 s.             | **API Gateway WebSocket** ou réponse async (202 + polling). |
| Wait passif (avant retry).                 | **Step Functions Wait** (gratuit, jusqu'à 1 an).            |

### 4.5 — Stratégies pour rester sous les 15 min

- **Découper** : transformer "traiter 10 000 lignes" en "10 messages SQS × 1 000 lignes".
- **Streaming** : lire un fichier S3 ligne par ligne plutôt que tout charger.
- **Délégation** : faire faire le gros calcul à un service spécialisé (DynamoDB scan parallel, S3 Select, Athena…).
- **Idempotence + checkpoints** : si une Lambda finit en 10 min et qu'on a besoin de plus, sauvegarder son état dans DDB et la rappeler.

---

## 5. RAM et CPU (item N2 explicite)

### 5.1 — La règle d'or

> Sur Lambda, **on ne configure que la RAM**. Le CPU est **proportionnel** à la RAM allouée. Choisir une RAM, c'est aussi choisir un CPU.

Reprise (cf. M4) :

| Memory       | Approx. vCPU  |
| ------------ | ------------- |
| 128 MB       | 0,07 vCPU     |
| 512 MB       | 0,29 vCPU     |
| 1 024 MB     | 0,58 vCPU     |
| **1 769 MB** | **1,00 vCPU** |
| 3 008 MB     | 1,70 vCPU     |
| 5 308 MB     | 3,00 vCPU     |
| 10 240 MB    | 6,00 vCPU     |

Au-delà de **1 769 MB**, on a **plus d'un cœur** disponible — utile si le code est multi-threadé.

### 5.2 — Le paradoxe : plus de RAM = parfois moins cher

Le coût Lambda est `RAM × durée`. Augmenter la RAM **augmente** le coût horaire **et** réduit la durée (plus de CPU). Le **produit** suit souvent une **courbe en U** : trop peu de RAM = très lent ; trop de RAM = surcoût compute sans gain.

Exemple typique : une fonction CPU-bound qui prend 2 000 ms à 256 MB peut prendre 350 ms à 1 024 MB. Le coût des deux : ~équivalent. À 2 048 MB, 200 ms → encore plus cher car la durée baisse moins que la RAM augmente.

**Méthode pour trouver le sweet spot** : déployer 5 versions de la fonction avec 256 / 512 / 1024 / 2048 / 3008 MB, lancer 50 invocations par version, lire les logs REPORT, calculer le coût total. Le minimum est le sweet spot.

L'outil [**AWS Lambda Power Tuning**](https://github.com/alexcasalboni/aws-lambda-power-tuning) (open source, basé sur Step Functions) automatise ça : on fournit un payload de test, il essaie 5-10 valeurs de RAM et trace les courbes coût/durée.

### 5.3 — Mémoire — surveiller `Max Memory Used`

Dans le log REPORT, `Max Memory Used: NNN MB` indique combien a réellement consommé la fonction. Trois cas :

- **Max Memory Used proche du max** : risque d'OOM. Bumper la mémoire.
- **Max Memory Used ≪ max** : on paye pour rien. **Mais** : attention au CPU — réduire la RAM ralentit aussi le CPU.
- **OOM réel** : la fonction crashe avec `Runtime.OutOfMemory` ; le retry asynchrone peut masquer le problème.

### 5.4 — Architecture ARM vs x86

Le bench typique en 2026 : **ARM (Graviton2/3) bat x86** sur Lambda en performance, **et** coûte 20 % moins cher.

Pour un workload IO-bound, la différence est marginale ; pour un workload CPU-bound (chiffrement, compression, parsing), elle est mesurable.

Sauf binaire compilé Intel-only, **toujours essayer ARM** :

```bash
aws lambda update-function-configuration \
  --function-name tp-m6-fn --architectures arm64
```

### 5.5 — Anti-patterns RAM/CPU

| Anti-pattern                      | Conséquence                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| 128 MB par défaut pour tout.      | Très lent et souvent plus cher au total.                        |
| 10 240 MB "pour être tranquille". | Sur-paiement massif, jamais utilisé.                            |
| Pas de re-tuning après refactor.  | Le sweet spot bouge — re-mesurer après changement significatif. |
| x86 par habitude.                 | 20 % de coût en plus pour rien.                                 |

---

## 6. Concurrency

### 6.1 — Trois notions distinctes

| Concept                     | Définition                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Unreserved concurrency**  | Le pool **partagé** du compte (par défaut 1000 par région, soft).                                   |
| **Reserved concurrency**    | On **réserve** N exécutions simultanées **pour une fonction**. Aucune autre fonction ne les "vole". |
| **Provisioned concurrency** | On **provisionne** N environnements **chauds** (cf. cold start). Facturation distincte.             |

### 6.2 — Reserved concurrency — un double rôle

```bash
aws lambda put-function-concurrency \
  --function-name tp-m6-critical \
  --reserved-concurrent-executions 200
```

Effet :

1. **Garantit** que jusqu'à 200 exécutions simultanées de **cette** fonction sont possibles, même si d'autres fonctions saturent le compte.
2. **Plafonne** : la fonction **ne peut pas dépasser 200**. Au-delà : throttling (erreur 429 `TooManyRequestsException`).

Le **plafonnement** est utile pour **protéger une dépendance fragile** (par exemple une RDS qui supporte 100 connexions max — la Lambda à 100 reserved garantit qu'on ne dépasse jamais).

Le **0** spécial : `--reserved-concurrent-executions 0` **désactive** la fonction (utile pour pause d'urgence).

### 6.3 — Burst concurrency — la montée en charge initiale

Quand une fonction reçoit une rafale subite (de 0 à 1000 invocations en 1 s), Lambda **n'instancie pas instantanément** 1000 environnements. La règle :

- **Burst initial** : 500 à 3000 envs (selon région) instantanément.
- **Au-delà** : 500 envs supplémentaires **par minute** jusqu'à atteindre le quota.

Si la demande dépasse, certaines invocations sont **throttlées** (sync : erreur immédiate ; async : queue + retry).

### 6.4 — Provisioned Concurrency — anti cold start

Vu en section 3.5. Récap :

- **N environnements toujours chauds**, prêts à répondre sans cold start.
- **Facturé** indépendamment des invocations.
- À combiner avec des **Application Auto Scaling targets** (par exemple, garder 5 env chauds en journée, 1 la nuit).

---

## 7. Réseau et VPC

### 7.1 — Lambdas non-VPC

- Par défaut, la Lambda est dans un VPC AWS managé.
- A accès Internet et endpoints publics AWS.
- **Pas d'accès** aux ressources d'un VPC privé (RDS dans subnet privé, ALB interne, services on-prem).

### 7.2 — Lambdas VPC-attached

- Attacher à 1+ subnets d'un VPC : la Lambda obtient une **ENI** dans chaque subnet.
- **Plus d'accès Internet par défaut** — il faut une NAT Gateway dans un subnet public (vu en Networking M2-M4).
- Hyperplane (introduit en 2019) a **éliminé** la pénalité de cold start liée aux ENI dans la plupart des cas.

### 7.3 — Limites VPC

- **Nombre d'ENI** dans le subnet : chaque Lambda consomme **1 ENI partagée** (Hyperplane). Capacité largement suffisante pour les workloads normaux.
- **IPs disponibles** dans le subnet : si le CIDR est petit (`/27`), des dizaines de Lambdas peuvent saturer. Préférer un subnet `/22` ou plus.

### 7.4 — Anti-patterns VPC

| Anti-pattern                                         | Conséquence                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Mettre **toutes** ses Lambdas en VPC "par sécurité". | Surcoût opérationnel + complexité réseau. À ne mettre en VPC **que** ce qui en a besoin. |
| Lambda VPC-attached qui sort sur Internet sans NAT.  | DNS résolu mais pas de route → timeout.                                                  |
| Plusieurs SG enchaînés sur la Lambda.                | Confusion de troubleshooting. Un SG par fonction suffit.                                 |
| Cross-AZ subnets non sélectionnés.                   | Si une AZ tombe, Lambda peut-être bloquée. Au moins 2 subnets sur 2 AZ.                  |

---

## 8. Stockage éphémère `/tmp`

### 8.1 — Caractéristiques

- Filesystem `/tmp` mounté dans le sandbox.
- Persiste **entre warm starts** mais perdu au cold start.
- **Limite** : 512 MB → 10 240 MB (configurable).
- Au-delà de 512 MB, facturé (~0,0000000358 $/GB-s).

### 8.2 — Cas d'usage

- Téléchargement de fichiers S3 avant traitement (pandas, ffmpeg).
- Cache local mutualisable entre warm starts (modèle ML, table de référence).
- Espace de travail pour décompression.

### 8.3 — Alternative pour gros volumes / partage entre Lambdas

- **EFS-mount** : monter un EFS dans la Lambda. Persistant, partageable, accessible aussi depuis EC2/ECS. Surcoût opérationnel (gérer EFS) mais utile pour partager 100 GB de modèles entre 50 Lambdas.
- **S3** : pour des fichiers > 10 GB, lire en streaming depuis S3 plutôt que tout télécharger en `/tmp`.

---

## 9. Lambda Layers (item N2 explicite)

### 9.1 — Définition

> Une **Lambda Layer** est une **archive ZIP** (jusqu'à 250 MB décompressé) contenant des **fichiers et bibliothèques** que plusieurs Lambdas peuvent **mutualiser**. Au démarrage de la Lambda, AWS **monte** les Layers dans `/opt`, et le runtime ajoute `/opt/python` (ou équivalent) au `PYTHONPATH`.

Trois usages typiques :

1. **Mutualiser des dépendances lourdes** : `pandas`, `numpy`, `Pillow`, `OpenCV`.
2. **Mutualiser du code commun** : utilities maison, modèles SQLAlchemy partagés, clients SDK custom.
3. **Custom runtime** : packager Rust, Bun, ou une version de Python non encore supportée.

### 9.2 — Quand utiliser une Layer

| Situation                                                  | Layer ?                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| 3+ Lambdas qui partagent `pandas`.                         | **Oui** — économies de bundle.                                 |
| 1 Lambda qui utilise `pandas`.                             | Layer optionnelle — gain négligeable.                          |
| Code applicatif qui change toutes les semaines.            | **Non** — le cycle de dev pâtit (deux artefacts à coordonner). |
| Lib interne stable (logging maison, validations communes). | **Oui** si plusieurs Lambdas l'utilisent.                      |
| Lambda avec image Docker.                                  | Inutile — la Layer est remplacée par le Dockerfile.            |
| AWS SDK (`boto3` côté Python).                             | Non — déjà fourni par le runtime.                              |

### 9.3 — Anatomie d'une Layer Python

Pour Python, la Layer doit avoir la structure suivante :

```tree
my-layer.zip
└── python/                          ← le dossier AWS reconnaît
    ├── pandas/
    ├── numpy/
    └── ... (toutes les libs)
```

### 9.4 — Construire une Layer pandas

```bash
# 1. Installer pandas dans un dossier "python/"
mkdir -p layer/python
pip install --platform manylinux2014_aarch64 \
  --target layer/python \
  --implementation cp --python-version 3.12 \
  --only-binary=:all: --upgrade pandas

# 2. Zipper
cd layer && zip -r ../pandas-layer.zip python/ && cd ..

# 3. Publier la Layer
aws lambda publish-layer-version \
  --layer-name pandas-py312-arm64 \
  --description "pandas 2.x for Python 3.12 ARM" \
  --zip-file fileb://pandas-layer.zip \
  --compatible-runtimes python3.12 \
  --compatible-architectures arm64
```

Sortie :

```json
{
  "LayerVersionArn": "arn:aws:lambda:eu-west-1:ACCOUNT:layer:pandas-py312-arm64:1",
  ...
}
```

**Important** : `--platform manylinux2014_aarch64` est crucial. Sans ça, `pip` installe les wheels de votre **machine locale** (macOS / Windows), incompatibles avec le runtime Lambda Linux ARM. Symptôme : `ImportError: ... incompatible architecture`.

### 9.5 — Référencer une Layer dans une Lambda

```bash
aws lambda update-function-configuration \
  --function-name tp-m6-pandas \
  --layers arn:aws:lambda:eu-west-1:ACCOUNT:layer:pandas-py312-arm64:1
```

Le code de la Lambda peut alors :

```python
import pandas as pd

def lambda_handler(event, context):
    df = pd.DataFrame({"x": [1,2,3]})
    return {"sum": int(df.x.sum())}
```

### 9.6 — Versionnement et durée de vie

- Chaque `publish-layer-version` incrémente le numéro.
- Une Lambda **référence une version précise** — modifier une Layer (rebuild + publish) ne casse **pas** les Lambdas existantes.
- Pour propager une mise à jour : mettre à jour la fonction vers la nouvelle version Layer.
- Les Layers anciennes peuvent être supprimées (`delete-layer-version`) si plus référencées.

### 9.7 — Partager une Layer entre comptes

```bash
aws lambda add-layer-version-permission \
  --layer-name pandas-py312-arm64 --version-number 1 \
  --statement-id share-with-prod \
  --principal 222222222222 \
  --action lambda:GetLayerVersion
```

Utile dans une **architecture multi-comptes** où un compte "platform" publie les Layers communes et les comptes "app" les consomment.

### 9.8 — Limites des Layers

- **5 Layers max** par fonction.
- **Taille combinée code + layers ≤ 250 MB** décompressé. C'est la même limite que le ZIP — la Layer ne donne pas plus d'espace, elle **mutualise**.
- Au-delà : passer en **image Docker**.

### 9.9 — Anti-patterns Layers

| Anti-pattern                                                      | Conséquence                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Layer contient le **code applicatif**.                            | Cycle de dev cassé, deux artefacts à coordonner.                       |
| Layer **non versionnée** dans la CI/CD.                           | Updates qui cassent les Lambdas. Toujours référencer un ARN versionné. |
| Plate-forme oubliée (`manylinux2014_aarch64`).                    | `ImportError` au runtime sur libs natives.                             |
| 5 Layers utilisées même pour des deps qui pourraient être bundle. | Limite hard atteinte, complexité inutile.                              |
| Layer qui contient des **secrets**.                               | Layers publiables — risque de fuite. Secrets dans Secrets Manager.     |

---

## 10. Diagnostic et tuning — méthode

### 10.1 — Boucle de tuning standard

1. **Mesurer** : 50-100 invocations de référence, lire les logs REPORT (`Duration`, `Init Duration`, `Max Memory Used`).
2. **Identifier le goulot** : CPU-bound (`Duration` chute avec plus de RAM) ou IO-bound (`Duration` stable quelle que soit la RAM) ?
3. **Itérer** : changer une variable à la fois (mémoire, runtime, architecture, Layer présent ou non).
4. **Comparer le coût** : `RAM × Duration` vs précédent.
5. **Documenter** : noter la config retenue et pourquoi.

### 10.2 — Métriques CloudWatch utiles

| Métrique                 | Namespace    | Description                                       |
| ------------------------ | ------------ | ------------------------------------------------- |
| `Invocations`            | `AWS/Lambda` | Nombre d'appels.                                  |
| `Errors`                 | `AWS/Lambda` | Erreurs (exceptions levées).                      |
| `Duration`               | `AWS/Lambda` | Durée du handler (sans init).                     |
| `Throttles`              | `AWS/Lambda` | Invocations refusées (concurrency dépassée).      |
| `IteratorAge`            | `AWS/Lambda` | Pour streams (Kinesis, DDB) : retard du consumer. |
| `ConcurrentExecutions`   | `AWS/Lambda` | Concurrence simultanée observée.                  |
| `ProvisionedConcurrent*` | `AWS/Lambda` | Utilisation de la PC.                             |

**Alarmes utiles** :

- `Errors > 1 %` des invocations sur 5 min.
- `Throttles > 0` sur 5 min.
- `Duration p99 > timeout × 0,8` (alerte avant timeout réel).

---

## 11. Exercices pratiques

### Exercice 1 — Audit des limites d'une Lambda existante (≈ 20 min)

**Objectif.** Maîtriser le tableau des limites.

Pour la Lambda `tp-m4-hello` créée en M4 :

1. Récupérer la config actuelle (`get-function-configuration`).
2. Établir un tableau "Limite / Valeur actuelle / Marge restante" pour : mémoire, timeout, payload sync (estimer), Layers utilisées, env vars (taille en octets), architecture.
3. Identifier celles qu'on **devrait** ajuster pour de la prod.

**Livrable.** Tableau.

### Exercice 2 — Mesurer le cold start (≈ 45 min)

**Objectif.** Item N2 explicite.

**Étapes :**

1. Créer une Lambda Python 3.12, 512 MB, qui logge `t_init_done` au top-level et `t_handler_done` dans le handler.
2. Première invocation (cold) : noter `Init Duration` + `Duration`.
3. Invocations 2-10 (warm) : noter `Duration`.
4. Attendre 15-20 min, invoquer à nouveau → constater un nouveau cold start.
5. **Ajouter** `import pandas as pd` au top-level. Re-tester.
6. Comparer `Init Duration` avant/après.

**Livrable.** Tableau avec 5 mesures cold + 5 warm, avant et après pandas.

### Exercice 3 — Construire et utiliser une Layer pandas (≈ 60 min)

**Objectif.** Item N2 explicite — Lambda Layers.

**Étapes :**

1. Construire la Layer `pandas-py312-arm64` (suivre la section 9.4).
2. La publier.
3. Créer deux Lambdas distinctes (`tp-m6-pandas-a` et `tp-m6-pandas-b`) qui font chacune un mini-traitement pandas.
4. Référencer la même Layer dans les deux.
5. Mesurer la taille de chaque ZIP **avec** et **sans** Layer.
6. Mesurer le cold start des deux.

**Livrable.** Captures CLI + bilan : "gain de N MB sur chaque Lambda".

### Exercice 4 — Power Tuning d'une Lambda CPU-bound (≈ 45 min)

**Objectif.** Le sweet spot RAM/durée.

**Étapes :**

1. Écrire une Lambda CPU-bound (par exemple : `hashlib.sha256` sur 5 MB de données en boucle).
2. Déployer 5 versions : 256, 512, 1024, 2048, 3008 MB.
3. Invoquer 20 fois chacune.
4. Calculer pour chaque version : durée moyenne, `RAM × Duration`, coût pour 1M invocations.
5. Identifier le sweet spot.

**Livrable.** Tableau + courbe (Excel / Google Sheet) coût vs RAM.

### Exercice 5 — SnapStart sur une fonction Python (≈ 30 min)

**Objectif.** Comprendre SnapStart.

**Étapes :**

1. Sur la Lambda de l'exercice 2 (avec pandas), activer SnapStart : `--snap-start ApplyOn=PublishedVersions`.
2. Publier une version.
3. Créer un alias `prod` pointant sur la version.
4. Invoquer 10 fois `tp-m6-fn:prod`. Mesurer le cold start.
5. Comparer aux mesures de l'exercice 2.

**Livrable.** Tableau comparatif avant/après SnapStart.

### Mini-défi — Définir un budget compute pour une API serverless (≈ 60 min, conceptuel)

**Cas.** Une API serverless avec :

- 1 endpoint `/upload` (200 req/jour, payload 5 MB).
- 1 endpoint `/search` (50 000 req/jour, payload 1 KB).
- 1 worker SQS qui consomme 500 000 messages/jour.

Définir :

1. Mémoire et timeout cible de chaque fonction.
2. Reserved Concurrency à fixer ?
3. Provisioned Concurrency pour quelle fonction ?
4. Faut-il une Layer ? Pour quoi ?
5. Estimation du coût mensuel (invocations + GB-seconds + PC).

**Livrable.** Document de 1 page + tableau de chiffrage.

---

## 12. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Citer **5 limites quantitatives** Lambda majeures (mémoire, timeout, payload sync/async, /tmp, ZIP, image, concurrency).
- [ ] Distinguer **soft** et **hard** limits ; savoir comment ouvrir une soft.
- [ ] Définir un **cold start** et citer ses **4 phases** (Firecracker, runtime, code init, handler).
- [ ] Donner les ordres de grandeur de cold start pour : Python `boto3` ; Python + pandas ; image Docker ; Java Spring Boot avec et sans SnapStart.
- [ ] Citer **3 stratégies** de réduction du cold start (init hors handler, SnapStart, Provisioned Concurrency).
- [ ] Expliquer la **limite de 15 minutes** et les **3 alternatives** (Step Functions, Batch, Fargate).
- [ ] Expliquer la **relation RAM/CPU** et le seuil 1 769 MB = 1 vCPU.
- [ ] Lire un log REPORT et identifier `Init Duration`, `Duration`, `Max Memory Used`.
- [ ] Distinguer **Reserved**, **Provisioned**, et **Burst** concurrency.
- [ ] Définir une **Lambda Layer** et citer 3 cas d'usage légitimes.
- [ ] Lister les **anti-patterns** de Layers (code applicatif dedans, non versionné, mauvaise plate-forme).
- [ ] Citer les **limites de Layers** (5 max, 250 MB cumulé).

### Items du glossaire visés

**N2 atteint** :

- _limitations principales d'une lambda (temps d'exécution, cold start, RAM/CPU limités)_ — sections 2, 3, 4, 5.
- _rendre disponible une bibliothèque afin de ne pas impacter la taille d'une lambda via Lambda Layers_ — section 9.

**Items N3 abordés en surface** (non couverts en profondeur) :

- _stratégies pour contourner le cold start_ — section 3.5.
- _stratégie de throttling pertinente_ — section 6.2 (Reserved concurrency à des fins de protection).

---

## 13. Ressources complémentaires

### Documentation AWS

- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Operating Lambda: performance optimization](https://aws.amazon.com/blogs/compute/operating-lambda-performance-optimization-part-1/)
- [Lambda SnapStart](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html)
- [Provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html)
- [Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [Lambda monitoring metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html)

### Outils

- [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning)
- [AWS Lambda Powertools (Python / Node / Java)](https://docs.powertools.aws.dev/) — logging, tracing, batch, idempotency.
- [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/) — packaging Lambda + dependencies + layers + triggers.

### Pricing

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/) — calcul détaillé.
- [Provisioned Concurrency pricing](https://aws.amazon.com/lambda/pricing/#Provisioned_Concurrency_Pricing).

### Pour aller plus loin

- **M7 (AppRunner et serverless)** — autres formes de serverless quand Lambda atteint ses limites.
- **M8 (Batch vs Lambda)** — quand passer en Batch (long, lourd, GPU).
- **M9 (Step Functions)** — orchestrer des Lambdas courtes pour dépasser les 15 min.
- **M10 (ECR)** — packaging image pour Lambda Docker.
- **AWS Analytics M1-M2** — CloudWatch Logs Insights pour analyser massivement les logs Lambda.
