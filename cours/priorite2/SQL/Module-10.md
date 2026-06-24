# M10 — Manipulation avancée

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Maîtriser les options **`ON DELETE`** des clés étrangères (CASCADE, RESTRICT, SET NULL, SET DEFAULT).
- Choisir entre **suppression dure** et **soft delete** selon le contexte.
- Créer et restaurer un **dump SQL** (`pg_dump`, `mysqldump`, équivalents).
- Migrer des **données entre environnements** (dev → staging → prod).
- Connaître les bases de la **stratégie de backup** en production.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M9 SQL terminés.

---

## 1. Suppression en cascade — rappel et approfondissement

### Rappel (M3)

Une **foreign key** précise un comportement quand la ligne référencée (parente) est supprimée ou modifiée :

```sql
CREATE TABLE orders (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE
);
```

Les 4 options principales :

| Option                            | Effet à la suppression du parent                   |
| --------------------------------- | -------------------------------------------------- |
| `CASCADE`                         | Les enfants sont supprimés automatiquement         |
| `RESTRICT` / `NO ACTION` (défaut) | Refuse la suppression du parent s'il a des enfants |
| `SET NULL`                        | Met la FK à `NULL` sur les enfants                 |
| `SET DEFAULT`                     | Met la valeur DEFAULT sur les enfants              |

**Analogie.** Un effet domino. Renverser une pièce (parent) renverse les pièces accrochées (enfants). On peut configurer chaque accrochage : `CASCADE` = elles tombent, `RESTRICT` = la pièce ne peut pas tomber tant que les autres tiennent, `SET NULL` = elles se détachent et restent debout.

### Choisir l'option

**`CASCADE`** :

- Les enfants n'ont pas de sens sans le parent.
- Exemple : `order_items` n'existent pas sans `order`.

**`RESTRICT`** :

- Le parent est précieux et doit être supprimé manuellement.
- Exemple : un `customer` ne peut être supprimé si des `orders` existent encore — il faut archiver ou explicitement les supprimer.

**`SET NULL`** :

- L'enfant peut survivre sans parent (la FK devient optionnelle).
- Exemple : un employé dont le manager part — l'employé reste, son `manager_id` devient NULL.
- Pré-requis : la colonne FK doit être **nullable**.

**`SET DEFAULT`** :

- Rare. Utile quand on veut une valeur de remplacement systématique.
- Exemple : `category_id SET DEFAULT 'uncategorized'`.

### Cascade en chaîne

Les cascades **se propagent** :

```sql
companies → departments (ON DELETE CASCADE)
departments → employees (ON DELETE CASCADE)

DELETE FROM companies WHERE id = 42;
-- → supprime aussi tous les departments de la company 42
--    → supprime aussi tous les employees de ces departments
```

Conséquence : **un DELETE peut supprimer beaucoup plus de lignes que prévu**. Toujours vérifier l'impact avant.

```sql
-- Vérification préalable
SELECT COUNT(*) FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE d.company_id = 42;
-- Si le résultat est 5000, on confirme avant de DELETE
```

---

## 2. Soft delete — l'alternative

### Théorie

Au lieu de **supprimer physiquement** une ligne, on **marque** comme supprimée :

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- Suppression "soft"
UPDATE users SET deleted_at = NOW() WHERE id = 42;

-- Lecture qui ignore les "supprimés"
SELECT * FROM users WHERE deleted_at IS NULL;
```

### Avantages

- **Récupération** facile (`UPDATE ... SET deleted_at = NULL`).
- **Audit** — historique préservé.
- **Cohérence** — les FK pointant vers la ligne restent valides.

### Inconvénients

- **Pollution** — toutes les requêtes doivent filtrer `WHERE deleted_at IS NULL`.
- **Espace disque** — les lignes s'accumulent.
- **Risque de fuite** — oublier le filtre = afficher des données censées être supprimées.

### Solution pratique

Combiner :

- `deleted_at` pour le marquage.
- **Une vue** `active_users` qui filtre déjà.
- Donner l'accès à la **vue**, pas à la table directement (M8).

```sql
CREATE VIEW active_users AS
SELECT * FROM users WHERE deleted_at IS NULL;
```

ORMs comme **Django** ou **Hibernate** supportent le soft delete nativement via décorateurs / annotations.

### Quand préférer soft vs hard delete

| Cas                                                 | Recommandation                                   |
| --------------------------------------------------- | ------------------------------------------------ |
| Domaine régulé (RGPD, finance)                      | Hard delete obligatoire passé une certaine durée |
| Audit ou historique nécessaire                      | Soft delete + archivage                          |
| Données techniques (logs, caches)                   | Hard delete                                      |
| Doutes ou erreurs utilisateur fréquents (corbeille) | Soft delete avec restauration                    |

---

## 3. Dump SQL — pourquoi et comment

### Théorie

Un **dump** est un export textuel de la base : schéma + données. Il permet :

- **Backups** (sauvegardes périodiques).
- **Migration** entre serveurs / versions.
- **Copie** dev ← prod (anonymisée idéalement).
- **Versioning** d'un schéma de référence.

**Analogie.** Une photographie haute résolution de toute la base. Permet de la **recréer ailleurs**, à l'identique.

Le format **standard** est un fichier SQL contenant `CREATE TABLE`, `INSERT`, et éventuellement `CREATE INDEX`, `CREATE FUNCTION`, etc.

### Types de dump

- **Schema-only** — uniquement la structure, sans données.
- **Data-only** — uniquement les données (en INSERT ou COPY).
- **Full** — schéma + données.
- **Custom format** (PostgreSQL) — binaire compressé, restaurable en parallèle.

---

## 4. `pg_dump` et `pg_restore` (PostgreSQL)

### Dumper la base

```bash
# Dump complet en SQL plain
pg_dump -U user -h host -d mydb -f backup.sql

# Schema-only
pg_dump -U user -d mydb --schema-only -f schema.sql

# Data-only
pg_dump -U user -d mydb --data-only -f data.sql

# Format custom (binaire compressé, recommandé pour gros dumps)
pg_dump -U user -d mydb -F c -f backup.dump

# Tables spécifiques
pg_dump -U user -d mydb -t users -t orders -f partial.sql
```

### Restaurer

**Plain SQL** : avec `psql` :

```bash
psql -U user -d mydb_new -f backup.sql
```

**Custom format** : avec `pg_restore` :

```bash
pg_restore -U user -d mydb_new backup.dump
pg_restore -U user -d mydb_new -j 4 backup.dump   # parallèle, 4 workers
```

### Options utiles

```bash
--clean              # DROP avant CREATE (utile pour rebuild)
--if-exists          # CREATE IF NOT EXISTS, DROP IF EXISTS
--no-owner           # ignore les owners (utile cross-environnement)
--no-privileges      # ignore les GRANT/REVOKE
--exclude-table=...  # exclure certaines tables
```

### Pipe direct prod → staging

```bash
pg_dump -U user -h prod -d mydb | psql -U user -h staging -d mydb_staging
```

Pratique pour les copies rapides — attention à la bande passante et à la cohérence (dump pas atomique sans `--single-transaction`).

---

## 5. `mysqldump` (MySQL)

### Dumper

```bash
mysqldump -u user -p mydb > backup.sql

# Schema-only
mysqldump -u user -p --no-data mydb > schema.sql

# Data-only
mysqldump -u user -p --no-create-info mydb > data.sql

# Plusieurs bases
mysqldump -u user -p --databases db1 db2 > multi.sql

# Toutes les bases
mysqldump -u user -p --all-databases > full.sql
```

### Restaurer

```bash
mysql -u user -p mydb_new < backup.sql
```

### Options utiles

```bash
--single-transaction  # cohérent (InnoDB), pas de lock
--routines            # inclut stored procedures et functions
--triggers            # inclut les triggers
--events              # inclut les events
--compress            # compression réseau
```

### Pour SQLite — `.dump`

```bash
sqlite3 mydb.db .dump > backup.sql
sqlite3 mydb_new.db < backup.sql
```

Format SQL pur. SQLite reste portable et simple.

---

## 6. Backups en production

### Stratégie 3-2-1

> **3** copies, sur **2** supports différents, dont **1** offsite.

- **Local** : dump quotidien sur un disque attaché.
- **Cloud** : upload S3 ou équivalent.
- **Offsite / froid** : Glacier, Backblaze, ou disque externe sécurisé.

### Fréquence

- **Full dump** : quotidien ou hebdomadaire selon volume.
- **Incremental / WAL** : continu sur PostgreSQL (Write-Ahead Logging).
- **Snapshot** : RDS, GCP Cloud SQL le font automatiquement (toutes les 24h, rétention configurable).

### Tester la restauration

Un backup non testé est **un faux backup**. Au moins une fois par trimestre :

1. Restaurer le dernier dump sur une instance jetable.
2. Lancer un script de vérification (`COUNT(*)` par table, checksum sur tables critiques).
3. Documenter la procédure et le temps de restauration (RTO).

### RPO et RTO

Deux métriques de continuité :

- **RPO** (Recovery Point Objective) — combien de données on accepte de perdre. Backup quotidien → RPO = 24h.
- **RTO** (Recovery Time Objective) — combien de temps on accepte d'être down. Restaurer un dump de 50 Go → souvent 1h+.

Définir ces deux nombres avec le métier **avant** de choisir une stratégie de backup.

### Outils managed

- **AWS RDS / Aurora** : snapshots auto + point-in-time recovery (PITR).
- **GCP Cloud SQL** : équivalent.
- **Azure Database** : idem.

Le managed gère la majorité des cas. Pour de l'on-premise ou de la souveraineté forte, **Barman** (PostgreSQL) ou **Percona XtraBackup** (MySQL) sont les références.

---

## 7. Exercices pratiques

### Exercice 1 — Cascade observation (≈ 25 min)

Créer trois tables liées :

```sql
CREATE TABLE companies (id SERIAL PRIMARY KEY, name VARCHAR(100));
CREATE TABLE departments (
    id SERIAL PRIMARY KEY, name VARCHAR(100),
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
);
CREATE TABLE employees (
    id SERIAL PRIMARY KEY, name VARCHAR(100),
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE
);
```

Insérer 2 companies, 4 departments, 10 employees.

1. Supprimer une company.
2. Compter les departments et employees restants.
3. Vérifier la propagation cascade.

### Exercice 2 — Comparer les options ON DELETE (≈ 30 min)

Créer 4 versions de `parents` / `children`, une par option `ON DELETE` :

```sql
CREATE TABLE parents_cascade (...);
CREATE TABLE children_cascade (parent_id REFERENCES parents_cascade(id) ON DELETE CASCADE);

CREATE TABLE parents_restrict (...);
CREATE TABLE children_restrict (parent_id REFERENCES parents_restrict(id) ON DELETE RESTRICT);

CREATE TABLE parents_set_null (...);
CREATE TABLE children_set_null (parent_id REFERENCES parents_set_null(id) ON DELETE SET NULL);

CREATE TABLE parents_set_default (...);
-- + DEFAULT
```

Pour chaque version, insérer 1 parent et 2 enfants. Tenter `DELETE FROM parents_X WHERE id = 1`. Observer le comportement.

### Exercice 3 — Soft delete (≈ 25 min)

1. Ajouter une colonne `deleted_at TIMESTAMP` à `users`.
2. Implémenter une "suppression" via `UPDATE users SET deleted_at = NOW() WHERE id = 42`.
3. Créer une vue `active_users` qui filtre `deleted_at IS NULL`.
4. Comparer la liste avant / après "suppression".
5. "Restaurer" via `UPDATE users SET deleted_at = NULL`.

### Exercice 4 — pg_dump et restore (≈ 30 min)

Sur une base PostgreSQL locale :

1. Créer une base `my_test_db` avec 2-3 tables et quelques données.
2. `pg_dump -d my_test_db -f backup.sql`.
3. `pg_dump -d my_test_db -F c -f backup.dump`.
4. Inspecter `backup.sql` pour comprendre la structure.
5. Créer une base vide `my_test_db_restored`.
6. Restaurer avec `pg_restore -d my_test_db_restored backup.dump`.
7. Vérifier que les données sont identiques.

### Exercice 5 — Migration de schema (≈ 25 min)

1. Dumper uniquement le schéma : `pg_dump --schema-only -d mydb -f schema.sql`.
2. Examiner le fichier — identifier les `CREATE TABLE`, `CREATE INDEX`, etc.
3. Modifier le `schema.sql` pour renommer une table.
4. Appliquer le schema modifié sur une nouvelle base.
5. Documenter en commentaire les étapes pour un futur migration en équipe.

---

## 8. Mini-défi de synthèse — export / import d'une base (≈ 1 heure)

### Scénario

Vous avez une base **production** avec 5 tables et environ 1000 lignes au total. Vous devez :

1. **Backup** complet de la prod.
2. **Restaurer** sur un environnement de **staging**.
3. **Anonymiser** les emails (pour respecter le RGPD).
4. **Vérifier** la cohérence (counts par table, contraintes valides).

### Étapes

1. Préparer une base "prod" avec 5 tables liées et au moins 1000 lignes au total.
2. `pg_dump -F c -d prod -f prod_backup.dump`.
3. Créer une base `staging` vide.
4. `pg_restore -d staging prod_backup.dump`.
5. Anonymiser :

```sql
UPDATE users SET email = 'user_' || id || '@anonymized.test';
```

6. Vérifications :

```sql
SELECT (SELECT COUNT(*) FROM prod.users) = (SELECT COUNT(*) FROM staging.users);
-- + autres COUNT(*) par table
```

7. Documenter en `README.md` :
   - Procédure complète.
   - Temps pris.
   - Outils utilisés.
   - RPO / RTO estimés.

### Critères de validation

- [ ] Le backup et la restauration sont **scriptés** (pas tapés à la main une fois).
- [ ] L'anonymisation est **idempotente** (rejouable sans erreur).
- [ ] Les `COUNT(*)` correspondent entre source et cible.
- [ ] Aucune erreur de contrainte FK à l'import.
- [ ] La procédure tient sur une page.

---

## 9. Auto-évaluation

Le module M10 est validé lorsque :

- [ ] L'apprenant connaît les 4 options `ON DELETE` et leur effet.
- [ ] Il sait quand préférer hard delete vs soft delete.
- [ ] Il maîtrise `pg_dump` / `pg_restore` (ou `mysqldump` selon SGBD).
- [ ] Il connaît la règle 3-2-1 des backups.
- [ ] Il connaît RPO et RTO et sait les estimer pour son contexte.
- [ ] Le mini-défi export/import est rendu avec script + README.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : suppression en cascade, dump SQL (export/import).

---

## 10. Ressources complémentaires

- **Documentation PostgreSQL** — _Backup and Restore_ : [postgresql.org/docs/current/backup.html](https://www.postgresql.org/docs/current/backup.html).
- **Documentation pg_dump** : [postgresql.org/docs/current/app-pgdump.html](https://www.postgresql.org/docs/current/app-pgdump.html).
- **Barman** (PostgreSQL backup manager) : [pgbarman.org](https://www.pgbarman.org/).
- **Documentation MySQL** — _mysqldump_ : [dev.mysql.com/doc/refman/8.0/en/mysqldump.html](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).
- **Percona XtraBackup** : [percona.com/software/mysql-database/percona-xtrabackup](https://www.percona.com/software/mysql-database/percona-xtrabackup). Backup MySQL avancé sans lock.
- **AWS RDS Backup** : [docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).
- _Database Reliability Engineering_ (Laine Campbell, Charity Majors) — référence moderne sur backups, monitoring, SRE pour DB.
