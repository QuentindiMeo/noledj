# M3 — RDS / Aurora — Backups

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer les **deux mécanismes de backup** RDS/Aurora : **Automated Backups** (continus, PITR) et **Snapshots manuels** (à la demande, point-in-time fixe).
- Configurer les **automatic backups** sur RDS et Aurora (item N2 explicite) : retention period (0 = désactivé, jusqu'à 35 jours), backup window, copy to snapshots, copy tags.
- Comprendre le **Point-in-Time Recovery** (PITR) : restaurer à n'importe quelle seconde dans la fenêtre de rétention.
- Créer un **snapshot manuel**, gérer la rétention, copier cross-region / cross-account, partager.
- **Restaurer un snapshot** vers une nouvelle instance (item du glossaire pratique).
- Distinguer les particularités **Aurora** : snapshots de cluster, backups inclus dans le tarif storage, PITR à la seconde.
- Reconnaître les **anti-patterns** (pas de backup, retention trop courte, oublier de tester la restauration).

## Durée estimée

0,5 jour à 1 jour.

## Pré-requis

- M1 (Tour d'horizon) et M2 (Provisionnement).
- Une instance RDS / un cluster Aurora à disposition (créer si nécessaire).
- AWS CLI v2 avec permissions `rds:*`.

---

## 1. Pourquoi le backup

### 1.1 — Le problème

Une base de données peut subir de **multiples sinistres** :

- **Bug applicatif** : `DELETE FROM users` sans `WHERE`. Plus de users.
- **Erreur opérationnelle** : drop accidentel d'une table en prod.
- **Corruption logicielle** : crash inattendu, FS corrompu.
- **Panne matérielle** : disque foiré (rare grâce à la réplication AWS, mais possible).
- **Attaque malveillante** : ransomware, exfiltration, sabotage.
- **Catastrophe AZ / Région** : très rare mais arrivé (Tokyo 2019, US-East-1 plusieurs fois).

Sans backup → **perte définitive** des données.

### 1.2 — RPO et RTO — vocabulaire

| Sigle                              | Définition                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **RPO** (Recovery Point Objective) | Combien de **données on accepte de perdre** (en temps). 0 = aucune perte, 1h = on accepte de perdre 1h. |
| **RTO** (Recovery Time Objective)  | Combien de temps on accepte que ça soit **down** avant retour.                                          |

Le backup détermine le **RPO**. Le mécanisme de restauration détermine le **RTO**.

### 1.3 — Les 3 piliers chez AWS

| Mécanisme                   | RPO               | RTO         | Cas d'usage                                    |
| --------------------------- | ----------------- | ----------- | ---------------------------------------------- |
| **Multi-AZ**                | 0 (sync)          | 30-60 s     | Panne d'une AZ.                                |
| **Read Replica**            | ~secondes (async) | Manuel      | Lecture sans impact OLTP.                      |
| **Automated Backup + PITR** | 5 min             | 30 min - 2h | Erreur applicative, restore à un point précis. |
| **Manual Snapshot**         | À la création     | 30 min - 2h | Avant changement majeur, rétention longue.     |

**Multi-AZ et backups sont complémentaires**, pas alternatifs. Multi-AZ protège contre les pannes hardware. Backup protège contre les erreurs humaines.

### 1.4 — L'analogie de l'archive personnelle

- **Multi-AZ** = avoir 2 disques en RAID dans son PC. Si l'un meurt, l'autre prend.
- **Automated backup PITR** = Time Machine sur Mac : toutes les heures, snapshot incrémental. On peut revenir à n'importe quel point récent.
- **Manual snapshot** = sauvegarde manuelle sur disque externe avant de réinstaller le système.

Aucun ne remplace l'autre. **Les trois ensemble** = stratégie complète.

---

## 2. Automated Backups (item N2 explicite)

### 2.1 — Définition

Les **Automated Backups** d'RDS sont un mécanisme **continu** qui combine :

- Un **snapshot quotidien** dans la backup window.
- Des **transaction logs** (WAL en PostgreSQL, binlogs en MySQL) sauvegardés en continu vers S3.

Ces deux éléments permettent le **PITR** : restaurer la DB à n'importe quelle seconde dans la fenêtre de rétention.

### 2.2 — Paramètres

| Paramètre               | Valeur                                                 |
| ----------------------- | ------------------------------------------------------ |
| `BackupRetentionPeriod` | 0 (désactivé) à 35 jours.                              |
| `PreferredBackupWindow` | Plage de 30 min minimum (e.g. `02:00-02:30` UTC).      |
| `CopyTagsToSnapshot`    | Booléen — copier les tags de l'instance aux snapshots. |
| `BackupTarget`          | `region` (par défaut) ou `outposts`.                   |

**Important** : `BackupRetentionPeriod = 0` **désactive** les backups. À **ne jamais** faire en prod.

### 2.3 — Configurer à la création

Vu en M2 :

```bash
aws rds create-db-instance \
  ...
  --backup-retention-period 7 \
  --preferred-backup-window "02:00-03:00" \
  --copy-tags-to-snapshot
```

### 2.4 — Modifier à chaud

```bash
aws rds modify-db-instance \
  --db-instance-identifier tp-postgres-1 \
  --backup-retention-period 14 \
  --apply-immediately
```

L'augmentation de la rétention est **rétroactive** : les snapshots existants sont conservés plus longtemps automatiquement.

### 2.5 — Combien de jours retenir ?

| Profil                              | Recommandation                                      |
| ----------------------------------- | --------------------------------------------------- |
| Dev / staging                       | 1-7 jours                                           |
| Pré-prod                            | 7-14 jours                                          |
| Production standard                 | **14-30 jours**                                     |
| Production critique (banque, santé) | 30-35 jours + snapshots manuels archivés long terme |
| Conformité (RGPD, PCI, HIPAA)       | Selon réglementation                                |

**À retenir** :

- Le **maximum est 35 jours** pour les backups RDS auto.
- Pour aller au-delà → **snapshots manuels** ou **export S3** (vu en section 6).

### 2.6 — Coût des automated backups

- **Inclus jusqu'à 100 % de la taille de l'instance**. Exemple : 100 GB d'instance → 100 GB de backup gratuits.
- Au-delà : 0,095 $/GB/mois (en eu-west-1) pour le storage backup additionnel.

→ Pour la plupart des cas, **gratuit en pratique**.

### 2.7 — Impact performance

- Pour **instances Single-AZ** : il peut y avoir une **brève suspension d'I/O** (~1 s) pendant le snapshot quotidien.
- Pour **Multi-AZ** : le snapshot est pris sur le standby → **pas d'impact** sur la primary.

**Argument supplémentaire** pour Multi-AZ en prod.

### 2.8 — Backup window — quand la placer

- Choisir une **plage d'activité faible** (typiquement la nuit du pays).
- Pour la France : `01:00-02:00 UTC` (2h-3h heure locale en été).
- Doit être **distinct de la maintenance window**.

---

## 3. Snapshots manuels

### 3.1 — Définition

Un **snapshot manuel** est une **copie point-in-time** créée à la demande. Persistant **jusqu'à suppression explicite** (vs auto-backup qui expire selon retention).

### 3.2 — Création

```bash
aws rds create-db-snapshot \
  --db-instance-identifier tp-postgres-1 \
  --db-snapshot-identifier tp-postgres-snap-2026-05-18 \
  --tags Key=Reason,Value="Pre-migration" Key=Owner,Value=alice
```

Le snapshot est **complet** la première fois, **incrémental** par la suite (économie de stockage).

### 3.3 — Cas d'usage des snapshots manuels

- **Avant un changement risqué** (migration de schéma, upgrade de version).
- **Sauvegarde long terme** au-delà des 35 jours autos.
- **Partage cross-account** (envoyer une copie à un autre compte AWS).
- **Réplication cross-region** pour DR.
- **Point de référence** : "version v2.3 livrée".

### 3.4 — Rétention

Les snapshots manuels **ne sont jamais supprimés automatiquement**. À gérer manuellement :

```bash
# Lister
aws rds describe-db-snapshots --db-instance-identifier tp-postgres-1 \
  --query 'DBSnapshots[].{Id:DBSnapshotIdentifier, Created:SnapshotCreateTime, Status:Status}'

# Supprimer
aws rds delete-db-snapshot --db-snapshot-identifier tp-postgres-snap-OLD
```

**Hygiène** : tagger les snapshots avec une **expiration** prévue et auditer périodiquement.

### 3.5 — Snapshots automatiques vs manuels

| Aspect                                | **Automated Backups**             | **Manual Snapshots**      |
| ------------------------------------- | --------------------------------- | ------------------------- |
| Création                              | Quotidien automatique             | À la demande              |
| Rétention max                         | 35 jours                          | Illimitée                 |
| Expiration                            | Auto à la fin de retention        | Jamais (manuelle)         |
| PITR                                  | Oui (au sec près)                 | Non (point fixe)          |
| Survie à la suppression de l'instance | **Non** (sauf if `FinalSnapshot`) | **Oui**                   |
| Coût                                  | Souvent gratuit (≤ size instance) | Standard 0,095 $/GB/mois  |
| Cas d'usage                           | Recovery erreur récente           | Archive, before-after, DR |

### 3.6 — Le piège : la suppression d'instance

Quand on supprime une instance RDS :

```bash
aws rds delete-db-instance --db-instance-identifier tp-postgres-1 \
  --final-db-snapshot-identifier tp-postgres-FINAL  # IMPORTANT
```

Sans `--final-db-snapshot-identifier` (ou avec `--skip-final-snapshot`), les **automated backups sont supprimés**. Le `--final-db-snapshot-identifier` crée un snapshot manuel permanent avant suppression.

**Best practice** : toujours conserver un final snapshot, surtout en prod.

---

## 4. Point-in-Time Recovery (PITR)

### 4.1 — Définition

Le **PITR** permet de restaurer une instance à **n'importe quelle seconde** dans la fenêtre de rétention des automated backups.

```text
                       Automated Backup Retention (e.g. 7 jours)
   ←─────────────────────────────────────────────────────────────────→

   T-7j                                                          MAINTENANT
    │                                                                 │
    ▼                                                                 ▼
    [snap]──[snap]──[snap]──[snap]──[snap]──[snap]──[snap]
       │                                                              │
       └── + transaction logs continus ───────────────────────────────┘

   On peut restaurer à n'importe quel instant T entre T-7j et MAINTENANT.
```

### 4.2 — Comment

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier tp-postgres-1 \
  --target-db-instance-identifier tp-postgres-restored-pitr \
  --restore-time "2026-05-17T14:30:00Z" \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids sg-xxx \
  --no-multi-az \
  --db-instance-class db.t4g.micro
```

→ Crée une **nouvelle instance** à partir de l'état de la source à 14:30:00 UTC le 17/05/2026.

Note : **on ne peut pas restaurer en place** (overwrite l'instance source). On crée une nouvelle instance.

### 4.3 — Use the latest restorable time

```bash
aws rds describe-db-instances \
  --db-instance-identifier tp-postgres-1 \
  --query 'DBInstances[0].LatestRestorableTime'
# → "2026-05-18T12:35:00Z" (typically 5 min ago)
```

Le **LatestRestorableTime** est le point le plus récent restorable. Typiquement **5 minutes en arrière** car les transaction logs ne sont pas synchrones à la seconde.

### 4.4 — Workflow d'incident type

```text
1. Bug détecté : "On a perdu tous les users à 14:32".
2. Identifier l'heure exacte (avant 14:32) : 14:30:00.
3. PITR vers 14:30:00 → nouvelle instance "rds-restored".
4. Vérifier que les users sont là.
5. Décision :
   a) Bascule app sur rds-restored (changer endpoint DNS).
   b) Ou : dump les users de rds-restored et les ré-insérer dans la prod.
6. Garder rds-restored quelques jours pour validation.
7. Supprimer une fois validé.
```

---

## 5. Restauration — variantes

### 5.1 — Restore d'un snapshot manuel

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier tp-postgres-restored \
  --db-snapshot-identifier tp-postgres-snap-2026-05-18 \
  --db-instance-class db.t4g.small \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids sg-xxx \
  --no-multi-az
```

**Important** : on peut **changer la classe d'instance** lors du restore. Utile pour restorer un dump prod sur une instance staging plus petite.

### 5.2 — Restore d'un automated backup (PITR)

Cf. section 4.

### 5.3 — Restore cross-region

```bash
# 1. Copier le snapshot vers la région cible
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:eu-west-1:ACCOUNT:snapshot:tp-postgres-snap \
  --target-db-snapshot-identifier tp-postgres-snap-us-east \
  --source-region eu-west-1 \
  --region us-east-1 \
  --kms-key-id alias/aws/rds   # KMS key dans la région cible

# 2. Restaurer dans la région cible
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier tp-postgres-us-east \
  --db-snapshot-identifier tp-postgres-snap-us-east \
  --region us-east-1 \
  ...
```

**Cas d'usage** : DR multi-région.

### 5.4 — Restore cross-account

Snapshot **partageable** entre comptes AWS. Étapes :

1. Compte source : `modify-db-snapshot-attribute --attribute-name restore --values-to-add <ACCOUNT_TARGET>`.
2. Compte cible : voit le snapshot dans `describe-db-snapshots --include-shared`.
3. Compte cible : copie d'abord pour le posséder, puis restore.

### 5.5 — Durée de la restauration

| Taille      | Durée typique de restauration |
| ----------- | ----------------------------- |
| < 10 GB     | 10-15 min                     |
| 10-100 GB   | 20-40 min                     |
| 100 GB-1 TB | 1-3 h                         |
| > 1 TB      | Plusieurs heures              |

**Plus la taille est grande, plus le RTO grandit.** Tester un restore réel sur la taille de prod pour valider le RTO planifié.

---

## 6. Snapshots Aurora — particularités

### 6.1 — Aurora — cluster snapshots

Pour Aurora, on snapshote le **cluster** (pas l'instance) :

```bash
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier tp-aurora-cluster \
  --db-cluster-snapshot-identifier tp-aurora-snap-2026-05-18
```

**Différences** :

- **Instantané** (pas d'impact sur le cluster).
- Inclut **toutes les instances** du cluster (storage partagé).
- Pour restaurer : `restore-db-cluster-from-snapshot` puis créer des instances dans le nouveau cluster.

### 6.2 — Aurora — backup retention inclus

Aurora **inclut** les automated backups dans le storage cluster (pas de surcoût pour la rétention). Configurable de 1 à 35 jours.

### 6.3 — Aurora Backtrack — la spécificité MySQL

Pour Aurora MySQL, il existe **Backtrack** : "rembobiner" la base de quelques heures sans créer de nouvelle instance.

```bash
aws rds modify-db-cluster \
  --db-cluster-identifier tp-aurora-cluster \
  --backtrack-window 72  # heures
```

Puis :

```bash
aws rds backtrack-db-cluster \
  --db-cluster-identifier tp-aurora-cluster \
  --backtrack-to "2026-05-18T11:00:00Z"
```

**Avantages** : rapide (~secondes), pas de nouvelle instance.
**Limites** : MySQL only, max 72 heures, en place (perd les données entre).

Aurora PostgreSQL **n'a pas** Backtrack.

### 6.4 — Aurora Cloning

Aurora propose le **cloning** : créer une copie du cluster **sans copier les données** (copy-on-write au niveau du storage layer).

- Quasi-instantané.
- Coût initial nul (pas de duplication storage).
- Le clone divergera ensuite (CoW : chaque page modifiée crée une nouvelle copie).

**Cas d'usage** : tests, dev sur copie prod, migrations.

```bash
aws rds restore-db-cluster-to-point-in-time \
  --source-db-cluster-identifier tp-aurora-cluster \
  --db-cluster-identifier tp-aurora-clone \
  --restore-type copy-on-write \
  --use-latest-restorable-time
```

---

## 7. Pratique — restaurer un snapshot (item du glossaire)

L'objectif : faire un cycle complet **snapshot → modification → restore**.

### 7.1 — Plan

1. Sur l'instance de M2, **insérer** des données de test.
2. **Créer un snapshot manuel**.
3. **Supprimer** ou modifier des données.
4. **Restorer** le snapshot vers une nouvelle instance.
5. **Vérifier** que les données effacées sont bien dans la nouvelle.

### 7.2 — Étape 1 — Insérer des données

```sql
-- Sur tp-postgres-1
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO users (email) VALUES
  ('alice@example.com'),
  ('bob@example.com'),
  ('carol@example.com');

SELECT * FROM users;
-- 3 lignes
```

### 7.3 — Étape 2 — Créer le snapshot

```bash
aws rds create-db-snapshot \
  --db-instance-identifier tp-postgres-1 \
  --db-snapshot-identifier tp-postgres-snap-before-deletion \
  --tags Key=Purpose,Value="TP Restore"

# Attendre que le snapshot soit prêt (~3-5 min)
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier tp-postgres-snap-before-deletion

# Vérifier
aws rds describe-db-snapshots \
  --db-snapshot-identifier tp-postgres-snap-before-deletion \
  --query 'DBSnapshots[0].{Id:DBSnapshotIdentifier, Status:Status, Size:AllocatedStorage}'
```

### 7.4 — Étape 3 — Modifier (simuler l'incident)

```sql
-- "Oups, j'ai supprimé tout le monde"
DELETE FROM users;

SELECT COUNT(*) FROM users;
-- 0
```

### 7.5 — Étape 4 — Restorer le snapshot

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier tp-postgres-restored \
  --db-snapshot-identifier tp-postgres-snap-before-deletion \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids sg-tp-rds \
  --no-multi-az \
  --no-publicly-accessible

# Attendre la disponibilité (~10-15 min pour une petite instance)
aws rds wait db-instance-available \
  --db-instance-identifier tp-postgres-restored
```

**Note** : le restore crée une **nouvelle instance** avec un nouvel endpoint, pas un remplacement de l'instance source.

### 7.6 — Étape 5 — Vérifier

```bash
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier tp-postgres-restored \
  --query 'DBInstances[0].Endpoint.Address' --output text)

psql -h $NEW_ENDPOINT -U admin -d postgres -c "SELECT * FROM users;"
-- 3 lignes (alice, bob, carol) : récupérées !
```

### 7.7 — Bonus — restaurer en PITR

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier tp-postgres-1 \
  --target-db-instance-identifier tp-postgres-pitr \
  --use-latest-restorable-time \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name tp-rds-subnet-group \
  --vpc-security-group-ids sg-tp-rds
```

Ou avec un timestamp précis :

```bash
--restore-time "2026-05-18T12:00:00Z"
```

### 7.8 — Cleanup

```bash
aws rds delete-db-snapshot --db-snapshot-identifier tp-postgres-snap-before-deletion
aws rds delete-db-instance --db-instance-identifier tp-postgres-restored --skip-final-snapshot
aws rds delete-db-instance --db-instance-identifier tp-postgres-pitr --skip-final-snapshot
```

---

## 8. Tester sa stratégie de backup

> **Un backup non testé n'est pas un backup.** C'est un fichier qui sera peut-être restorable.

### 8.1 — La méthode

Chaque **trimestre** :

1. Choisir une instance prod (ou clone).
2. **Restaurer** un snapshot ou PITR vers une nouvelle instance.
3. **Vérifier** : connexion, intégrité des données, requêtes critiques.
4. **Mesurer le RTO réel** : combien de temps a pris le restore ?
5. **Documenter** : runbook à jour.

### 8.2 — Test automatisé

Pattern moderne : Lambda + EventBridge qui :

1. Identifie le dernier snapshot.
2. Restaure dans un VPC dédié.
3. Lance des assertions SQL (`SELECT COUNT(*) FROM users > 0`).
4. Détruit l'instance restorée.
5. Émet un événement CloudWatch / Slack en cas d'échec.

---

## 9. Anti-patterns

| Anti-pattern                                                       | Conséquence                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| **`BackupRetentionPeriod = 0`** en prod.                           | Pas de backup, pas de PITR. Tout est perdu en cas d'incident. |
| **`--skip-final-snapshot`** à la suppression d'instance prod.      | Données perdues à jamais.                                     |
| **Snapshots manuels jamais supprimés**.                            | Coût stockage qui grossit. Auditer trimestriellement.         |
| **Pas de cross-region** pour DR.                                   | Une catastrophe régionale = downtime indéfini.                |
| **Pas de chiffrement** des snapshots.                              | Compliance à risque, fuite si snapshot partagé par erreur.    |
| **Restore jamais testé**.                                          | RTO inconnu, surprise garantie en incident.                   |
| **Backup window pendant les heures de pointe**.                    | Spike d'I/O pour Single-AZ.                                   |
| **PITR jamais utilisé** alors qu'on a `BackupRetentionPeriod = 7`. | On paie sans bénéfice. Tester régulièrement.                  |
| **Garder snapshot manuel "v0.1"** depuis 3 ans.                    | Coût + risque (clé KMS qui peut avoir bougé).                 |
| **Restorer en gardant Multi-AZ** pour un test.                     | 2× le prix juste pour un test.                                |

---

## 10. Exercices pratiques

### Exercice 1 — Configurer les backups automatiques (≈ 20 min)

**Objectif.** L'item N2 explicite.

**Étapes :**

1. Sur l'instance de M2, vérifier le `BackupRetentionPeriod`.
2. Le passer à **14 jours** : `modify-db-instance ... --backup-retention-period 14 --apply-immediately`.
3. Configurer une `BackupWindow` à `01:00-02:00`.
4. Activer `CopyTagsToSnapshot`.

**Livrable.** Capture de l'état de l'instance après modif.

### Exercice 2 — Créer et restaurer un snapshot (≈ 60 min)

**Objectif.** Item central du glossaire.

**Étapes :** suivre la section 7.

**Livrable.** Captures des 5 étapes + capture de `SELECT * FROM users` sur l'instance restorée.

### Exercice 3 — Point-in-Time Recovery (≈ 30 min)

**Objectif.** Tester PITR.

**Étapes :**

1. Sur l'instance source, insérer des données à T0.
2. Attendre 6 minutes (les transaction logs doivent se propager).
3. Modifier les données (DELETE / UPDATE).
4. Restaurer en PITR à T0+1 min.
5. Vérifier que les données originales sont récupérées.

**Livrable.** Timeline + captures.

### Exercice 4 — Copier un snapshot cross-region (≈ 30 min)

**Objectif.** DR multi-région.

**Étapes :**

1. Créer un snapshot manuel dans `eu-west-1`.
2. Le copier vers `eu-west-3` (Paris).
3. Lister les snapshots dans `eu-west-3` pour vérifier.
4. Supprimer pour éviter la facturation.

**Livrable.** Captures + estimation du coût.

### Exercice 5 — Calculer le RTO (≈ 30 min)

**Objectif.** Connaître son RTO réel.

**Étapes :**

1. Insérer ~1 GB de données dans une instance.
2. Faire un snapshot.
3. Démarrer une restauration et **chronométrer** :
   - Temps avant `available`.
   - Temps avant connexion psql réussie.
   - Temps avant requête `SELECT COUNT(*)` rapide.
4. Comparer à la durée d'un restore vide.

**Livrable.** Chiffres mesurés + estimation pour 100 GB / 1 TB.

### Mini-défi — Stratégie de backup pour une SaaS B2B (≈ 30 min, papier)

**Cas.** Plateforme SaaS B2B avec :

- DB Aurora PostgreSQL, 500 GB.
- 200 entreprises clientes, RPO de 1 h tolérable, RTO de 4 h tolérable.
- Conformité RGPD : conservation 6 ans.

**Concevoir** :

1. Automated backup retention ? Cross-region ?
2. Snapshots manuels : fréquence, retention, archivage ?
3. Multi-AZ ?
4. Procédure de test trimestriel ?
5. Coût mensuel estimé.

**Livrable.** Plan documenté.

---

## 11. Auto-évaluation

Cocher les énoncés que l'on peut **dire à voix haute, sans notes**, en moins de 90 secondes par énoncé :

- [ ] Distinguer **automated backups** et **snapshots manuels** sur 5 axes.
- [ ] Définir **RPO** et **RTO**.
- [ ] Citer le **max retention** des automated backups (35 jours).
- [ ] Décrire le **PITR** (en quoi ça consiste, pourquoi).
- [ ] **Configurer une retention** de 14 jours de mémoire.
- [ ] **Créer un snapshot manuel**, le **restaurer** vers une nouvelle instance.
- [ ] Citer les **particularités Aurora** : cluster snapshots, Backtrack (MySQL), cloning.
- [ ] Distinguer **restore in-place** (impossible) et **restore vers nouvelle instance** (toujours).
- [ ] Citer les **3 étapes** d'un cross-region snapshot.
- [ ] Énoncer la règle "**un backup non testé n'est pas un backup**" et décrire un test trimestriel.
- [ ] Citer **3 anti-patterns**.

### Items du glossaire visés

**N2 atteint** :

- _mettre en place des backups automatiques sur RDS / Aurora_ — sections 2 et 7.

---

## 12. Ressources complémentaires

### Documentation AWS

- [RDS Backups Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.BackupRestore.html)
- [Aurora Backups](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/BackupRestoreAurora.html)
- [Point-in-Time Recovery](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)
- [Aurora Backtrack](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Managing.Backtrack.html)
- [Aurora Cloning](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Managing.Clone.html)

### Outils

- [AWS Backup](https://aws.amazon.com/backup/) — gestion centralisée des backups multi-services (RDS, EFS, EBS, DynamoDB, …).

### Pour aller plus loin

- **M4-M5 (DynamoDB)** — backup pattern différent (PITR + on-demand).
- **M6 (S3 lifecycle)** — versioning S3 comme alternative pour les fichiers.
- **Niveau 3** : Aurora Global Database (multi-region active-active), DynamoDB Global Tables, AWS Backup multi-service strategy.
