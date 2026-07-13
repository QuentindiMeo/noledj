import { memo, useDeferredValue, useCallback, useMemo, useRef, useState } from "react";

// *** EXERCICE 1 ***

// Cas A
function Sum({ a, b }) {
  const total = useMemo(() => a + b, [a, b]);
  return <p>{total}</p>;
}
// ! Verdict : useMemo inutile car une addition est une opération peu coûteuse.
// * Il est préférable de l'écrire directement dans le JSX : <p>{a + b}</p>.

// Cas B
function Filter({ items }) {
  const expensive = useMemo(
    () => items.filter((i) => /complex/.test(i.label) && i.priority > 3),
    [items],
  );
  return <List items={expensive} />;
}
// ! Verdict : useMemo utile car le filtrage peut être coûteux si la liste est longue.
// * Garder en mémoire le résultat du filtrage évite de recalculer à chaque rendu si la liste n'a pas changé.

// Cas C
function Date() {
  const now = useMemo(() => new Date().toISOString(), [Math.random()]);
  return <p>{now}</p>;
}
// ! Verdict : useMemo inutile car Math.random() change à chaque rendu, donc le calcul sera toujours refait.
// * Il est préférable de l'écrire directement dans le JSX : <p>{new Date().toISOString()}</p>.

export function App() {
  Sum({ a: 1, b: 2 });
  Filter({ items: [{ label: "complex", priority: 4 }] });
  Date();
}

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 2 ***

const Row = memo(function Row({ item, onSelect }) {
  return <div onClick={() => onSelect(item.id)}>{item.label}</div>;
});

type ListItem = {
  id: number;
  label: string;
  disabled: boolean;
};

const makeItems = (): ListItem[] =>
  Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
    disabled: false,
  }));

function List() {
  const [items] = useState(makeItems());
  const [displayedItems, setDisplayedItems] = useState(items);

  const handleSelect = useCallback((id: number) => {
    setDisplayedItems((prev: ListItem[]) => {
      const newItems = [...prev];
      newItems[id] = { ...newItems[id], disabled: !newItems[id].disabled };
      return newItems;
    });
  }, []);

  return displayedItems.map((item: ListItem) => (
    <Row key={item.id} item={item} onSelect={handleSelect} />
  ));
}

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 3 ***

export function Modal({ onClose }) {
  const [isOpen, setIsOpen] = useState(true);
  const firstButton = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (firstButton.current) {
      firstButton.current.focus();
    }
  }, []);

  return (
    <dialog open={isOpen}>
      <p>Modal content</p>
      <input placeholder="Enter text..." />
      <button ref={firstButton} onClick={() => alert("Button clicked")}>
        Button
      </button>
      <button onClick={handleClose}>Close</button>
    </dialog>
  );
}

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 4 ***

const RANDOM_NAMES = Array.from(
  { length: 10000 },
  () => `Name ${Math.floor(Math.random() * 100_000_000)}`,
);

function Spinner() {
  return (
    <div
      className="spinner-container"
      style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}
    >
      <div
        className="spinner"
        style={{
          width: "40px",
          height: "40px",

          backgroundColor: "rgba(0, 0, 0, 0.5)",
          borderRadius: "50%",
          animation: "bounce 1s infinite",
        }}
      />
    </div>
  );
}

export function NameList() {
  const [names] = useState(RANDOM_NAMES);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);

  const filteredNames = names.filter((name) =>
    name.toLowerCase().includes(deferredFilter.toLowerCase()),
  );

  // const filteredNames = useMemo(
  //   () =>
  //     names.filter((name) => name.toLowerCase().includes(filter.toLowerCase())),
  //   [names, filter],
  // );

  return (
    <div style={{ height: "90vh", overflowY: "scroll", marginTop: "2rem", gap: "1rem" }}>
      <input
        placeholder="Filter names..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filter !== deferredFilter && <Spinner />}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {filteredNames.map((name, index) => (
          <li
            style={{ padding: "0.5rem", border: "1px solid #999" }}
            key={index}
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
