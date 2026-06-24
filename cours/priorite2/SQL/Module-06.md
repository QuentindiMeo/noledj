# M6 — Lisibilité et conditions

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Utiliser des **alias** de table et de colonne pour clarifier les requêtes.
- Exprimer une **logique conditionnelle** dans `SELECT` via **`CASE WHEN`**.
- Maîtriser les **wildcards** (`%`, `_`, `[...]`) avec `LIKE` et `ILIKE`.
- Appliquer des **conventions de formatting** pour rendre les requêtes longues lisibles.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M5 SQL terminés.

---

## 1. Alias — clarifier les noms

### Alias de table

```sql
SELECT u.name, o.total
FROM users AS u
JOIN orders AS o ON o.user_id = u.id;
```

`AS u` est optionnel — `users u` fonctionne aussi. Convention : alias **court** (1-3 lettres) lié au nom de la table.

### Pourquoi un alias

- **Lisibilité** : `u.name` plus court que `users.name` dans des requêtes longues.
- **Obligatoire** dans les self-joins (cf. M5) — sinon on ne distingue pas les deux instances.
- **Obligatoire** quand deux tables ont une colonne du même nom.

```sql
-- Sans alias : ambigu
SELECT name FROM users, orders;   -- ✗ name vient d'où ?

-- Avec alias
SELECT u.name FROM users u, orders o;    -- ✓
```

### Alias de colonne

```sql
SELECT
    name AS full_name,
    YEAR(created_at) AS year_joined,
    COUNT(*) AS total_orders
FROM users;
```

**Cas où c'est indispensable** :

- Colonne calculée sans nom natif (`SUM(total)` → renommer en `revenue`).
- Plusieurs colonnes du même nom dans le résultat (`u.id` et `o.id` → `user_id` et `order_id`).
- Lisibilité pour les consommateurs du résultat (rapport, export CSV).

### Alias dans `ORDER BY` et `GROUP BY`

```sql
SELECT
    role,
    COUNT(*) AS nb_users
FROM users
GROUP BY role
ORDER BY nb_users DESC;
```

Pratique : `ORDER BY` accepte les alias définis dans `SELECT`. **`WHERE` ne les accepte pas** (évalué avant `SELECT`).

```sql
-- ✗ Erreur — WHERE ne voit pas l'alias
SELECT name, age * 12 AS age_months
FROM users
WHERE age_months > 360;

-- ✓ Répéter l'expression
SELECT name, age * 12 AS age_months
FROM users
WHERE age * 12 > 360;

-- ✓ Ou utiliser une CTE / sous-requête (cf. M12)
```

### Alias dans les expressions

```sql
SELECT
    u.name,
    o.total - o.total * 0.20 AS total_ht
FROM users u
JOIN orders o ON o.user_id = u.id;
```

L'alias documente une formule. Sans lui, le rapport renvoie `?column?` ou `total - total * 0.20` selon le SGBD.

### Guillemets pour identifiants exotiques

```sql
SELECT name AS "User Name", age AS "Age in years"
FROM users;
```

Permet des espaces ou caractères spéciaux dans le nom de colonne. À utiliser modérément — préférer `snake_case` ou `camelCase` simple.

---

## 2. `CASE WHEN` — expressions conditionnelles

### Syntaxe `CASE` simple

```sql
SELECT
    name,
    CASE role
        WHEN 'admin' THEN 'Administrateur'
        WHEN 'user' THEN 'Utilisateur standard'
        ELSE 'Autre'
    END AS role_label
FROM users;
```

Equivalent d'un `switch`. Compare une expression à des valeurs successives.

### Syntaxe `CASE WHEN` (cherchée)

Plus flexible — chaque branche a sa propre condition :

```sql
SELECT
    name,
    age,
    CASE
        WHEN age IS NULL THEN 'unknown'
        WHEN age < 18 THEN 'minor'
        WHEN age BETWEEN 18 AND 65 THEN 'adult'
        ELSE 'senior'
    END AS age_category
FROM users;
```

**Analogie.** Un arbre `if / else if / else`. Chaque `WHEN` est un test booléen ; le premier vrai gagne. `ELSE` est le défaut.

### Cas d'usage

- **Catégorisation** d'une valeur continue (âges, prix, scores).
- **Renommage** de codes techniques en libellés métier.
- **Calcul conditionnel** (totaux selon statut).

### `CASE` dans agrégat — pivot

```sql
SELECT
    country,
    SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS revenue_paid,
    SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END) AS revenue_cancelled,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) AS nb_paid,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) AS nb_pending
FROM orders
GROUP BY country;
```

**Pivot** : transformer des lignes en colonnes. Très utile pour les rapports croisés.

PostgreSQL offre aussi `FILTER (WHERE ...)` (cf. M4), souvent plus lisible :

```sql
SUM(total) FILTER (WHERE status = 'paid') AS revenue_paid
```

### `CASE` dans `ORDER BY`

```sql
SELECT name, role
FROM users
ORDER BY
    CASE role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'user' THEN 3
        ELSE 4
    END;
```

Tri **par ordre métier**, pas alphabétique. Pratique pour afficher les rôles dans un ordre hiérarchique.

### `CASE` dans `UPDATE`

```sql
UPDATE products
SET price = CASE
    WHEN category = 'premium' THEN price * 1.10
    WHEN category = 'standard' THEN price * 1.05
    ELSE price
END;
```

Mise à jour conditionnelle par ligne. Un seul `UPDATE` au lieu de plusieurs.

---

## 3. Wildcards — recherche par motif

### `LIKE` et les jokers

```sql
SELECT * FROM users WHERE email LIKE '%@example.com';
```

| Wildcard | Sens                         |
| -------- | ---------------------------- |
| `%`      | Zéro ou plusieurs caractères |
| `_`      | Exactement un caractère      |

Exemples :

```sql
LIKE 'A%'            -- commence par A
LIKE '%abc'          -- finit par abc
LIKE '%abc%'         -- contient abc
LIKE '_lice'         -- 5 lettres, finit par 'lice' (Alice, Slice...)
LIKE 'A_e_'          -- 4 lettres, A _ e _ (Acre, Acme...)
```

### Sensibilité à la casse

| SGBD           | `LIKE`                                       |
| -------------- | -------------------------------------------- |
| **PostgreSQL** | Sensible (`'Alice'` ≠ `'alice'`)             |
| **MySQL**      | Insensible par défaut (`utf8mb4_unicode_ci`) |
| **SQLite**     | Insensible par défaut pour ASCII             |

PostgreSQL fournit `ILIKE` pour une recherche **insensible** explicite :

```sql
SELECT * FROM users WHERE name ILIKE 'al%';   -- matche Alice, alice, ALICE
```

Standard portable : passer en lowercase explicitement.

```sql
SELECT * FROM users WHERE LOWER(name) LIKE 'al%';
```

### `NOT LIKE`

```sql
SELECT * FROM users WHERE email NOT LIKE '%@spam.com';
```

### Échapper un wildcard

Si on cherche un `%` ou `_` littéral dans la donnée :

```sql
SELECT * FROM messages
WHERE content LIKE '%50\%%'        -- contient "50%"
ESCAPE '\';
```

Le caractère d'échappement est spécifié après `ESCAPE`.

### `SIMILAR TO` et regex (PostgreSQL)

Pour des motifs plus riches :

```sql
SELECT * FROM users WHERE email ~ '^[a-z]+@example\.(com|org)$';   -- regex
SELECT * FROM users WHERE email ~* '^admin';                       -- regex insensible
```

- `~` : regex sensible.
- `~*` : regex insensible.
- `!~` / `!~*` : négations.

À utiliser quand `LIKE` ne suffit pas. Plus puissant, mais plus coûteux côté performance.

### Performance

`LIKE 'abc%'` (préfixe) peut utiliser un index. `LIKE '%abc'` (suffixe) ou `LIKE '%abc%'` (contains) **ne peuvent pas** utiliser un index B-tree classique → table scan.

Pour des recherches **fulltext** efficaces :

- PostgreSQL : `tsvector` + index GIN.
- MySQL : `FULLTEXT INDEX`.
- Service dédié : Elasticsearch, Meilisearch.

---

## 4. Conventions de formatting

### Pourquoi formater

Une requête SQL de 20 lignes mal formattée est illisible pour le relecteur — et pour soi-même 3 mois plus tard. Bonne nouvelle : SQL **n'est pas sensible** à la casse (sauf identifiants entre guillemets) et **tolère** les espaces et retours à la ligne. À nous d'en profiter.

### Règles d'or

1. **Mots-clés en MAJUSCULES** : `SELECT`, `FROM`, `WHERE`, `JOIN`. Distingue visuellement de la donnée.
2. **Identifiants en `snake_case`** : `user_id`, pas `userId` ou `USER_ID`.
3. **Une clause par ligne** : `SELECT`, `FROM`, `WHERE`, `GROUP BY`, etc. sur leur propre ligne.
4. **Indentation** des colonnes du `SELECT` et des conditions du `WHERE`.
5. **Alias systématiques** pour les tables jointes.

### Exemple avant / après

**Avant** :

```sql
select u.name as n,o.total,o.status from users u join orders o on o.user_id=u.id where o.status='paid' and o.total>100 order by o.total desc limit 10;
```

**Après** :

```sql
SELECT
    u.name AS n,
    o.total,
    o.status
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE o.status = 'paid'
  AND o.total > 100
ORDER BY o.total DESC
LIMIT 10;
```

La seconde version se lit en 30 secondes ; la première demande 2 minutes pour la décomposer.

### Conventions par équipe

Beaucoup d'équipes adoptent un **SQL Style Guide** explicite ([sqlstyle.guide](https://www.sqlstyle.guide/)). Les outils comme **`sqlfluff`** automatisent le formatting et la conformité. À mettre en CI sur tout projet avec du SQL versionné.

### Commentaires

```sql
-- Commentaire sur une ligne

/*
 Commentaire multi-lignes,
 utile pour documenter une requête complexe.
 */

SELECT u.name,                  -- nom complet
       COUNT(o.id) AS nb        -- nombre de commandes
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

Commentaire en tête d'une requête longue = bonne pratique. Permet de retrouver l'intention 6 mois plus tard.

---

## 5. Exercices pratiques

### Exercice 1 — Aliasing (≈ 15 min)

Reformuler la requête suivante avec des alias clairs :

```sql
SELECT users.name, orders.total, orders.created_at
FROM users
JOIN orders ON orders.user_id = users.id
WHERE orders.status = 'paid';
```

Ajouter des alias de colonne pour rendre la sortie auto-documentée (`user_name`, `order_amount`, `order_date`).

### Exercice 2 — `CASE` simple (≈ 25 min)

Sur la table `users` :

1. Ajouter une colonne dérivée `age_category` qui catégorise l'âge :
   - NULL → `'unknown'`
   - < 18 → `'minor'`
   - 18-25 → `'young'`
   - 26-65 → `'adult'`
   - > 65 → `'senior'`

2. Compter le nombre d'utilisateurs par catégorie (utiliser `GROUP BY` sur l'expression `CASE`).

### Exercice 3 — Pivot avec `CASE` (≈ 30 min)

Sur la table `orders`, construire un rapport pivot :

```
country | paid_revenue | cancelled_revenue | pending_revenue | total
--------+--------------+-------------------+-----------------+-------
FR      | 260.50       | 30.00             | 0.00            | 290.50
DE      | 250.00       | 0.00              | 0.00            | 250.00
US      | 0.00         | 0.00              | 999.00          | 999.00
```

Utiliser `SUM(CASE WHEN ... THEN total ELSE 0 END)` pour chaque statut.

### Exercice 4 — `LIKE` et patterns (≈ 25 min)

Sur la table `users` :

1. Trouver les emails se terminant par `@gmail.com`.
2. Trouver les utilisateurs dont le nom contient "an" (sensible à la casse).
3. Faire la même chose en insensible à la casse.
4. Trouver les emails dont le nom local (avant `@`) commence par une lettre suivie de chiffres (`a123@x.y`, `b456@x.y`).
5. Exclure tous les emails contenant `+` (alias gmail souvent utilisés pour les inscriptions tests).

### Exercice 5 — Tri par ordre métier (≈ 20 min)

Sur la table `orders` :

- Trier par `status` dans l'ordre métier : `pending` d'abord, puis `paid`, puis `cancelled`.
- Au sein de chaque statut, trier par `total` décroissant.
- Limit 10.

Utiliser un `CASE` dans `ORDER BY`.

### Exercice 6 — Formatting (≈ 15 min)

Reformatter la requête condensée suivante selon les règles de la section 4 :

```sql
select c.country,count(distinct c.id) as users_count,sum(case when o.status='paid' then o.total else 0 end) as revenue,count(case when o.status='cancelled' then 1 end) as cancelled_count from users c left join orders o on o.user_id=c.id group by c.country having sum(case when o.status='paid' then o.total else 0 end)>100 order by revenue desc limit 10;
```

---

## 6. Mini-défi de synthèse (≈ 1 heure)

Construire un **rapport mensuel d'activité** lisible et conditionnel sur la base Chinook (ou base de votre choix) :

### Spécifications

- Colonnes : `month`, `nb_invoices`, `revenue`, `avg_basket`, `top_genre`, `customer_segment_breakdown`.
- **`month`** : YYYY-MM extrait de la date.
- **`nb_invoices`** : nombre d'invoices du mois.
- **`revenue`** : somme des totals (en €).
- **`avg_basket`** : `revenue / nb_invoices`.
- **`top_genre`** : genre musical le plus vendu ce mois-là (via une sous-requête ou jointure).
- **`customer_segment_breakdown`** : 3 colonnes pivot — `nb_new_customers`, `nb_returning_customers`, `nb_premium_customers` (définition à choisir, `CASE WHEN`).

### Exigences

- [ ] **Aliasing systématique** sur les tables.
- [ ] **Au moins 3 colonnes** dérivées via `CASE WHEN`.
- [ ] **Au moins une recherche** par `LIKE` ou `ILIKE`.
- [ ] **Formatting** conforme aux règles section 4.
- [ ] **Commentaires** en tête de chaque requête expliquant l'intention.
- [ ] **Tri** final par `month` croissant.

---

## 7. Auto-évaluation

Le module M6 est validé lorsque :

- [ ] L'apprenant utilise des alias de table courts et cohérents.
- [ ] Il écrit un `CASE WHEN` à 3+ branches avec `ELSE`.
- [ ] Il sait construire un pivot avec `SUM(CASE ...)`.
- [ ] Il distingue `%` et `_` dans `LIKE`.
- [ ] Il connaît `ILIKE` (PostgreSQL) ou `LOWER(...)` pour la recherche insensible.
- [ ] Il applique les règles de formatting sur une requête longue.
- [ ] Le rapport mensuel du mini-défi est complet et lisible.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : alias, `SELECT CASE`, caractères wildcards.

---

## 8. Ressources complémentaires

- **Documentation PostgreSQL** — _Conditional Expressions_ : [postgresql.org/docs/current/functions-conditional.html](https://www.postgresql.org/docs/current/functions-conditional.html).
- **PostgreSQL** — _Pattern Matching_ : [postgresql.org/docs/current/functions-matching.html](https://www.postgresql.org/docs/current/functions-matching.html). Couvre `LIKE`, `SIMILAR TO`, regex.
- **SQL Style Guide** (Simon Holywell) : [sqlstyle.guide](https://www.sqlstyle.guide/). Conventions complètes.
- **sqlfluff** : [sqlfluff.com](https://sqlfluff.com/). Linter SQL — à intégrer en CI.
- **PostgreSQL Tutorial** — _CASE Expression_ : [postgresqltutorial.com/postgresql-tutorial/postgresql-case](https://www.postgresqltutorial.com/postgresql-tutorial/postgresql-case/).
- **Mode SQL Tutorial** — _Conditional Logic in Aggregations_ : [mode.com/sql-tutorial/sql-aggregate-functions-conditional](https://mode.com/sql-tutorial/).
