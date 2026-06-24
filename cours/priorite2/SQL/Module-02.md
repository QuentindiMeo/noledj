# M2 — CRUD

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Écrire des requêtes **`SELECT`** avec conditions (`WHERE`), tri (`ORDER BY`), pagination (`LIMIT`/`OFFSET`).
- Insérer des lignes avec **`INSERT INTO ... VALUES`**.
- Mettre à jour des lignes avec **`UPDATE ... SET ... WHERE`**.
- Supprimer des lignes avec **`DELETE FROM ... WHERE`**.
- Manipuler les valeurs **`NULL`** correctement.
- Reconnaître et **éviter** les erreurs catastrophiques (UPDATE / DELETE sans WHERE).

## Durée estimée

0,75 jour.

## Pré-requis

- M1 SQL terminé.
- Avoir un environnement SQL fonctionnel (PostgreSQL / SQLite / MySQL).

---

## 1. Préparation — table d'exercices

Pour tous les exemples du module, on utilisera la table suivante :

```sql
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,            -- PostgreSQL : SERIAL = auto-incrément
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    age         INTEGER,
    role        VARCHAR(20) NOT NULL DEFAULT 'user',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Insertion initiale :

```sql
INSERT INTO users (email, name, age, role) VALUES
  ('alice@example.com', 'Alice', 30, 'admin'),
  ('bob@example.com',   'Bob',   25, 'user'),
  ('carol@example.com', 'Carol', 35, 'user'),
  ('dave@example.com',  'Dave',  NULL, 'user');
```

(Sur SQLite : remplacer `SERIAL` par `INTEGER PRIMARY KEY AUTOINCREMENT` et `NOW()` par `CURRENT_TIMESTAMP`.)

---

## 2. `SELECT` — lire des données

### Syntaxe générale

```sql
SELECT <colonnes>
FROM <table>
WHERE <conditions>
ORDER BY <colonne> [ASC|DESC]
LIMIT <n> OFFSET <m>;
```

L'ordre des clauses est **imposé** : `SELECT`, `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`. Inverser deux clauses est une erreur de syntaxe.

### Sélectionner toutes les colonnes

```sql
SELECT * FROM users;
```

`*` est lisible en exploration. **À éviter en production** : si on ajoute une colonne sensible, elle sort silencieusement.

### Sélectionner des colonnes nommées

```sql
SELECT id, name, email FROM users;
```

Toujours explicite en production.

### Alias de colonne

```sql
SELECT
    name AS user_name,
    email AS user_email
FROM users;
```

`AS` est optionnel mais lisible. Approfondi en M6.

### `DISTINCT` — éliminer les doublons

```sql
SELECT DISTINCT role FROM users;
-- Résultat : 'admin', 'user'
```

À utiliser avec précaution : `DISTINCT` peut être coûteux sur de grandes tables.

---

## 3. `WHERE` — filtrer

### Opérateurs de comparaison

```sql
SELECT * FROM users WHERE age = 30;        -- égalité
SELECT * FROM users WHERE age <> 30;       -- différence (ou !=)
SELECT * FROM users WHERE age > 25;        -- strictement supérieur
SELECT * FROM users WHERE age >= 25;       -- supérieur ou égal
SELECT * FROM users WHERE age < 30;
SELECT * FROM users WHERE age <= 30;
```

### Opérateurs logiques

```sql
SELECT * FROM users
WHERE age > 18 AND role = 'admin';

SELECT * FROM users
WHERE role = 'admin' OR is_active = false;

SELECT * FROM users
WHERE NOT is_active;
```

**Priorité** : `NOT` > `AND` > `OR`. Utiliser des parenthèses dès qu'il y a du doute :

```sql
SELECT * FROM users
WHERE (role = 'admin' OR role = 'manager') AND is_active = true;
```

### `IN` — liste de valeurs

```sql
SELECT * FROM users
WHERE role IN ('admin', 'manager', 'editor');

-- Équivalent verbeux :
SELECT * FROM users
WHERE role = 'admin' OR role = 'manager' OR role = 'editor';
```

Plus lisible. Aussi : `NOT IN (...)`.

### `BETWEEN` — intervalle

```sql
SELECT * FROM users
WHERE age BETWEEN 25 AND 35;

-- Équivalent :
SELECT * FROM users
WHERE age >= 25 AND age <= 35;
```

`BETWEEN` est **inclusif** des deux bornes.

### `LIKE` — recherche de motif

```sql
SELECT * FROM users WHERE email LIKE '%@example.com';
SELECT * FROM users WHERE name LIKE 'A%';        -- commence par A
SELECT * FROM users WHERE name LIKE '_lice';     -- _ = un caractère
```

- `%` : 0 ou N caractères.
- `_` : exactement 1 caractère.

Sensible à la casse selon le SGBD (PostgreSQL : sensible ; MySQL : insensible par défaut). Pour insensibilité explicite, `ILIKE` en PostgreSQL.

### `IS NULL` — détection de valeur absente

```sql
SELECT * FROM users WHERE age IS NULL;
SELECT * FROM users WHERE age IS NOT NULL;
```

**Ne JAMAIS** utiliser `age = NULL` — ça ne fonctionne pas (cf. section 5).

---

## 4. Tri et pagination

### `ORDER BY`

```sql
SELECT * FROM users ORDER BY age ASC;        -- croissant (défaut)
SELECT * FROM users ORDER BY age DESC;       -- décroissant

SELECT * FROM users ORDER BY role, age DESC; -- multi-colonnes
```

### `LIMIT` et `OFFSET`

```sql
SELECT * FROM users
ORDER BY id
LIMIT 10;                  -- les 10 premières lignes

SELECT * FROM users
ORDER BY id
LIMIT 10 OFFSET 20;        -- de la 21ème à la 30ème
```

**Pagination classique** : `LIMIT page_size OFFSET (page_number - 1) * page_size`.

Sur SQL Server : `OFFSET ... FETCH NEXT ... ROWS ONLY` (syntaxe standard).

### Gestion des `NULL` dans le tri

PostgreSQL : `NULL` est trié **dernier** en `ASC` et **premier** en `DESC` par défaut. Forçable :

```sql
SELECT * FROM users ORDER BY age ASC NULLS LAST;
SELECT * FROM users ORDER BY age DESC NULLS FIRST;
```

MySQL traite `NULL` comme la plus petite valeur.

---

## 5. `NULL` — la valeur absente

### Théorie

`NULL` représente l'**absence** de valeur, pas zéro, pas chaîne vide. Trois propriétés à retenir :

1. **`NULL = NULL` est faux** (en réalité : `UNKNOWN`).
2. Toute opération arithmétique avec `NULL` donne `NULL`.
3. Toute comparaison avec `NULL` donne `UNKNOWN` (filtré par `WHERE`).

**Analogie.** `NULL` = "je ne sais pas". Demander "Alice ne sait pas = Bob ne sait pas ?" n'est pas vrai ni faux — c'est indéterminé.

### Conséquences pratiques

```sql
-- ✗ Ne retourne JAMAIS rien
SELECT * FROM users WHERE age = NULL;

-- ✓ Bon
SELECT * FROM users WHERE age IS NULL;

-- ✗ Surprise : exclut les NULL silencieusement
SELECT * FROM users WHERE age <> 30;
-- Si age IS NULL, la ligne n'apparaît PAS dans le résultat.

-- ✓ Pour inclure les NULL
SELECT * FROM users WHERE age <> 30 OR age IS NULL;
```

### `COALESCE` — fournir une valeur par défaut

```sql
SELECT name, COALESCE(age, 0) AS age FROM users;
-- Si age IS NULL, renvoie 0 à la place.
```

`COALESCE(a, b, c)` renvoie le premier non-NULL parmi ses arguments.

### `IFNULL` vs `COALESCE`

`IFNULL(x, y)` existe en MySQL/SQLite mais **pas** en PostgreSQL standard. Préférer `COALESCE` partout — c'est le standard ANSI.

---

## 6. `INSERT` — ajouter des lignes

### Une seule ligne

```sql
INSERT INTO users (email, name, age)
VALUES ('eve@example.com', 'Eve', 28);
```

Les colonnes non précisées prennent leur **valeur par défaut** (`DEFAULT`) ou `NULL` si rien n'est défini.

### Plusieurs lignes en un seul INSERT

```sql
INSERT INTO users (email, name) VALUES
  ('frank@example.com', 'Frank'),
  ('grace@example.com', 'Grace'),
  ('hank@example.com',  'Hank');
```

Bien plus efficace que 3 `INSERT` séparés — une seule transaction, moins de round-trips.

### `INSERT` avec toutes les colonnes implicites

```sql
INSERT INTO users VALUES (DEFAULT, 'eve@example.com', 'Eve', 28, 'user', true, DEFAULT);
```

**À éviter** : si la structure de la table change (nouvelle colonne ajoutée), l'INSERT casse. Toujours préciser les colonnes.

### `RETURNING` (PostgreSQL, SQLite récent)

```sql
INSERT INTO users (email, name) VALUES ('iris@example.com', 'Iris')
RETURNING id, created_at;
```

Récupère les valeurs générées (id auto, timestamps). Indispensable pour relier l'INSERT à la suite du traitement.

En MySQL : `LAST_INSERT_ID()` après l'INSERT.

### `ON CONFLICT` — gestion des doublons (PostgreSQL)

```sql
INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice 2')
ON CONFLICT (email) DO NOTHING;
-- ou
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
```

**Upsert** en une requête. MySQL : `INSERT ... ON DUPLICATE KEY UPDATE`.

---

## 7. `UPDATE` — modifier des lignes

### Syntaxe

```sql
UPDATE users
SET role = 'admin', is_active = true
WHERE email = 'bob@example.com';
```

**Toujours** un `WHERE` (sauf pour mettre à jour vraiment toute la table — rare et risqué).

### Mise à jour conditionnelle

```sql
UPDATE users
SET role = 'senior'
WHERE age > 30 AND role = 'user';
```

### Mise à jour avec calcul

```sql
UPDATE users
SET age = age + 1
WHERE email = 'alice@example.com';
```

La valeur de droite peut référencer les colonnes de la ligne en cours.

### `RETURNING` (PostgreSQL)

```sql
UPDATE users SET role = 'admin' WHERE email = 'bob@example.com'
RETURNING id, name, role;
```

Récupère les lignes modifiées. Confirmation immédiate.

---

## 8. `DELETE` — supprimer des lignes

### Syntaxe

```sql
DELETE FROM users
WHERE email = 'bob@example.com';
```

### Plusieurs lignes

```sql
DELETE FROM users
WHERE is_active = false AND created_at < '2024-01-01';
```

### `RETURNING`

```sql
DELETE FROM users WHERE id = 42
RETURNING *;
```

Récupère les lignes supprimées avant la suppression. Utile pour confirmer ou archiver.

### `TRUNCATE` — alternative pour vider une table

```sql
TRUNCATE TABLE users;
```

Vide la table **entière**, plus rapide que `DELETE FROM users` (pas de log ligne à ligne). Mais :

- Ne respecte pas certaines contraintes de clé étrangère.
- Ne déclenche pas les triggers.
- Pas annulable en cas de transaction selon le SGBD.

À utiliser pour des **resets de table** (tests, staging), jamais en production sans bonne raison.

---

## 9. ⚠️ Le piège catastrophique — UPDATE / DELETE sans WHERE

### Le scénario

```sql
UPDATE users SET role = 'admin';   -- ✗ TOUS les users deviennent admin
DELETE FROM users;                  -- ✗ TOUS les users sont supprimés
```

Sans `WHERE`, l'opération touche **toute la table**. C'est l'erreur la plus coûteuse en SQL — dispatch d'un email "rien ne marche en prod" en moins de 30 secondes.

### Anecdote

GitLab a perdu en 2017 ~6 heures de données suite à un `rm -rf` en production déclenché par un opérateur fatigué. SQL fait pareil avec `DELETE FROM users;` non gardé.

### Garde-fous

1. **Tester d'abord en `SELECT`** :

```sql
SELECT * FROM users WHERE email = 'bob@example.com';   -- vérifier le scope
-- puis seulement
DELETE FROM users WHERE email = 'bob@example.com';
```

2. **Transaction obligatoire pour les opérations risquées** :

```sql
BEGIN;
DELETE FROM users WHERE created_at < '2020-01-01';
-- Vérifier le nombre de lignes affectées
-- Si OK :
COMMIT;
-- Si KO :
ROLLBACK;
```

3. **Configurer le client SQL en mode `safe-updates`** : MySQL Workbench bloque les UPDATE/DELETE sans WHERE par défaut.

4. **Backup avant**. Toujours. Pour tout.

Transactions et `BEGIN`/`COMMIT` sont approfondis en **M7**.

---

## 10. Exercices pratiques

### Exercice 1 — Lecture filtrée (≈ 25 min)

Sur la table `users` :

1. Sélectionner tous les utilisateurs actifs.
2. Sélectionner les utilisateurs dont l'âge est entre 25 et 35.
3. Sélectionner les utilisateurs admin **ou** dont l'âge est inconnu.
4. Sélectionner les 5 utilisateurs les plus jeunes (NULL en dernier).
5. Sélectionner les utilisateurs dont le nom commence par `A` ou `B`.

### Exercice 2 — Pagination (≈ 15 min)

Récupérer la **deuxième page** d'utilisateurs (`page_size = 3`), triée par `id` croissant.

Vérifier que les pages sont **disjointes** (pas de chevauchement, pas d'oubli).

### Exercice 3 — Gestion NULL (≈ 25 min)

1. Compter les utilisateurs sans âge renseigné.
2. Lister les utilisateurs avec leur âge, en remplaçant `NULL` par `"unknown"`.
3. Sélectionner les utilisateurs dont l'âge est `<> 30` (et expliquer le piège — incluent-ils ceux avec âge `NULL` ?).
4. Corriger la requête pour inclure aussi ceux dont l'âge est `NULL`.

### Exercice 4 — INSERT (≈ 20 min)

1. Insérer un nouvel utilisateur "Mallory" avec un email valide.
2. Insérer 5 utilisateurs en une seule requête multi-VALUES.
3. Tenter d'insérer un utilisateur avec un email déjà existant — observer l'erreur.
4. Insérer avec `ON CONFLICT DO NOTHING` (PostgreSQL) pour ignorer le doublon.

### Exercice 5 — UPDATE et DELETE prudents (≈ 25 min)

1. Mettre à jour le rôle de tous les utilisateurs de plus de 30 ans en `'senior'`.
2. Désactiver (`is_active = false`) les utilisateurs créés avant `2024-01-01`.
3. Supprimer définitivement les utilisateurs inactifs **après** vérification par un `SELECT` préalable.

Documenter en commentaire la **vérification** effectuée avant chaque DELETE.

---

## 11. Mini-défi de synthèse (≈ 1,5 heure)

Concevoir et manipuler une table **`books`** :

**Schéma minimal** :

```sql
CREATE TABLE books (
    id          SERIAL PRIMARY KEY,
    isbn        VARCHAR(13) UNIQUE NOT NULL,
    title       VARCHAR(200) NOT NULL,
    author      VARCHAR(100) NOT NULL,
    year        INTEGER,
    price       DECIMAL(6, 2) NOT NULL,
    in_stock    BOOLEAN NOT NULL DEFAULT true,
    rating      DECIMAL(2, 1)                    -- optionnel, NULL si pas noté
);
```

**Mission** :

1. Insérer **10 livres** (mélange d'auteurs, d'années, avec quelques `NULL` sur `year` et `rating`).
2. Requêtes à écrire :
   - Tous les livres de moins de 20 € en stock.
   - Le top 3 des livres par rating (NULL en dernier).
   - Les livres publiés entre 1990 et 2010, triés par auteur puis titre.
   - Tous les livres dont le titre contient "python" (case-insensitive).
   - Les livres dont l'année est inconnue **ou** la note est manquante.
3. Mettre à jour les notes : remplacer les `NULL` par `0` (puis revenir en arrière).
4. Marquer comme `in_stock = false` tous les livres publiés avant 1990.
5. Supprimer les livres invendables (in_stock = false **et** rating < 2).

**Critères de validation** :

- [ ] Toutes les requêtes utilisent un `WHERE` explicite (sauf le SELECT top 3).
- [ ] L'UPDATE et le DELETE sont précédés d'un `SELECT` de contrôle.
- [ ] Les `NULL` sont gérés avec `IS NULL` ou `COALESCE`.
- [ ] Aucune requête ne touche toute la table par accident.

---

## 12. Auto-évaluation

Le module M2 est validé lorsque :

- [ ] L'apprenant écrit un `SELECT ... WHERE ... ORDER BY ... LIMIT` complet de tête.
- [ ] Il connaît `IS NULL`, `IN`, `BETWEEN`, `LIKE`, `COALESCE`.
- [ ] Il sait insérer une ou plusieurs lignes et récupérer l'id généré.
- [ ] Il sait mettre à jour avec calcul (`age = age + 1`).
- [ ] Il connaît le risque catastrophique d'`UPDATE`/`DELETE` sans `WHERE`.
- [ ] Il sait gérer les doublons avec `ON CONFLICT` (PostgreSQL) ou équivalent.
- [ ] Le mini-défi `books` est implémenté avec toutes les requêtes fonctionnelles.

**Items du glossaire visés** (vers passage P/N → A) :

- **N1** : `SELECT ... FROM ... WHERE`, `INSERT INTO ... VALUES ...`, `UPDATE ... SET ... WHERE`, `DELETE FROM ... WHERE`.

---

## 13. Ressources complémentaires

- **Documentation PostgreSQL** — _Queries_ : [postgresql.org/docs/current/queries.html](https://www.postgresql.org/docs/current/queries.html).
- **PostgreSQL Tutorial** — _Querying Data_ : [postgresqltutorial.com/postgresql-tutorial](https://www.postgresqltutorial.com/postgresql-tutorial/).
- **SQLBolt** : [sqlbolt.com](https://sqlbolt.com/). Tutoriel interactif gratuit, recommandé pour les débutants.
- **Mode Analytics SQL Tutorial** : [mode.com/sql-tutorial](https://mode.com/sql-tutorial/). Excellente progression pédagogique.
- **PostgreSQL Exercises** : [pgexercises.com](https://pgexercises.com/). Exercices progressifs avec correction.
- **Use The Index, Luke!** : [use-the-index-luke.com](https://use-the-index-luke.com/). Référence sur la performance SQL (utile pour M12).
