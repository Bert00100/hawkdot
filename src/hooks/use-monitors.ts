"use client";
import { useCallback } from "react";
import { monitorsApi, type ListMonitorsParams } from "@/lib/api/monitors";
import { useRemoteData } from "@/hooks/use-remote-data";

export function useMonitors(params: ListMonitorsParams) {
    const key = JSON.stringify(params);
    const load = useCallback((signal: AbortSignal) => monitorsApi.list(JSON.parse(key), signal), [key]);
    return useRemoteData(load, 15_000);
}
export function useMonitor(id: string) {
    const load = useCallback((signal: AbortSignal) => monitorsApi.get(id, signal), [id]);
    return useRemoteData(load, 15_000);
}
