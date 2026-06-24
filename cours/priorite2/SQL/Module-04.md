# M4 — Agrégation

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser les **fonctions d'agrégation** (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`).
- Maîtriser **`GROUP BY`** pour grouper sur une ou plusieurs colonnes.
- Filtrer un résultat groupé avec **`HAVING`** et distinguer son rôle de `WHERE`.
- Construire des **rapports d'agrégation** combinant filtre, groupage, tri, pagination.
- Reconnaître les **pièges classiques** (NULL dans COUNT, mélange agrégat / non-agrégat).

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M3 SQL terminés.

---

## 1. Préparation — jeu de données

Pour tous les exemples, on utilise une table `orders` :

```sql
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    country     VARCHAR(2) NOT NULL,
    total       DECIMAL(10, 2) NOT NULL,
    status      VARCHAR(20) NOT NULL,
    created_at  TIMESTAMP NOT NULL
);

INSERT INTO orders (user_id, country, total, status, created_at) VALUES
  (1, 'FR', 120.00, 'paid',     '2026-01-15'),
  (1, 'FR',  45.00, 'paid',     '2026-02-10'),
  (2, 'FR',  85.50, 'paid',     '2026-01-20'),
  (2, 'FR',  30.00, 'cancelled','2026-02-05'),
  (3, 'DE', 200.00, 'paid',     '2026-01-22'),
  (3, 'DE',  50.00, 'paid',     '2026-03-01'),
  (4, 'US', 999.00, 'pending',  '2026-03-12'),
  (5, 'FR',  10.00, 'paid',     '2026-04-01');
```

---

## 2. Fonctions d'agrégation

### Les cinq incontournables

| Fonction              | Effet                                     | Type renvoyé        |
| --------------------- | ----------------------------------------- | ------------------- |
| `COUNT(*)`            | Compte toutes les lignes                  | INTEGER             |
| `COUNT(col)`          | Compte les valeurs non-NULL de la colonne | INTEGER             |
| `COUNT(DISTINCT col)` | Compte les valeurs distinctes (non-NULL)  | INTEGER             |
| `SUM(col)`            | Somme des valeurs                         | Selon col (numeric) |
| `AVG(col)`            | Moyenne des valeurs                       | NUMERIC ou DOUBLE   |
| `MIN(col)`            | Plus petite valeur                        | Selon col           |
| `MAX(col)`            | Plus grande valeur                        | Selon col           |

### Sans `GROUP BY` — une seule ligne

```sql
SELECT COUNT(*) FROM orders;
-- 8

SELECT
    COUNT(*)             AS total_rows,
    COUNT(DISTINCT user_id) AS unique_customers,
    SUM(total)           AS revenue,
    AVG(total)           AS avg_order,
    MIN(total)           AS smallest,
    MAX(total)           AS biggest
FROM orders
WHERE status = 'paid';
```

Sans `GROUP BY`, l'agrégation regroupe **toute la table** en une seule ligne de résultat.

**Analogie.** Comme la touche `Σ` d'une calculatrice de table. Elle additionne toutes les valeurs d'une colonne, indépendamment de leur clé.

### Subtilités `COUNT`

```sql
-- Table users avec parfois age IS NULL
SELECT COUNT(*) FROM users;        -- 100 (toutes les lignes)
SELECT COUNT(age) FROM users;      -- 75 (seulement non-NULL)
SELECT COUNT(DISTINCT age) FROM users;  -- 42 (valeurs distinctes)
```

À retenir : `COUNT(*)` compte les **lignes**, `COUNT(col)` compte les **valeurs non-NULL** de la colonne.

### Autres fonctions utiles

- **`STRING_AGG(col, sep)`** (PostgreSQL) / **`GROUP_CONCAT(col SEPARATOR sep)`** (MySQL) — concatène des chaînes groupées.
- **`ARRAY_AGG(col)`** (PostgreSQL) — agrège en tableau.
- **`STDDEV`, `VARIANCE`** — écart type, variance.
- **`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col)`** — médiane et percentiles (SQL standard, supporté par PG, Oracle, SQL Server).

---

## 3. `GROUP BY` — agréger par catégorie

### Théorie

`GROUP BY` divise les lignes en **groupes** selon la valeur d'une ou plusieurs colonnes, puis applique l'agrégation **à chaque groupe**.

**Analogie.** Le tri d'une pile de factures par mois. On les empile par mois, puis on somme chaque pile séparément.

### Exemple simple

```sql
SELECT
    country,
    COUNT(*) AS nb_orders,
    SUM(total) AS revenue
FROM orders
GROUP BY country;

-- Résultat :
-- country | nb_orders | revenue
-- FR      | 5         | 290.50
-- DE      | 2         | 250.00
-- US      | 1         | 999.00
```

Chaque pays a une ligne agrégée. Le `COUNT(*)` compte les lignes **du groupe**, le `SUM(total)` somme **dans le groupe**.

### Multi-colonnes

```sql
SELECT
    country,
    status,
    COUNT(*) AS nb,
    SUM(total) AS revenue
FROM orders
GROUP BY country, status
ORDER BY country, status;
```

Crée un groupe par couple (country, status). Permet des rapports croisés.

### Règle fondamentale

> **Toute colonne du `SELECT` qui n'est pas une fonction d'agrégation doit apparaître dans `GROUP BY`.**

```sql
-- ✗ Erreur : status n'est ni agrégé, ni groupé
SELECT country, status, COUNT(*)
FROM orders
GROUP BY country;

-- ✓ Correct
SELECT country, status, COUNT(*)
FROM orders
GROUP BY country, status;
```

MySQL **par défaut** est laxiste sur cette règle (`only_full_group_by` désactivé) — il retourne un résultat arbitraire, ce qui mène à des bugs subtils. **Toujours activer `only_full_group_by`** ou se discipliner.

---

## 4. `HAVING` — filtrer des groupes

### Théorie

`HAVING` filtre **les groupes** produits par `GROUP BY`, comme `WHERE` filtre **les lignes** avant agrégation.

**Analogie** :

- `WHERE` = filtre les factures avant le tri par mois (exclure les factures annulées).
- `HAVING` = filtre les piles mensuelles après tri (exclure les mois où moins de 5 factures).

### Exemple

```sql
SELECT
    country,
    COUNT(*) AS nb_orders,
    SUM(total) AS revenue
FROM orders
WHERE status = 'paid'                  -- filtre avant agrégation
GROUP BY country
HAVING SUM(total) > 100                -- filtre après agrégation
ORDER BY revenue DESC;
```

Lecture :

1. **WHERE** : ne garder que les commandes payées.
2. **GROUP BY** : grouper par pays.
3. **HAVING** : ne garder que les pays dont le revenu > 100 €.
4. **ORDER BY** : trier les pays par revenu décroissant.

### Différence cruciale `WHERE` vs `HAVING`

| Aspect                                     | `WHERE`          | `HAVING`         |
| ------------------------------------------ | ---------------- | ---------------- |
| Quand                                      | Avant agrégation | Après agrégation |
| Peut utiliser des fonctions d'agrégation ? | Non              | Oui              |
| Peut utiliser un alias du `SELECT` ?       | Non              | Oui (selon SGBD) |

Exemple qui distingue :

```sql
SELECT country, COUNT(*) AS nb
FROM orders
WHERE total > 50              -- filtre les lignes individuelles
GROUP BY country
HAVING COUNT(*) >= 2;         -- filtre les pays
```

`WHERE total > 50` exclut les petites commandes **avant** de compter. `HAVING COUNT(*) >= 2` exclut les pays qui ont moins de 2 commandes restantes après le filtre.

Si on inverse :

```sql
-- ✗ Erreur — WHERE ne peut pas utiliser COUNT
SELECT country, COUNT(*)
FROM orders
WHERE COUNT(*) >= 2
GROUP BY country;
```

---

## 5. Cas avancés

### `GROUP BY` avec expressions

```sql
SELECT
    EXTRACT(MONTH FROM created_at) AS month,
    COUNT(*),
    SUM(total)
FROM orders
GROUP BY EXTRACT(MONTH FROM created_at)
ORDER BY month;
```

On peut grouper par n'importe quelle expression — pas seulement une colonne.

### `GROUP BY` numéroté (positions)

```sql
SELECT country, status, COUNT(*)
FROM orders
GROUP BY 1, 2;     -- équivalent à GROUP BY country, status
```

Pratique pour les longues expressions. À utiliser modérément — moins lisible.

### `ROLLUP` et `CUBE`

Fonctions avancées pour calculer **plusieurs niveaux d'agrégation** en une requête. Standard SQL, supporté par PG, MySQL 8+, SQL Server, Oracle.

```sql
SELECT
    country,
    status,
    SUM(total) AS revenue
FROM orders
GROUP BY ROLLUP (country, status);

-- Résultat :
-- country | status     | revenue
-- FR      | paid       | 260.50
-- FR      | cancelled  | 30.00
-- FR      | NULL       | 290.50    ← sous-total France
-- DE      | paid       | 250.00
-- DE      | NULL       | 250.00    ← sous-total Allemagne
-- US      | pending    | 999.00
-- US      | NULL       | 999.00    ← sous-total US
-- NULL    | NULL       | 1539.50   ← total général
```

`ROLLUP` ajoute les **sous-totaux hiérarchiques**. `CUBE` ajoute **toutes les combinaisons** possibles. Utile pour les rapports avec totaux croisés.

### `FILTER` clause (PostgreSQL)

Filtrer dans l'agrégation, sans WHERE global :

```sql
SELECT
    country,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'paid') AS paid,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
    SUM(total) FILTER (WHERE status = 'paid') AS revenue
FROM orders
GROUP BY country;
```

Très expressif pour les rapports multi-statuts. Équivalent en standard SQL via `CASE WHEN` (M6).

---

## 6. Pièges classiques

### Piège 1 — `COUNT(col)` vs `COUNT(*)`

```sql
SELECT COUNT(email) FROM users;    -- 75 (NULL exclus)
SELECT COUNT(*)     FROM users;    -- 100 (toutes les lignes)
```

Faire la différence selon ce qu'on veut compter (lignes ou valeurs renseignées).

### Piège 2 — Mélange agrégat / non-agrégat

```sql
-- ✗ Erreur (en mode strict)
SELECT user_id, status, SUM(total)
FROM orders
GROUP BY user_id;
```

`status` n'est ni groupé ni agrégé. PostgreSQL refuse ; MySQL non-strict retourne une valeur arbitraire de `status` par user.

### Piège 3 — Division par zéro dans AVG

```sql
SELECT AVG(total) FROM orders WHERE status = 'voided';
-- Retourne NULL si aucune ligne ne matche, pas 0.
```

À gérer avec `COALESCE(AVG(total), 0)`.

### Piège 4 — `SUM` sur colonne nullable

```sql
SELECT SUM(rating) FROM books WHERE author = 'X';
-- Si tous les ratings sont NULL, SUM renvoie NULL, pas 0.
```

Idem : `COALESCE(SUM(rating), 0)` pour fiabiliser.

### Piège 5 — `HAVING` au lieu de `WHERE`

```sql
-- ✓ Correct mais moins efficace
SELECT country, COUNT(*)
FROM orders
GROUP BY country
HAVING country = 'FR';

-- ✓ Plus efficace : filtrer AVANT
SELECT country, COUNT(*)
FROM orders
WHERE country = 'FR'
GROUP BY country;
```

`WHERE` filtre tôt, réduisant le nombre de lignes à grouper. À utiliser quand le filtre porte sur une colonne (pas un agrégat).

### Piège 6 — Performance des `DISTINCT` et `GROUP BY`

Les deux nécessitent souvent un tri ou un hashage des lignes. Sur des tables de millions de lignes, c'est coûteux. **Indexer** la colonne groupée aide énormément (cf. M12).

---

## 7. Exercices pratiques

### Exercice 1 — Agrégations de base (≈ 20 min)

Sur la table `orders` :

1. Compter le nombre total de commandes.
2. Compter le nombre de clients distincts.
3. Calculer le revenu total (commandes `paid` seulement).
4. Trouver la commande la plus chère.
5. Calculer le panier moyen (paid only).

### Exercice 2 — GROUP BY simple (≈ 25 min)

1. Nombre de commandes par pays.
2. Revenu par statut.
3. Nombre de commandes par client (`user_id`).
4. Pour chaque pays, le panier moyen et le panier maximum (paid only).

### Exercice 3 — HAVING (≈ 25 min)

1. Pays avec **plus de 2 commandes**.
2. Clients dont le total dépensé **> 100 €**.
3. Mois (extract de `created_at`) avec un **revenu > 200 €**.
4. Statuts représentés par **au moins 3 commandes**.

### Exercice 4 — Combinaison WHERE + GROUP BY + HAVING + ORDER BY + LIMIT (≈ 30 min)

Construire une requête qui retourne **les 3 meilleurs clients (par revenu)** :

- Seulement les commandes payées.
- Seulement les clients avec **au moins 2 commandes** payées.
- Triés par revenu décroissant.
- Limit 3.

### Exercice 5 — Pièges détectés (≈ 20 min)

Identifier l'erreur ou le risque dans chaque requête :

```sql
-- A
SELECT user_id, country, COUNT(*) FROM orders GROUP BY user_id;

-- B
SELECT AVG(total) FROM orders WHERE status = 'voided';

-- C
SELECT country, COUNT(*) FROM orders WHERE COUNT(*) > 2 GROUP BY country;

-- D
SELECT country, SUM(total) FROM orders GROUP BY 1 HAVING SUM(total) > 100;
```

Corriger A, B, C. D est correct mais à commenter.

---

## 8. Mini-défi de synthèse — rapport d'agrégation (≈ 1 à 1,5 heure)

Sur un jeu de données plus riche (par exemple Chinook ou Northwind, cf. M1), construire un **rapport d'agrégation** qui répond aux questions :

### Bibliothèque Chinook (musique)

1. **Top 10 artistes** par nombre de tracks.
2. **Revenu total** par pays client.
3. **Panier moyen** par client, classé par taille décroissante (top 20).
4. **Genres musicaux** ayant **plus de 50 tracks** et un **prix moyen > 0.99 €**.
5. **Évolution mensuelle** du nombre de commandes sur les 12 derniers mois (utiliser `DATE_TRUNC` ou `EXTRACT`).
6. **ROLLUP** : nombre d'invoices par pays, avec un total général.

### Livrables

- Un fichier `.sql` avec chaque requête commentée (objectif, jointure, agrégation).
- Pour chaque requête, **noter la première ligne de résultat** en commentaire.
- Au moins **deux requêtes** utilisent un `HAVING`.
- Au moins **une requête** utilise `COUNT(DISTINCT)`.
- Au moins **une requête** combine `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`.

---

## 9. Auto-évaluation

Le module M4 est validé lorsque :

- [ ] L'apprenant cite les 5 fonctions d'agrégation principales.
- [ ] Il distingue `COUNT(*)`, `COUNT(col)` et `COUNT(DISTINCT col)`.
- [ ] Il maîtrise la règle "toute colonne SELECT non agrégée doit être dans GROUP BY".
- [ ] Il distingue `WHERE` (lignes) et `HAVING` (groupes) avec une analogie.
- [ ] Il identifie 3 pièges classiques d'agrégation.
- [ ] Le mini-défi rapport est rendu avec 6 requêtes commentées.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : fonctions d'agrégation.
- (Préfiguration N3 : `GROUP BY`, `HAVING` — déjà introduits ici.)

---

## 10. Ressources complémentaires

- **Documentation PostgreSQL** — _Aggregate Functions_ : [postgresql.org/docs/current/functions-aggregate.html](https://www.postgresql.org/docs/current/functions-aggregate.html).
- **Documentation PostgreSQL** — _GROUP BY and HAVING_ : [postgresql.org/docs/current/queries-table-expressions.html](https://www.postgresql.org/docs/current/queries-table-expressions.html).
- **PostgreSQL Tutorial** — _GROUP BY_ : [postgresqltutorial.com/postgresql-tutorial/postgresql-group-by](https://www.postgresqltutorial.com/postgresql-tutorial/postgresql-group-by/).
- **Mode SQL Tutorial** — _Aggregate Functions_ : [mode.com/sql-tutorial/sql-aggregate-functions](https://mode.com/sql-tutorial/sql-aggregate-functions/).
- **PostgreSQL Exercises** — sections _Aggregates_ : [pgexercises.com/questions/aggregates](https://pgexercises.com/questions/aggregates/).
