import {
  cloneElement,
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// *** EXERCICE 1 *** //

class TimerC extends Component {
  state = { seconds: 0 };

  componentDidMount() {
    this.id = setInterval(() => {
      this.setState((prev) => ({ seconds: prev.seconds + 1 }));
    }, 1000);
  }

  componentWillUnmount() {
    clearInterval(this.id);
  }

  render() {
    return <p>{this.state.seconds}s</p>;
  }
}

// ? réponse ? //
// ? réponse ? //
// ? réponse ? //

const useTimer = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, []);
  return seconds;
};

const TimerF = () => {
  const seconds = useTimer();

  return <p>{seconds}s</p>;
};

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 2 *** //

const AccordionContext = createContext();
const useAccordionContext = () => {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("useAccordionContext must be used within an Accordion");
  }
  return context;
};

const AccordionPanel = ({ children, isOpen }) => {
  return isOpen ? <div>{children}</div> : null;
};
const AccordionHeader = ({ children, onSelect, value }) => {
  const { openItem } = useAccordionContext();
  return (
    <div onClick={() => onSelect(value)} aria-expanded={value === openItem}>
      {children}
    </div>
  );
};
const AccordionItem = ({ children, value, isOpen, onSelect }) => {
  const { openItem } = useAccordionContext();

  return (
    <div>
      {children.map((child) => {
        if (child.type === AccordionHeader) {
          return cloneElement(child, { value, onSelect });
        }
        if (child.type === AccordionPanel) {
          return cloneElement(child, { isOpen: value === openItem });
        }
      })}
    </div>
  );
};

const Accordion = ({ children }) => {
  const [openItem, setOpenItem] = useState(null);

  const handleSelect = useCallback((value) => {
    setOpenItem((prev) => (prev === value ? null : value));
  }, []);

  return (
    <AccordionContext.Provider value={{ openItem, handleSelect }}>
      <div>
        {children.map((child) => {
          if (child.type === AccordionItem) {
            return cloneElement(child, {
              isOpen: child.props.value === openItem,
              onSelect: handleSelect,
            });
          }
          return child;
        })}
      </div>
    </AccordionContext.Provider>
  );
};

Accordion.Header = AccordionHeader;
Accordion.Panel = AccordionPanel;
Accordion.Item = AccordionItem;

export const AccordionImpl = () => (
  <Accordion>
    <Accordion.Item value="a">
      <Accordion.Header>Section A</Accordion.Header>
      <Accordion.Panel>Content A</Accordion.Panel>
    </Accordion.Item>
    <Accordion.Item value="b">
      <Accordion.Header>Section B</Accordion.Header>
      <Accordion.Panel>Content B</Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 3 *** //

/**
 * ? Avantages : N/A
 * ? Inconvénients : verbeux, typage pénible à lire
 */
const Toggle = ({ children }) => {
  const [on, setOn] = useState(false);
  const toggle = useCallback(() => setOn((prev) => !prev), []);

  return children({ on, toggle });
};
export const ToggleRenderPropsImpl = () => (
  <Toggle>
    {({ on, toggle }) => <button onClick={toggle}>{on ? "On" : "Off"}</button>}
  </Toggle>
);

/**
 * ? Avantages : modulaire, moderne, scalable, typage clair, décomposition facile
 * ? Inconvénients : N/A
 */
const useToggle = (): [boolean, () => void] => {
  const [on, setOn] = useState(false);
  const toggle = useCallback(() => setOn((prev) => !prev), []);
  return [on, toggle];
};
export const ToggleHookImpl = () => {
  const [on, toggle] = useToggle();
  return <button onClick={toggle}>{on ? "On" : "Off"}</button>;
};

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 4 *** //

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    } else {
      return this.props.children;
    }
  }
}

const CrashyComponent = () => {
  useEffect(() => {
    throw new Error("Boom");
  }, []);

  return <p>CrashyComponent</p>;
};

export const ErrorBoundaryImpl = () => (
  <ErrorBoundary fallback={<p>Oops</p>}>
    <CrashyComponent />
  </ErrorBoundary>
);

// ! séparateur ! //
// ! séparateur ! //
// ! séparateur ! //

// *** EXERCICE 5 *** //

const MyPage = () => {
  return <p>MyPage</p>;
};

/**
 * ? Avantages : modulaire, scalable
 * ? Inconvénients : lisibilité si plusieurs HOC imbriqués, typage pénible à lire
 */
function withLogger(Component) {
  return function (props) {
    useEffect(() => {
      console.log(`${Component.name} mounted`);
      return () => console.log(`${Component.name} unmounted`);
    }, []);
    return <Component {...props} />;
  };
}
export const PageHoc = withLogger(MyPage);

/**
 * ? Avantages : modulaire, scalable, lisibilité, typage clair
 * ? Inconvénients : N/A
 */
const useMountLogger = (name) => {
  useEffect(() => {
    console.log(`${name} mounted`);
    return () => console.log(`${name} unmounted`);
  }, [name]);
};
const MyPageHook = () => {
  useMountLogger(MyPageHook.name);
  return <p>MyPageHook</p>;
}