import { useEffect, useState } from "react";

const EVT = "nav-reveal";

let current = false;

export const setNavRevealed = (value: boolean) => {
  current = value;
  window.dispatchEvent(new CustomEvent(EVT, { detail: value }));
};

export const getNavRevealed = () => current;

export function useNavRevealed() {
  const [value, setValue] = useState(current);

  useEffect(() => {
    const handler = (event: Event) => setValue((event as CustomEvent).detail as boolean);
    window.addEventListener(EVT, handler);
    return () => window.removeEventListener(EVT, handler);
  }, []);

  return value;
}
