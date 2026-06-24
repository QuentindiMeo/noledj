# M3 — Métriques et monitoring

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Définir **CloudWatch** comme service de monitoring d'AWS, expliquer ce qu'est une **métrique** (namespace, nom, dimensions, statistique, granularité) et un **datapoint**.
- Lister les **métriques EC2 disponibles par défaut** (CPU, réseau, disque "Instance Store", status checks) et — point structurant — savoir **ce qui n'est PAS disponible par défaut** (RAM, espace disque filesystem, processus).
- Installer et configurer le **CloudWatch Agent** pour exposer les métriques manquantes (RAM, disque, processus, logs applicatifs).
- Lire et interpréter les **4 catégories de métriques** d'une EC2 — CPU, RAM, disque, réseau — et identifier des **patterns de saturation** typiques (CPU steal, swap, throttling EBS, packet drops).
- Créer une **alarme CloudWatch** sur un seuil, la **router** vers SNS / Auto Scaling / EventBridge, et concevoir un **dashboard** de pilotage opérationnel.
- Comprendre la mécanique des **status checks** (System / Instance / Attached EBS) et savoir réagir aux trois types d'échecs.

## Durée estimée

1 jour.

## Pré-requis

- M1 et M2 (lancer, gérer le cycle de vie d'une EC2).
- AWS CLI v2 configurée.
- Permissions IAM : `cloudwatch:*`, `logs:*`, `ec2:DescribeInstances`, `ssm:*` (pour installer l'agent via SSM).
- Une instance EC2 en `running` pour les exercices (Amazon Linux 2023 ou Ubuntu).
- AWS Identity M3 — recommandé (Instance Profile : on attachera un rôle pour que l'agent puisse publier des métriques).

---

## 1. Pourquoi le monitoring est un prérequis, pas une finition

### 1.1 — La règle qu'on apprend une fois et qu'on ne relâche plus

> **Une infrastructure sans monitoring est invisible et donc indéfendable.**

Trois conséquences directes :

- **Impossible de diagnostiquer** un incident : "ça rame", oui, mais quoi exactement ? CPU saturé ? Disque plein ? Réseau écroulé ? Sans données, on tâtonne.
- **Impossible de rightsizer** : on prend un `m6i.xlarge` "pour être tranquille" et il reste à 5 % de CPU pendant des mois — facture multipliée par 3 sans bénéfice.
- **Impossible de scaler intelligemment** : un Auto Scaling Group qui scale-out se déclenche sur une **métrique** ; sans monitoring, on scale à la louche.

Ce module installe le **réflexe** : avant de mettre une EC2 en production, on définit **quelles métriques** on suit, **quels seuils** sont préoccupants, **qui** est alerté quand c'est dépassé.

### 1.2 — L'analogie du tableau de bord d'une voiture

Penser à CloudWatch comme le **tableau de bord** d'une voiture :

- **Compteur de vitesse (CPU)** : aiguille au rouge en permanence = moteur saturé.
- **Niveau d'huile / température (RAM, disque)** : voyant orange = stocker plus de mémoire bientôt, sinon casse.
- **Niveau de carburant (disque)** : sans réserve = arrêt brutal imminent (filesystem plein → crash applicatif).
- **Tachymètre / régime moteur (réseau, IOPS)** : surrégime soutenu = casse à terme.
- **Voyant moteur (status checks)** : allumé = panne profonde, l'instance est compromise.

Une voiture sans tableau de bord avancerait quand même… jusqu'à ce qu'elle s'arrête. Une EC2 sans CloudWatch fait pareil.

### 1.3 — Trois questions auxquelles le monitoring doit répondre

| Question                                   | Métriques principales                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| Mon instance est-elle **en surcharge** ?   | CPU, RAM, disque IOPS, réseau in/out.                 |
| Mon instance est-elle **en sous-charge** ? | Mêmes métriques + observation sur une fenêtre longue. |
| Mon instance est-elle **en panne** ?       | Status checks System / Instance, métriques en erreur. |

Toutes les sections suivantes alimentent ces trois questions.

### 1.4 — Anti-patterns récurrents

| Anti-pattern                                                      | Conséquence                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "EC2 lancée, le monitoring CloudWatch suffit, c'est gratuit."     | Faux : la RAM et le disque filesystem **ne** sont **pas** monitorés par défaut.               |
| Configurer 50 alarmes "au cas où".                                | Saturation des notifications → alerte ignorée. Préférer 5 alarmes critiques précises.         |
| Alarmes sur 1 minute sans `EvaluationPeriods`.                    | Flapping (alarme qui clignote sur des pics transitoires).                                     |
| Ne jamais regarder les **status checks**.                         | Une instance qui a perdu son réseau ou son host AWS reste "running" en facture sans répondre. |
| CloudWatch Logs sans **rétention** définie.                       | Coût qui explose sur 2 ans, logs jamais nettoyés.                                             |
| Métriques **détaillées (1 min)** activées partout sans réflexion. | Surcoût (0,30 $/mois par instance × milliers d'instances).                                    |

---

## 2. CloudWatch — le backbone de monitoring AWS

### 2.1 — Ce qu'est CloudWatch

> **Amazon CloudWatch** est le service de **monitoring** centralisé d'AWS. Il collecte des **métriques** (séries temporelles), des **logs**, et des **événements** depuis quasiment tous les services AWS, et permet de définir des **alarmes** et des **dashboards** par-dessus.

Trois sous-services principaux :

| Sous-service           | Rôle                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **CloudWatch Metrics** | Stockage et visualisation de séries temporelles (CPU, latence, requêtes, …).           |
| **CloudWatch Logs**    | Ingestion, stockage, recherche de logs textuels (système, app, AWS services).          |
| **CloudWatch Alarms**  | Déclenchement d'actions (SNS, Auto Scaling, EventBridge) au franchissement d'un seuil. |

D'autres briques annexes : **Metric Streams** (export en temps réel), **Logs Insights** (requêtes structurées), **Container Insights**, **Synthetics** (sondes synthétiques), **RUM** (real user monitoring). Hors périmètre direct de ce module.

### 2.2 — Vocabulaire des métriques

Une **métrique** dans CloudWatch est identifiée par :

| Concept         | Définition                                                                              | Exemple                                               |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Namespace**   | "Catégorie" de la métrique. Un service = un namespace.                                  | `AWS/EC2`, `AWS/RDS`, `AWS/Lambda`, `MyApp/Custom`.   |
| **Metric name** | Nom de la métrique dans le namespace.                                                   | `CPUUtilization`, `NetworkIn`, `mem_used_percent`.    |
| **Dimensions**  | Couples clé-valeur qui **scopent** la métrique à une ressource.                         | `InstanceId=i-0abc`, `AutoScalingGroupName=asg-x`.    |
| **Datapoint**   | Une valeur à un instant donné.                                                          | `(2026-05-18T14:01:00Z, 42.5)`.                       |
| **Statistic**   | Aggrégation appliquée sur une fenêtre de temps (`Sum`, `Average`, `Maximum`, `p99`, …). | `Average` sur 5 min = moyenne de tous les datapoints. |
| **Period**      | Taille de la fenêtre d'agrégation.                                                      | 60 s, 300 s, 3600 s.                                  |
| **Granularité** | Fréquence à laquelle la métrique est publiée.                                           | 5 min (standard) ou 1 min (détaillé).                 |

### 2.3 — Standard vs Detailed Monitoring

Pour EC2 :

| Mode                    | Granularité | Coût                                                       |
| ----------------------- | ----------- | ---------------------------------------------------------- |
| **Standard Monitoring** | 5 minutes   | **Gratuit** pour les métriques par défaut EC2.             |
| **Detailed Monitoring** | 1 minute    | ~0,30 $/instance/mois (pricing CloudWatch Custom Metrics). |

Quand activer detailed :

- Workload **rapide** où une saturation de 2 min nécessite réaction immédiate.
- Auto Scaling **agressif** (scale-in/out fréquent) qui prend ses décisions sur 1 min.

Pour le reste, **standard suffit**.

```bash
# Activer detailed monitoring sur une instance
aws ec2 monitor-instances --instance-ids i-0123
# Désactiver
aws ec2 unmonitor-instances --instance-ids i-0123
```

### 2.4 — Rétention des métriques

CloudWatch stocke les métriques avec une **rétention dégressive** :

| Granularité de publication | Rétention |
| -------------------------- | --------- |
| < 60 secondes              | 3 heures  |
| 1 minute                   | 15 jours  |
| 5 minutes                  | 63 jours  |
| 1 heure                    | 15 mois   |

Au-delà, les datapoints sont **agrégés** ou **supprimés**. Pour conserver l'historique long terme, exporter vers S3 via Metric Streams ou via une Lambda planifiée.

---

## 3. Les métriques EC2 par défaut — ce qu'on a sans rien faire

Quand on lance une EC2, **AWS publie automatiquement** un jeu de métriques dans le namespace `AWS/EC2`, sans installation d'agent. Toutes sont en granularité 5 min (ou 1 min en detailed).

### 3.1 — Métriques disponibles d'office

| Métrique                       | Unité | Description                                                                       |
| ------------------------------ | ----- | --------------------------------------------------------------------------------- |
| **CPUUtilization**             | %     | Pourcentage de CPU utilisé sur l'instance (côté hyperviseur).                     |
| **NetworkIn**                  | bytes | Trafic réseau entrant total sur toutes les interfaces.                            |
| **NetworkOut**                 | bytes | Trafic réseau sortant total.                                                      |
| **NetworkPacketsIn**           | count | Nombre de paquets entrants.                                                       |
| **NetworkPacketsOut**          | count | Nombre de paquets sortants.                                                       |
| **DiskReadBytes**              | bytes | Octets lus depuis les **instance store** volumes (pas EBS !).                     |
| **DiskWriteBytes**             | bytes | Octets écrits sur **instance store**.                                             |
| **DiskReadOps**                | count | Nombre de read I/O sur instance store.                                            |
| **DiskWriteOps**               | count | Nombre de write I/O sur instance store.                                           |
| **StatusCheckFailed**          | 0/1   | 1 si un des deux status checks est en échec (voir 3.3).                           |
| **StatusCheckFailed_System**   | 0/1   | 1 si le **System status** est en échec (problème côté AWS host).                  |
| **StatusCheckFailed_Instance** | 0/1   | 1 si l'**Instance status** est en échec (problème côté OS).                       |
| **MetadataNoToken**            | count | Nombre de requêtes IMDS sans token IMDSv2 (utile pour traquer les usages legacy). |

Pour les instances **burstable** (T family), métriques supplémentaires :

| Métrique                     | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| **CPUCreditUsage**           | Crédits CPU consommés sur la période.                                       |
| **CPUCreditBalance**         | Crédits CPU restants.                                                       |
| **CPUSurplusCreditBalance**  | Crédits dépassement (en mode Unlimited).                                    |
| **CPUSurplusCreditsCharged** | Surplus déjà facturés (impacte la facture).                                 |
| **BurstBalance**             | Pour les volumes `gp2` / `st1` : niveau du seau de burst IOPS / throughput. |

### 3.2 — Le grand absent : RAM, disque filesystem, processus

**Très important** : AWS **ne voit pas** ce qui se passe **dans** l'OS de l'instance. Concrètement, sans agent :

| Information utile                                     | Disponible par défaut ?    |
| ----------------------------------------------------- | -------------------------- |
| RAM utilisée / libre                                  | **Non**                    |
| Swap utilisé                                          | **Non**                    |
| Espace disque libre sur `/`, `/var`, `/data`          | **Non**                    |
| Nombre de processus, processus zombies                | **Non**                    |
| Charge applicative (requêtes/s, latence, erreurs)     | **Non** (sauf agent dédié) |
| Logs système (`/var/log/syslog`, `/var/log/messages`) | **Non**                    |
| Logs applicatifs                                      | **Non**                    |

**Pourquoi** ? AWS gère l'hyperviseur, donc voit ce qui sort de l'hyperviseur (CPU consommé, paquets réseau). Mais le système invité (OS Linux/Windows) est **opaque** pour AWS — il faudrait y mettre un agent. C'est exactement ce que fait CloudWatch Agent (section 4).

Conséquence pratique : un serveur peut être **complètement OOM-killed** (Out of Memory) **sans aucune alarme** CloudWatch native. Le CPU restera à 0 %, le réseau aussi, et le `StatusCheckFailed` ne se déclenche **que** si l'OS ne répond plus du tout aux pings d'AWS.

### 3.3 — Les status checks — la santé de l'instance

AWS exécute en permanence **deux checks** sur chaque instance :

| Check                     | Vérifie                                                                   | Résolution si échec                                                          |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **System Status Check**   | Côté AWS : santé du host physique, du réseau, de l'alimentation.          | **Côté AWS** : attendre, ou stop/start (l'instance migre sur un autre host). |
| **Instance Status Check** | Côté OS : kernel boot OK, réseau de l'instance OK, pas de panique kernel. | **Côté nous** : reboot, debug applicatif, restaurer un snapshot.             |

Depuis 2023, un **3e check** est exposé pour les volumes EBS attachés :

| Check                         | Vérifie                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Attached EBS Status Check** | Tous les volumes EBS attachés peuvent répondre aux I/O (sinon l'instance peut être bloquée en lecture). |

```bash
# Voir les status checks d'une instance
aws ec2 describe-instance-status --instance-ids i-0123 \
  --query 'InstanceStatuses[0].{
    System: SystemStatus.Status,
    Instance: InstanceStatus.Status,
    Events: Events
  }'
```

Réaction recommandée :

- **System failed** : surveiller. Si ça persiste plus de 20 minutes, **stop + start** (l'instance migrera vers un autre host AWS sain).
- **Instance failed** : se connecter (SSH ou SSM Session Manager) et investiguer. Si pas possible : reboot.
- **Attached EBS failed** : risque de système de fichiers corrompu. Snapshot avant tout debug.

### 3.4 — Consulter les métriques par défaut

Via la CLI :

```bash
# Liste des métriques EC2 disponibles
aws cloudwatch list-metrics --namespace AWS/EC2 --dimensions Name=InstanceId,Value=i-0123

# Récupérer les datapoints CPU des dernières 3 heures
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0123 \
  --start-time $(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average Maximum
```

Pour des requêtes plus expressives (multi-métriques, calculs), préférer `get-metric-data` avec un Metric Math.

---

## 4. CloudWatch Agent — combler les manques

### 4.1 — Pourquoi cet agent

Le **CloudWatch Agent** est un binaire à installer sur l'instance qui :

- Collecte les **métriques système** invisibles à AWS : RAM, disque filesystem, swap, processus, network par interface.
- Pousse des **logs applicatifs** et système vers CloudWatch Logs.
- Tourne sur Linux et Windows.
- Se configure via un fichier JSON ou via SSM Parameter Store.

C'est l'outil **standard** AWS pour observer un EC2 en profondeur. Toute production sérieuse l'a déployé.

### 4.2 — Installer l'agent

Trois méthodes, par ordre de préférence :

**Méthode 1 — via AMI Amazon Linux 2023 (l'agent est pré-installé)** :

```bash
sudo systemctl enable amazon-cloudwatch-agent
sudo systemctl start amazon-cloudwatch-agent
```

**Méthode 2 — via SSM (déploiement à l'échelle)** :

```bash
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters "action=Install,name=AmazonCloudWatchAgent" \
  --targets "Key=instanceids,Values=i-0123"
```

**Méthode 3 — paquet manuel (Ubuntu, etc.)** :

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

L'agent requiert **un rôle IAM** sur l'instance avec la policy managée **`CloudWatchAgentServerPolicy`** (ou un équivalent custom). Sans rôle, il ne peut pas publier de métriques ou de logs.

### 4.3 — Fichier de configuration

L'agent lit `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`. Exemple minimal :

```json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "cwagent"
  },
  "metrics": {
    "namespace": "Noledj/EC2Custom",
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}",
      "AutoScalingGroupName": "${aws:AutoScalingGroupName}"
    },
    "metrics_collected": {
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent"]
      },
      "swap": {
        "measurement": ["swap_used_percent"]
      },
      "disk": {
        "resources": ["/", "/var", "/home"],
        "measurement": ["used_percent", "inodes_free"],
        "ignore_file_system_types": ["sysfs", "tmpfs"]
      },
      "diskio": {
        "resources": ["*"],
        "measurement": [
          "reads",
          "writes",
          "read_bytes",
          "write_bytes",
          "io_time"
        ]
      },
      "netstat": {
        "measurement": ["tcp_established", "tcp_time_wait"]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/messages",
            "log_group_name": "/ec2/{instance_id}/messages",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/myapp/*.log",
            "log_group_name": "/ec2/{instance_id}/myapp",
            "retention_in_days": 14
          }
        ]
      }
    }
  }
}
```

**Démarrage avec ce fichier** :

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s
```

L'agent commence à publier les métriques dans le namespace **`Noledj/EC2Custom`** (custom — donc facturées comme custom metrics, ~0,30 $/métrique/mois).

### 4.4 — Bonnes pratiques de configuration

- **Choisir 5-15 métriques système clés**, pas 50 — chaque métrique custom coûte ~0,30 $/mois × N instances.
- **Filtrer les filesystems** (`ignore_file_system_types`) pour ne pas mesurer 30 pseudo-FS Linux.
- **Définir la rétention des logs** au moment de la création des log groups (sinon **jamais expire**, coûteux).
- **Centraliser via SSM Parameter Store** : `aws ssm put-parameter --name /noledj/cw-agent-config ...` puis charger depuis l'agent — permet de déployer la même config sur 100 instances sans toucher chaque machine.

---

## 5. CPU — la métrique reine

### 5.1 — `CPUUtilization`

Définition : **pourcentage de temps où le CPU virtuel de l'instance est actif** sur la fenêtre de mesure.

Lecture :

| Valeur observée                               | Diagnostic typique                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| **0-30 %**                                    | Instance sous-utilisée. Considérer un type plus petit (économie 30-50 %). |
| **30-70 %**                                   | Zone confortable.                                                         |
| **70-90 %**                                   | Charge élevée. Préparer le scaling.                                       |
| **90-100 %** soutenu                          | Saturation. Latence en hausse, throttling possible.                       |
| **100 %** ponctuel sur instance T sans crédit | Voir 5.3 — vous êtes throttlé à la baseline (par exemple 20 %).           |

**Attention à la moyenne** : un CPU **moyen** à 40 % cache parfois des **pics** à 100 % toutes les 5 minutes. Toujours regarder aussi la statistique **Maximum** sur la même période.

### 5.2 — Côté CPU vu de l'OS

L'agent CloudWatch expose en supplément :

| Métrique           | Interprétation                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| `cpu_usage_user`   | % du temps dans l'espace utilisateur (apps).                                     |
| `cpu_usage_system` | % du temps en kernel (syscalls, drivers).                                        |
| `cpu_usage_iowait` | % du temps **bloqué sur I/O** — fort iowait = disque ou réseau qui ralentissent. |
| `cpu_usage_steal`  | % du temps "volé" par d'autres VMs sur le même host — typique d'un host saturé.  |
| `cpu_usage_idle`   | % d'idle réel.                                                                   |

Quatre patterns classiques :

| Symptôme                                                 | Cause probable                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `CPUUtilization` à 80 %, dont 70 % iowait.               | Saturation **disque**, pas CPU. Le CPU "attend" l'I/O.              |
| `cpu_steal` > 5 % en continu.                            | Host AWS surchargé, voisin gourmand. **Stop + start** pour migrer.  |
| `cpu_system` 30 % + paquets réseau très élevés.          | Surcharge kernel par les interruptions réseau.                      |
| `CPUUtilization` à 20 % mais latence applicative élevée. | Le problème **n'est pas** dans le CPU — chercher RAM/disque/réseau. |

### 5.3 — CPU credits sur les instances T

Pour les instances burstables (`t2`, `t3`, `t3a`, `t4g`), la véritable métrique critique est :

- **`CPUCreditBalance`** : crédits restants. À 0 → throttling à la baseline (par exemple 20 % pour `t3.medium`).
- **`CPUSurplusCreditBalance`** : crédits empruntés (mode Unlimited). Si ça monte, la facture overflow Unlimited grimpe.

**Alarme typique sur T** : `CPUCreditBalance < 50` pendant 5 min consécutives → soit upgrade vers M, soit accepter Unlimited.

```txt
   CPUCreditBalance
        │
   720 ─┤▁▁▁▁▂▃▅▆▇ (instance idle accumule des crédits)
        │
   200 ─┤            ▇▆▅▃▂▁ (instance soudain en charge)
        │
     0 ─┤                  └─── throttling commence
        └──────────────────────────────►  temps
```

---

## 6. RAM — la métrique invisible par défaut

### 6.1 — Métriques disponibles (via agent uniquement)

| Métrique                | Description                                                         | Seuil de vigilance |
| ----------------------- | ------------------------------------------------------------------- | ------------------ |
| `mem_used_percent`      | % de RAM utilisée (hors cache).                                     | > 80 %             |
| `mem_available_percent` | % de RAM **réellement disponible** (incluant le cache reclaimable). | < 20 %             |
| `mem_buffered`          | RAM en buffer kernel.                                               | informatif         |
| `mem_cached`            | RAM en cache (filesystem).                                          | informatif         |
| `swap_used_percent`     | % de swap utilisé.                                                  | > 0 % soutenu      |

### 6.2 — Lire la RAM Linux — `used` vs `available`

**Piège classique** : `mem_used_percent = 95 %` peut être normal sur un Linux récent. Le kernel utilise la RAM libre comme cache filesystem ; cette RAM est **récupérable instantanément** dès qu'une app en demande.

La métrique **réellement préoccupante** est `mem_available_percent` :

- 30 % → confortable.
- 10 % → la prochaine app va peut-être devoir swapper.
- 0 % → OOM-killer Linux va tuer le plus gros processus pour libérer.

### 6.3 — Swap — signal d'alarme

Swap > 0 % en continu sur un serveur applicatif = **mauvais signe** :

- L'OS a manqué de RAM réelle et écrit des pages sur disque.
- Performance dégradée d'un facteur 10-100 sur les accès swap.
- À résoudre par : ajout de RAM (type d'instance plus gros) ou diminution du footprint mémoire de l'app.

```bash
# Vérifier swap depuis l'instance
free -h
swapon --show
```

### 6.4 — OOM — Out Of Memory

Quand Linux n'a plus de RAM libre et plus de swap, l'**OOM-killer** déclenche : il tue le plus gros processus.

Symptôme côté CloudWatch (sans agent) :

- Application redémarrée brutalement, sans cause visible.
- CPU revient à 0 après le kill.

Symptôme côté logs (`/var/log/messages` ou `journalctl`) :

```log
Out of memory: Killed process 1234 (java) total-vm:... anon-rss:...
```

D'où l'importance de :

1. Faire ingérer `/var/log/messages` (ou `/var/log/kern.log`) par CloudWatch Logs.
2. Alarmer sur `mem_used_percent > 80 %` ou `mem_available_percent < 20 %`.

---

## 7. Disque — instance store, EBS, filesystem

Trois "couches" de métriques disque, à ne pas confondre.

### 7.1 — Instance Store (volatile, AWS-native)

Les métriques par défaut `DiskReadBytes`, `DiskWriteBytes`, `DiskReadOps`, `DiskWriteOps` couvrent **uniquement** les instance store volumes (NVMe locaux pour `i3`, `i4i`, `d3`, etc.).

**Pour la majorité des EC2** qui utilisent EBS, ces métriques **restent à zéro** — c'est trompeur.

### 7.2 — EBS — métriques côté volume

EBS expose son propre namespace `AWS/EBS` :

| Métrique                     | Description                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| `VolumeReadBytes`            | Octets lus.                                                        |
| `VolumeWriteBytes`           | Octets écrits.                                                     |
| `VolumeReadOps`              | IOPS de lecture.                                                   |
| `VolumeWriteOps`             | IOPS d'écriture.                                                   |
| `VolumeTotalReadTime`        | Temps cumulé d'I/O lecture (utile pour calcul de latence moyenne). |
| `VolumeTotalWriteTime`       | Temps cumulé d'I/O écriture.                                       |
| `VolumeQueueLength`          | Profondeur de file d'attente — > 5 soutenu = goulot disque.        |
| `BurstBalance`               | Pour `gp2` / `st1` : seau de burst restant en %.                   |
| `VolumeThroughputPercentage` | Pour `io1`/`io2` : % du throughput provisionné consommé.           |
| `VolumeIdleTime`             | Temps cumulé d'idle.                                               |

Trois signaux d'alarme :

- **`BurstBalance < 20 %`** sur `gp2` : le seau de burst se vide → IOPS qui vont chuter à la baseline. Migrer vers `gp3` ou ajouter IOPS.
- **`VolumeQueueLength` > 5** soutenu : goulot disque. Soit upgrade IOPS, soit changer de type (vers `io2`).
- **Latence I/O** dérivable de `VolumeTotalReadTime / VolumeReadOps` : > 10 ms typiquement préoccupant pour un workload OLTP.

### 7.3 — Filesystem — métriques côté OS (via agent)

L'EBS volume **brut** ne dit rien sur l'espace **utilisé** par le filesystem. L'agent comble :

| Métrique            | Description                                                             | Seuil de vigilance |
| ------------------- | ----------------------------------------------------------------------- | ------------------ |
| `disk_used_percent` | % d'espace utilisé sur le montage.                                      | > 80 %             |
| `disk_inodes_free`  | Inodes libres — important pour des FS avec beaucoup de petits fichiers. | < 10 % du total    |

**Configuration agent** :

```json
"disk": {
  "resources": ["/", "/var", "/data"],
  "measurement": ["used_percent", "inodes_free"]
}
```

Un disque plein à 100 % cause :

- Crash applicatif (impossibilité d'écrire un log → certaines apps plantent).
- Impossibilité d'écrire un fichier temporaire de package manager → mises à jour bloquées.
- Corruption potentielle des bases de données.

**Alarme `disk_used_percent > 85 %`** est un des "must-have" du monitoring EC2.

### 7.4 — Schéma récapitulatif disque

```graphviz
  ┌──────────────────────────┐
  │ Filesystem ext4 / xfs    │  ← disk_used_percent (agent)
  │ /, /var, /data           │     inodes_free (agent)
  └───────────┬──────────────┘
              │
  ┌──────────────────────────┐
  │ EBS Volume gp3 / io2     │  ← VolumeReadOps, BurstBalance (AWS/EBS)
  │ (vol-0abc, attaché)      │     VolumeQueueLength (AWS/EBS)
  └───────────┬──────────────┘
              │
  ┌──────────────────────────┐
  │ Instance Store (NVMe)    │  ← DiskReadOps (AWS/EC2, défaut)
  │ (si instance i3, i4i…)   │     DiskReadBytes (AWS/EC2)
  └──────────────────────────┘
```

---

## 8. Réseau

### 8.1 — Métriques disponibles

| Métrique            | Unité     | Description                            |
| ------------------- | --------- | -------------------------------------- |
| `NetworkIn`         | bytes/min | Bytes reçus sur toutes les interfaces. |
| `NetworkOut`        | bytes/min | Bytes envoyés.                         |
| `NetworkPacketsIn`  | count     | Paquets reçus.                         |
| `NetworkPacketsOut` | count     | Paquets envoyés.                       |

**Via agent (Linux netstat)** :

| Métrique                  | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `netstat_tcp_established` | Nombre de connexions TCP `ESTABLISHED`. Saturation possible si gros nombre.                    |
| `netstat_tcp_time_wait`   | Connexions en `TIME_WAIT` — typique d'apps qui ouvrent/ferment beaucoup de connexions courtes. |

### 8.2 — Bande passante d'une instance — la limite cachée

Chaque type d'instance a un **plafond de bande passante** (souvent appelé "Burst Network Bandwidth"). Quelques exemples :

| Type            | Network "burst"                    |
| --------------- | ---------------------------------- |
| `t3.medium`     | "Up to 5 Gbps" (peu garantie)      |
| `m6i.large`     | "Up to 12.5 Gbps"                  |
| `m6i.4xlarge`   | "Up to 12.5 Gbps" (constants ici)  |
| `c7gn.16xlarge` | "Up to 200 Gbps" (réseau optimisé) |

Pour les petites instances, "Up to X Gbps" ressemble à du burst : on a un seau qui se vide quand on tient le débit. **Quand on le vide**, la bande passante chute à la baseline soutenue (souvent 100-500 Mbps). Symptôme : à un moment précis, le temps de réponse réseau augmente brutalement, indépendamment du CPU.

Hélas, CloudWatch **n'expose pas** directement le seau de burst réseau pour les EC2 (contrairement à EBS). Il faut le **déduire** d'un `NetworkIn + NetworkOut` qui plafonne soudainement.

### 8.3 — Métriques avancées via Network Performance Monitoring

Depuis 2023, les ENA (Elastic Network Adapter) modernes exposent des compteurs avancés via SSM Inventory + CloudWatch :

- `bw_in_allowance_exceeded` : paquets droppés parce que la bande passante d'entrée a été dépassée.
- `bw_out_allowance_exceeded` : idem en sortie.
- `pps_allowance_exceeded` : paquets droppés à cause du PPS (packets per second) limit.
- `conntrack_allowance_exceeded` : connexions droppées du fait du conntrack.

À chercher quand on a des **packet drops mystérieux** sans saturation visible.

---

## 9. Alarmes — passer du monitoring à la réaction

### 9.1 — Anatomie d'une alarme

Une **alarme CloudWatch** est définie par :

| Paramètre              | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| **MetricName**         | La métrique à surveiller.                                       |
| **Namespace**          | Son namespace.                                                  |
| **Dimensions**         | La ressource ciblée.                                            |
| **Statistic**          | Aggrégation (`Average`, `Maximum`, `p95`, …).                   |
| **Period**             | Fenêtre d'évaluation (60, 300, 3600 s).                         |
| **EvaluationPeriods**  | Nombre de périodes consécutives pour déclencher.                |
| **DatapointsToAlarm**  | Combien de datapoints "anormaux" dans la fenêtre déclenchent.   |
| **Threshold**          | Valeur seuil.                                                   |
| **ComparisonOperator** | `GreaterThanThreshold`, `LessThanThreshold`, etc.               |
| **TreatMissingData**   | `notBreaching`, `breaching`, `missing`, `ignore`.               |
| **AlarmActions**       | ARNs des actions à déclencher : SNS, Auto Scaling, EventBridge. |

### 9.2 — Une alarme CPU > 80 % pendant 10 minutes

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "cpu-high-prod-web-01" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0abc \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:eu-west-1:111111111111:ops-alerts
```

Décomposition :

- **Period 300 s + EvaluationPeriods 2** : il faut **2 datapoints consécutifs de 5 min** au-dessus du seuil, soit 10 min de saturation soutenue. Évite le flapping sur un pic transitoire.
- **TreatMissingData notBreaching** : si l'instance ne publie pas de métrique (par exemple en train de stopper), on **ne** déclenche **pas** l'alarme.

### 9.3 — Trois alarmes "starter pack" pour une EC2 standard

| Alarme                                  | Threshold               | Action recommandée                           |
| --------------------------------------- | ----------------------- | -------------------------------------------- |
| **CPU > 80 % pendant 10 min**           | Average > 80, 2 × 5 min | SNS Ops + envisager scaling out.             |
| **Disk used % > 85 %** (via agent, `/`) | Average > 85, 1 × 5 min | SNS Ops + script de purge automatique.       |
| **StatusCheckFailed > 0 pendant 5 min** | Maximum >= 1, 1 × 5 min | SNS Ops + auto-reboot via CloudWatch action. |

L'action "reboot automatique" sur StatusCheckFailed :

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "status-check-failed-prod-web-01" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0abc \
  --statistic Maximum \
  --period 60 --evaluation-periods 2 --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:automate:eu-west-1:ec2:reboot
```

L'ARN `arn:aws:automate:REGION:ec2:reboot` (ou `:stop`, `:terminate`) est une **action AWS-managed** qui agit directement sur l'instance, sans Lambda intermédiaire.

### 9.4 — Composite alarms

Pour combiner plusieurs alarmes en une "macro-alarme" (par exemple "CPU haut **ET** RAM haute **ET** disque haut" = vraie saturation, pas seul pic transitoire) :

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name "saturation-vraie-prod-web-01" \
  --alarm-rule "ALARM(\"cpu-high\") AND ALARM(\"ram-high\")" \
  --actions-enabled \
  --alarm-actions arn:aws:sns:eu-west-1:111111111111:ops-alerts
```

Très utile pour réduire le bruit.

---

## 10. Dashboards — la vue d'ensemble

### 10.1 — À quoi sert un dashboard

Un **CloudWatch Dashboard** réunit plusieurs widgets (graphes, chiffres, textes) sur une page unique. Trois usages typiques :

- **Pilotage opérationnel** : vue 1-écran des indicateurs critiques de la prod (latence p99, taux d'erreurs, CPU des nodes, etc.).
- **Audit** : tableau partageable à un manager / client pendant un incident.
- **Comparaison avant/après** : suivi pendant un déploiement ou un test de charge.

### 10.2 — Créer un dashboard minimal

Via la console : "CloudWatch > Dashboards > Create dashboard", puis ajouter des widgets.

Via la CLI :

```bash
cat > dashboard.json <<EOF
{
  "widgets": [
    {
      "type": "metric", "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "i-0abc"]
        ],
        "region": "eu-west-1",
        "title": "CPU - prod-web-01",
        "view": "timeSeries"
      }
    },
    {
      "type": "metric", "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "metrics": [
          ["Noledj/EC2Custom", "mem_used_percent", "InstanceId", "i-0abc"],
          [".", "swap_used_percent", ".", "."]
        ],
        "region": "eu-west-1",
        "title": "RAM & Swap - prod-web-01"
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard \
  --dashboard-name "prod-web" \
  --dashboard-body file://dashboard.json
```

### 10.3 — Le pattern "4 quadrants" recommandé

Pour une EC2 unique, un dashboard structurant :

```txt
┌────────────────────────────┬────────────────────────────┐
│ CPU (Util, iowait, steal)  │ RAM (used %, swap %)       │
├────────────────────────────┼────────────────────────────┤
│ Disque (used %, IOPS, BB)  │ Réseau (In/Out, drops)     │
└────────────────────────────┴────────────────────────────┘
```

Pour un cluster Auto Scaling, on remplace les graphes "InstanceId" par des aggregats `AutoScalingGroupName` (somme/moyenne sur le groupe).

---

## 11. Logs — mention courte

CloudWatch Logs est couvert en détail dans le parcours **AWS Analytics (M1-M2)**. Pour ce module :

- L'agent CloudWatch peut **pousser n'importe quel fichier de log** vers CloudWatch Logs.
- Chaque log file → un **log group** (par exemple `/ec2/prod-web/myapp.log`).
- **Toujours définir une rétention** (`retention_in_days`) lors de la création, sinon "Never expire" → facture qui grimpe.
- Pour des requêtes : **CloudWatch Logs Insights** propose un mini-langage SQL-like.

Exemple Insights :

```txt
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 20
```

---

## 12. Exercices pratiques

### Exercice 1 — Cartographier les métriques disponibles d'une EC2 fraîche (≈ 20 min)

**Objectif.** Maîtriser ce qui est dispo "par défaut" et ce qui ne l'est pas.

**Étapes :**

1. Lancer une `t3.micro` (M1).
2. Attendre 10 minutes.
3. Lister les métriques publiées dans `AWS/EC2` pour cette instance.
4. Faire un tableau : "CPU ✅, RAM ❌, disque OS ❌, réseau ✅, status checks ✅".
5. Lister les **status checks** via `describe-instance-status` et confirmer qu'ils sont OK.

**Livrable.** Capture des métriques + tableau.

### Exercice 2 — Installer le CloudWatch Agent et publier la RAM (≈ 45 min)

**Objectif.** L'item N1 explicite : monitorer la **consommation de RAM**.

**Étapes :**

1. Attacher un Instance Profile avec `CloudWatchAgentServerPolicy` à l'instance.
2. Installer l'agent (paquet AL2023 ou Ubuntu).
3. Écrire une config minimale qui collecte : `mem_used_percent`, `swap_used_percent`, `disk used_percent` sur `/`.
4. Démarrer l'agent. Attendre 5 min.
5. Vérifier les métriques dans le namespace custom.

**Livrable.** Le fichier `amazon-cloudwatch-agent.json`, capture des métriques publiées.

### Exercice 3 — Saturer le CPU et observer (≈ 30 min)

**Objectif.** Lire un graph en charge.

**Étapes :**

1. Sur l'instance, installer `stress` (`sudo dnf install -y stress` ou `apt`).
2. Lancer `stress --cpu 2 --timeout 600` (2 cœurs, 10 min).
3. Pendant ce temps, ouvrir le graphe `CPUUtilization` (statistique Average) et `cpu_usage_user` (via agent).
4. Sur instance T : observer `CPUCreditBalance` chuter.
5. Identifier le **moment exact** où le throttling commence (CPU passe brutalement de 100 % à ~20 % pour une T).
6. Comparer Average vs Maximum sur la même fenêtre.

**Livrable.** Captures des courbes + commentaire de ce qui se passe.

### Exercice 4 — Saturer le disque et observer (≈ 30 min)

**Objectif.** Comprendre la différence entre métriques EBS et filesystem.

**Étapes :**

1. Sur l'instance, écrire un fichier de 5 GB : `dd if=/dev/zero of=/tmp/bigfile bs=1M count=5000`.
2. Observer `VolumeWriteBytes` (`AWS/EBS`) et `disk_used_percent` (custom).
3. Vérifier que `VolumeQueueLength` monte pendant l'écriture.
4. Supprimer le fichier, observer que `disk_used_percent` redescend, mais `VolumeWriteBytes` reste haut (cumul).

**Livrable.** Captures + une phrase expliquant la différence des deux niveaux.

### Exercice 5 — Créer 3 alarmes "starter pack" (≈ 30 min)

**Objectif.** Manipuler `put-metric-alarm`.

Pour l'instance, créer :

1. CPU > 80 % pendant 10 min → SNS topic `ops-alerts` (créer le topic au préalable).
2. `mem_used_percent` > 80 % pendant 10 min → SNS.
3. `StatusCheckFailed` ≥ 1 pendant 2 min → action `arn:aws:automate:eu-west-1:ec2:reboot`.

Tester l'alarme CPU en relançant `stress`. Vérifier qu'on reçoit bien la notification SNS (mail ou Slack via Lambda).

**Livrable.** Les 3 commandes `put-metric-alarm` + capture de l'alerte reçue.

### Mini-défi — Dashboard de monitoring d'une mini-flotte (≈ 60 min)

**Cas.** 3 instances EC2 simulant une mini-flotte (web1, web2, db).

Construire un dashboard CloudWatch unique qui montre :

- CPU (Average) des 3 instances, superposées sur un même graphe.
- RAM (`mem_used_percent`) des 3 instances.
- Disque (`disk_used_percent` sur `/`) des 3 instances.
- Réseau In/Out cumulé du groupe.
- Pour la `db`, en plus : `VolumeQueueLength` de son EBS.
- Un widget texte expliquant : "à quoi sert ce dashboard, à qui, et quand consulter".

**Livrable.** Capture du dashboard + le JSON exporté (depuis "Actions > View/edit source").

---

## 13. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Définir **CloudWatch** et ses 3 sous-services (Metrics, Logs, Alarms).
- [ ] Expliquer **Namespace / MetricName / Dimensions / Statistic / Period** sur un exemple.
- [ ] Distinguer **Standard Monitoring (5 min)** et **Detailed (1 min)**, avec leur coût.
- [ ] Citer les **métriques EC2 par défaut** (CPU, NetworkIn/Out, DiskReadOps/Bytes pour instance store, StatusChecks).
- [ ] Identifier **ce qui n'est PAS** par défaut (RAM, swap, espace filesystem, processus).
- [ ] Décrire les **3 status checks** (System, Instance, Attached EBS) et la réaction à chacun.
- [ ] Expliquer le rôle du **CloudWatch Agent** et lister les métriques qu'il ajoute.
- [ ] Distinguer `mem_used_percent` et `mem_available_percent` sur Linux moderne.
- [ ] Reconnaître un **CPU iowait élevé** = problème disque, pas CPU.
- [ ] Expliquer les métriques **CPU credit** des instances T (`CPUCreditBalance`).
- [ ] Distinguer les 3 niveaux disque : **instance store**, **EBS** (`AWS/EBS`), **filesystem** (agent).
- [ ] Configurer une **alarme** : metric, statistic, period, evaluation periods, action.
- [ ] Comprendre `TreatMissingData` et son impact.
- [ ] Décrire un **dashboard 4 quadrants** (CPU / RAM / Disque / Réseau).

### Items du glossaire visés

**N1 atteint** :

- _accéder aux métriques permettant de monitorer la consommation de ressources_ — sections 3 (CPU, réseau), 5 (CPU détaillé), 6 (RAM via agent), 7 (disque), 8 (réseau).

**Items N3 amorcés** (non couverts en profondeur, renvoyés à un module dédié) :

- _choisir la métrique adaptée pour un autoscaling_ — abordé en mention en 5.1 et 9.3.
- _conditions de mise en place d'un autoscaling group_ — Networking M8 et compléments hors parcours direct.

---

## 14. Ressources complémentaires

### Documentation AWS

- [Amazon CloudWatch User Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/)
- [CloudWatch metrics for EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/viewing_metrics_with_cloudwatch.html)
- [Status checks for your instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html)
- [Installing the CloudWatch agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html)
- [CloudWatch agent configuration file reference](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html)
- [CloudWatch Logs Insights query syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [Amazon EBS volume metrics](https://docs.aws.amazon.com/ebs/latest/userguide/using_cloudwatch_ebs.html)

### Outils complémentaires

- [Compute Optimizer](https://aws.amazon.com/compute-optimizer/) — recommandations de rightsizing automatique basées sur le monitoring.
- [Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) — pour relier consommation et facture.
- [CloudWatch Anomaly Detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html) — alarmes basées sur un modèle dynamique, pas un seuil fixe.

### Pour aller plus loin

- **M4-M6 (Lambda)** — monitoring des Lambdas (métriques `Invocations`, `Errors`, `Duration`, `Throttles`).
- **M11-M12 (ECS)** — Container Insights pour les services ECS et EKS.
- **AWS Analytics M1-M2** — CloudWatch Logs en profondeur (Insights, alarmes sur logs).
- **AWS Networking M8** — Auto Scaling Groups : choix de la métrique de scaling (CPU, custom, ALB request count, …).
