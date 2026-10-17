"use client";
import {useEffect, useRef, useState} from 'react';
import './money-navigation-tabs.css';

type Tab = {value: string; label: string};

/** Manual activation keeps arrow-key exploration from changing data or context. */
export function MoneyNavigationTabs({id, label, items, selected, onSelect}: {
  id: string;
  label: string;
  items: Tab[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focus, setFocus] = useState({selected, value: selected});
  const focused = focus.selected === selected ? focus.value : selected;
  useEffect(() => {
    buttons.current.get(selected)?.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
  }, [selected]);
  return <div className="money-navigation-tabs" role="tablist" aria-label={label} aria-orientation="horizontal">
    {items.map(({value, label}, index) => <button
      key={value}
      ref={node => {if (node) buttons.current.set(value, node); else buttons.current.delete(value);}}
      type="button"
      id={`${id}-tab-${value}`}
      role="tab"
      aria-selected={selected === value}
      aria-controls={`${id}-panel`}
      tabIndex={focused === value ? 0 : -1}
      onClick={() => onSelect(value)}
      onFocus={event => {
        setFocus({selected, value});
        event.currentTarget.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
      }}
      onKeyDown={event => {
        let target: number;
        if (event.key === 'ArrowRight') target = (index + 1) % items.length;
        else if (event.key === 'ArrowLeft') target = (index + items.length - 1) % items.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = items.length - 1;
        else return;
        event.preventDefault();
        buttons.current.get(items[target].value)?.focus();
      }}
    >{label}</button>)}
  </div>;
}
