# M1 — Les 4 piliers de la POO

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Citer **les 4 piliers de la POO** et donner une analogie courte pour chacun.
- Identifier le **pilier en jeu** dans un extrait de code.
- Implémenter une classe qui démontre les 4 piliers ensemble.
- Reconnaître les **anti-patterns** qui violent chaque pilier.

## Durée estimée

0,75 à 1 jour.

## Pré-requis

- Niveau 1 POO : classes, attributs, méthodes, constructeur, getter / setter.
- Parcours Python M2 recommandé (visibilité, méthodes statiques).

---

## 1. Rappel — qu'est-ce que la POO ?

### Théorie

La **Programmation Orientée Objet** organise le code autour d'**objets** : des entités qui combinent un **état** (attributs) et un **comportement** (méthodes). Les objets sont des instances de **classes** — des "moules" qui décrivent ce que doit contenir l'instance.

Elle s'oppose (sans s'exclure) à la programmation impérative (séquence d'instructions) et fonctionnelle (composition de fonctions pures).

### Pourquoi la POO ?

Pour gérer la **complexité d'un domaine** : modéliser des concepts métier (Compte, Utilisateur, Commande) comme des entités cohérentes plutôt que comme des tas de fonctions et de dictionnaires éparpillés.

Les **4 piliers** sont les principes qui rendent ce modèle viable à grande échelle :

1. **Encapsulation** — protéger l'état interne d'un objet.
2. **Abstraction** — exposer l'essentiel, cacher le reste.
3. **Polymorphisme** — un même message, plusieurs réponses selon le type.
4. **Héritage / Interaction** — comment les classes se composent et se réutilisent.

Chacun a une analogie concrète, et chacun se traduit en code.

---

## 2. Pilier 1 — Encapsulation

### Théorie

L'encapsulation consiste à **regrouper état et comportement dans une même unité** (la classe), et à **contrôler l'accès** à cet état depuis l'extérieur.

- L'état (attributs) est **interne** : on n'y touche pas directement de l'extérieur.
- Le comportement (méthodes) est **l'API publique** : c'est par là qu'on interagit.
- Les invariants (règles que l'objet doit toujours respecter) sont **gardés par les méthodes**.

**Analogie.** La coque d'une montre. À l'extérieur, on voit l'aiguille bouger. À l'intérieur, des engrenages compliqués qu'on n'a pas à comprendre — et qu'on ne doit surtout pas démonter avec une pince à épiler. L'horloger encapsule la complexité ; le porteur de la montre interagit avec une interface simple (la couronne pour régler l'heure).

### Démonstration

```python
class BankAccount:
    def __init__(self, balance: float = 0.0):
        self._balance = balance         # privé par convention

    @property
    def balance(self) -> float:
        return self._balance

    def deposit(self, amount: float) -> None:
        if amount <= 0:
            raise ValueError("Amount must be positive")
        self._balance += amount

    def withdraw(self, amount: float) -> None:
        if amount <= 0:
            raise ValueError("Amount must be positive")
        if amount > self._balance:
            raise ValueError("Insufficient funds")
        self._balance -= amount
```

L'invariant **"le solde ne devient jamais négatif"** est garanti par la méthode `withdraw`. Si `_balance` était public, n'importe qui pourrait écrire `account._balance = -1000` et casser l'invariant.

### Anti-pattern

```python
# ✗ Pas d'encapsulation
class BankAccount:
    balance: float = 0.0


a = BankAccount()
a.balance = -1000   # personne ne l'empêche
```

Sans encapsulation, l'objet n'est qu'un sac d'attributs. La logique métier doit être rappelée par tous les appelants — duplication et bugs garantis.

### Lien Python

Python n'a pas de vrai privé (cf. parcours Python M2). On utilise les conventions `_attribut` et `__attribut` pour signaler l'intention. C'est une **discipline d'équipe** plus qu'une contrainte technique.

---

## 3. Pilier 2 — Abstraction

### Théorie

L'abstraction consiste à **exposer ce qui est essentiel** pour l'utilisateur, et à **cacher les détails d'implémentation**.

- L'utilisateur de la classe ne devrait avoir à connaître que la **forme** (signature des méthodes) — pas la **substance** (comment elles sont implémentées).
- Si l'implémentation change, l'utilisateur ne s'en aperçoit pas.

**Analogie.** La pédale d'accélérateur. Tu sais qu'elle fait accélérer. Tu n'as pas à connaître la combustion, l'injection, la transmission, l'ECU. L'abstraction expose une **interface intuitive** sur une mécanique complexe. Si demain on remplace le moteur thermique par un moteur électrique, la pédale reste la même.

### Démonstration

```python
class Storage:
    def save(self, key: str, value: bytes) -> None:
        raise NotImplementedError

    def load(self, key: str) -> bytes:
        raise NotImplementedError


class S3Storage(Storage):
    def save(self, key, value):
        # upload vers S3...
        ...

    def load(self, key):
        # download depuis S3...
        ...


class LocalDiskStorage(Storage):
    def save(self, key, value):
        # écriture fichier...
        ...

    def load(self, key):
        # lecture fichier...
        ...


def backup_user_data(storage: Storage, data: bytes):
    storage.save("user-backup", data)
```

`backup_user_data` ne sait pas si c'est du S3 ou du disque local. **L'abstraction `Storage`** lui suffit. C'est ce qui permet de tester avec un fake en mémoire, ou de migrer de S3 vers GCS sans toucher au métier.

### Encapsulation vs Abstraction

Souvent confondues. La nuance :

| Pilier        | Focus                       | Question                                    |
| ------------- | --------------------------- | ------------------------------------------- |
| Encapsulation | Protéger l'**état**         | "Qui a le droit de modifier cet attribut ?" |
| Abstraction   | Cacher l'**implémentation** | "Qui doit connaître comment c'est fait ?"   |

L'encapsulation protège la donnée. L'abstraction simplifie le contrat. Les deux travaillent main dans la main.

---

## 4. Pilier 3 — Polymorphisme

### Théorie

Le polymorphisme (du grec "plusieurs formes") permet à un **même message** d'avoir des **comportements différents** selon le type de l'objet qui le reçoit.

C'est ce qui rend le code **ouvert à l'extension** : on peut ajouter de nouveaux types sans modifier le code qui les utilise.

**Analogie.** Le verbe "**appuyer**". Tu peux appuyer sur un interrupteur (allume une lampe), sur une touche de piano (joue une note), sur une porte (ouverture). Le geste reste le même, mais le résultat dépend de l'objet.

### Démonstration — polymorphisme par héritage

```python
class Animal:
    def speak(self) -> str:
        raise NotImplementedError


class Dog(Animal):
    def speak(self) -> str:
        return "Wouaf"


class Cat(Animal):
    def speak(self) -> str:
        return "Miaou"


class Cow(Animal):
    def speak(self) -> str:
        return "Meuh"


animals = [Dog(), Cat(), Cow()]
for a in animals:
    print(a.speak())
```

Le code `a.speak()` est le **même** pour les trois animaux. C'est Python qui choisit la bonne implémentation selon le type. Ajouter `Sheep` ne nécessite pas de modifier le code de la boucle.

### Trois formes de polymorphisme

Survol — détaillé en **M7** :

- **Surcharge (overload)** : plusieurs méthodes du même nom avec des signatures différentes. Limité en Python (pas natif), répandu en Java/C++.
- **Héritage** : plusieurs classes implémentent une même méthode. C'est l'exemple ci-dessus, le plus courant.
- **Paramétrique** : un même code fonctionne sur plusieurs types via des paramètres de type (génériques). Plus avancé — sujet du **M11**.

### Lien duck typing

En Python, on n'a même pas besoin d'héritage pour profiter du polymorphisme :

```python
class Email:
    def send(self): print("sending email")

class Sms:
    def send(self): print("sending sms")


def notify(channel):
    channel.send()


notify(Email())
notify(Sms())
```

Tant qu'un objet a la méthode `send()`, il "passe pour" un canal de notification. C'est le **duck typing** : _si ça caquette comme un canard, c'est un canard_. Approfondi en M3 (interfaces, `Protocol`).

---

## 5. Pilier 4 — Héritage et interaction entre classes

### Théorie

Aucune classe ne vit isolée. Les classes **s'utilisent** mutuellement de plusieurs façons :

- **Héritage** — une classe spécialise une autre (`Dog` est un `Animal`). Relation **"est un"**.
- **Composition** — une classe contient une autre (`Car` a un `Engine`). Relation **"a un"**.
- **Agrégation** — variante faible de composition (les sous-objets peuvent exister sans le contenant).
- **Dépendance** — une classe utilise temporairement une autre (méthode qui prend un objet en paramètre).

**Analogie.** Une cuisine de restaurant :

- **Héritage** : le sous-chef est un cuisinier spécialisé (relation "est un").
- **Composition** : le restaurant est composé d'une cuisine, d'une salle, d'un personnel. Si le restaurant ferme, la cuisine et la salle ferment avec.
- **Agrégation** : les serveurs travaillent dans le restaurant, mais ils existent indépendamment (ils peuvent partir bosser ailleurs).
- **Dépendance** : le chef dépend d'un fournisseur pour les ingrédients (relation temporaire).

### Démonstration

```python
class Engine:
    def start(self) -> str:
        return "vroom"


class Car:
    def __init__(self, engine: Engine):
        self.engine = engine        # composition

    def start(self):
        return f"car says {self.engine.start()}"


class ElectricCar(Car):             # héritage
    def start(self):
        return "silently rolling"


def drive(vehicle: Car):             # dépendance
    print(vehicle.start())


drive(Car(Engine()))
drive(ElectricCar(Engine()))
```

Ces quatre relations sont approfondies dans **M2 — Relations entre classes**. Ici, l'idée est juste de reconnaître que **le polymorphisme et l'abstraction reposent sur ces relations**.

### Héritage avec parcimonie

Le piège classique : **abuser de l'héritage**. Si chaque besoin de "réutiliser du code" devient une classe parent, l'arbre d'héritage gonfle et devient ingérable.

> **Favor composition over inheritance** — _Design Patterns_ (Gang of Four, 1994).

L'héritage est légitime quand la relation est vraiment "est un" (un `Chien` est un `Animal`). Pour "veut réutiliser ce code", préférer la composition ou les mixins (Python M2).

---

## 6. Les 4 piliers ensemble — un cas complet

### Le cas — un système de paiement

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class Money:
    amount: float
    currency: str


class PaymentMethod(ABC):                  # abstraction
    @abstractmethod
    def charge(self, amount: Money) -> str: ...


class CreditCard(PaymentMethod):           # polymorphisme par héritage
    def __init__(self, card_number: str):
        self._card_number = card_number    # encapsulation

    def charge(self, amount: Money) -> str:
        # logique réelle cachée derrière l'abstraction
        return f"Charged {amount.amount} {amount.currency} on card {self._masked()}"

    def _masked(self) -> str:
        return f"****{self._card_number[-4:]}"


class BankTransfer(PaymentMethod):
    def __init__(self, iban: str):
        self._iban = iban

    def charge(self, amount: Money) -> str:
        return f"Transfer of {amount.amount} {amount.currency} initiated to {self._iban[:6]}..."


class Order:                                # composition
    def __init__(self, total: Money, payment: PaymentMethod):
        self.total = total
        self.payment = payment

    def checkout(self) -> str:
        return self.payment.charge(self.total)


# Usage
order1 = Order(Money(50, "EUR"), CreditCard("1234567890123456"))
order2 = Order(Money(120, "EUR"), BankTransfer("FR7612345678901234567890123"))

print(order1.checkout())   # Charged 50 EUR on card ****3456
print(order2.checkout())   # Transfer of 120 EUR initiated to FR7612...
```

Les 4 piliers en jeu :

| Pilier            | Où ?                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| **Encapsulation** | `CreditCard._card_number` et `_masked()` privés ; `Money` frozen.                    |
| **Abstraction**   | Classe abstraite `PaymentMethod` — l'`Order` ignore les détails.                     |
| **Polymorphisme** | `payment.charge()` se comporte différemment selon le type.                           |
| **Interaction**   | `Order` **compose** un `PaymentMethod` ; `CreditCard` **hérite** de `PaymentMethod`. |

Ce code respecte aussi le **Open/Closed Principle** (SOLID — M5) : ajouter `Crypto(PaymentMethod)` n'oblige pas à modifier `Order`.

---

## 7. Exercices pratiques

### Exercice 1 — Identifier les piliers (≈ 20 min)

Pour chaque extrait de code suivant, indiquer **quel(s) pilier(s)** est démontré et **pourquoi** :

```python
# Cas A
class Logger:
    def __init__(self):
        self._messages = []

    def log(self, msg):
        self._messages.append(msg)
        print(msg)

    def history(self):
        return list(self._messages)
```

```python
# Cas B
class Shape:
    def area(self): raise NotImplementedError

class Circle(Shape):
    def __init__(self, radius): self.radius = radius
    def area(self): return 3.14 * self.radius ** 2

class Square(Shape):
    def __init__(self, side): self.side = side
    def area(self): return self.side ** 2

shapes = [Circle(5), Square(3)]
total = sum(s.area() for s in shapes)
```

```python
# Cas C
class Engine:
    def start(self): print("vroom")

class Car:
    def __init__(self, engine):
        self.engine = engine
    def drive(self):
        self.engine.start()
```

### Exercice 2 — Compte bancaire encapsulé (≈ 30 min)

Implémenter une classe `BankAccount` qui :

- Stocke un solde **privé par convention**.
- Expose `balance` en lecture seule (`@property`).
- Fournit `deposit(amount)` et `withdraw(amount)` qui valident l'argument et l'invariant **solde ≥ 0**.
- Tente une attaque : essayer de mettre le solde à -1000 depuis l'extérieur. Vérifier que la convention `_solde` n'empêche pas la modification — discuter en commentaire pourquoi c'est OK en Python.

### Exercice 3 — Storage abstrait (≈ 35 min)

Concevoir :

1. Une classe abstraite `Storage` avec `save(key, value)` et `load(key)`.
2. Deux implémentations : `InMemoryStorage` (dict en mémoire) et `JsonFileStorage` (fichier sur disque).
3. Une fonction `backup(storage, data)` qui n'a **aucune connaissance** de l'implémentation concrète.
4. Démontrer le polymorphisme : appeler `backup` avec les deux storages.

### Exercice 4 — Animaux polymorphes (≈ 25 min)

Modéliser un zoo :

- `Animal` (abstrait) avec `speak()` et `move()`.
- `Bird`, `Fish`, `Mammal` qui implémentent `move()` différemment.
- `Dog`, `Cat`, `Cow` qui héritent de `Mammal` et redéfinissent `speak()`.
- `describe_animals(animals)` qui appelle `speak()` et `move()` sur chacun.

Vérifier qu'ajouter un nouveau type (`Snake(Animal)`) ne nécessite **aucune modification** de `describe_animals`.

### Exercice 5 — Repérer les violations (≈ 25 min)

Pour chaque cas, identifier **quel pilier est violé** et proposer une correction :

```python
# Cas A
class Order:
    items: list = []
    total: float = 0

o = Order()
o.total = -50    # ?
```

```python
# Cas B
def send_notification(channel, message):
    if channel == "email":
        send_email(message)
    elif channel == "sms":
        send_sms(message)
    elif channel == "push":
        send_push(message)
    # ajout d'un canal = modifier cette fonction
```

```python
# Cas C
class Animal:
    def speak(self):
        if isinstance(self, Dog):
            return "Wouaf"
        elif isinstance(self, Cat):
            return "Miaou"
```

---

## 8. Mini-défi de synthèse (≈ 1,5 à 2 heures)

Modéliser un **système de notification** qui démontre les 4 piliers.

**Cahier des charges** :

- Une classe abstraite `NotificationChannel` avec une méthode `send(recipient: str, message: str) -> bool`.
- Au moins **3 implémentations concrètes** : `EmailChannel`, `SmsChannel`, `SlackChannel`.
- Chaque implémentation **encapsule** ses propres configurations privées (credentials, endpoint URL...).
- Une classe `NotificationService` qui :
  - **Compose** une liste de `NotificationChannel`.
  - Fournit `broadcast(recipient, message)` qui envoie sur tous les canaux et retourne `{channel_name: success}`.
  - **Ne connaît rien** des implémentations concrètes (abstraction).

**Validation** :

- Implémenter 3 canaux + ajouter un 4ᵉ (`WhatsappChannel`) **sans modifier** `NotificationService`.
- Documenter dans le code (1 commentaire par pilier) où chaque pilier se manifeste.
- Écrire un test qui mocke les `send()` (renvoie `True`/`False` selon le canal) et vérifie que `broadcast` collecte les bons retours.

**Bonus** :

- Ajouter une stratégie de **fallback** : si `EmailChannel` échoue, essayer `SmsChannel`. Sans modifier la classe `NotificationService` — uniquement par composition (créer une `FallbackChannel` qui prend une liste de channels).

---

## 9. Auto-évaluation

Le module M1 est validé lorsque :

- [ ] L'apprenant peut citer les 4 piliers et donner une analogie en moins de 30 secondes chacune.
- [ ] Il identifie correctement les piliers à l'œuvre dans un extrait de code.
- [ ] Il distingue clairement **encapsulation** et **abstraction**.
- [ ] Il connaît au moins 2 formes de polymorphisme et peut en montrer une par code.
- [ ] Il distingue **héritage** ("est un") et **composition** ("a un").
- [ ] Il sait identifier 3 violations classiques (état exposé, conditionnelle de type, héritage forcé).
- [ ] Le mini-défi est implémenté avec les 4 piliers explicites.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : 4 piliers de la POO (encapsulation, polymorphisme, interaction entre classes, abstraction).

---

## 10. Ressources complémentaires

- **Robert C. Martin** — _Clean Code_ (chapitre 6 sur les objets vs structures de données).
- **Erich Gamma et al.** — _Design Patterns: Elements of Reusable Object-Oriented Software_ (1994), introduction sur les principes de conception orientée objet.
- **Python documentation** — _Classes_ : [docs.python.org/3/tutorial/classes.html](https://docs.python.org/3/tutorial/classes.html).
- **Bertrand Meyer** — _Object-Oriented Software Construction_ (référence classique sur les fondements théoriques).
- **Real Python** — _Object-Oriented Programming (OOP) in Python 3_.
