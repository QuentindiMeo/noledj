# M11 — Sécurité

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Comprendre **l'anatomie d'une injection SQL** et reconnaître les **trois patterns classiques** (login bypass, exfiltration, destruction).
- Utiliser des **requêtes paramétrées** dans les principaux langages (Python, JavaScript, Java).
- Refactorer une requête vulnérable en requête sécurisée.
- Appliquer le **principe du moindre privilège** sur les rôles SQL.
- Identifier les autres vecteurs (sous-requêtes dynamiques, ORDER BY dynamique, table dynamique).

## Durée estimée

0,5 jour.

## Pré-requis

- M1 à M10 SQL terminés.

---

## 1. Anatomie d'une injection SQL

### Le principe

Une **injection SQL** survient quand des **données utilisateur** sont **concaténées** directement dans une requête, permettant à l'attaquant d'**injecter du SQL**.

```python
# ✗ Vulnérable
email = request.args["email"]
query = f"SELECT * FROM users WHERE email = '{email}'"
cursor.execute(query)
```

Si l'attaquant envoie `email = "' OR '1'='1"`, la requête devient :

```sql
SELECT * FROM users WHERE email = '' OR '1'='1'
```

`'1'='1'` est toujours vrai → la requête retourne **tous les users**. Bypass d'authentification.

**Analogie.** Un colis dans lequel on cache un explosif. Si la frontière (la base) accepte le colis sans inspection, l'explosif fait des dégâts. Le **paramétrage** est la machine de tri qui scanne tout et empêche les explosifs.

### Pourquoi c'est l'attaque #1

- Listée comme **n°1 OWASP** en 2017, encore dans le top 3 en 2024 (catégorie _Injection_).
- **Trivial à exploiter** quand le code est vulnérable.
- **Catastrophique** : exfiltration complète, modification, destruction.
- **Fréquente** : nombreuses bases legacy non-protégées.

---

## 2. Trois patterns d'attaque canoniques

### Pattern 1 — Login bypass

```python
sql = f"SELECT * FROM users WHERE email = '{email}' AND password = '{pwd}'"
```

Payload : `email = "admin@x.y'--"` (le `--` commente le reste).

Résultat :

```sql
SELECT * FROM users WHERE email = 'admin@x.y'--' AND password = 'xxx'
```

Le `AND password = ...` est commenté. L'attaquant s'authentifie comme admin sans mot de passe.

### Pattern 2 — Exfiltration via `UNION`

```python
sql = f"SELECT name, email FROM users WHERE id = {user_id}"
```

Payload : `user_id = "0 UNION SELECT username, password_hash FROM admin_users"`.

```sql
SELECT name, email FROM users WHERE id = 0
UNION
SELECT username, password_hash FROM admin_users
```

L'attaquant récupère les hashes admin. Avec un bon dictionnaire et bcrypt, c'est du temps mais pas un mur.

### Pattern 3 — Destruction

```python
sql = f"SELECT * FROM products WHERE name LIKE '%{search}%'"
```

Payload : `search = "x'; DROP TABLE users; --"`.

```sql
SELECT * FROM products WHERE name LIKE '%x'; DROP TABLE users; --%'
```

Selon le SGBD et le driver, **deux requêtes** sont exécutées. La table `users` disparaît.

Note : certains drivers (psycopg2 avec `cursor.execute`) **interdisent** plusieurs statements en un appel — une protection partielle. Mais d'autres drivers ne le font pas. Ne jamais s'appuyer là-dessus.

### Pattern bonus — Blind SQL injection

L'attaquant n'a pas accès au retour direct, mais déduit via le **comportement** :

```python
sql = f"SELECT * FROM users WHERE id = {user_id}"
```

Payload : `user_id = "1 AND (SELECT COUNT(*) FROM users WHERE role='admin' AND username LIKE 'a%') > 0"`.

Si la requête est lente / rapide / retourne 200/404, l'attaquant déduit l'information bit par bit. **Long mais possible** en automatisé (`sqlmap`).

---

## 3. Le remède — requêtes paramétrées

### Théorie

Une **requête paramétrée** sépare le **code SQL** des **données**. Le driver envoie d'abord la **structure** de la requête au SGBD, puis les **valeurs**. Le SGBD traite les valeurs comme **pures données**, **jamais comme du SQL**.

```python
# ✓ Paramétrée
sql = "SELECT * FROM users WHERE email = %s"
cursor.execute(sql, (email,))
```

Même si `email = "' OR '1'='1"`, la requête envoyée au moteur est :

```
SELECT * FROM users WHERE email = $1
$1 = "' OR '1'='1"
```

La chaîne est traitée comme **valeur**, pas comme code. Aucune injection possible.

### Trois propriétés clés

- **Sécurité** — la valeur ne peut jamais devenir du SQL.
- **Performance** — le SGBD peut cacher le plan de requête (prepared statement).
- **Lisibilité** — séparation propre code / données.

### Compatibilité

**Tous** les drivers modernes supportent les paramètres. Le format diffère selon le SGBD/driver :

| Driver                        | Placeholder   | Exemple                                      |
| ----------------------------- | ------------- | -------------------------------------------- |
| psycopg2 (Python, PostgreSQL) | `%s`          | `cursor.execute("... WHERE id = %s", (42,))` |
| psycopg3 (Python, PostgreSQL) | `%s` ou `$1`  | idem                                         |
| asyncpg (Python async)        | `$1, $2, ...` | `await conn.fetch("... WHERE id = $1", 42)`  |
| mysql-connector (Python)      | `%s`          | `cursor.execute("...", (val,))`              |
| sqlite3 (Python stdlib)       | `?`           | `cursor.execute("... WHERE id = ?", (42,))`  |
| node-postgres (Node)          | `$1, $2, ...` | `client.query('... WHERE id = $1', [42])`    |
| JDBC (Java)                   | `?`           | `stmt.setInt(1, 42)`                         |

Toujours **vérifier la doc du driver** — ne pas inventer.

---

## 4. Exemples dans plusieurs langages

### Python — psycopg

```python
import psycopg

with psycopg.connect(...) as conn:
    with conn.cursor() as cur:
        # ✓ Paramétré
        cur.execute(
            "SELECT * FROM users WHERE email = %s AND is_active = %s",
            (email, True)
        )
        users = cur.fetchall()
```

### Python — SQLAlchemy Core

```python
from sqlalchemy import text

# ✓ Paramètres nommés
result = conn.execute(
    text("SELECT * FROM users WHERE email = :email"),
    {"email": email}
)
```

### Python — SQLAlchemy ORM

```python
# ✓ ORM, sécurité native
users = session.query(User).filter(User.email == email).all()
```

L'ORM construit les requêtes paramétrées **automatiquement**. C'est sa principale valeur sécuritaire.

### Node.js — pg

```js
const result = await client.query(
  "SELECT * FROM users WHERE email = $1 AND is_active = $2",
  [email, true],
);
```

### Java — JDBC

```java
String sql = "SELECT * FROM users WHERE email = ? AND is_active = ?";
PreparedStatement stmt = conn.prepareStatement(sql);
stmt.setString(1, email);
stmt.setBoolean(2, true);
ResultSet rs = stmt.executeQuery();
```

### Anti-pattern universel

```python
# ✗ NE JAMAIS faire ça
sql = "SELECT * FROM users WHERE email = '" + email + "'"
sql = f"SELECT * FROM users WHERE email = '{email}'"
sql = "SELECT * FROM users WHERE email = '%s'" % email
```

Même si on "valide" `email` avant (`re.match`, length check, etc.), c'est **insuffisant**. Toujours paramétrer.

---

## 5. Cas non triviaux

### `ORDER BY` dynamique

Les placeholders **ne peuvent pas** être utilisés pour des noms de colonnes / mots-clés. Ils servent **uniquement** pour les valeurs.

```python
# ✗ Faux ami
cur.execute("SELECT * FROM users ORDER BY %s", (sort_column,))   # erreur ou ne marche pas
```

Solution : **whitelist** côté code.

```python
ALLOWED_SORT = {"name", "email", "created_at"}

if sort_column not in ALLOWED_SORT:
    raise ValueError("Invalid sort column")

sql = f"SELECT * FROM users ORDER BY {sort_column}"
cur.execute(sql)
```

L'interpolation est **sûre** parce que `sort_column` est validé contre une liste fixe.

### Nom de table dynamique

Même problème, même solution : whitelist + interpolation.

```python
ALLOWED_TABLES = {"users", "orders", "products"}

if table_name not in ALLOWED_TABLES:
    raise ValueError("Invalid table")

cur.execute(f"SELECT COUNT(*) FROM {table_name}")
```

### `LIKE` avec wildcards

```python
search = request.args["q"]
sql = "SELECT * FROM users WHERE name LIKE %s"
cur.execute(sql, (f"%{search}%",))
```

L'utilisateur peut envoyer des `%` qui élargiront le résultat — c'est un **bug fonctionnel** (peut-être souhaité), pas une faille de sécurité. Pour échapper :

```python
escaped = search.replace("%", "\\%").replace("_", "\\_")
cur.execute("SELECT * FROM users WHERE name LIKE %s ESCAPE '\\'", (f"%{escaped}%",))
```

### Liste dynamique (`IN`)

```python
ids = [1, 2, 3, 5]
placeholders = ",".join(["%s"] * len(ids))
sql = f"SELECT * FROM users WHERE id IN ({placeholders})"
cur.execute(sql, ids)
```

Construction du **nombre** de placeholders dynamiquement, mais les valeurs restent paramétrées.

---

## 6. Autres bonnes pratiques

### Principe du moindre privilège

L'application **ne doit pas** se connecter en tant que `postgres` (superuser). Créer un user dédié avec uniquement les droits nécessaires :

```sql
CREATE USER app_user WITH PASSWORD 'strong_secret';

GRANT CONNECT ON DATABASE mydb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Pour les futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

Si une injection SQL passe, l'attaquant ne peut pas `DROP DATABASE` ni `CREATE EXTENSION` — la table de log ne suffit pas pour lui.

### Read-only pour les rapports

```sql
CREATE USER reporter WITH PASSWORD '...';
GRANT CONNECT ON DATABASE mydb TO reporter;
GRANT USAGE ON SCHEMA public TO reporter;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporter;
```

Outils analytiques (BI, dashboards) tournent avec ce user. Aucun risque d'UPDATE/DELETE accidentel.

### Vues + permissions (rappel M8)

Exposer une **vue** avec uniquement les colonnes non sensibles. Donner `SELECT` sur la vue, pas sur la table.

### Row-Level Security (PostgreSQL avancé)

Filtre automatique au niveau de la base selon l'utilisateur connecté :

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY my_orders ON orders
    FOR SELECT USING (user_id = current_setting('app.current_user')::int);
```

Chaque requête `SELECT * FROM orders` ne renvoie que **les commandes de l'user courant**. Impossible d'oublier le filtre côté app.

### Logging et audit

- Log des accès — qui a fait quoi quand.
- Pas de log des **valeurs sensibles** (passwords, tokens).
- Audit des privilèges régulièrement (`pg_audit`, équivalents).

---

## 7. ORMs et sécurité

### Les ORMs protègent par défaut

Django, SQLAlchemy, Hibernate, etc. génèrent des requêtes paramétrées **sans effort**. La sécurité est gratuite tant qu'on utilise l'API normale.

```python
# Django ORM — automatiquement paramétré
User.objects.filter(email=email)

# SQLAlchemy ORM
session.query(User).filter(User.email == email)
```

### Les pièges restent

**`raw()` / `text()` / `extra()`** — les ORMs offrent des échappatoires pour du SQL brut. Mêmes règles que sans ORM.

```python
# Django ✗
User.objects.raw(f"SELECT * FROM users WHERE email = '{email}'")

# Django ✓
User.objects.raw("SELECT * FROM users WHERE email = %s", [email])
```

**Filter dynamique sur nom de champ** :

```python
# ✗
filter_field = request.args["field"]
User.objects.filter(**{filter_field: value})    # injection logique possible
```

Whitelist obligatoire ici aussi.

### Pas de fausse sécurité

Utiliser un ORM **ne dispense pas** de :

- Vérifier les inputs métier (longueurs, types).
- Appliquer le moindre privilège côté DB user.
- Auditer les usages de `raw()` régulièrement.

---

## 8. Exercices pratiques

### Exercice 1 — Repérer la vulnérabilité (≈ 25 min)

Pour chaque snippet, identifier la faille et proposer un correctif :

```python
# A
def get_user(user_id):
    return cursor.execute(f"SELECT * FROM users WHERE id = {user_id}").fetchone()

# B
def search(q):
    sql = "SELECT * FROM products WHERE name LIKE '%" + q + "%'"
    return cursor.execute(sql).fetchall()

# C
def sort_users(field):
    return cursor.execute(f"SELECT * FROM users ORDER BY {field}").fetchall()

# D
def login(email, password):
    sql = f"SELECT * FROM users WHERE email = '{email}' AND password = '{password}'"
    user = cursor.execute(sql).fetchone()
    return user is not None
```

Pour chaque cas, produire la **version sécurisée** et un **exemple d'attaque** qui marche sur la version vulnérable.

### Exercice 2 — Refactor login bypass (≈ 25 min)

Soit une page de login Python :

```python
def login(email, password):
    sql = f"SELECT id FROM users WHERE email = '{email}' AND password_hash = '{hash(password)}'"
    user = cursor.execute(sql).fetchone()
    return user
```

1. Démontrer l'attaque login bypass.
2. Refactor en version paramétrée.
3. Ajouter une vérification de password via `passlib.verify_password` (cf. FastAPI M9).
4. Tester que le login fonctionne avec credentials valides et échoue sinon.

### Exercice 3 — ORDER BY dynamique (≈ 25 min)

Implémenter une fonction `list_users(sort_by, order)` qui :

- Accepte `sort_by` parmi `["name", "email", "created_at"]` (whitelist).
- Accepte `order` parmi `["ASC", "DESC"]` (whitelist).
- Rejette toute valeur hors whitelist avec une `ValueError`.
- Utilise l'interpolation **sûre** pour le `ORDER BY`.

Tester avec des inputs valides et des inputs hostiles (`"name; DROP TABLE users; --"`).

### Exercice 4 — Liste IN dynamique (≈ 20 min)

Implémenter `get_users_by_ids(ids: list[int])` qui :

- Reçoit une liste d'ids.
- Construit dynamiquement les placeholders.
- Renvoie les users matchant.

```python
def get_users_by_ids(ids):
    if not ids:
        return []
    placeholders = ",".join(["%s"] * len(ids))
    sql = f"SELECT * FROM users WHERE id IN ({placeholders})"
    cur.execute(sql, ids)
    return cur.fetchall()
```

Tester avec une liste vide, une liste de 1, une liste de 10.

### Exercice 5 — Moindre privilège (≈ 25 min)

Sur une base PostgreSQL :

1. Créer un user `app_user` avec uniquement `SELECT, INSERT, UPDATE, DELETE` sur `public.*`.
2. Tenter `DROP TABLE users` avec ce user → vérifier le refus.
3. Tenter `CREATE TABLE evil (...)` → vérifier le refus.
4. Tenter `GRANT ALL ON users TO public` → vérifier le refus.
5. Documenter les permissions accordées dans un commentaire.

---

## 9. Mini-défi de synthèse — refactor sécurisé (≈ 1 à 1,5 heure)

### Scénario

Vous reprenez un code legacy d'une petite application Python avec PostgreSQL. Vous trouvez ce code :

```python
# legacy.py
import psycopg

conn = psycopg.connect("postgresql://admin:admin@localhost/mydb")
cur = conn.cursor()

def search_products(q, min_price, max_price, sort):
    sql = f"""
        SELECT * FROM products
        WHERE name LIKE '%{q}%'
          AND price >= {min_price}
          AND price <= {max_price}
        ORDER BY {sort}
    """
    cur.execute(sql)
    return cur.fetchall()


def add_user(name, email, role):
    sql = f"INSERT INTO users (name, email, role) VALUES ('{name}', '{email}', '{role}')"
    cur.execute(sql)
    conn.commit()


def delete_account(user_id):
    sql = f"DELETE FROM users WHERE id = {user_id}"
    cur.execute(sql)
    conn.commit()
```

### Mission

1. **Identifier toutes les failles** (4+).
2. **Refactorer** en version sécurisée :
   - Paramétrer tout ce qui doit l'être.
   - Whitelister `sort` parmi 3 colonnes autorisées.
   - Valider `role` parmi un enum métier.
   - Préparer le `LIKE` correctement (escape).
3. **Créer un user PostgreSQL** dédié `app_user` (pas `admin`) avec moindre privilège.
4. **Tester** la robustesse :
   - Recherche normale → OK.
   - Recherche avec `q = "'; DROP TABLE users; --"` → pas de drop.
   - Recherche avec `sort = "name; SELECT pg_sleep(10)"` → rejet.
   - Add user avec `role = "admin'; --"` → rejet.

### Livrables

- Code refactoré.
- Un fichier `SECURITY.md` qui liste les failles trouvées, les corrections, et les tests de robustesse passés.

### Critères de validation

- [ ] Aucune f-string ni concaténation dans une requête.
- [ ] Toutes les valeurs utilisateur sont **paramétrées**.
- [ ] Les éléments non paramétrables (ORDER BY) sont **whitelistés**.
- [ ] L'app se connecte avec un user **non-superuser**.
- [ ] Au moins 4 attaques tentées sont rejetées.

---

## 10. Auto-évaluation

Le module M11 est validé lorsque :

- [ ] L'apprenant explique une injection SQL en une phrase avec une analogie.
- [ ] Il identifie les **3 patterns** d'attaque (login bypass, exfiltration, destruction).
- [ ] Il écrit une requête paramétrée dans son langage favori sans hésiter.
- [ ] Il connaît la limite du paramétrage (`ORDER BY`, table dynamique) et applique la whitelist.
- [ ] Il configure le moindre privilège sur un user SQL.
- [ ] Il connaît les protections natives des ORMs et leurs pièges.
- [ ] Le mini-défi de refactor est rendu avec `SECURITY.md`.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : injections SQL, paramétrage des requêtes.

---

## 11. Ressources complémentaires

- **OWASP** — _SQL Injection_ : [owasp.org/www-community/attacks/SQL_Injection](https://owasp.org/www-community/attacks/SQL_Injection). Référence absolue.
- **OWASP** — _SQL Injection Prevention Cheat Sheet_ : [cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).
- **PortSwigger Web Security Academy** : [portswigger.net/web-security/sql-injection](https://portswigger.net/web-security/sql-injection). Cours et labs pratiques.
- **`sqlmap`** : [sqlmap.org](https://sqlmap.org/). Outil automatisé d'injection SQL — utile pour pen-test sur ses **propres** systèmes.
- **PostgreSQL Privileges** : [postgresql.org/docs/current/ddl-priv.html](https://www.postgresql.org/docs/current/ddl-priv.html).
- **Bobby Tables** : [bobby-tables.com](https://bobby-tables.com/). Bref guide humoristique sur les requêtes paramétrées (inspiré du XKCD #327).
