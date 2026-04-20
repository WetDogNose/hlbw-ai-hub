"use client";

import React from "react";
import { Coins, TrendingUp } from "lucide-react";

export interface GlobalLedgerProps {
  ledgerTotal: number;
  limit?: number;
}

const DEFAULT_LIMIT = 5_000_000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function GlobalLedger({
  ledgerTotal,
  limit = DEFAULT_LIMIT,
}: GlobalLedgerProps) {
  const pct =
    limit > 0 ? Math.min(100, Math.round((ledgerTotal / limit) * 100)) : 0;

  return (
    <div className="orchestration-panel">
      <h2 className="orchestration-panel__title orchestration-panel__title--ledger">
        <Coins size={20} /> Budget Ledger
      </h2>
      <div className="global-ledger">
        <div className="ledger-cell">
          <div className="ledger-cell__label">Total Token Burn</div>
          <div className="ledger-cell__value">
            {formatTokens(ledgerTotal)}{" "}
            <TrendingUp size={16} className="ledger-cell__trend--up" />
          </div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-cell__label">Daily Ceiling</div>
          <div className="ledger-cell__value">{formatTokens(limit)}</div>
        </div>
      </div>
      <div className="ledger-progress">
        <div className="ledger-progress__label">{pct}% of ceiling</div>
        <div className="ledger-progress__bar">
          <div className="ledger-progress__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
