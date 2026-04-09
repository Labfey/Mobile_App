import { useEffect, useState, useCallback } from "react";
import { ref, onValue, push, update } from "firebase/database";
import { db } from "../services/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type Route = "Balacbac–Town" | "Town–Balacbac";

export interface RevenueEntry {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  passengerCount: number;
  farePerPassenger: number;
  route: Route;
  timestamp: number;
  date: string; // "YYYY-MM-DD"
  tripId: string;
}

export type DateFilter = "today" | "week" | "month" | "all";

// ─────────────────────────────────────────────────────────────────────────────
// FARE CALCULATION
// Base fares from your existing getZoneFare logic in mapscreen.tsx
// Full route (all zones) = ₱20. We use passengerCount * farePerPassenger.
// ─────────────────────────────────────────────────────────────────────────────

export function calculateRevenue(
  passengerCount: number,
  farePerPassenger: number = 20
): number {
  return passengerCount * farePerPassenger;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE — call this when a trip ends (from mapscreen.tsx endTripSilent / endTrip)
// ─────────────────────────────────────────────────────────────────────────────

export async function recordTripRevenue({
  driverId,
  driverName,
  passengerCount,
  farePerPassenger = 20,
  route,
  tripId,
}: {
  driverId: string;
  driverName: string;
  passengerCount: number;
  farePerPassenger?: number;
  route: Route;
  tripId: string;
}): Promise<void> {
  const amount = calculateRevenue(passengerCount, farePerPassenger);
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  const entryRef = push(ref(db, "revenue"));
  await update(entryRef, {
    driverId,
    driverName,
    amount,
    passengerCount,
    farePerPassenger,
    route,
    timestamp: Date.now(),
    date,
    tripId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

export function getWeekStartString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split("T")[0];
}

export function getMonthStartString(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

function getStartForFilter(filter: DateFilter): string | null {
  if (filter === "today") return getTodayString();
  if (filter === "week") return getWeekStartString();
  if (filter === "month") return getMonthStartString();
  return null; // "all" — no start bound
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

export interface RevenueStats {
  total: number;
  tripCount: number;
  totalPassengers: number;
  avgPerTrip: number;
  byDriver: Record<string, { name: string; total: number; trips: number }>;
  byDate: Record<string, number>; // date string → revenue
}

export function aggregateRevenue(entries: RevenueEntry[]): RevenueStats {
  const byDriver: RevenueStats["byDriver"] = {};
  const byDate: RevenueStats["byDate"] = {};
  let total = 0;
  let totalPassengers = 0;

  for (const e of entries) {
    total += e.amount;
    totalPassengers += e.passengerCount;

    if (!byDriver[e.driverId]) {
      byDriver[e.driverId] = { name: e.driverName, total: 0, trips: 0 };
    }
    byDriver[e.driverId].total += e.amount;
    byDriver[e.driverId].trips += 1;

    byDate[e.date] = (byDate[e.date] ?? 0) + e.amount;
  }

  return {
    total,
    tripCount: entries.length,
    totalPassengers,
    avgPerTrip: entries.length > 0 ? Math.round(total / entries.length) : 0,
    byDriver,
    byDate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — for admin dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function useRevenue(filter: DateFilter = "week") {
  const [allEntries, setAllEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Live listener
  useEffect(() => {
    const revenueRef = ref(db, "revenue");
    const unsub = onValue(revenueRef, (snap) => {
      if (!snap.exists()) {
        setAllEntries([]);
        setLoading(false);
        return;
      }
      const raw = snap.val() as Record<string, Omit<RevenueEntry, "id">>;
      const list: RevenueEntry[] = Object.entries(raw)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setAllEntries(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filter entries by date range
  const filtered = useCallback((): RevenueEntry[] => {
    const start = getStartForFilter(filter);
    if (!start) return allEntries;
    return allEntries.filter((e) => e.date >= start);
  }, [allEntries, filter]);

  const entries = filtered();
  const stats = aggregateRevenue(entries);

  return { entries, stats, loading, allEntries };
}