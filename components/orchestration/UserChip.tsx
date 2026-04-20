"use client";

// Pass 22 — current-user chip + theme toggle.
//
// Fetches /api/scion/me once on mount. Renders `email — role` plus a small
// in-place theme toggle driven by `next-themes::useTheme`. Uses SWR's
// one-shot semantics (no refreshInterval) because IAP identity does not
// change in-flight.

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, UserCircle } from "lucide-react";
import type { ScionMeResponse } from "@/app/api/scion/me/route";

const fetcher = async (url: string): Promise<ScionMeResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionMeResponse;
};

export default function UserChip(): React.ReactElement {
  const { data, error } = useSWR<ScionMeResponse>("/api/scion/me", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  let label: string;
  if (error) label = "unauthenticated";
  else if (!data) label = "loading…";
  else label = `${data.email ?? "unknown"} — ${data.role}`;

  return (
    <div className="user-chip">
      <span className="user-chip__identity">
        <UserCircle size={16} /> {label}
      </span>
      {mounted ? (
        <div className="user-chip__theme" role="group" aria-label="Theme">
          <button
            type="button"
            className={
              theme === "light"
                ? "user-chip__theme-btn user-chip__theme-btn--active"
                : "user-chip__theme-btn"
            }
            onClick={() => setTheme("light")}
            aria-label="Light theme"
          >
            <Sun size={14} />
          </button>
          <button
            type="button"
            className={
              theme === "system"
                ? "user-chip__theme-btn user-chip__theme-btn--active"
                : "user-chip__theme-btn"
            }
            onClick={() => setTheme("system")}
            aria-label="System theme"
          >
            <Monitor size={14} />
          </button>
          <button
            type="button"
            className={
              theme === "dark"
                ? "user-chip__theme-btn user-chip__theme-btn--active"
                : "user-chip__theme-btn"
            }
            onClick={() => setTheme("dark")}
            aria-label="Dark theme"
          >
            <Moon size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
