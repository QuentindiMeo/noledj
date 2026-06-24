# M9 — Patrons de conception secondaires

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Implémenter cinq patterns moins courants mais essentiels : **Adapter**, **Composite**, **Visitor**, **Command**, **Memento**.
- Les **reconnaître** dans du code existant ou dans des frameworks (SQLAlchemy, AST de Python, undo/redo des IDE...).
- Choisir entre le pattern et son **équivalent pythonique** quand celui-ci suffit.
- Identifier les **cas marginaux** où ces patterns ne valent pas le coût.

## Durée estimée

1 à 1,5 jour.

## Pré-requis

- M1 à M8 POO terminés.

---

## 1. Le contexte

M8 a couvert les 7 patterns les plus connus. M9 explore 5 patterns moins fréquents en code applicatif courant, mais que l'on rencontre régulièrement dans :

- Les **bibliothèques de parsing / AST** (Visitor).
- Les **frameworks** qui intègrent du legacy (Adapter).
- Les **éditeurs** et **applications graphiques** (Command, Memento).
- Les **systèmes hiérarchiques** (Composite).

Connaître ces patterns donne un vocabulaire commun et un **regard plus aiguisé** sur le code des bibliothèques utilisées au quotidien.

---

## 2. Adapter — structurel

### Intention

Faire **collaborer deux interfaces incompatibles** sans modifier ni l'une ni l'autre. L'Adapter sert d'intermédiaire qui traduit les appels.

**Analogie.** La prise de courant universelle pour voyager. Le chargeur français a une fiche ronde ; la prise britannique attend une fiche carrée. L'adaptateur s'intercale et **traduit** sans modifier ni le chargeur ni l'installation électrique.

### Cas d'usage

- Intégrer une **bibliothèque legacy** dont on ne contrôle pas l'API.
- Connecter un **service tiers** à une interface interne.
- Préparer une **migration progressive** en remplaçant une implémentation derrière une façade.

### Implémentation

```python
# Bibliothèque tierce qu'on ne peut pas modifier
class LegacyXmlLogger:
    def write_xml(self, content: str): ...


# Interface attendue par notre code
class Logger:
    def log(self, message: str): ...


# Adapter
class LegacyXmlLoggerAdapter(Logger):
    def __init__(self, legacy: LegacyXmlLogger):
        self._legacy = legacy

    def log(self, message: str):
        xml = f"<entry>{message}</entry>"
        self._legacy.write_xml(xml)


def application_code(logger: Logger):
    logger.log("hello")


application_code(LegacyXmlLoggerAdapter(LegacyXmlLogger()))
```

L'`application_code` parle à `Logger`. `LegacyXmlLogger` parle XML. L'adapter les marie.

### Variantes

- **Object Adapter** (illustré) — composition : l'adapter **contient** une instance de la classe à adapter.
- **Class Adapter** (Java/C++) — héritage multiple : moins courant en Python car peu pratique.

### Pythonisation — duck typing

Si l'on contrôle le code qui consomme, **on n'a pas besoin d'adapter formel** :

```python
def application_code(logger):
    logger.log("hello")     # appelle .log


class WriteXmlWrapper:
    def __init__(self, legacy):
        self._legacy = legacy

    def log(self, msg):
        self._legacy.write_xml(f"<entry>{msg}</entry>")


application_code(WriteXmlWrapper(LegacyXmlLogger()))
```

Pas d'héritage, pas de classe abstraite — Python accepte tout objet ayant `log`. C'est l'**Adapter sans le formalisme**.

### Quand l'éviter

- Si l'on **contrôle** les deux côtés de l'interface, modifier l'un directement est plus simple.
- Pour une seule fonction tierce, une **fonction wrapper** suffit.

---

## 3. Composite — structurel

### Intention

Composer des objets en **structures arborescentes** et traiter uniformément les **objets individuels** et les **groupes d'objets**.

**Analogie.** Un dossier dans un système de fichiers. Il peut contenir des **fichiers** (feuilles) et d'autres **dossiers** (nœuds). L'opération "calculer la taille totale" fonctionne de la même façon pour un fichier (sa propre taille) ou pour un dossier (somme des tailles de son contenu).

### Cas d'usage

- Arborescences de fichiers, menus, composants UI.
- DOM HTML / XML.
- AST (Abstract Syntax Tree).
- Hierarchies d'organisation (équipe → employés + sous-équipes).

### Implémentation

```python
from abc import ABC, abstractmethod


class FileSystemNode(ABC):
    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def size(self) -> int: ...

    @abstractmethod
    def print_tree(self, indent: int = 0): ...


class File(FileSystemNode):
    def __init__(self, name: str, size_bytes: int):
        super().__init__(name)
        self._size = size_bytes

    def size(self) -> int:
        return self._size

    def print_tree(self, indent: int = 0):
        print(" " * indent + f"📄 {self.name} ({self._size} bytes)")


class Directory(FileSystemNode):
    def __init__(self, name: str):
        super().__init__(name)
        self.children: list[FileSystemNode] = []

    def add(self, node: FileSystemNode):
        self.children.append(node)

    def size(self) -> int:
        return sum(child.size() for child in self.children)

    def print_tree(self, indent: int = 0):
        print(" " * indent + f"📁 {self.name}/")
        for child in self.children:
            child.print_tree(indent + 2)


# Construction
root = Directory("project")
root.add(File("README.md", 1000))
src = Directory("src")
src.add(File("main.py", 5000))
src.add(File("utils.py", 2000))
root.add(src)

print(root.size())   # 8000
root.print_tree()
```

Le code qui parcourt l'arbre ne distingue **jamais** un fichier d'un dossier — c'est la signature commune `FileSystemNode` qui fait le travail.

### Lien avec Python

Le module `ast` de Python est un Composite parfait : un programme Python est un arbre de `AST.Node`. Chaque nœud peut contenir d'autres nœuds (un `If` contient un `Compare` et des `Statement`...).

### Quand l'éviter

- Pour une hiérarchie **plate** (juste une liste).
- Si les feuilles et les nœuds ont des **opérations très différentes** — forcer une signature commune crée des méthodes vides.

---

## 4. Visitor — comportemental

### Intention

**Séparer un algorithme** de la **structure d'objets** sur laquelle il opère. Ajouter de nouvelles opérations sans modifier les classes parcourues.

**Analogie.** Un fonctionnaire qui visite tous les bureaux d'une administration. Chaque bureau (Service Compta, Service RH, Service IT) accueille le visiteur. Le visiteur applique son audit propre à chaque bureau. On peut envoyer différents visiteurs (audit financier, audit sécurité, audit RH) sans modifier les bureaux.

### Cas d'usage

- AST de compilateur : ajouter des passes (optimisation, génération de code, type checking) sans modifier les nœuds.
- Hiérarchies stables où l'on veut **ajouter régulièrement** de nouvelles opérations.

### Implémentation

```python
from abc import ABC, abstractmethod


class Visitor(ABC):
    @abstractmethod
    def visit_file(self, file: "File"): ...
    @abstractmethod
    def visit_directory(self, directory: "Directory"): ...


class FileSystemNode(ABC):
    @abstractmethod
    def accept(self, visitor: Visitor): ...


class File(FileSystemNode):
    def __init__(self, name, size): self.name, self.size = name, size
    def accept(self, visitor): visitor.visit_file(self)


class Directory(FileSystemNode):
    def __init__(self, name):
        self.name = name
        self.children: list[FileSystemNode] = []

    def accept(self, visitor):
        visitor.visit_directory(self)
        for c in self.children:
            c.accept(visitor)


# Premier visiteur — taille totale
class SizeCalculator(Visitor):
    def __init__(self): self.total = 0
    def visit_file(self, file): self.total += file.size
    def visit_directory(self, directory): pass


# Deuxième visiteur — liste des noms
class NameCollector(Visitor):
    def __init__(self): self.names = []
    def visit_file(self, file): self.names.append(file.name)
    def visit_directory(self, directory): self.names.append(directory.name)


# Usage
root = Directory("root")
root.children.append(File("a.txt", 100))
root.children.append(File("b.txt", 200))

size = SizeCalculator()
root.accept(size)
print(size.total)   # 300

names = NameCollector()
root.accept(names)
print(names.names)  # ['root', 'a.txt', 'b.txt']
```

Ajouter une nouvelle opération (compter les fichiers, comparer à une regex...) = créer une nouvelle classe `Visitor`. **Aucune modification** de `File` ni `Directory`.

### Trade-off

Visitor offre l'inverse du Composite simple :

- **Composite** — facile d'ajouter de **nouveaux types de nœuds**, dur d'ajouter de **nouvelles opérations** (il faut toucher toutes les classes).
- **Visitor** — facile d'ajouter de **nouvelles opérations** (un visitor de plus), dur d'ajouter de **nouveaux types de nœuds** (il faut mettre à jour tous les visitors).

C'est le **dilemme expression problem** : on choisit lequel des deux axes est stable, et l'autre devient malléable.

### Pythonisation — `singledispatch`

Python permet le double dispatch via `singledispatch` (cf. M7) sans la cérémonie `accept`/`visit_*` :

```python
from functools import singledispatch

@singledispatch
def calculate_size(node):
    raise NotImplementedError

@calculate_size.register
def _(node: File):
    return node.size

@calculate_size.register
def _(node: Directory):
    return sum(calculate_size(c) for c in node.children)
```

Moins canonique, plus pythonique. À considérer quand on n'a pas besoin du pattern formel.

---

## 5. Command — comportemental

### Intention

**Encapsuler une requête** sous forme d'objet. Cela permet de la **passer en paramètre**, la **stocker**, la **rejouer**, l'**annuler**, ou la **mettre en file d'attente**.

**Analogie.** Un bon de commande au restaurant. Le serveur reçoit la commande (l'objet), la porte en cuisine, le cuisinier l'exécute. La commande est un **objet indépendant** du serveur et du cuisinier — on peut la stocker, l'annuler, la repasser à un autre cuisinier.

### Cas d'usage

- **Undo/Redo** dans les éditeurs.
- **Queues de jobs** (tâches asynchrones).
- **Macros** et **scripts** dans des applications.
- **GUI** : associer un bouton à une commande au lieu d'un callback.

### Implémentation

```python
from abc import ABC, abstractmethod


class Command(ABC):
    @abstractmethod
    def execute(self): ...
    @abstractmethod
    def undo(self): ...


class Editor:
    def __init__(self):
        self.text = ""


class TypeCommand(Command):
    def __init__(self, editor: Editor, text: str):
        self.editor = editor
        self.text = text

    def execute(self):
        self.editor.text += self.text

    def undo(self):
        self.editor.text = self.editor.text[:-len(self.text)]


class DeleteLastCommand(Command):
    def __init__(self, editor: Editor):
        self.editor = editor
        self.deleted = ""

    def execute(self):
        if self.editor.text:
            self.deleted = self.editor.text[-1]
            self.editor.text = self.editor.text[:-1]

    def undo(self):
        self.editor.text += self.deleted


class History:
    def __init__(self):
        self.commands: list[Command] = []

    def execute(self, command: Command):
        command.execute()
        self.commands.append(command)

    def undo(self):
        if self.commands:
            self.commands.pop().undo()


editor = Editor()
history = History()

history.execute(TypeCommand(editor, "Hello"))
history.execute(TypeCommand(editor, " World"))
print(editor.text)    # "Hello World"
history.undo()
print(editor.text)    # "Hello"
history.undo()
print(editor.text)    # ""
```

Chaque action est un **objet Commande** qu'on peut stocker, rejouer, annuler.

### Pythonisation — fonctions et closures

```python
def type_cmd(editor, text):
    def execute(): editor.text += text
    def undo(): editor.text = editor.text[:-len(text)]
    return execute, undo


history = []
exec_, undo_ = type_cmd(editor, "Hello")
exec_()
history.append((exec_, undo_))
history[-1][1]()       # undo
```

Plus léger. Pour un undo simple, c'est suffisant. Pour un système plus riche (logging des commandes, sérialisation, GUI), le pattern classique avec classes est plus structurant.

---

## 6. Memento — comportemental

### Intention

Capturer l'**état interne** d'un objet **sans violer son encapsulation**, pour pouvoir le restaurer plus tard.

**Analogie.** La sauvegarde dans un jeu vidéo. Le moteur enregistre l'état actuel (position du personnage, inventaire, quêtes), sans que le joueur ait à connaître les détails. Plus tard, on peut **restaurer** cet état et reprendre exactement où on en était.

### Cas d'usage

- Snapshots d'état pour undo/redo (couplé à Command).
- Checkpoints dans un calcul long.
- Rollback transactionnel.
- Time-travel debugging.

### Implémentation

```python
class TextEditorMemento:
    """Snapshot opaque — interne au memento."""
    def __init__(self, text: str, cursor: int):
        self._text = text
        self._cursor = cursor


class TextEditor:
    def __init__(self):
        self.text = ""
        self.cursor = 0

    def type(self, s: str):
        self.text = self.text[:self.cursor] + s + self.text[self.cursor:]
        self.cursor += len(s)

    def save(self) -> TextEditorMemento:
        return TextEditorMemento(self.text, self.cursor)

    def restore(self, m: TextEditorMemento):
        self.text = m._text
        self.cursor = m._cursor


editor = TextEditor()
editor.type("Hello")
snapshot = editor.save()
editor.type(" World")
print(editor.text)   # "Hello World"
editor.restore(snapshot)
print(editor.text)   # "Hello"
```

Trois rôles :

- **Originator** (`TextEditor`) — l'objet dont on capture l'état.
- **Memento** (`TextEditorMemento`) — l'objet snapshot opaque.
- **Caretaker** (typiquement une pile dans un système undo) — gère les mementos sans les inspecter.

### Pythonisation — `copy.deepcopy`

Pour les cas simples, sauvegarder un objet via `copy.deepcopy` suffit :

```python
import copy

editor = TextEditor()
editor.type("Hello")
snapshot = copy.deepcopy(editor)
editor.type(" World")

editor = snapshot   # restore
print(editor.text)   # "Hello"
```

Pas de classe `Memento`. Plus simple. Mais `deepcopy` peut être coûteux et expose tout l'état — le Memento formel est utile quand on veut être **sélectif** sur ce qui est sauvegardé.

### Combinaison Command + Memento

C'est l'idiome classique pour un undo robuste. Chaque commande capture son memento avant exécution :

```python
class ReversibleCommand(Command):
    def execute(self, editor):
        self.snapshot = editor.save()
        self._do(editor)

    def undo(self, editor):
        editor.restore(self.snapshot)
```

---

## 7. Tableau de synthèse

| Pattern       | Famille        | Question                                                      | Alternative pythonique           |
| ------------- | -------------- | ------------------------------------------------------------- | -------------------------------- |
| **Adapter**   | Structurel     | "Comment connecter deux interfaces incompatibles ?"           | Wrapper minimal avec duck typing |
| **Composite** | Structurel     | "Comment traiter pareil un objet et un groupe ?"              | Récursion simple sur arbre       |
| **Visitor**   | Comportemental | "Comment ajouter des opérations sans modifier la structure ?" | `singledispatch`                 |
| **Command**   | Comportemental | "Comment encapsuler une action pour la stocker / rejouer ?"   | Tuple (fn, args) ou closure      |
| **Memento**   | Comportemental | "Comment sauvegarder/restaurer un état ?"                     | `copy.deepcopy`                  |

---

## 8. Exercices pratiques

### Exercice 1 — Identifier le pattern (≈ 20 min)

Pour chaque code, identifier le pattern :

```python
# Cas A
class JsonStringifier:
    def __init__(self, legacy_to_dict):
        self._legacy = legacy_to_dict

    def stringify(self, obj):
        return json.dumps(self._legacy.serialize(obj))
```

```python
# Cas B
class Folder:
    def __init__(self):
        self.children = []
    def size(self):
        return sum(c.size() for c in self.children)

class File:
    def __init__(self, n): self._n = n
    def size(self): return self._n
```

```python
# Cas C
class AddTodo:
    def __init__(self, app, text):
        self.app, self.text = app, text
    def execute(self): self.app.todos.append(self.text)
    def undo(self): self.app.todos.remove(self.text)
```

```python
# Cas D
class TreeNode:
    def accept(self, visitor):
        visitor.process(self)
        for c in self.children:
            c.accept(visitor)
```

### Exercice 2 — Adapter (≈ 30 min)

Soit une classe legacy non modifiable :

```python
class LegacyDatabase:
    def query_records(self, sql_string: str) -> str:
        # renvoie du XML
        return "<rows>...</rows>"
```

Et le code applicatif :

```python
class Repository(Protocol):
    def find_all(self) -> list[dict]: ...
```

Écrire un `LegacyDatabaseAdapter(Repository)` qui :

1. Traduit `find_all()` en appel `query_records("SELECT *")`.
2. Convertit le XML retourné en `list[dict]`.

Tester avec une fonction `display(repo: Repository)`.

### Exercice 3 — Composite (≈ 35 min)

Modéliser une **équipe d'entreprise** :

- `Employee` : un employé, avec un nom et un salaire.
- `Team` : une équipe contenant des `Employee` et / ou des sous-équipes.

Méthodes communes (via abstraction `TeamMember`) :

- `cost()` — coût total (salaire pour un employé, somme pour une équipe).
- `head_count()` — nombre d'employés.
- `print_org_chart(indent=0)` — affichage hiérarchique.

Tester avec un org chart à 3 niveaux.

### Exercice 4 — Visitor (≈ 40 min)

Reprendre le Composite de l'exercice 3 et **ajouter** trois opérations via Visitor :

1. `MaxSalaryVisitor` — trouve le salaire maximum.
2. `BadgeCountVisitor` — compte les employés (badges à distribuer).
3. `EmailListVisitor` — collecte tous les emails.

Ajouter une 4ᵉ opération sans modifier `Employee` ni `Team`.

### Exercice 5 — Command + Memento (≈ 45 min)

Implémenter un système d'**undo/redo** pour un éditeur de texte simple :

- Commandes : `Type(text)`, `DeleteLast()`, `Replace(old, new)`.
- Chaque commande sauvegarde un memento avant exécution.
- `History` gère deux piles : `undone` et `redone`.
- API : `editor.execute(cmd)`, `editor.undo()`, `editor.redo()`.

Tester un scénario complet : taper, supprimer, undo, undo, redo, taper (le redo doit être perdu après un nouveau type).

---

## 9. Mini-défi de synthèse (≈ 2 à 3 heures)

Choisir **un** pattern parmi les cinq et l'implémenter dans un cas réel.

### Idées de mini-projets

1. **Adapter** — exposer une API REST FastAPI au-dessus d'une bibliothèque legacy qui parle XML.
2. **Composite** — modéliser un système de menus déroulants imbriqués (Menu, MenuItem, SubMenu).
3. **Visitor** — écrire 3 visiteurs pour un AST Python (compter les imports, lister les fonctions définies, calculer la complexité cyclomatique).
4. **Command** — système de jobs avec retry et logging pour une CLI.
5. **Memento** — checkpoints réguliers pour un calcul long, avec restauration en cas d'erreur.

### Critères de validation

- [ ] Le pattern choisi est **identifiable** sans ambiguïté et **commenté** dans le code.
- [ ] Le pattern résout un **problème réel** (pas un exercice artificiel).
- [ ] Une alternative pythonique est **considérée et rejetée** (avec justification écrite).
- [ ] Au moins un **test unitaire** valide le bon fonctionnement.
- [ ] Le code reste **lisible** — le pattern simplifie plutôt qu'il ne complique.

---

## 10. Auto-évaluation

Le module M9 est validé lorsque :

- [ ] L'apprenant peut citer les 5 patterns avec une analogie pour chacun.
- [ ] Il les reconnaît dans un code donné (au moins 4 sur 5).
- [ ] Il connaît l'alternative pythonique de chaque pattern.
- [ ] Il sait formuler le **trade-off** Composite / Visitor (le dilemme expression problem).
- [ ] Le mini-défi est implémenté avec un pattern documenté et son alternative comparée.

**Items du glossaire visés** (vers passage P/N → A) :

- **N3** : patterns moins connus (Visitor, Adapter, Command, Memento, Composite).

---

## 11. Ressources complémentaires

- **Erich Gamma et al.** — _Design Patterns: Elements of Reusable Object-Oriented Software_. Chapitres dédiés à chacun de ces 5 patterns.
- **Refactoring Guru** : [refactoring.guru/design-patterns](https://refactoring.guru/design-patterns). Schémas et exemples pour chaque pattern.
- **Documentation Python `ast`** : exemple de Visitor déjà implémenté dans la stdlib.
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitre 10 — alternatives fonctionnelles aux patterns.
- **Expression Problem** — article Wikipedia : approfondir le trade-off entre extension verticale (types) et horizontale (opérations).
- **Conférence Brandon Rhodes** — _The Clean Architecture in Python_ (PyOhio 2014). Discussion des patterns dans un contexte pythonique.
