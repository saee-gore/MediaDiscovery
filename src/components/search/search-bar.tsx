"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock, Search, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { cx } from "@/lib/format";

/**
 * The semantic search field.
 *
 * Written as a natural-language prompt rather than a keyword box: the rotating
 * placeholder teaches the interaction by example, and the suggestion chips give
 * someone a way in when they don't know what to type. Recent searches come from
 * the server, so they follow the account rather than the browser.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholders,
  suggestions = [],
  recent = [],
  onClearRecent,
  loading,
  label = "What are you in the mood for?",
  autoFocus,
  size = "lg",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  placeholders: string[];
  suggestions?: string[];
  recent?: string[];
  onClearRecent?: () => void;
  loading?: boolean;
  label?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (placeholders.length <= 1 || value) return;
    const timer = setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % placeholders.length),
      3800,
    );
    return () => clearInterval(timer);
  }, [placeholders.length, value]);

  const showPanel = focused && !value && (suggestions.length > 0 || recent.length > 0);

  return (
    <div className="relative w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
        role="search"
      >
        <label htmlFor="semantic-search" className="sr-only">
          {label}
        </label>
        <div
          className={cx(
            "flex items-center gap-2 rounded-2xl border bg-surface transition-colors",
            size === "lg" ? "px-4 py-2.5" : "px-3 py-2",
            focused ? "border-accent" : "border-line hover:border-line-strong",
          )}
        >
          <Sparkles
            className={cx("h-4 w-4 shrink-0", focused ? "text-accent" : "text-subtle")}
            aria-hidden
          />
          <input
            id="semantic-search"
            ref={inputRef}
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            placeholder={placeholders[placeholderIndex] ?? "Describe what you want"}
            className={cx(
              "min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-subtle",
              size === "lg" ? "text-base" : "text-sm",
            )}
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="rounded p-1 text-subtle hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size={size === "lg" ? "md" : "sm"}
            loading={loading}
            disabled={!value.trim()}
          >
            <span className="hidden sm:inline">Search</span>
            <Search className="h-4 w-4 sm:hidden" aria-hidden />
          </Button>
        </div>
      </form>

      {showPanel ? (
        <div
          className="animate-fade-up absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line bg-bg-elevated"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {recent.length ? (
            <div className="border-b border-line p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                  Recent
                </span>
                {onClearRecent ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onClearRecent}
                    className="text-[11px] text-subtle hover:text-ink"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {recent.slice(0, 4).map((query) => (
                <button
                  key={query}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(query);
                    onSubmit(query);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                  <span className="truncate">{query}</span>
                </button>
              ))}
            </div>
          ) : null}

          {suggestions.length ? (
            <div className="p-2">
              <span className="block px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">
                Try
              </span>
              {suggestions.slice(0, 5).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(suggestion);
                    onSubmit(suggestion);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <span className="truncate">{suggestion}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
