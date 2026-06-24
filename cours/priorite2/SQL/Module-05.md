# M5 — Jointures et ensembles

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Joindre plusieurs tables avec **`INNER JOIN`**.
- Préserver les lignes non matchées avec **`LEFT JOIN`** / **`RIGHT JOIN`**.
- Combiner toutes les lignes avec **`FULL OUTER JOIN`**.
- Utiliser **`CROSS JOIN`** et **self-join** (table jointe à elle-même).
- Combiner les résultats de plusieurs requêtes avec **`UNION`**, **`INTERSECT`**, **`EXCEPT`**.
- Reconnaître les **pièges classiques** : produit cartésien, jointure sur NULL, duplication par jointure.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M4 SQL terminés.

---

## 1. Préparation — jeu de données

```sql
CREATE TABLE users (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(100) NOT NULL,
    country VARCHAR(2) NOT NULL
);

CREATE TABLE orders (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    total   DECIMAL(10, 2) NOT NULL,
    status  VARCHAR(20) NOT NULL
);

INSERT INTO users (name, country) VALUES
  ('Alice', 'FR'),
  ('Bob',   'FR'),
  ('Carol', 'DE'),
  ('Dave',  'US');     -- Dave n'a pas de commande

INSERT INTO orders (user_id, total, status) VALUES
  (1, 120.00, 'paid'),
  (1,  45.00, 'paid'),
  (2,  85.50, 'paid'),
  (3, 200.00, 'paid'),
  (NULL, 50.00, 'pending');   -- commande sans user_id (orphan)
```

---

## 2. Pourquoi joindre des tables

Le modèle relationnel **éclate les données** en plusieurs tables liées (cf. formes normales, M9). Conséquence : pour produire un rapport "qui a commandé combien", on doit **recombiner** ces tables. C'est le rôle des **jointures**.

**Analogie.** Un classeur de fiches. Une fiche **client** et une fiche **commande** sont rangées séparément, mais reliées par un numéro de client. Pour faire un mailing, on **rapproche** les deux fiches pour chaque client.

### Sans jointure (anti-pattern)

```sql
-- Tout dans une table
CREATE TABLE orders (
    id, user_name, user_country, user_email,  -- redondant !
    total, status
);
```

Si un utilisateur change d'email, il faut mettre à jour **toutes** ses commandes. Risque de divergence : 1 commande avec l'ancien email reste à jamais. Cf. M9 sur la normalisation.

### Avec jointure

```sql
SELECT u.name, u.country, o.total
FROM users u
JOIN orders o ON o.user_id = u.id;
```

Les données restent normalisées (un user = un endroit unique). La jointure les **assemble** au moment de la requête.

---

## 3. `INNER JOIN`

### Théorie

`INNER JOIN` ne renvoie que les lignes **qui matchent dans les deux tables**. Une ligne sans correspondance dans l'autre table est exclue.

**Analogie.** L'intersection de deux ensembles. Seuls les éléments présents dans les deux passent.

### Syntaxe

```sql
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;
```

`INNER` est optionnel — `JOIN` seul est équivalent. Mais `INNER` rend l'intention explicite.

### Résultat

```
name  | total
------|-------
Alice | 120.00
Alice |  45.00
Bob   |  85.50
Carol | 200.00
```

- **Dave** (US, sans commande) n'apparaît pas.
- La commande **orphan** (`user_id IS NULL`) n'apparaît pas non plus.

### Convention — alias courts

```sql
SELECT u.name, o.total
FROM users u
JOIN orders o ON o.user_id = u.id;
```

`u` et `o` sont des **alias** qui rendent la requête lisible. Toujours utiliser des alias dès qu'on a plus d'une table.

### Préciser la clause d'égalité

```sql
JOIN orders o ON o.user_id = u.id
```

C'est la **clé de jointure**. Elle peut être plus complexe :

```sql
JOIN orders o
  ON o.user_id = u.id
  AND o.country = u.country     -- multi-colonnes
```

---

## 4. `LEFT JOIN` / `RIGHT JOIN`

### `LEFT JOIN`

Renvoie **toutes les lignes de la table de gauche**, plus celles qui matchent à droite. Les colonnes de droite valent `NULL` si pas de match.

```sql
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id;
```

Résultat :

```
name  | total
------|-------
Alice | 120.00
Alice |  45.00
Bob   |  85.50
Carol | 200.00
Dave  | NULL       ← Dave conservé, pas de commande
```

### Cas d'usage

- **Lister tous les users**, même sans commande.
- **Compter les commandes par user**, en affichant 0 pour ceux sans commande.

```sql
SELECT u.name, COUNT(o.id) AS nb_orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;

-- Alice | 2
-- Bob   | 1
-- Carol | 1
-- Dave  | 0       ← grâce au LEFT JOIN
```

Note : `COUNT(o.id)` compte les non-NULL, donc 0 pour Dave. `COUNT(*)` aurait compté 1 (la ligne avec `o.id IS NULL`) — erreur classique.

### `RIGHT JOIN`

Symétrique de `LEFT JOIN` : conserve toutes les lignes de droite.

```sql
SELECT u.name, o.total
FROM users u
RIGHT JOIN orders o ON o.user_id = u.id;
```

```
name  | total
------|-------
Alice | 120.00
Alice |  45.00
Bob   |  85.50
Carol | 200.00
NULL  |  50.00      ← commande orphan (user_id IS NULL)
```

En pratique, `RIGHT JOIN` est **rarement utilisé** — on préfère inverser l'ordre des tables et utiliser `LEFT JOIN`. C'est plus lisible.

---

## 5. `FULL OUTER JOIN`

### Théorie

`FULL OUTER JOIN` conserve **toutes les lignes des deux tables**. Les colonnes valent `NULL` du côté où il n'y a pas de match.

```sql
SELECT u.name, o.total
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id;
```

Résultat :

```
name  | total
------|-------
Alice | 120.00
Alice |  45.00
Bob   |  85.50
Carol | 200.00
Dave  | NULL       ← Dave sans commande
NULL  |  50.00     ← commande orphan
```

### Cas d'usage typique

Audit de cohérence : qui n'a pas de commande ? Quelle commande n'a pas de user valide ?

```sql
SELECT u.name, o.id AS order_id, o.total
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id
WHERE u.id IS NULL OR o.id IS NULL;

-- Affiche uniquement les "orphelins" des deux côtés
```

### Support SGBD

- **PostgreSQL, SQL Server, Oracle** : `FULL OUTER JOIN` natif.
- **MySQL** : pas de `FULL OUTER JOIN` natif. À simuler par `UNION` de `LEFT JOIN` et `RIGHT JOIN`.
- **SQLite** : `FULL OUTER JOIN` ajouté en 3.39 (2022).

---

## 6. `CROSS JOIN` et self-join

### `CROSS JOIN` — produit cartésien

Combine **toutes les lignes de gauche avec toutes les lignes de droite**. Pas de clause `ON`.

```sql
SELECT u.name, c.code
FROM users u
CROSS JOIN currencies c;
```

Si `users` a 4 lignes et `currencies` 3, on obtient **12 lignes** (4 × 3).

### Cas d'usage légitime

Rare. Surtout pour générer des combinaisons :

- Matrice de prix par produit × région.
- Génération de séries (dates × users).
- Initialisation de relations multi-à-multi.

### Anti-pattern — CROSS JOIN par accident

```sql
-- ✗ Erreur : on a oublié la clause ON
SELECT u.name, o.total
FROM users u, orders o;
-- Résultat : 4 users × 5 orders = 20 lignes
```

L'ancienne syntaxe `FROM a, b` sans `JOIN ... ON` est légale mais produit un **produit cartésien**. C'est l'erreur classique sur les très grandes tables : la requête tourne pendant des heures et renvoie des millions de lignes.

**Toujours utiliser `JOIN ... ON`** — explicite, et le SGBD signalera l'absence de clause de jointure.

### Self-join — table jointe à elle-même

Joindre une table à elle-même, avec des alias différents.

```sql
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    manager_id INTEGER REFERENCES employees(id)
);
```

Lister chaque employé avec le nom de son manager :

```sql
SELECT
    e.name AS employee,
    m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

Cas d'usage : hiérarchies (employés / managers), relations (utilisateur / utilisateur referrer), versions (current / previous).

---

## 7. `UNION`, `INTERSECT`, `EXCEPT`

### `UNION` — concaténation de résultats

Combine les résultats de deux `SELECT` ayant la **même structure** (mêmes colonnes, types compatibles).

```sql
SELECT name FROM users WHERE country = 'FR'
UNION
SELECT name FROM users WHERE country = 'DE';
```

`UNION` **élimine les doublons**. `UNION ALL` les **conserve** (et est beaucoup plus rapide — pas de tri pour dédupliquer).

```sql
SELECT name FROM customers
UNION ALL
SELECT name FROM suppliers;
-- Tous les noms apparaissent, doublons possibles
```

### Cas d'usage

- Fusionner deux sources de données (clients + fournisseurs comme "contacts").
- Combiner des sous-totaux et des totaux dans un même résultat.

### `INTERSECT` — intersection

Lignes présentes dans **les deux** résultats.

```sql
SELECT email FROM customers
INTERSECT
SELECT email FROM newsletter_subscribers;
-- Emails qui sont clients ET abonnés
```

### `EXCEPT` — différence

Lignes présentes dans le premier résultat **et pas dans le second**.

```sql
SELECT email FROM customers
EXCEPT
SELECT email FROM newsletter_subscribers;
-- Clients pas encore abonnés à la newsletter
```

MySQL utilise `MINUS` (Oracle) ou n'a pas l'opérateur — à simuler avec un `LEFT JOIN ... WHERE IS NULL`.

### Règles communes

- **Mêmes colonnes** : même nombre, mêmes types compatibles.
- **Noms** : seuls les noms du premier `SELECT` apparaissent dans le résultat.
- **ORDER BY** : à la fin, une seule fois pour l'ensemble.

```sql
SELECT name, country FROM customers
UNION
SELECT name, country FROM suppliers
ORDER BY name;
```

---

## 8. Pièges classiques

### Piège 1 — Doublons par jointure 1-N

```sql
-- users (id, name)
-- orders (id, user_id)  ← un user peut avoir N orders

SELECT u.name, COUNT(o.id) AS nb
FROM users u
JOIN orders o ON o.user_id = u.id
GROUP BY u.id;          -- ✓ groupe par user

SELECT u.name, o.total  -- ✗ chaque user apparaît N fois
FROM users u
JOIN orders o ON o.user_id = u.id;
```

Une jointure 1-N **multiplie** les lignes. Si on n'agrège pas, les "doublons" sont attendus mais surprenants pour les débutants.

### Piège 2 — SUM mal placé après LEFT JOIN

```sql
SELECT u.name, SUM(o.total) AS revenue
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;

-- Dave (sans commande) : revenue = NULL
-- Pour avoir 0 : COALESCE(SUM(o.total), 0)
```

### Piège 3 — Jointure sur colonne avec NULL

```sql
SELECT u.name, o.total
FROM users u
JOIN orders o ON o.user_id = u.id;
-- La commande avec user_id IS NULL ne ressort PAS
-- (NULL = NULL est faux, cf. M2 sur NULL)
```

Pour inclure les NULL des deux côtés : `FULL OUTER JOIN`. Pour traiter `NULL = NULL` comme vrai : utiliser `IS NOT DISTINCT FROM` (PostgreSQL).

### Piège 4 — Filtre sur la table droite après LEFT JOIN

```sql
-- ✗ Convertit le LEFT JOIN en INNER JOIN silencieusement
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.status = 'paid';
-- Dave (sans commande) disparaît : sa ligne a status = NULL,
-- qui n'est pas 'paid', donc filtrée.

-- ✓ Mettre le filtre dans la clause JOIN
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid';
-- Dave reste, avec total = NULL
```

Le filtre dans le `WHERE` après un `LEFT JOIN` exclut les NULL — annulant l'effet du LEFT. Mettre le filtre dans le `ON`.

### Piège 5 — UNION sans ALL

```sql
SELECT name FROM customers
UNION                    -- ✗ trie + déduplique, coûteux
SELECT name FROM suppliers;

SELECT name FROM customers
UNION ALL                -- ✓ beaucoup plus rapide si doublons OK
SELECT name FROM suppliers;
```

Toujours préférer `UNION ALL` sauf si la déduplication est explicitement souhaitée.

---

## 9. Exercices pratiques

### Exercice 1 — INNER JOIN basique (≈ 20 min)

1. Lister tous les couples (user, commande) — INNER JOIN.
2. Combien de commandes ont un user matché ?
3. Combien de users ont au moins une commande ?

### Exercice 2 — LEFT JOIN (≈ 25 min)

1. Lister tous les users avec leur nombre de commandes (`0` pour ceux sans).
2. Lister les users **sans aucune commande**.
3. Calculer le revenu par user, avec `0` pour ceux sans commande.

### Exercice 3 — Pièges de LEFT JOIN (≈ 25 min)

Soit la requête :

```sql
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.status = 'paid';
```

1. Prédire le résultat. Dave apparaît-il ?
2. Corriger pour que Dave apparaisse (avec `NULL` pour son total).

### Exercice 4 — FULL OUTER JOIN audit (≈ 25 min)

1. Lister tous les users **sans commande** et toutes les commandes **sans user valide** en une seule requête.
2. Compter combien d'anomalies de chaque type.

### Exercice 5 — Self-join (≈ 25 min)

Créer une table `employees(id, name, manager_id)` avec 5 employés et 2 managers.

1. Lister chaque employé avec le nom de son manager.
2. Lister les employés **sans manager** (top-level).
3. Compter combien d'employés chaque manager supervise.

### Exercice 6 — UNION (≈ 20 min)

Créer une table `suppliers(id, name)`. Insérer 3 suppliers.

1. Lister tous les noms de `users` + `suppliers` en un seul résultat (avec source).
2. Identifier les noms qui apparaissent dans **les deux** (`INTERSECT`).
3. Identifier les `users` qui ne sont pas `suppliers` (`EXCEPT`).

---

## 10. Mini-défi de synthèse — requêtes multi-tables (≈ 1,5 heure)

Sur la base Chinook (musique, cf. M1) ou Northwind :

### Questions à répondre

1. **Top 10 albums** par revenu total (vente de tracks).
2. **Clients qui n'ont jamais acheté** un genre rock.
3. **Artistes** sans aucun album dans la base.
4. **Tracks** présents dans plusieurs genres (anomalie de données ? ou normal ?).
5. Pour chaque **employé**, combien de **clients** lui sont assignés et leur revenu total.
6. Liste des **playlists** avec le **nombre de tracks** et la **durée totale**.

### Contraintes

- **Au moins une `LEFT JOIN`** pour préserver les non-matchs.
- **Au moins un `INNER JOIN` multi-tables** (au moins 3 tables jointes).
- **Au moins un `UNION` ou `EXCEPT`**.
- **Aucun produit cartésien accidentel** — vérifier que les counts sont cohérents.
- Chaque requête est **commentée** : but, jointures, complexité estimée.

---

## 11. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant écrit un `INNER JOIN` et un `LEFT JOIN` de tête.
- [ ] Il distingue `LEFT`, `RIGHT`, `FULL OUTER`, `INNER`, `CROSS`.
- [ ] Il connaît le piège du filtre sur la table droite d'un `LEFT JOIN`.
- [ ] Il écrit un self-join avec deux alias.
- [ ] Il distingue `UNION` et `UNION ALL` côté performance.
- [ ] Il utilise `INTERSECT` / `EXCEPT` pour des opérations ensemblistes.
- [ ] Le mini-défi multi-tables est rendu avec 6 requêtes commentées.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : jointures, fonctions d'ensemble.
- **N2** : différence entre `INNER JOIN` et `LEFT`/`RIGHT JOIN`.
- (Préfiguration N3 : différence entre tous les types de jointures — couvert ici.)

---

## 12. Ressources complémentaires

- **Documentation PostgreSQL** — _Joins_ : [postgresql.org/docs/current/tutorial-join.html](https://www.postgresql.org/docs/current/tutorial-join.html).
- **PostgreSQL Tutorial** — _PostgreSQL JOINs_ : [postgresqltutorial.com/postgresql-tutorial/postgresql-joins](https://www.postgresqltutorial.com/postgresql-tutorial/postgresql-joins/).
- **SQL Joins Explained** (Visual) : [sql-joins.leopard.in.ua](https://sql-joins.leopard.in.ua/). Diagrammes de Venn pour chaque jointure — excellent pour la compréhension visuelle.
- **Mode SQL Tutorial** — _Joins_ : [mode.com/sql-tutorial/sql-joins](https://mode.com/sql-tutorial/sql-joins/).
- **SQLZoo** — _Self join_ : [sqlzoo.net/wiki/Self_join](https://sqlzoo.net/wiki/Self_join). Bons exercices.
- **PostgreSQL Exercises** — section _Joins_ : [pgexercises.com/questions/joins](https://pgexercises.com/questions/joins/).
