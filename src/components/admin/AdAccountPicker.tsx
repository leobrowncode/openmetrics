"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterAccountsByQuery, type AccountMatchMode } from "@/lib/account-search";
import { plainDashes } from "@/lib/text";
import { cx, inputClass } from "../ui";

export interface AdAccountOption {
  connectionId: string;
  connectionLabel: string;
  metaAccountId: string;
  name: string;
  currency: string;
}

export function AdAccountPicker({
  accounts,
  onSelect,
}: {
  accounts: AdAccountOption[];
  onSelect?: (account: AdAccountOption | null) => void;
}) {
  const reactId = useId();
  const listId = `${reactId}-accounts`;
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { items: visible, mode } = useMemo(() => filterAccountsByQuery(accounts, query), [accounts, query]);
  const safeIndex = visible.length === 0 ? 0 : Math.min(activeIndex, visible.length - 1);
  const active = visible[safeIndex];
  const selected = accounts.find((account) => account.metaAccountId === selectedId) ?? null;
  const showConnection = new Set(accounts.map((account) => account.connectionId)).size > 1;

  useEffect(() => {
    if (!active) return;
    optionRefs.current.get(active.metaAccountId)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(account: AdAccountOption | null) {
    setSelectedId(account?.metaAccountId ?? null);
    onSelect?.(account);
  }

  function move(delta: number) {
    setActiveIndex((current) => {
      const max = Math.max(visible.length - 1, 0);
      const base = Math.min(current, max);
      return Math.min(max, Math.max(0, base + delta));
    });
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter" && active) {
      if (selected?.metaAccountId === active.metaAccountId) return;
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="metaAccountId" value={selected?.metaAccountId ?? ""} />
      <input type="hidden" name="connectionId" value={selected?.connectionId ?? ""} />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-2">
          <input
            ref={searchRef}
            role="combobox"
            aria-label="Rechercher un compte"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(reactId, active.metaAccountId) : undefined}
            className={cx(inputClass, "py-1.5")}
            placeholder="Tapez une lettre, par exemple L"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
        </div>
        <p className="px-3 pt-2 text-xs text-slate-500">{matchCaption(visible.length, mode, query)}</p>
        <div
          id={listId}
          role="listbox"
          aria-label="Comptes publicitaires disponibles"
          className="max-h-72 space-y-0.5 overflow-y-auto p-1"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
              return;
            }
            if (event.key === "Enter" && active) {
              event.preventDefault();
              choose(active);
              return;
            }
            if (event.key === "Backspace") {
              event.preventDefault();
              setQuery((current) => current.slice(0, -1));
              setActiveIndex(0);
              searchRef.current?.focus();
              return;
            }
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              setQuery((current) => current + event.key);
              setActiveIndex(0);
              searchRef.current?.focus();
            }
          }}
        >
          {visible.map((account, index) => {
            const isSelected = account.metaAccountId === selectedId;
            const isActive = index === safeIndex;
            return (
              <div
                key={account.metaAccountId}
                id={optionId(reactId, account.metaAccountId)}
                role="option"
                aria-selected={isSelected}
                ref={(node) => {
                  if (node) optionRefs.current.set(account.metaAccountId, node);
                  else optionRefs.current.delete(account.metaAccountId);
                }}
                className={cx(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left",
                  isActive && !isSelected && "bg-slate-100",
                  isSelected && "bg-brand-50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(account)}
              >
                <input
                  type="radio"
                  tabIndex={-1}
                  className="mt-1"
                  checked={isSelected}
                  readOnly
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-900">{plainDashes(account.name)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {account.metaAccountId} · {account.currency}
                    {showConnection ? ` · ${plainDashes(account.connectionLabel)}` : ""}
                  </span>
                </span>
              </div>
            );
          })}
          {visible.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Aucun compte ne correspond à « {query.trim()} ».</p>}
        </div>
      </div>
      {selected && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <p>
            Sélection : <span className="font-medium text-slate-800">{plainDashes(selected.name)}</span>
          </p>
          <button type="button" className="text-slate-500 underline-offset-2 hover:underline" onClick={() => choose(null)}>
            Effacer la sélection
          </button>
        </div>
      )}
    </div>
  );
}

function optionId(prefix: string, metaAccountId: string): string {
  return `${prefix}-${metaAccountId}`;
}

function matchCaption(count: number, mode: AccountMatchMode, query: string): string {
  const label = `${count} compte(s)`;
  if (mode === "prefix") return `${label} commençant par « ${query.trim()} »`;
  if (mode === "contains") return `Aucun nom ne commence par « ${query.trim()} ». ${label} contiennent ce texte.`;
  return `${label}, ordre alphabétique`;
}
