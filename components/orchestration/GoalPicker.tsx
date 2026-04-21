"use client";

// SCION goal picker — small dropdown that SWR-fetches the goals list and
// exposes `{ value, onChange }`. The empty string denotes "(no goal)" so
// callers can treat missing selection uniformly.

import React from "react";
import useSWR from "swr";
import type { ScionGoalsResponse } from "@/app/api/scion/goals/route";

export interface GoalPickerProps {
  value: string;
  onChange: (goalId: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const fetcher = async (url: string): Promise<ScionGoalsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionGoalsResponse;
};

export default function GoalPicker({
  value,
  onChange,
  id,
  className,
  disabled,
}: GoalPickerProps): React.ReactElement {
  const { data } = useSWR<ScionGoalsResponse>("/api/scion/goals", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });
  const goals = data?.goals ?? [];
  return (
    <select
      id={id}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">(no goal)</option>
      {goals.map((g) => (
        <option key={g.id} value={g.id}>
          {g.description}
        </option>
      ))}
    </select>
  );
}
