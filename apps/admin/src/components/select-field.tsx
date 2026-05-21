"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}

export function SelectField({ label, value, options, onChange, placeholder = "Выбери значение", disabled, className = "", buttonClassName = "" }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const control = (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className={`field flex min-h-10 items-center justify-between gap-3 text-left ${buttonClassName}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "truncate text-white" : "truncate text-zinc-500"}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${open ? "rotate-180 text-focus" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-50 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#11141d] p-1 shadow-2xl shadow-black/60"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "__empty"}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${
                  isSelected ? "bg-focus/15 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
                } ${option.disabled ? "cursor-not-allowed opacity-40" : ""}`}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check size={15} className="shrink-0 text-focus" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  if (!label) {
    return control;
  }

  return (
    <div className="block text-sm text-zinc-400">
      <div>{label}</div>
      {control}
    </div>
  );
}
