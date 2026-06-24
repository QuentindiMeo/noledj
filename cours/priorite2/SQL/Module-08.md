# M8 — Vues

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Expliquer ce qu'est une **vue** SQL et dans quels cas l'utiliser.
- Créer, modifier et supprimer une vue avec **`CREATE VIEW`**, **`CREATE OR REPLACE VIEW`**, **`DROP VIEW`**.
- Distinguer **vue classique** et **vue matérialisée**.
- Comprendre les **conditions de mise à jour** au travers d'une vue.
- Utiliser les vues comme outil de **simplification** et de **contrôle d'accès**.

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M7 SQL terminés.

---

## 1. Pourquoi une vue ?

### Le problème

Soit une requête métier complexe qu'on tape **plusieurs fois par semaine** :

```sql
SELECT
    u.name,
    u.email,
    COUNT(o.id) AS nb_orders,
    SUM(o.total) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
WHERE u.is_active = true
GROUP BY u.id, u.name, u.email
HAVING SUM(o.total) > 100;
```

Trois inconvénients à la dupliquer partout :

1. **Maintenance** — si la logique change (par exemple `is_active` devient `not deleted`), il faut modifier N endroits.
2. **Bugs** — chaque copie peut diverger sans qu'on s'en aperçoive.
3. **Lisibilité** — `SELECT * FROM weird_join_with_filters` devient illisible.

### La solution

Une **vue** est une **requête nommée**, stockée dans la base, qu'on peut interroger comme une table :

```sql
CREATE VIEW active_premium_customers AS
SELECT
    u.id, u.name, u.email,
    COUNT(o.id) AS nb_orders,
    SUM(o.total) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
WHERE u.is_active = true
GROUP BY u.id, u.name, u.email
HAVING SUM(o.total) > 100;
```

Maintenant :

```sql
SELECT * FROM active_premium_customers ORDER BY total_spent DESC LIMIT 10;
```

**Analogie.** Une fenêtre prédécoupée sur la base. Au lieu d'expliquer à chaque fois "regarde ici, filtre ça, joins avec là", on installe une fenêtre fixe qui montre exactement la bonne vue. Tout le monde regarde par le même cadre.

### Bénéfices

- **Réutilisation** d'une logique complexe.
- **Encapsulation** — le consommateur ne voit que la vue, pas la complexité dessous.
- **Cohérence** — un seul endroit où changer la définition.
- **Sécurité** — exposer une vue restreinte plutôt que la table brute (cf. section 7).

### Coût

- **Performance** — chaque `SELECT` sur une vue ré-exécute la requête sous-jacente. Pas de cache (sauf vue matérialisée).
- **Complexité opérationnelle** — une vue qui dépend de plusieurs tables se casse si l'une est modifiée sans précaution.

---

## 2. `CREATE VIEW` — créer une vue

### Syntaxe

```sql
CREATE VIEW <view_name> AS
SELECT ...
FROM ...
WHERE ...;
```

### Exemple simple

```sql
CREATE VIEW active_users AS
SELECT id, name, email
FROM users
WHERE is_active = true;
```

À l'usage :

```sql
SELECT * FROM active_users;
SELECT name FROM active_users WHERE email LIKE '%@example.com';
```

La vue **agit comme une table virtuelle**.

### Renommer les colonnes

```sql
CREATE VIEW user_summary (uid, full_name, contact) AS
SELECT id, name, email FROM users;
```

Les colonnes de la vue peuvent être renommées au moment de la déclaration. Utile pour exposer une API stable même si les colonnes sous-jacentes évoluent.

### Vue basée sur d'autres vues

Les vues peuvent **s'imbriquer** :

```sql
CREATE VIEW high_value_orders AS
SELECT * FROM orders WHERE total > 100;

CREATE VIEW high_value_customers AS
SELECT u.* FROM users u
JOIN high_value_orders o ON o.user_id = u.id;
```

À utiliser modérément — au-delà de 2 ou 3 niveaux, l'optimiseur peut peiner et le debugging devient laborieux.

---

## 3. La vue peut-elle être mise à jour ?

### Théorie

Selon la requête sous-jacente, une vue est **updatable** (on peut faire `INSERT`/`UPDATE`/`DELETE` dessus) ou non.

Conditions générales (PostgreSQL) pour qu'une vue soit updatable :

- Basée sur **une seule table**.
- Pas de `GROUP BY`, `HAVING`, `DISTINCT`, `UNION`, `INTERSECT`, fonctions d'agrégation.
- Pas de sous-requête dans le `SELECT`.
- Pas de `JOIN` (en général).

Pour les vues plus complexes, on utilise des **`INSTEAD OF` triggers** (avancé, M12+).

### Exemple — vue updatable

```sql
CREATE VIEW recent_users AS
SELECT id, name, email
FROM users
WHERE created_at > NOW() - INTERVAL '7 days';

UPDATE recent_users SET email = 'new@x.y' WHERE id = 1;
-- Met à jour la ligne sous-jacente dans users
```

### `WITH CHECK OPTION`

Empêche d'insérer / mettre à jour des lignes qui **ne respectent pas** la clause `WHERE` de la vue :

```sql
CREATE VIEW active_users AS
SELECT * FROM users WHERE is_active = true
WITH CHECK OPTION;

INSERT INTO active_users (name, email, is_active) VALUES ('X', 'x@y.z', false);
-- ✗ Refus : la ligne n'apparaîtrait pas dans la vue
```

Utile pour les vues utilisées comme **filtres de sécurité**.

---

## 4. Vues matérialisées — `MATERIALIZED VIEW`

### Théorie

Une **vue matérialisée** stocke physiquement le résultat de la requête sur disque. Elle est rapide à lire (comme une table) mais doit être **rafraîchie** explicitement pour refléter les changements des tables sous-jacentes.

**Analogie.** La vue classique est une **vitre** : on regarde à travers, la vue change quand la rue change. La vue matérialisée est une **photo** : on capture l'instant, et la photo ne change pas tant qu'on n'en prend pas une nouvelle.

### Syntaxe (PostgreSQL)

```sql
CREATE MATERIALIZED VIEW monthly_revenue AS
SELECT
    DATE_TRUNC('month', created_at) AS month,
    SUM(total) AS revenue
FROM orders
WHERE status = 'paid'
GROUP BY DATE_TRUNC('month', created_at);

-- Lecture rapide (déjà calculée)
SELECT * FROM monthly_revenue;

-- Rafraîchir
REFRESH MATERIALIZED VIEW monthly_revenue;
```

### Cas d'usage

- **Rapports analytiques** lourds à calculer.
- **Dashboards** qui acceptent une donnée légèrement périmée.
- **Précompute** pour soulager la base OLTP.

### Concurrent refresh

```sql
CREATE MATERIALIZED VIEW ... WITH NO DATA;
REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue;
```

`CONCURRENTLY` permet de rafraîchir sans verrouiller les lectures (nécessite un index unique sur la vue).

### Limitations

- Pas de vue matérialisée **en MySQL** (jusqu'en 2024). À simuler avec des tables + jobs périodiques.
- Espace disque additionnel.
- Données non temps réel — à gérer côté UX.

---

## 5. Supprimer ou remplacer une vue

### `DROP VIEW`

```sql
DROP VIEW active_users;
DROP VIEW IF EXISTS active_users CASCADE;
```

`CASCADE` supprime aussi les vues qui en dépendent. **À utiliser prudemment**.

### `CREATE OR REPLACE VIEW`

```sql
CREATE OR REPLACE VIEW active_users AS
SELECT id, name, email, role
FROM users WHERE is_active = true;
```

Met à jour la définition **sans dropper**. Pratique pour les migrations.

**Limitation** : on ne peut pas changer la liste ni l'ordre des colonnes existantes. Pour cela, il faut `DROP` + `CREATE`.

---

## 6. Sécurité via les vues

### Le pattern

Donner aux utilisateurs accès à une **vue** plutôt qu'à la **table** :

```sql
-- Table avec colonnes sensibles
CREATE TABLE users (
    id, email, password_hash, ssn, created_at, ...
);

-- Vue qui expose seulement le strict nécessaire
CREATE VIEW public_users AS
SELECT id, email, created_at FROM users;

-- Permissions
GRANT SELECT ON public_users TO reporting_user;
REVOKE ALL ON users FROM reporting_user;
```

Le `reporting_user` peut faire ses rapports sans jamais voir les mots de passe ni les SSN.

### Cas typique — multi-tenant

```sql
CREATE VIEW my_orders AS
SELECT * FROM orders WHERE user_id = current_user_id();
```

Chaque utilisateur ne voit que **ses** commandes. Combiné avec des permissions, c'est un mécanisme robuste de **row-level security** (option PostgreSQL native disponible aussi, plus avancée).

### Avantage

- **Pas de réécriture côté app** — c'est la base qui filtre.
- **Cohérence** — impossible d'oublier le filtre dans une requête.

---

## 7. Exercices pratiques

### Exercice 1 — Vue simple (≈ 15 min)

1. Créer une table `products(id, name, price, in_stock)`.
2. Créer une vue `available_products` qui sélectionne les produits avec `in_stock = true` et `price < 100`.
3. Insérer 5 produits dont 2 en rupture.
4. `SELECT * FROM available_products`. Vérifier le résultat.

### Exercice 2 — Vue avec agrégation (≈ 25 min)

Sur la base orders/users (M2-M7) :

Créer une vue `customer_lifetime_value` :

- Une ligne par user.
- Colonnes : `user_id`, `name`, `nb_orders`, `total_spent`, `last_order_date`.
- Inclure les commandes **paid uniquement**.
- Trier par `total_spent` décroissant.

Tester `SELECT * FROM customer_lifetime_value WHERE total_spent > 200;`.

### Exercice 3 — Vue updatable (≈ 25 min)

1. Créer une vue `active_users` : `SELECT * FROM users WHERE is_active = true`.
2. Faire `UPDATE active_users SET name = 'X' WHERE id = 1;` → vérifier que la ligne sous-jacente est modifiée.
3. Ajouter `WITH CHECK OPTION` à la définition.
4. Tenter `INSERT INTO active_users (..., is_active) VALUES (..., false);` → vérifier le refus.

### Exercice 4 — Vue matérialisée (≈ 30 min, PostgreSQL)

1. Créer une vue matérialisée `monthly_orders_summary` qui agrège par mois.
2. Mesurer le temps de réponse de `SELECT *`.
3. Comparer avec la même requête **sans** vue matérialisée (en tapant la requête directe).
4. Insérer 1000 nouvelles commandes.
5. Constater que la vue matérialisée n'a pas changé.
6. `REFRESH MATERIALIZED VIEW`.
7. Vérifier que les nouvelles données apparaissent.

### Exercice 5 — Sécurité (≈ 20 min)

1. Créer un user PostgreSQL `reporter` avec un mot de passe.
2. Lui donner `SELECT` sur la vue `customer_lifetime_value` (exercice 2).
3. Lui **interdire** `SELECT` sur la table `users` directement.
4. Se connecter en tant que `reporter` et vérifier qu'on peut lire la vue mais pas la table.

---

## 8. Mini-défi de synthèse — vue pour une requête récurrente (≈ 1 heure)

Identifier (sur un projet existant ou la base Chinook/Northwind) **une requête récurrente** longue et la transformer en vue.

### Étapes

1. **Identifier** la requête (10 à 30 lignes idéalement) qu'on tape souvent.
2. **Créer la vue** `CREATE VIEW ... AS ...`.
3. **Refactor** au moins 3 endroits (scripts, dashboards, rapports) pour utiliser la vue au lieu de réécrire la requête.
4. **Mesurer** les temps :
   - Avant : 3 exécutions de la requête directe.
   - Après : 3 exécutions via la vue.
   - Sont-ils comparables ? Si la vue est lente, considérer une `MATERIALIZED VIEW`.
5. **Documenter** la vue par un `COMMENT ON VIEW` :

```sql
COMMENT ON VIEW customer_lifetime_value IS
'Agrégation des commandes payées par utilisateur. Mise à jour : temps réel.';
```

### Critères de validation

- [ ] La vue est créée et fonctionnelle.
- [ ] Au moins 3 usages refactorisés.
- [ ] Si la vue est lente, une variante `MATERIALIZED VIEW` est testée et comparée.
- [ ] La vue a un commentaire explicatif.
- [ ] Bonus : exposer la vue uniquement à un user `reporting` (security via permissions).

---

## 9. Auto-évaluation

Le module M8 est validé lorsque :

- [ ] L'apprenant explique le but d'une vue avec une analogie.
- [ ] Il crée une vue simple et une vue à agrégation.
- [ ] Il distingue vue classique et vue matérialisée.
- [ ] Il comprend les conditions de mise à jour à travers une vue.
- [ ] Il utilise `WITH CHECK OPTION` pour les vues de filtrage.
- [ ] Il utilise les vues comme couche de sécurité (permissions).
- [ ] Le mini-défi est implémenté avec une vue documentée.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : vues — création, intérêt, utilisation.

---

## 10. Ressources complémentaires

- **Documentation PostgreSQL** — _Views_ : [postgresql.org/docs/current/sql-createview.html](https://www.postgresql.org/docs/current/sql-createview.html).
- **Documentation PostgreSQL** — _Materialized Views_ : [postgresql.org/docs/current/rules-materializedviews.html](https://www.postgresql.org/docs/current/rules-materializedviews.html).
- **PostgreSQL Tutorial** — _Views_ : [postgresqltutorial.com/postgresql-views](https://www.postgresqltutorial.com/postgresql-views/).
- **PostgreSQL Tutorial** — _Materialized Views_ : [postgresqltutorial.com/postgresql-views/postgresql-materialized-views](https://www.postgresqltutorial.com/postgresql-views/postgresql-materialized-views/).
- **Mode SQL Tutorial** — _SQL Views_ : [mode.com/sql-tutorial](https://mode.com/sql-tutorial/).
- **Row-Level Security** (PostgreSQL) : [postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Pour le multi-tenant avancé.
