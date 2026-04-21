"use client";

// Small controlled dropdown of AgentPersonas. Used by ExecuteDialog to
// optionally pin a new Issue to a specific persona. Blank value = "auto-
// assign" (no `assignedAgentId` sent); the runtime's singleton __system
// persona is already filtered out by the list route.

import React from "react";
import useSWR from "swr";
import type { PersonaListResponse } from "@/app/api/scion/personas/route";

const fetcher = async (url: string): Promise<PersonaListResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as PersonaListResponse;
};

export interface PersonaPickerProps {
  /** Current selection — empty string = auto-assign. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Optional label text; omit for an unlabelled embed. */
  label?: string;
}

export default function PersonaPicker({
  value,
  onChange,
  id,
  className,
  disabled,
  label,
}: PersonaPickerProps): React.ReactElement {
  const { data, error } = useSWR<PersonaListResponse>(
    "/api/scion/personas",
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );

  const selectId = id ?? "persona-picker";
  const personas = data?.personas ?? [];
  const isEmpty = personas.length === 0;

  const selectNode = (
    <select
      id={selectId}
      className={className ?? "execute-dialog__input"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">(auto-assign)</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {p.role}
        </option>
      ))}
      {isEmpty ? (
        <option value="" disabled>
          (no personas defined)
        </option>
      ) : null}
    </select>
  );

  if (label === undefined) {
    return selectNode;
  }

  return (
    <label className="execute-dialog__label" htmlFor={selectId}>
      {label}
      {error ? (
        <span className="execute-dialog__toast execute-dialog__toast--error">
          failed to load personas
        </span>
      ) : null}
      {selectNode}
    </label>
  );
}
