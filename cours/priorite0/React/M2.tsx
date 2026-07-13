import { useState } from "react";
import "./App.css";

type TodoElem = {
  id: string;
  label: string;
  priority: number;
  done: boolean;
};

const TODO_ELEMS: TodoElem[] = [
  { id: "el1", label: "Element AA", priority: 1, done: false },
  { id: "el2", label: "Element AB", priority: 2, done: false },
  { id: "el3", label: "Element AC", priority: 3, done: false },
  { id: "el4", label: "Element AD", priority: 4, done: false },
  { id: "el5", label: "Element AE", priority: 5, done: false },
  { id: "el6", label: "Element AF", priority: 6, done: false },
  { id: "el7", label: "Element AG", priority: 7, done: false },
  { id: "el8", label: "Element AH", priority: 8, done: false },
  { id: "el9", label: "Element AI", priority: 9, done: false },
  { id: "el10", label: "Element AJ", priority: 10, done: false },
  { id: "el11", label: "Element AK", priority: 11, done: false },
  { id: "el12", label: "Element AL", priority: 12, done: false },
  { id: "el13", label: "Element AM", priority: 13, done: false },
  { id: "el14", label: "Element AN", priority: 14, done: false },
  { id: "el15", label: "Element AO", priority: 15, done: false },
  { id: "el16", label: "Element AP", priority: 16, done: false },
  { id: "el17", label: "Element AQ", priority: 17, done: false },
  { id: "el18", label: "Element AR", priority: 18, done: false },
  { id: "el19", label: "Element AS", priority: 19, done: false },
  { id: "el20", label: "Element AT", priority: 20, done: false },
  { id: "el21", label: "Element AU", priority: 21, done: false },
  { id: "el22", label: "Element AV", priority: 22, done: false },
  { id: "el23", label: "Element AW", priority: 23, done: false },
  { id: "el24", label: "Element AX", priority: 24, done: false },
  { id: "el25", label: "Element AY", priority: 25, done: false },
  { id: "el26", label: "Element AZ", priority: 26, done: false },
  { id: "el27", label: "Element BA", priority: 27, done: false },
  { id: "el28", label: "Element BB", priority: 28, done: false },
  { id: "el29", label: "Element BC", priority: 29, done: false },
  { id: "el30", label: "Element BD", priority: 30, done: false },
  { id: "el31", label: "Element BE", priority: 31, done: false },
  { id: "el32", label: "Element BF", priority: 32, done: false },
  { id: "el33", label: "Element BG", priority: 33, done: false },
  { id: "el34", label: "Element BH", priority: 34, done: false },
  { id: "el35", label: "Element BI", priority: 35, done: false },
  { id: "el36", label: "Element BJ", priority: 36, done: false },
  { id: "el37", label: "Element BK", priority: 37, done: false },
  { id: "el38", label: "Element BL", priority: 38, done: false },
  { id: "el39", label: "Element BM", priority: 39, done: false },
  { id: "el40", label: "Element BN", priority: 40, done: false },
  { id: "el41", label: "Element BO", priority: 41, done: false },
  { id: "el42", label: "Element BP", priority: 42, done: false },
  { id: "el43", label: "Element BQ", priority: 43, done: false },
  { id: "el44", label: "Element BR", priority: 44, done: false },
  { id: "el45", label: "Element BS", priority: 45, done: false },
  { id: "el46", label: "Element BT", priority: 46, done: false },
  { id: "el47", label: "Element BU", priority: 47, done: false },
  { id: "el48", label: "Element BV", priority: 48, done: false },
  { id: "el49", label: "Element BW", priority: 49, done: false },
  { id: "el50", label: "Element BX", priority: 50, done: false },
];

function App() {
  const [todoEls, setTodoEls] = useState([...TODO_ELEMS]);
  const [isFiltered, setIsFiltered] = useState(false);

  const handleDeleteElem = (id: string) => {
    setTodoEls(todoEls.filter((elem) => elem.id !== id));
  };

  const handleSortByPriority = () => {
    setTodoEls([...todoEls].sort((a, b) => a.priority - b.priority));
  };

  const handleSortByLabel = () => {
    setTodoEls([...todoEls].sort((a, b) => a.label.localeCompare(b.label)));
  };

  const handleSortById = () => {
    setTodoEls([...todoEls].sort((a, b) => a.id.localeCompare(b.id)));
  };

  const handleFilterByDone = () => {
    if (isFiltered) {
      setTodoEls([...TODO_ELEMS]);
      setIsFiltered(false);
      return;
    }
    setIsFiltered(true);
    setTodoEls(todoEls.filter((elem) => elem.done));
  };

  return (
    <>
      <div>
        <p>Sort By</p>
        <button onClick={handleSortByPriority}>Priority</button>
        <button onClick={handleSortByLabel}>Label</button>
        <button onClick={handleSortById}>Id</button>
      </div>

      <div>
        <p>Filter By</p>
        <button onClick={handleFilterByDone}>Done</button>
      </div>

      <ul>
        {todoEls.map((todo) => (
          <li key={todo.id}>
            <p>
              {`${todo.label} - Priority: ${todo.priority} - Done: ${todo.done.toString()}`}
            </p>
            <input type="text" />
            <button onClick={() => handleDeleteElem(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default App;
