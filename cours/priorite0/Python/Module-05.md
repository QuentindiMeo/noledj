# M5 — Concurrence et parallélisme

## Objectif

À la fin de ce module, l'apprenant sera capable de :

- Distinguer **concurrence** et **parallélisme**.
- Expliquer ce qu'est le **GIL** (Global Interpreter Lock) et pourquoi il existe en CPython.
- Identifier si une tâche est **I/O-bound** ou **CPU-bound** et choisir l'outil approprié.
- Utiliser `threading` et `concurrent.futures.ThreadPoolExecutor` pour des tâches I/O-bound.
- Utiliser `multiprocessing` et `concurrent.futures.ProcessPoolExecutor` pour des tâches CPU-bound.
- Mesurer l'accélération obtenue (et savoir pourquoi elle peut ne pas venir).

## Durée estimée

1,5 jours.

## Pré-requis

- M2 à M4 terminés.
- Item du plan de remédiation visé : N3 #12 (multiprocessing, multithreading, GIL).

---

## 1. Concurrence vs parallélisme

### Théorie

Deux notions souvent confondues :

- **Concurrence** : organiser plusieurs tâches qui **peuvent se chevaucher dans le temps**. À un instant donné, une seule s'exécute, mais elles sont entrelacées.
- **Parallélisme** : exécuter plusieurs tâches **réellement en même temps**, sur plusieurs cœurs ou plusieurs machines.

**Analogie.** Un chef cuisinier seul qui jongle entre plusieurs casseroles (concurrence) vs plusieurs chefs travaillant dans des cuisines séparées (parallélisme). Le premier reste plus efficace que de finir une casserole avant d'en démarrer une autre, mais il ne va pas plus vite qu'un chef seul ne peut aller. Le second double réellement la production.

Python permet les deux — mais le GIL impose une contrainte importante sur le parallélisme avec `threading`.

---

## 2. Le GIL — un seul micro pour tous

### Théorie

GIL = **Global Interpreter Lock**. C'est un verrou global dans CPython (l'implémentation Python la plus répandue) qui garantit qu'**un seul thread Python exécute du bytecode à un instant donné**.

**Pourquoi.** Le gestionnaire mémoire de CPython (reference counting) n'est pas thread-safe. Sans verrou global, deux threads modifiant simultanément le compteur de références d'un objet provoqueraient des corruptions. Le GIL est la solution la plus simple — au prix de bloquer le parallélisme thread-based.

**Analogie.** Un seul micro pour 8 orateurs dans une salle. Même si chaque orateur sait parler, un seul parle à la fois. Quand l'un fait une pause pour boire (I/O), il passe le micro à un autre — donc l'auditoire entend du contenu en continu, mais jamais deux orateurs simultanément.

### Implications pratiques

- **Threading + CPU-bound** : **pas d'accélération**. Un seul thread tourne à la fois, les autres attendent le GIL.
- **Threading + I/O-bound** : **accélération significative**. Quand un thread attend de l'I/O, il relâche le GIL et un autre thread peut tourner.
- **Multiprocessing** : pas concerné. Chaque processus a son propre interpréteur, donc son propre GIL.
- **Bibliothèques natives** (NumPy, certaines parties de la stdlib) : peuvent relâcher le GIL pendant leurs calculs en C, ce qui restitue un peu de parallélisme.

### Évolution

- **PEP 703** (Python 3.13+) : rendre le GIL **optionnel**. Le mode "free-threaded" est disponible en expérimental ; il pourrait devenir le défaut à terme.
- D'autres implémentations Python (Jython, IronPython) n'ont jamais eu de GIL.
- Le GIL reste utile pour la simplicité du modèle mémoire CPython — son retrait demande un refactor profond.

---

## 3. I/O-bound vs CPU-bound — la distinction critique

### Théorie

| Type          | Caractéristique                                                  | Exemples                                                                    | Outil optimal            |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| **I/O-bound** | Attend des opérations externes ; CPU inactif la plupart du temps | Requêtes HTTP, lecture/écriture disque, requêtes SQL, appels d'API          | `threading` ou `asyncio` |
| **CPU-bound** | Calcule continuellement ; CPU saturé                             | Compression, hashing massif, traitement d'images, ML, calculs scientifiques | `multiprocessing`        |

### Test pratique

Lancer la tâche **deux fois** simultanément :

- Si le temps total est presque identique à une seule exécution → I/O-bound (les deux peuvent partager le CPU pendant les attentes).
- Si le temps total est ≈ doublé → CPU-bound (le CPU est déjà saturé).

Ou plus simple : ajouter des cœurs (ou des threads) et mesurer.

- Le temps diminue → CPU-bound, le travail peut se paralléliser.
- Le temps ne bouge pas → la limite est ailleurs (I/O, réseau, locks).

---

## 4. `threading` — pour les tâches I/O-bound

### Démonstration

```python
import threading
import time

def download(url):
    time.sleep(1)  # simule l'attente d'une réponse HTTP
    print(f"Téléchargé {url}")

threads = [threading.Thread(target=download, args=(f"url-{i}",)) for i in range(5)]

start = time.perf_counter()
for t in threads:
    t.start()
for t in threads:
    t.join()
print(f"Total : {time.perf_counter() - start:.2f}s")
# Total ≈ 1.0s (au lieu de 5.0s en séquentiel)
```

`time.sleep` relâche le GIL — c'est l'équivalent d'une attente I/O. Les 5 threads "dorment" en parallèle.

### Forme moderne — `ThreadPoolExecutor`

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(download, [f"url-{i}" for i in range(5)]))
```

Plus concis, gestion automatique du cycle de vie, récupération des résultats simple. À privilégier sur `threading.Thread` brut dans la majorité des cas.

### Synchronisation — `threading.Lock`

Quand plusieurs threads modifient une donnée partagée, il faut sérialiser les accès :

```python
import threading

counter = 0
lock = threading.Lock()

def bump():
    global counter
    with lock:
        counter += 1   # opération non atomique en bytecode

threads = [threading.Thread(target=bump) for _ in range(1000)]
for t in threads: t.start()
for t in threads: t.join()

print(counter)   # 1000, garanti par le lock
```

Sans le lock, le résultat oscillerait sous 1000 — l'incrément `counter += 1` n'est pas atomique au niveau bytecode (lecture, addition, écriture).

### Limites pratiques

- Quelques milliers de threads au plus (chaque thread OS coûte ~1 MB de stack par défaut).
- Au-delà, préférer `asyncio` (cf. parcours FastAPI).
- Aucun gain sur du CPU-bound — démonstration dans le mini-défi.

---

## 5. `multiprocessing` — pour les tâches CPU-bound

### Démonstration

```python
from multiprocessing import Process
import time

def compute(n):
    return sum(i * i for i in range(n))

if __name__ == "__main__":
    processes = [Process(target=compute, args=(10_000_000,)) for _ in range(4)]

    start = time.perf_counter()
    for p in processes: p.start()
    for p in processes: p.join()
    print(f"Total : {time.perf_counter() - start:.2f}s")
```

Sur une machine 4 cœurs, on observe ≈ 4× d'accélération vs une exécution séquentielle. Chaque processus a son propre GIL et tourne sur un cœur distinct.

### Forme moderne — `ProcessPoolExecutor`

```python
from concurrent.futures import ProcessPoolExecutor

if __name__ == "__main__":
    with ProcessPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compute, [10_000_000] * 4))
```

### Le `if __name__ == "__main__"`

Sur Windows et macOS (depuis Python 3.8), `multiprocessing` utilise `spawn` par défaut : chaque processus fils ré-importe le module principal. Sans la garde `if __name__ == "__main__"`, le code se relancerait en boucle infinie à chaque fork.

### Coûts à connaître

- **Sérialisation (`pickle`).** Les arguments et résultats sont sérialisés pour passer entre processus. Les fonctions définies dans un shell interactif, les lambdas, certaines closures **ne sont pas picklables** et provoquent des erreurs.
- **Démarrage** : créer un processus est beaucoup plus coûteux que créer un thread (≈ 100 ms vs ≈ 1 ms).
- **Mémoire** : chaque processus a son propre espace mémoire — un dataset partagé doit être dupliqué (ou utiliser `multiprocessing.shared_memory`).

**Règle pratique.** `multiprocessing` ne vaut le coup que si chaque tâche unitaire dure au moins quelques centaines de millisecondes. Pour des tâches de microsecondes, l'overhead dépasse le gain.

---

## 6. Mention rapide — `asyncio`

Pour les workloads I/O-bound massifs (milliers de connexions simultanées), `asyncio` est souvent préférable à `threading` :

- Pas de threads OS (un seul thread, scheduler coopératif).
- Moins de pièges de synchronisation.
- Tooling moderne (FastAPI, aiohttp, asyncpg, httpx).

`asyncio` sera approfondi dans le parcours **FastAPI** (modules M10 et au-delà). On retient ici : si on dépasse quelques centaines de connexions concurrentes I/O, `asyncio` est la bonne réponse.

---

## 7. Heuristique de choix

| Workload                               | Outil optimal                                                              | À éviter                             |
| -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| I/O-bound, peu de tâches (< 50)        | `threading` ou `asyncio`                                                   | `multiprocessing` (overhead inutile) |
| I/O-bound, beaucoup de tâches (> 100)  | `asyncio`                                                                  | `threading` (limite de threads OS)   |
| CPU-bound, calcul lourd, peu de tâches | `multiprocessing`                                                          | `threading` (GIL)                    |
| CPU-bound, beaucoup de tâches courtes  | NumPy / vectorisation, ou `multiprocessing` avec chunking                  | `multiprocessing` sans chunking      |
| Mix I/O + CPU                          | `multiprocessing` pour le CPU, `asyncio`/`threading` dans chaque processus | Un seul outil                        |

### Trois questions à se poser avant de paralléliser

1. **Est-ce vraiment lent ?** Profiler d'abord avec `cProfile` ou `time.perf_counter()`. La parallélisation n'a de sens que si l'on a mesuré un goulet d'étranglement.
2. **Le code est-il I/O-bound ou CPU-bound ?** La réponse détermine l'outil. Se tromper coûte de la complexité sans gain.
3. **Le coût d'orchestration est-il rentable ?** Coût de création du thread/process vs durée de la tâche. Pour des tâches très courtes, la séquentielle reste optimale.

---

## 8. Exercices pratiques

### Exercice 1 — Mesurer une tâche I/O-bound (≈ 20 min)

Écrire trois versions de la fonction suivante :

```python
import time

def fake_request(i):
    time.sleep(0.5)
    return i

# Tâche : exécuter fake_request pour i ∈ range(10) et collecter les résultats.
```

1. **Séquentielle** (boucle simple).
2. **Threading** via `ThreadPoolExecutor(max_workers=10)`.
3. **Multiprocessing** via `ProcessPoolExecutor(max_workers=4)`.

Mesurer le temps total des trois versions. Constater :

- Séquentielle ≈ 5 s.
- Threading ≈ 0,5 s.
- Multiprocessing ≈ 0,5 s mais avec un overhead de démarrage notable (souvent ≈ 1-2 s en plus).

**Conclusion** : pour I/O-bound, threading est aussi rapide que multiprocessing et bien moins coûteux.

### Exercice 2 — Mesurer une tâche CPU-bound (≈ 20 min)

Reprendre la structure ci-dessus avec :

```python
def heavy(n):
    return sum(i * i for i in range(n))

# Tâche : 4 appels avec n = 10_000_000
```

1. Séquentielle.
2. Threading (`ThreadPoolExecutor(max_workers=4)`).
3. Multiprocessing (`ProcessPoolExecutor(max_workers=4)`).

Constater :

- Séquentielle : `T` secondes.
- Threading : **≈ `T`** secondes — pas d'accélération (le GIL bloque le parallélisme CPU).
- Multiprocessing : **≈ `T / nb_cœurs`** secondes.

**Conclusion** : threading n'aide pas sur du CPU-bound. Le GIL est démontré expérimentalement.

### Exercice 3 — Synchronisation avec `Lock` (≈ 20 min)

Écrire un compteur partagé entre 10 threads, chacun incrémentant 10 000 fois.

1. **Sans lock** : exécuter, observer un résultat < 100 000 (course condition).
2. **Avec `threading.Lock`** : exécuter, vérifier 100 000 exact.

Bonus : remplacer par `threading.RLock` et expliquer la différence (lock réentrant — peut être pris plusieurs fois par le même thread sans deadlock).

### Exercice 4 — Picklabilité (≈ 20 min)

Tenter de paralléliser via `ProcessPoolExecutor` les fonctions suivantes :

```python
def f1(x):
    return x * 2

f2 = lambda x: x * 2

class Counter:
    def __init__(self):
        self.n = 0

    def step(self, x):
        return x * 2
```

- `f1` fonctionne (fonction nommée de top-level).
- `f2` lève `PicklingError` (lambda non picklable).
- `Counter().step` lève `PicklingError` dans certaines configurations (méthode liée).

Documenter les conclusions et proposer une alternative pour `f2` (par exemple `functools.partial` sur une fonction nommée).

### Exercice 5 — Chunking (≈ 30 min)

Comparer `pool.map(func, iterable)` avec et sans `chunksize` sur une tâche CPU-bound de 100 000 éléments courts (chaque tâche dure ≈ 1 µs).

- Sans `chunksize` : overhead de transmission inter-process à chaque élément → peut être **plus lent** que la version séquentielle.
- Avec `chunksize=1000` : chaque worker reçoit des paquets de 1000, l'overhead est amorti.

**Conclusion** : pour des tâches courtes, le chunking est indispensable.

---

## 9. Mini-défi de synthèse (≈ 1 à 2 heures)

Implémenter un mini-pipeline de scraping/traitement :

1. **Étape I/O** — Télécharger 20 pages (simuler avec `time.sleep(0.5)` + retour d'une string aléatoire). Paralléliser avec `ThreadPoolExecutor`.
2. **Étape CPU** — Pour chaque page, calculer le hash SHA-256 d'une grande chaîne dérivée (par exemple `(page * 100_000).encode()`). Paralléliser avec `ProcessPoolExecutor`.
3. **Mesure** — Comparer 4 versions :
   - Séquentielle pure.
   - Étape I/O parallèle, étape CPU séquentielle.
   - Étape I/O séquentielle, étape CPU parallèle.
   - Les deux parallèles.

Validation attendue :

- La version (4) est la plus rapide.
- La version (1) est la plus lente.
- La version (2) accélère surtout la phase I/O ; la version (3) accélère surtout la phase CPU.
- L'apprenant peut justifier chaque résultat en termes de GIL et de type de workload.

---

## 10. Auto-évaluation

Le module M5 est validé lorsque :

- [ ] L'apprenant peut expliquer la différence concurrence / parallélisme avec une analogie.
- [ ] Il peut expliquer le rôle et le coût du GIL en une minute, sans notes.
- [ ] Il sait identifier I/O-bound vs CPU-bound sur un cas donné.
- [ ] Il utilise `ThreadPoolExecutor` et `ProcessPoolExecutor` sans hésiter sur la syntaxe.
- [ ] Il connaît les trois principaux coûts de `multiprocessing` (pickle, démarrage, mémoire).
- [ ] Il peut citer un cas où threading est inutile et un cas où multiprocessing est inutile.
- [ ] Le mini-défi est exécuté et les résultats sont cohérents avec la théorie.

**Item du glossaire visé** (passage P/N → A) : N3 #12 (multiprocessing, multithreading, GIL).

---

## 11. Ressources complémentaires

- **Documentation officielle** : _threading_, _multiprocessing_, _concurrent.futures_ — sections de référence de la stdlib.
- **PEP 703** — _Making the Global Interpreter Lock Optional in CPython_ (contexte sur l'évolution du GIL).
- _Fluent Python_ (Luciano Ramalho, 2ᵉ édition), chapitres 19 à 21 — _Concurrency Models in Python_.
- **Real Python** — articles _Speed Up Your Python Program With Concurrency_ et _An Intro to Threading in Python_.
- **David Beazley** — _Understanding the Python GIL_ (conférence PyCon 2010, toujours pertinente pour saisir le mécanisme).
