# M5 — SOLID en détail

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer et expliciter chacun des **5 principes SOLID** avec une analogie.
- **Repérer les violations** SOLID dans un code donné.
- **Refactorer** une classe pour appliquer chaque principe.
- Comprendre comment les 5 principes **se renforcent mutuellement**.

## Durée estimée

1 jour.

## Pré-requis

- M1 à M4 POO.

---

## 1. Pourquoi SOLID ?

### Contexte historique

SOLID est un acronyme proposé par **Robert C. Martin** (Uncle Bob) au début des années 2000, regroupant cinq principes de conception orientée objet :

- **S**ingle Responsibility Principle.
- **O**pen/Closed Principle.
- **L**iskov Substitution Principle.
- **I**nterface Segregation Principle.
- **D**ependency Inversion Principle.

Ce ne sont **pas** des règles strictes, mais des **boussoles**. Un code qui suit SOLID est plus facile à modifier, tester et étendre — au prix d'une complexité initiale légèrement supérieure.

### Pourquoi en parler

Sans SOLID, on retombe sur les anti-patterns récurrents :

- Classes "fourre-tout" qui changent à chaque évolution.
- Hiérarchies fragiles où ajouter un cas casse 10 endroits.
- Code intestable parce que les dépendances sont créées en interne.
- Bugs de substitution où une sous-classe brise les attentes.

SOLID est l'**hygiène** de la conception OO. À pratiquer naturellement, pas en cochant une checklist.

---

## 2. SRP — Single Responsibility Principle

### Énoncé

> **Une classe ne devrait avoir qu'une seule raison de changer.**

Une "responsabilité" = un **axe de changement** du code. Si deux raisons distinctes peuvent provoquer la modification d'une classe, elle a deux responsabilités.

**Analogie.** Un couteau suisse vs un spécialiste. Le couteau suisse fait tout, mais mal — et si tu veux améliorer la pince, tu risques de casser la lame. Le chirurgien a un seul outil par opération : précis, maintenable, remplaçable.

### Violation typique

```python
class Report:
    def __init__(self, data):
        self.data = data

    def calculate_summary(self):
        # 1ère responsabilité : logique métier
        return sum(self.data)

    def to_html(self):
        # 2ème responsabilité : présentation
        return f"<h1>Report</h1><p>{self.calculate_summary()}</p>"

    def save_to_disk(self, path):
        # 3ème responsabilité : persistance
        with open(path, "w") as f:
            f.write(self.to_html())

    def send_via_email(self, recipient):
        # 4ème responsabilité : transport
        smtp.send(recipient, body=self.to_html())
```

Cette classe a **4 responsabilités** : calcul, présentation, persistance, transport. Quatre raisons distinctes de changer.

### Refactor

```python
class Report:
    def __init__(self, data):
        self.data = data

    def calculate_summary(self) -> float:
        return sum(self.data)


class HtmlReportFormatter:
    def format(self, report: Report) -> str:
        return f"<h1>Report</h1><p>{report.calculate_summary()}</p>"


class FileWriter:
    def write(self, content: str, path: str):
        with open(path, "w") as f:
            f.write(content)


class EmailSender:
    def send(self, recipient: str, body: str):
        smtp.send(recipient, body=body)
```

Chaque classe a **une seule raison** de changer :

- `Report` change si le métier change.
- `HtmlReportFormatter` change si la présentation change.
- `FileWriter` change si on change de mode de stockage.
- `EmailSender` change si on change de service email.

### Signaux d'alerte SRP

- Une classe avec **plus de 5-7 méthodes publiques** non liées.
- Des méthodes qui n'utilisent **pas** les attributs de l'instance.
- Un nom de classe avec **un "et"** : `UserAndOrderManager`.
- Un fichier qui apparaît dans **plusieurs PR** pour des raisons distinctes.

### Limite

SRP peut être **sur-appliqué**. Découper en classes microscopiques (une méthode = une classe) crée son propre désordre : explosion du nombre de fichiers, perte de lisibilité. Le bon niveau : **un agrégat cohérent du domaine**.

---

## 3. OCP — Open/Closed Principle

### Énoncé

> **Une entité (classe, module, fonction) doit être ouverte à l'extension, mais fermée à la modification.**

Quand on ajoute une nouvelle fonctionnalité, on devrait pouvoir **ajouter** du code sans **modifier** celui qui existe déjà.

**Analogie.** Une prise électrique standard. On peut brancher une lampe, un grille-pain, un chargeur — l'installation électrique est **ouverte à l'extension**. Mais on ne modifie pas la prise pour chaque nouvel appareil — elle est **fermée à la modification**.

### Violation typique

```python
class DiscountCalculator:
    def calculate(self, customer_type: str, amount: float) -> float:
        if customer_type == "regular":
            return amount
        elif customer_type == "premium":
            return amount * 0.9
        elif customer_type == "vip":
            return amount * 0.8
        # Ajouter "platinum" → modifier cette méthode
```

Chaque nouveau type oblige à **rouvrir** `DiscountCalculator.calculate`. Risque de régression à chaque modification. Tests à refaire à chaque ajout.

### Refactor

```python
from abc import ABC, abstractmethod


class DiscountPolicy(ABC):
    @abstractmethod
    def apply(self, amount: float) -> float: ...


class RegularDiscount(DiscountPolicy):
    def apply(self, amount): return amount

class PremiumDiscount(DiscountPolicy):
    def apply(self, amount): return amount * 0.9

class VipDiscount(DiscountPolicy):
    def apply(self, amount): return amount * 0.8


class DiscountCalculator:
    def calculate(self, policy: DiscountPolicy, amount: float) -> float:
        return policy.apply(amount)
```

Ajouter un type "Platinum" se fait par **création** d'une nouvelle classe :

```python
class PlatinumDiscount(DiscountPolicy):
    def apply(self, amount): return amount * 0.7
```

**Aucune ligne** de `DiscountCalculator` n'a changé. **Aucune ligne** des autres `DiscountPolicy` non plus.

### Signaux d'alerte OCP

- Une **longue chaîne `if/elif`** ou un `match` qui traite des types.
- Une méthode qu'on doit modifier **à chaque** nouveau cas métier.
- Un fichier où chaque nouvelle feature apporte du code.

### Quand ne pas appliquer

OCP a un **coût** : créer une hiérarchie de classes pour 2 cas figés inutilement compliqué. La règle pratique : **n'appliquer OCP que quand le besoin d'extension est avéré ou prévisible**. Une `if/elif` à 3 branches qui ne bougera plus est OK.

---

## 4. LSP — Liskov Substitution Principle

### Énoncé

> **Les objets d'une sous-classe doivent pouvoir remplacer les objets de la classe parente sans casser le comportement attendu.**

Si `Child` hérite de `Parent`, toute fonction qui prend un `Parent` doit fonctionner **identiquement** avec un `Child`.

**Analogie.** Le remplaçant à un poste. Si ta remplaçante peut faire tout ce que tu faisais (répondre au téléphone, traiter les emails, négocier avec les clients) sans surprise, elle respecte le contrat. Si elle "ne sait pas répondre au téléphone", on ne peut pas la substituer à toi sans casser le service.

### Violation typique — le Penguin

```python
class Bird:
    def fly(self) -> None:
        print("Flying high")


class Penguin(Bird):
    def fly(self) -> None:
        raise NotImplementedError("Penguins can't fly")


def make_them_fly(birds: list[Bird]):
    for bird in birds:
        bird.fly()


make_them_fly([Bird(), Penguin()])    # ✗ crash sur le pingouin
```

`Penguin` **hérite** de `Bird` mais **brise le contrat** : appeler `fly()` lève une exception. Toute fonction qui croit avoir un `Bird` peut crasher.

### Refactor

Deux directions possibles selon le métier :

**Option 1** : restructurer la hiérarchie.

```python
class Bird:
    pass

class FlyingBird(Bird):
    def fly(self): ...

class Penguin(Bird):
    def swim(self): ...
```

**Option 2** : utiliser composition.

```python
class Bird:
    def __init__(self, ability):
        self.ability = ability


class FlyAbility:
    def execute(self): print("flying")

class SwimAbility:
    def execute(self): print("swimming")


sparrow = Bird(FlyAbility())
penguin = Bird(SwimAbility())
```

### Signaux d'alerte LSP

- Une sous-classe qui lève `NotImplementedError` sur une méthode héritée.
- Une sous-classe qui **renforce** des préconditions (ex : `Parent.method(any int)` mais `Child.method(only positive int)`).
- Une sous-classe qui **affaiblit** des postconditions (ex : `Parent` renvoie une liste, `Child` renvoie parfois `None`).
- Du code qui fait `isinstance` pour ajuster son comportement selon le type concret.

### LSP et types

Formellement, LSP exige :

- Préconditions **égales ou plus faibles** dans la sous-classe.
- Postconditions **égales ou plus fortes** dans la sous-classe.
- Mêmes invariants ou plus stricts.
- Mêmes exceptions levées ou un sous-ensemble.

En Python, ces règles ne sont pas vérifiées automatiquement — c'est à l'auteur de les respecter.

---

## 5. ISP — Interface Segregation Principle

### Énoncé

> **Un client ne devrait pas être obligé de dépendre d'interfaces qu'il n'utilise pas.**

Mieux vaut **plusieurs petites interfaces ciblées** qu'une seule grosse interface généraliste.

**Analogie.** Les fiches de poste dans une entreprise. Personne n'a une fiche qui combine "médecin + plombier + comptable". Chaque rôle a sa fiche ciblée. Les profils polyvalents combinent **plusieurs** fiches au besoin.

### Violation typique

```python
from abc import ABC, abstractmethod


class Worker(ABC):
    @abstractmethod
    def work(self): ...

    @abstractmethod
    def eat(self): ...

    @abstractmethod
    def sleep(self): ...


class Human(Worker):
    def work(self): print("working")
    def eat(self): print("eating")
    def sleep(self): print("sleeping")


class Robot(Worker):
    def work(self): print("processing")
    def eat(self): raise NotImplementedError("robots don't eat")  # ✗
    def sleep(self): raise NotImplementedError("robots don't sleep")  # ✗
```

`Robot` est forcé d'implémenter `eat` et `sleep` parce qu'ils sont sur l'interface `Worker`. Ces méthodes sont **inutilisables** pour lui.

### Refactor

```python
class Workable(ABC):
    @abstractmethod
    def work(self): ...

class Feedable(ABC):
    @abstractmethod
    def eat(self): ...

class Sleepable(ABC):
    @abstractmethod
    def sleep(self): ...


class Human(Workable, Feedable, Sleepable):
    def work(self): ...
    def eat(self): ...
    def sleep(self): ...


class Robot(Workable):
    def work(self): ...
```

Chaque classe **n'implémente que** ce qui la concerne. Aucune méthode "vide" ou "qui lève".

### Signaux d'alerte ISP

- Une classe abstraite avec **beaucoup de méthodes abstraites** dont certaines ne s'appliquent qu'à une minorité de sous-classes.
- Sous-classes qui lèvent `NotImplementedError` pour des méthodes héritées.
- Documentation : "Cette méthode peut être ignorée pour les types X".

### En Python

`Protocol` (vu en M3) rend ISP **naturel** : plusieurs petits protocoles, une classe peut respecter ceux qui la concernent sans s'engager sur les autres.

```python
from typing import Protocol

class Workable(Protocol):
    def work(self): ...

class Feedable(Protocol):
    def eat(self): ...


class Human:
    def work(self): ...
    def eat(self): ...

class Robot:
    def work(self): ...   # ne respecte que Workable
```

---

## 6. DIP — Dependency Inversion Principle

### Énoncé

> **Les modules de haut niveau ne devraient pas dépendre des modules de bas niveau. Les deux devraient dépendre d'abstractions.**
>
> **Les abstractions ne devraient pas dépendre des détails. Les détails devraient dépendre des abstractions.**

Concrètement : ne pas câbler une classe métier sur une implémentation concrète (une DB, un client HTTP, un fichier). Câbler sur une **abstraction**, et **injecter** l'implémentation au runtime.

**Analogie.** L'ampoule électrique. Elle ne se branche pas directement sur la centrale nucléaire ou sur le panneau solaire — elle se branche sur la **prise** (abstraction). Centrale et panneau solaire sont des détails ; l'ampoule en est isolée.

### Violation typique

```python
class MySQLDatabase:
    def save(self, data): ...

class UserService:
    def __init__(self):
        self.db = MySQLDatabase()    # ✗ couplage direct au détail

    def create_user(self, payload):
        self.db.save(payload)
```

`UserService` **dépend directement** de `MySQLDatabase`. Migrer vers PostgreSQL ou tester sans DB est lourd.

### Refactor

```python
from abc import ABC, abstractmethod


class UserRepository(ABC):       # abstraction
    @abstractmethod
    def save(self, data): ...


class MySQLUserRepository(UserRepository):
    def save(self, data): ...

class InMemoryUserRepository(UserRepository):    # pour les tests
    def __init__(self):
        self.users = []
    def save(self, data):
        self.users.append(data)


class UserService:
    def __init__(self, repo: UserRepository):    # ✓ dépend de l'abstraction
        self.repo = repo

    def create_user(self, payload):
        self.repo.save(payload)


# Câblage à un seul endroit
service = UserService(MySQLUserRepository())   # en prod
test_service = UserService(InMemoryUserRepository())  # en test
```

`UserService` ne sait plus rien de MySQL. Migrer vers PostgreSQL = créer `PostgreSQLUserRepository`. Tester `UserService` = utiliser `InMemoryUserRepository`.

### DIP en pratique

DIP rejoint **l'injection de dépendances** (cf. FastAPI M6). Les frameworks modernes (FastAPI, Django, Spring, .NET) **intègrent** DIP par construction.

### Signaux d'alerte DIP

- `self.db = SomeConcreteClass()` à l'intérieur d'une classe métier.
- Des tests qui ont besoin de **vraies** connexions (DB, HTTP) pour passer.
- Une classe métier qui **importe** un détail technique en dur.

### DIP vs OCP

OCP et DIP sont **proches** : tous deux passent par l'introduction d'abstractions. OCP est centré sur **l'évolution** (ajouter du nouveau), DIP sur **le couplage** (ne pas dépendre des détails). Souvent appliquer l'un applique l'autre.

---

## 7. SOLID en synergie

Les 5 principes se renforcent mutuellement. Un code conçu en respectant SOLID partage typiquement les caractéristiques suivantes :

- **Petites classes** avec une seule responsabilité (SRP).
- **Hiérarchies cohérentes** où l'héritage respecte la substitution (LSP).
- **Interfaces ciblées**, segmentées par besoin (ISP).
- **Extensions** ajoutées par création, pas modification (OCP).
- **Dépendances** câblées via abstractions et injection (DIP).

### Exemple de code SOLID

```python
from abc import ABC, abstractmethod
from typing import Protocol


# ISP — protocoles ciblés
class Hashable(Protocol):
    def to_hashable(self) -> tuple: ...

# DIP — abstraction repo
class StorageRepository(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> bool: ...


# SRP — classe focalisée
class FileHasher:
    def hash(self, content: bytes) -> str:
        import hashlib
        return hashlib.sha256(content).hexdigest()


# OCP — extensible via héritage propre
class CompressionStrategy(ABC):
    @abstractmethod
    def compress(self, data: bytes) -> bytes: ...

class GzipStrategy(CompressionStrategy):
    def compress(self, data): import gzip; return gzip.compress(data)

class NoOpStrategy(CompressionStrategy):
    def compress(self, data): return data


# Service métier — orchestrateur
class BackupService:
    def __init__(self, repo: StorageRepository, hasher: FileHasher, compression: CompressionStrategy):
        self.repo = repo
        self.hasher = hasher
        self.compression = compression

    def backup(self, key: str, content: bytes) -> bool:
        compressed = self.compression.compress(content)
        hashed_key = self.hasher.hash(content)[:16]
        return self.repo.save(f"{key}-{hashed_key}", compressed)
```

Cette architecture :

- Permet de tester `BackupService` avec des fakes pour chaque dépendance.
- Permet d'ajouter Zstd compression (OCP) sans modifier `BackupService`.
- Permet de remplacer le `FileHasher` (DIP, si on en faisait une abstraction).
- Aucune méthode inutile n'est imposée sur les implémentations (ISP).
- Une sous-classe de `CompressionStrategy` qui lèverait `NotImplementedError` violerait LSP — donc c'est explicite.

---

## 8. Exercices pratiques

### Exercice 1 — Repérer le principe violé (≈ 25 min)

Pour chaque cas, identifier le ou les principes SOLID violés :

```python
# Cas A
class Square(Rectangle):
    def __init__(self, side):
        super().__init__(side, side)

    def set_width(self, w):
        self.width = w
        self.height = w

    def set_height(self, h):
        self.width = h
        self.height = h
```

```python
# Cas B
class Printer:
    def print(self, doc): ...
    def fax(self, doc): ...
    def scan(self, doc): ...
    def staple(self, doc): ...

class OldPrinter(Printer):
    def print(self, doc): ...
    def fax(self, doc): raise NotImplementedError
    def scan(self, doc): raise NotImplementedError
    def staple(self, doc): raise NotImplementedError
```

```python
# Cas C
class EmailService:
    def __init__(self):
        self.smtp = SmtpClient("smtp.example.com", 587)

    def send(self, to, subject, body):
        self.smtp.send(to, subject, body)
```

```python
# Cas D
class FileManager:
    def read_csv(self, path): ...
    def write_csv(self, path, data): ...
    def upload_to_s3(self, path): ...
    def compress(self, path): ...
    def log_activity(self, action): ...
    def calculate_md5(self, path): ...
```

### Exercice 2 — Refactor SRP (≈ 30 min)

Soit :

```python
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

    def save(self):
        # connexion DB et insertion SQL
        ...

    def send_welcome(self):
        # appel SMTP
        ...

    def to_html_profile(self):
        return f"<h1>{self.name}</h1>"
```

Refactorer en **trois classes** distinctes. Justifier en commentaire la responsabilité de chacune.

### Exercice 3 — Refactor OCP (≈ 30 min)

Soit :

```python
def calculate_shipping(weight: float, country: str) -> float:
    if country == "FR":
        return weight * 1.0
    elif country == "DE":
        return weight * 1.5
    elif country == "US":
        return weight * 3.0
    elif country == "JP":
        return weight * 4.5
    raise ValueError("Unknown country")
```

Refactorer pour qu'ajouter un nouveau pays ne nécessite **pas** de modifier `calculate_shipping`.

### Exercice 4 — Refactor LSP (≈ 35 min)

Soit :

```python
class Account:
    def __init__(self, balance: float):
        self._balance = balance

    def withdraw(self, amount: float):
        if amount > self._balance:
            raise ValueError("Insufficient funds")
        self._balance -= amount


class SavingsAccount(Account):
    def withdraw(self, amount):
        if amount > 1000:
            raise ValueError("Savings withdrawal limit")
        super().withdraw(amount)
```

`SavingsAccount` **renforce les préconditions** (limite à 1000), donc viole LSP : un code qui marche avec `Account` peut crasher avec `SavingsAccount`.

Proposer deux refactors différents :

1. Modifier la hiérarchie.
2. Utiliser composition à la place.

### Exercice 5 — Refactor ISP + DIP (≈ 40 min)

Soit :

```python
class MegaService:
    def send_email(self, to, msg): ...
    def send_sms(self, to, msg): ...
    def log_to_disk(self, message): ...
    def query_db(self, sql): ...


class UserController:
    def create_user(self, payload):
        service = MegaService()
        service.query_db("INSERT INTO users...")
        service.send_email(payload["email"], "Welcome")
        service.log_to_disk("user created")
```

Refactorer :

1. Séparer `MegaService` en plusieurs interfaces ciblées (ISP).
2. Injecter les dépendances de `UserController` plutôt que de les créer (DIP).
3. Permettre à `UserController` d'être testé avec des fakes pour DB, email, log.

---

## 9. Mini-défi de synthèse — audit SOLID (≈ 2 heures)

Reprendre une classe d'un parcours précédent (par exemple le `TaskRunner` du POO M4 ou le système de notification du POO M1) ou choisir une classe d'un projet existant.

**Mission** :

1. **Audit** — pour chaque principe SOLID, indiquer si la classe le respecte ou le viole. Justifier.
2. **Refactor** — corriger les violations en respectant un principe à la fois :
   - Étape 1 : SRP (découper si nécessaire).
   - Étape 2 : OCP (extraire les branches si applicable).
   - Étape 3 : LSP (vérifier les hiérarchies existantes).
   - Étape 4 : ISP (segmenter les interfaces).
   - Étape 5 : DIP (injecter les dépendances).
3. **Tests** — montrer qu'on peut désormais tester la classe avec des fakes injectés (au moins 2).
4. **Documentation** — un commentaire en haut de chaque nouvelle classe expliquant la **responsabilité** qu'elle porte.

**Critères de validation** :

- [ ] Chaque classe a une responsabilité unique et identifiable en une phrase.
- [ ] Aucun `if isinstance(...)` dans le code refactoré.
- [ ] Aucune dépendance concrète directe — tout passe par des abstractions injectées.
- [ ] Les tests passent **sans** vraie DB ni vrai service externe.

---

## 10. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant peut citer les 5 principes SOLID et donner une analogie pour chacun.
- [ ] Il identifie correctement le ou les principes violés dans un extrait de code.
- [ ] Il sait refactorer une classe pour appliquer chaque principe.
- [ ] Il distingue **SRP** et **ISP** (la séparation de responsabilité dans la classe vs la séparation d'interface dans le contrat).
- [ ] Il distingue **OCP** et **DIP** (l'extension sans modification vs le couplage par abstraction).
- [ ] Le mini-défi est implémenté avec les 5 principes documentés.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : 5 principes SOLID en détail.
- **N1** : intérêt des principes SOLID (déjà acquis, consolidé ici).

---

## 11. Ressources complémentaires

- **Robert C. Martin** — _Clean Architecture_ (2017). Chapitres dédiés à chacun des 5 principes.
- **Robert C. Martin** — _Agile Software Development, Principles, Patterns, and Practices_ (2002). L'introduction historique des principes SOLID.
- **Uncle Bob's blog** — articles originaux sur chaque principe SOLID : [cleancoder.com/products](https://cleancoder.com).
- **Real Python** — articles _SOLID Principles: Improve Object-Oriented Design in Python_.
- _Head First Design Patterns_ (Eric Freeman et al.) — illustration vivante de OCP et DIP via des patterns.
- **Sandi Metz** — _Practical Object-Oriented Design_ (POODR). Une référence pour appliquer SOLID en Ruby/Python.
