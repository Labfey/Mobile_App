import { useEffect, useState, useCallback } from "react";
import { ref, onValue, push, update } from "firebase/database";
import { db } from "../services/firebase";
import { FareGroup } from "../components/PassengerCountModal";

export type Route = "Balacbac–Town" | "Town–Balacbac";

export interface RevenueEntry {
    id: string;
    driverId: string;
    driverName: string;
    amount: number;
    passengerCount: number;
    groups: FareGroup[];
    route: Route;
    timestamp: number;
    date: string;
    tripId: string;
}

export type DateFilter = "today" | "week" | "month" | "all";

export async function recordTripRevenue({
    driverId, driverName, groups, route, tripId,
}: {
    driverId: string;
    driverName: string;
    groups: FareGroup[];
    route: Route;
    tripId: string;
}): Promise<void> {
    const amount         = groups.reduce((s, g) => s + g.passengerCount * g.farePerPassenger, 0);
    const passengerCount = groups.reduce((s, g) => s + g.passengerCount, 0);
    const date           = new Date().toISOString().split("T")[0];
    const entryRef       = push(ref(db, "revenue"));
    await update(entryRef, { driverId, driverName, amount, passengerCount, groups, route, timestamp: Date.now(), date, tripId });
}

export function getTodayString()     { return new Date().toISOString().split("T")[0]; }
export function getWeekStartString() { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().split("T")[0]; }
export function getMonthStartString(){ const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }

function getStartForFilter(filter: DateFilter): string | null {
    if (filter === "today") return getTodayString();
    if (filter === "week")  return getWeekStartString();
    if (filter === "month") return getMonthStartString();
    return null;
}

export interface RevenueStats {
    total: number; tripCount: number; totalPassengers: number; avgPerTrip: number;
    byDriver: Record<string, { name: string; total: number; trips: number; passengers: number }>;
    byDate: Record<string, number>;
}

export function aggregateRevenue(entries: RevenueEntry[]): RevenueStats {
    const byDriver: RevenueStats["byDriver"] = {};
    const byDate: RevenueStats["byDate"] = {};
    let total = 0, totalPassengers = 0;
    for (const e of entries) {
        total += e.amount; totalPassengers += e.passengerCount;
        byDate[e.date] = (byDate[e.date] ?? 0) + e.amount;
        if (!byDriver[e.driverId]) byDriver[e.driverId] = { name: e.driverName, total: 0, trips: 0, passengers: 0 };
        byDriver[e.driverId].total      += e.amount;
        byDriver[e.driverId].trips      += 1;
        byDriver[e.driverId].passengers += e.passengerCount;
    }
    return { total, tripCount: entries.length, totalPassengers, avgPerTrip: entries.length > 0 ? Math.round(total / entries.length) : 0, byDriver, byDate };
}

export function useRevenue(filter: DateFilter = "week") {
    const [allEntries, setAllEntries] = useState<RevenueEntry[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const unsub = onValue(ref(db, "revenue"), (snap) => {
            if (!snap.exists()) { setAllEntries([]); setLoading(false); return; }
            const raw = snap.val() as Record<string, Omit<RevenueEntry, "id">>;
            setAllEntries(Object.entries(raw).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.timestamp - a.timestamp));
            setLoading(false);
        });
        return () => unsub();
    }, []);
    const filtered = useCallback(() => {
        const start = getStartForFilter(filter);
        return start ? allEntries.filter(e => e.date >= start) : allEntries;
    }, [allEntries, filter]);
    const entries = filtered();
    return { entries, stats: aggregateRevenue(entries), loading, allEntries };
}

export function useDriverRevenue(driverId: string, filter: DateFilter = "today") {
    const { allEntries, loading } = useRevenue("all");
    const filtered = useCallback(() => {
        const start = getStartForFilter(filter);
        return allEntries.filter(e => e.driverId === driverId && (start ? e.date >= start : true));
    }, [allEntries, driverId, filter]);
    const entries = filtered();
    return { entries, stats: aggregateRevenue(entries), loading };
}