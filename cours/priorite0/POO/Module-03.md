# M3 — Interface vs classe abstraite

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **interface** (contrat pur) et **classe abstraite** (contrat + implémentation partielle).
- Maîtriser les outils Python correspondants : `abc.ABC`, `typing.Protocol`.
- Choisir entre les deux selon le contexte (avec un tableau de décision en tête).
- Refactorer une hiérarchie de classes en introduisant l'abstraction adaptée.

## Durée estimée

0,75 jour.

## Pré-requis

- M1 et M2 POO terminés.
- Parcours Python M4 recommandé (classes abstraites avec `abc`).

---

## 1. Le besoin commun — abstraire le contrat

### Le problème

Soit trois classes qui font conceptuellement la même chose, sans relation d'héritage métier :

```python
class EmailSender:
    def send(self, recipient: str, message: str): ...

class SmsSender:
    def send(self, recipient: str, message: str): ...

class SlackSender:
    def send(self, recipient: str, message: str): ...
```

Une fonction `notify(sender, recipient, message)` aimerait travailler avec n'importe lequel — peu importe lequel. Mais sans abstraction explicite, le typage est mou, la documentation est implicite, et un nouveau type "presque pareil mais qui s'appelle `transmit` au lieu de `send`" passera sans bruit.

**Il faut nommer le contrat.**

Deux outils sont disponibles :

- Une **classe abstraite** — déclare des méthodes obligatoires + peut fournir des implémentations communes.
- Une **interface** (Protocol en Python) — déclare uniquement les méthodes attendues, sans implémentation.

---

## 2. Classe abstraite — contrat + implémentation partielle

### Théorie

Une classe abstraite est une **classe qui ne peut pas être instanciée directement**. Elle déclare :

- Des **méthodes abstraites** (sans corps) — obligatoires pour les sous-classes.
- Éventuellement des **méthodes concrètes** (avec corps) — réutilisables par les sous-classes.
- Éventuellement des **attributs** partagés.

**Analogie.** Un **cadre de formation interne** d'entreprise. Il fournit déjà la matière commune (théorie, méthode, exercices), mais l'apprenant doit compléter les parties spécifiques à son rôle. On ne peut pas "être" juste le cadre — il faut le compléter pour le pratiquer.

### Démonstration

```python
from abc import ABC, abstractmethod


class NotificationSender(ABC):
    def __init__(self, retries: int = 3):
        self.retries = retries

    @abstractmethod
    def send(self, recipient: str, message: str) -> bool: ...

    def send_with_retry(self, recipient: str, message: str) -> bool:
        """Méthode concrète — utilise send() qui sera implémentée par les sous-classes."""
        for attempt in range(self.retries):
            if self.send(recipient, message):
                return True
        return False


class EmailSender(NotificationSender):
    def send(self, recipient, message):
        # ... SMTP logic
        return True


# NotificationSender()              # TypeError
EmailSender().send_with_retry(...)  # ✓ — utilise send_with_retry de la parent et send d'Email
```

`NotificationSender` :

- Garde l'**état** (`retries`).
- Force ses sous-classes à implémenter `send`.
- Fournit `send_with_retry` qui réutilise `send` — sans dupliquer le pattern de retry dans chaque sous-classe.

### Avantages

- **Réutilisation de code** entre sous-classes.
- **État partagé** (attributs, configuration).
- **Logique de framework** (Template Method pattern, M8).

### Inconvénients

- **Couplage fort** entre sous-classes (changer la méthode concrète affecte tout le monde).
- **Héritage unique** en Python : on ne peut pas hériter de deux classes abstraites métier sans collision (cf. mixin, Python M2).

---

## 3. Interface — contrat pur

### Théorie

Une interface décrit **uniquement** les méthodes que doit fournir une classe — pas leur implémentation, pas d'état partagé.

- Pas d'attribut.
- Pas de constructeur (en général).
- Pas de méthode concrète.
- Seulement la **forme** : noms de méthodes, signatures, types.

C'est un **contrat pur**.

**Analogie.** Une **fiche de poste**. Elle décrit ce que le titulaire du poste doit savoir faire (responsabilités, livrables), sans dire comment. Deux médecins peuvent honorer la même fiche de poste avec des styles totalement différents — l'important est qu'ils fournissent le service attendu.

### Démonstration avec `Protocol`

```python
from typing import Protocol


class Sender(Protocol):
    def send(self, recipient: str, message: str) -> bool: ...


class EmailSender:                  # PAS d'héritage explicite
    def send(self, recipient, message):
        return True


class SmsSender:                    # PAS d'héritage non plus
    def send(self, recipient, message):
        return True


def notify(sender: Sender, recipient: str, message: str):
    return sender.send(recipient, message)


notify(EmailSender(), "a@b.c", "hello")   # ✓
notify(SmsSender(), "+33...", "hello")    # ✓
```

`EmailSender` et `SmsSender` **n'héritent pas** de `Sender`. Pourtant, mypy (et FastAPI, et tout outil typé) les acceptent là où un `Sender` est attendu — parce que leur forme correspond au protocole.

C'est le **structural subtyping** (typage structurel) : ce qui compte, c'est la **forme** de l'objet, pas son lignage. Inspiré du duck typing, mais désormais typé statiquement.

### Avantages

- **Découplage maximal** — une classe peut respecter 10 protocoles sans s'engager à hériter de quoi que ce soit.
- **Non intrusif** — on peut typer un code legacy en déclarant un `Protocol` qui décrit ses classes existantes, sans les modifier.
- **Composition naturelle** — plusieurs protocoles peuvent s'ajouter (`Sender + Loggable + Validable`).

### Inconvénients

- **Pas de réutilisation de code** — chaque classe doit tout réimplémenter.
- **Vérification au moment du type-check uniquement** — runtime, Python ne vérifie rien (sauf `@runtime_checkable`).

---

## 4. En Python — `abc.ABC` et `typing.Protocol`

### `abc.ABC` — la classe abstraite

```python
from abc import ABC, abstractmethod


class Logger(ABC):
    @abstractmethod
    def log(self, message: str) -> None: ...


class FileLogger(Logger):   # héritage explicite obligatoire
    def log(self, message): ...
```

- Héritage **explicite** (`class X(Logger)`).
- Vérification à **l'instanciation** — `Logger()` lève `TypeError`.
- `FileLogger` sans implémenter `log()` lève aussi `TypeError`.

### `typing.Protocol` — l'interface

```python
from typing import Protocol


class Logger(Protocol):
    def log(self, message: str) -> None: ...


class FileLogger:           # PAS d'héritage
    def log(self, message): ...
```

- **Pas d'héritage** nécessaire.
- Vérification au **type-check** (mypy / pyright). À l'exécution, Python ne fait rien.
- Pour une vérification runtime : `@runtime_checkable` (à utiliser parcimonieusement, c'est lent).

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Sender(Protocol):
    def send(self, recipient: str, msg: str) -> bool: ...


isinstance(EmailSender(), Sender)   # True à runtime
```

### Hybride — abc avec implémentations partielles + Protocol pour les nouveaux types

Rien n'empêche d'utiliser les deux :

- **`abc.ABC`** pour les implémentations "officielles" du domaine, partageant du code.
- **`Protocol`** pour les adaptateurs ou les types externes qu'on ne veut pas modifier.

```python
class NotificationSender(ABC):                # framework interne
    def send_with_retry(self, ...): ...
    @abstractmethod
    def send(self, ...): ...


class Sender(Protocol):                       # contrat plus large
    def send(self, recipient: str, msg: str) -> bool: ...


def notify(sender: Sender, ...): ...
# accepte aussi bien les NotificationSender que des objets externes ayant un send()
```

---

## 5. Tableau de décision

| Besoin                                                       | Outil      | Pourquoi                         |
| ------------------------------------------------------------ | ---------- | -------------------------------- |
| Partager du code entre sous-classes                          | `abc.ABC`  | Méthodes concrètes héritées.     |
| Forcer une signature sur des classes existantes (sans modif) | `Protocol` | Non-intrusif.                    |
| Avoir un état partagé (attributs)                            | `abc.ABC`  | Protocol n'a pas d'état.         |
| Plusieurs implémentations totalement indépendantes           | `Protocol` | Découplage maximal.              |
| Détection au moment de l'instanciation                       | `abc.ABC`  | Erreur Python directe.           |
| Typage statique pur sans coupler le code                     | `Protocol` | Validation par mypy uniquement.  |
| Hierarchie naturelle "est-un"                                | `abc.ABC`  | Confirme la relation d'héritage. |
| Hierarchie horizontale "se comporte comme"                   | `Protocol` | Reflète le duck typing.          |

### Heuristique simple

1. Y a-t-il du **code commun** à partager ? → `abc.ABC`.
2. Sinon, l'interface s'applique-t-elle à des classes **existantes** (qu'on ne veut pas modifier) ? → `Protocol`.
3. Sinon, ai-je besoin d'une **vérification stricte à l'instanciation** ? → `abc.ABC`.
4. Par défaut → `Protocol` (moins intrusif).

---

## 6. Refactor — introduire une abstraction

### Le code de départ

```python
class EmailService:
    def __init__(self, smtp_host: str, port: int):
        self.smtp_host = smtp_host
        self.port = port

    def deliver(self, to: str, subject: str, body: str) -> bool:
        # SMTP logic
        return True


class SmsService:
    def __init__(self, provider_url: str, api_key: str):
        self.provider_url = provider_url
        self.api_key = api_key

    def deliver(self, to: str, subject: str, body: str) -> bool:
        # HTTP API logic
        return True


def send_welcome(user_email, user_phone):
    EmailService("smtp.x", 587).deliver(user_email, "Welcome", "Hi!")
    SmsService("https://...", "key").deliver(user_phone, "", "Welcome!")
```

Problèmes :

- `send_welcome` instancie elle-même les services — couplage fort, intestable.
- Aucun typage pour exprimer "tout ce qui peut délivrer".
- Ajouter un canal Slack demande de modifier `send_welcome`.

### Refactor avec `Protocol`

```python
from typing import Protocol


class DeliveryChannel(Protocol):
    def deliver(self, to: str, subject: str, body: str) -> bool: ...


def send_welcome(channels: list[DeliveryChannel], user_email: str, user_phone: str):
    for c in channels:
        c.deliver(user_email or user_phone, "Welcome", "Hi!")


# Les classes existantes ne sont PAS modifiées
send_welcome([
    EmailService("smtp.x", 587),
    SmsService("https://...", "key"),
], "a@b.c", "+33...")
```

- `EmailService` et `SmsService` **n'ont pas changé**.
- `send_welcome` est testable (on peut lui passer un mock implémentant `deliver`).
- Ajouter `SlackService` ne nécessite **aucune modification** de `send_welcome`.

### Refactor avec `abc.ABC`

Si l'on veut **du code partagé** (par exemple, du logging au moment du `deliver`) :

```python
from abc import ABC, abstractmethod


class DeliveryChannel(ABC):
    def deliver(self, to: str, subject: str, body: str) -> bool:
        result = self._do_deliver(to, subject, body)
        self._log(to, result)
        return result

    @abstractmethod
    def _do_deliver(self, to: str, subject: str, body: str) -> bool: ...

    def _log(self, to: str, success: bool):
        print(f"[delivery] to={to} success={success}")


class EmailService(DeliveryChannel):
    def __init__(self, smtp_host, port):
        self.smtp_host, self.port = smtp_host, port

    def _do_deliver(self, to, subject, body):
        return True
```

Trade-off : on **gagne du code partagé** (logging), on **perd la non-intrusivité** (les classes héritent maintenant explicitement).

---

## 7. Exercices pratiques

### Exercice 1 — Choisir le bon outil (≈ 20 min)

Pour chaque scénario, choisir `abc.ABC` ou `Protocol`, et justifier en 1-2 lignes :

1. Tu écris un framework HTTP. Tu veux que tous les handlers fournissent une méthode `handle(request) -> response`, sans imposer une classe parente.
2. Tu écris un système de paiement avec 3 méthodes (`charge`, `refund`, `status`). Toutes doivent logger leurs actions de la même façon.
3. Tu intègres une bibliothèque externe `pandas.DataFrame` que tu ne peux pas modifier, et tu veux la typer dans une signature de fonction.
4. Tu modélises un domaine "véhicule" où chaque type partage un compteur de kilomètres et le calcul d'usure, mais a sa propre logique de freinage.

### Exercice 2 — Implémenter avec `abc.ABC` (≈ 25 min)

Écrire une classe abstraite `Vehicle` avec :

- Un attribut `_km: float = 0`.
- Une méthode concrète `add_distance(km: float)` qui incrémente `_km`.
- Une méthode abstraite `top_speed() -> float`.
- Une méthode concrète `report()` qui imprime `f"{type(self).__name__} : {self._km} km, top speed {self.top_speed()}"`.

Implémenter `Car(Vehicle)`, `Bike(Vehicle)`, `Truck(Vehicle)`. Vérifier qu'instancier `Vehicle()` directement lève une erreur.

### Exercice 3 — Implémenter avec `Protocol` (≈ 25 min)

Écrire un `Protocol Closable` avec une méthode `close() -> None`.

Démontrer qu'on peut le faire respecter par :

- Une classe `MyResource` créée pour l'occasion.
- Un fichier ouvert (`open("test.txt")`) — sans modifier la classe `IO`.
- Une classe `tempfile.TemporaryDirectory` (qui a une méthode `cleanup`, donc PAS compatible) — montrer que mypy / pyright signale l'erreur.

### Exercice 4 — Refactor (≈ 30 min)

Soit le code suivant :

```python
class WordFile:
    def __init__(self, path): self.path = path
    def export_pdf(self): print(f"exporting {self.path} as pdf")

class ExcelFile:
    def __init__(self, path): self.path = path
    def export_pdf(self): print(f"exporting {self.path} as pdf")

def batch_export(items):
    for item in items:
        item.export_pdf()
```

Introduire une abstraction explicite via `Protocol`. Ajouter un troisième type `MarkdownFile` qui implémente `export_pdf()` — vérifier que `batch_export` fonctionne sans modification.

### Exercice 5 — Refactor avec code partagé (≈ 30 min)

Soit deux classes qui dupliquent une logique de "validation avant action" :

```python
class EmailSender:
    def send(self, to, msg):
        if not to or "@" not in to:
            raise ValueError("invalid email")
        # send logic
        return True

class SmsSender:
    def send(self, to, msg):
        if not to or not to.startswith("+"):
            raise ValueError("invalid phone")
        # send logic
        return True
```

Refactorer en introduisant une classe abstraite `Sender(ABC)` qui :

- Possède une méthode concrète `send(to, msg)` qui appelle `_validate(to)` puis `_do_send(to, msg)`.
- Force les sous-classes à implémenter `_validate` et `_do_send`.

Vérifier que la logique de validation reste spécifique à chaque type, mais le pattern "valider puis envoyer" est factorisé.

---

## 8. Mini-défi de synthèse (≈ 1,5 à 2 heures)

Concevoir un système de **plugin d'export** pour un logiciel de bureautique.

**Cahier des charges** :

- Définir un `Protocol Exporter` avec une méthode `export(content: dict, output_path: Path) -> bool`.
- Définir une classe abstraite `BaseExporter(ABC)` qui :
  - Implémente `export(content, output_path)` en faisant : (1) validation du `content`, (2) appel d'une méthode `_serialize(content) -> bytes`, (3) écriture sur disque, (4) retour True/False.
  - Garde les statistiques d'export (nb tentatives, nb succès) en attribut d'instance.
  - Expose `_serialize` comme abstractmethod.

**Implémentations** :

1. `JsonExporter(BaseExporter)` — sérialise en JSON.
2. `YamlExporter(BaseExporter)` — sérialise en YAML.
3. `CsvExporter(BaseExporter)` — sérialise en CSV (pour des contents tabulaires).

**Plus un adaptateur externe non-intrusif** :

4. Une classe `LegacyXmlWriter` (qu'on suppose venir d'une lib externe et non-modifiable) qui a une méthode `export(content, output_path)` mais **n'hérite pas** de `BaseExporter`. Vérifier qu'elle satisfait le `Protocol Exporter` grâce au structural subtyping.

**Test** :

```python
exporters: list[Exporter] = [
    JsonExporter(),
    YamlExporter(),
    CsvExporter(),
    LegacyXmlWriter(),    # non-intrusive
]

for e in exporters:
    e.export({"key": "value"}, Path(f"out.{type(e).__name__}"))
```

**Validation** :

- [ ] Le `Protocol` et la classe abstraite sont tous deux utilisés et leur rôle est documenté.
- [ ] `LegacyXmlWriter` n'a pas été modifiée pour respecter le contrat.
- [ ] Les trois exporters internes partagent la logique de comptage de statistiques.
- [ ] mypy / pyright en mode strict passe sans erreur sur le code.

---

## 9. Auto-évaluation

Le module M3 est validé lorsque :

- [ ] L'apprenant distingue clairement classe abstraite et interface, avec une analogie pour chaque.
- [ ] Il choisit le bon outil parmi `abc.ABC` et `Protocol` selon le contexte (4 cas testés).
- [ ] Il maîtrise le **structural subtyping** de `Protocol` et son intérêt.
- [ ] Il sait introduire une abstraction dans un code existant **sans le modifier** (via `Protocol`).
- [ ] Il sait introduire une abstraction **avec partage de code** (via `abc.ABC`).
- [ ] Le mini-défi est implémenté avec les deux outils et validé en strict typing.

**Items du glossaire visés** (vers passage P/N → A) :

- **N2** : interface, classe abstraite.

---

## 10. Ressources complémentaires

- **Documentation Python** — `abc` et `typing.Protocol` : références officielles.
- **PEP 544** — _Protocols: Structural subtyping (static duck typing)_. Spec officielle de `Protocol`.
- **PEP 3119** — _Introducing Abstract Base Classes_. Spec historique de `abc`.
- **Mypy documentation** — section _Protocols and structural subtyping_.
- **Real Python** — articles _Abstract Base Classes in Python_ et _Python Type Checking - typing.Protocol_.
- **Fluent Python** (Luciano Ramalho, 2ᵉ édition), chapitres 13 et 14 — _Interfaces, Protocols, and ABCs_ et _Inheritance: For Better or for Worse_.
