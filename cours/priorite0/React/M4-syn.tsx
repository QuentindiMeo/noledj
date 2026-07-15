import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export const SelectImpl = ({ value, setValue }) => (
  <Select value={value} onChange={setValue}>
    <Select.Trigger>Choose...</Select.Trigger>
    <Select.Options>
      <Select.Option value="apple">Apple</Select.Option>
      <Select.Option value="banana">Banana</Select.Option>
      <Select.Option value="cherry">Cherry</Select.Option>
    </Select.Options>
  </Select>
);

// ? réponse ? //
// ? réponse ? //
// ? réponse ? //

function useClickOutside(onOutside) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);

  return ref;
}

const SelectContext = createContext();
const useSelectContext = () => {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error(
      `${useSelectContext.name} must be used within a ${Select.name}`,
    );
  }
  return context;
};

const useSelector = (value, onChange) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const [selectedValue, setSelectedValue] = useState(value);

  const handleSelect = useCallback(
    (newValue) => {
      setSelectedValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (newValue) => {
      setActiveItemIndex(newValue);
    },
    [setActiveItemIndex],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  return {
    isOpen: isOpen,
    onToggle: handleToggle,
    value: selectedValue,
    onSelect: handleSelect,
    activeItemIndex: activeItemIndex,
    onChangeActiveItem: handleChange,
  };
};

const SelectOption = ({ value, children }) => {
  const { value: selectedValue, onSelect, onToggle } = useSelectContext();
  const isSelected = selectedValue === value;

  const handleClick = useCallback(() => {
    onSelect(value);
    onToggle();
  }, [onSelect, onToggle]);

  return (
    <li role="option" aria-selected={isSelected} onClick={handleClick}>
      {children}
    </li>
  );
};
const SelectOptions = ({ children }) => {
  const { isOpen, onToggle, onSelect, activeItemIndex, onChangeActiveItem } =
    useSelectContext();

  const handleNavigate = useCallback(
    (event) => {
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key))
        return;
      event.preventDefault();

      if (event.key === "ArrowDown") {
        onChangeActiveItem((prev) => {
          const nextIndex = prev + 1;
          return nextIndex >= children.length ? 0 : nextIndex;
        });
      } else if (event.key === "ArrowUp") {
        onChangeActiveItem((prev) => {
          const nextIndex = prev - 1;
          return nextIndex < 0 ? children.length - 1 : nextIndex;
        });
      } else if (event.key === "Enter" && activeItemIndex >= 0) {
        const selectedChild = children[activeItemIndex];
        if (selectedChild && selectedChild.props.value) {
          onSelect(selectedChild.props.value);
          onToggle();
        }
      } else if (event.key === "Escape") {
        onToggle();
      }
    },
    [activeItemIndex, onChangeActiveItem],
  );

  if (!isOpen) return null;

  return (
    <ul role="listbox" onKeyDown={handleNavigate}>
      {children}
    </ul>
  );
};
const SelectTrigger = ({ children }) => {
  const { isOpen, onToggle } = useSelectContext();
  return (
    <button
      type="button"
      role="combobox"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      {children || "Choose..."}
    </button>
  );
};
const Select = ({ value, onChange, children }) => {
  const {
    isOpen,
    onToggle,
    value: selectedValue,
    onSelect,
    activeItemIndex,
    onChangeActiveItem: handleSelectChange,
  } = useSelector(value, onChange);
  const ctx = {
    isOpen,
    onToggle,
    value: selectedValue,
    onSelect,
    activeItemIndex,
    onChangeActiveItem: handleSelectChange,
  };

  const handleClickOutside = useCallback(() => {
    if (isOpen) {
      onToggle();
    }
  }, [isOpen, onToggle]);
  const parentRef = useClickOutside(handleClickOutside);

  return (
    <SelectContext.Provider value={ctx}>
      <div ref={parentRef}>{children}</div>
    </SelectContext.Provider>
  );
};

Select.Trigger = SelectTrigger;
Select.Options = SelectOptions;
Select.Option = SelectOption;

export const Main = () => {
  const [selectedValue, setSelectedValue] = useState("apple");

  return (
    <>
      <div style={{ height: "50vh", width: "100%" }} />
      <SelectImpl value={selectedValue} setValue={setSelectedValue} />
    </>
  );
};
