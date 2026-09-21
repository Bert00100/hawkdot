"use client";
import { useCallback } from "react";
import { resourcesApi, type ListResourcesParams } from "@/lib/api/resources";
import { useRemoteData } from "@/hooks/use-remote-data";

export function useResources(params: ListResourcesParams) {
    const key = JSON.stringify(params);
    const load = useCallback((signal: AbortSignal) => resourcesApi.list(JSON.parse(key), signal), [key]);
    return useRemoteData(load);
}
