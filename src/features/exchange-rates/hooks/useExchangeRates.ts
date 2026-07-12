import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import type { CurrencyCode } from "../../../domain/currency";
import { FrankfurterExchangeRateAdapter } from "../../../platform/exchange-rates/frankfurterExchangeRateAdapter";
import { MemoryRateCache } from "../../../platform/exchange-rates/memoryRateCache";
import type { ExchangeRateProvider, RateRecord } from "../../../platform/exchange-rates/types";

const rateCache = new MemoryRateCache();
const exchangeRateProvider: ExchangeRateProvider = new FrankfurterExchangeRateAdapter(rateCache);

export type RateRequest = { currency: CurrencyCode; date?: string };
export type RateQueryState = "loading" | "fresh" | "stale" | "unavailable" | "error";

export function useExchangeRates(baseCurrency: CurrencyCode, requests: readonly RateRequest[]) {
  const uniqueRequests = useMemo(() => {
    const values = new Map<string, RateRequest>();
    for (const request of requests) values.set(`${request.currency}:${request.date ?? "latest"}`, request);
    if (!values.has(`${baseCurrency}:latest`)) values.set(`${baseCurrency}:latest`, { currency: baseCurrency });
    return [...values.values()];
  }, [baseCurrency, requests]);

  const queries = useQueries({
    queries: uniqueRequests.map((request) => ({
      queryKey: ["exchange-rate", request.date ? "historical" : "latest", request.currency, baseCurrency, request.date ?? null],
      queryFn: () => request.date
        ? exchangeRateProvider.getHistoricalRate(request.currency, baseCurrency, request.date)
        : exchangeRateProvider.getLatestRate(request.currency, baseCurrency),
      staleTime: 24 * 60 * 60 * 1000,
      retry: false,
      enabled: request.currency === baseCurrency || Boolean(request.currency)
    }))
  });

  const states = useMemo(() => {
    const result = new Map<string, { state: RateQueryState; record?: RateRecord; error?: string }>();
    uniqueRequests.forEach((request, index) => {
      const query = queries[index];
      const key = `${request.currency}:${request.date ?? "latest"}`;
      const state: RateQueryState = query.isPending
        ? "loading"
        : query.data?.status === "stale"
          ? "stale"
          : query.isError
            ? "error"
            : query.data
              ? "fresh"
              : "unavailable";
      result.set(key, { state, record: query.data, error: query.error instanceof Error ? query.error.message : undefined });
    });
    return result;
  }, [queries, uniqueRequests]);

  const latestRates = useMemo(() => {
    const result = new Map<CurrencyCode, RateRecord>();
    for (const request of uniqueRequests) {
      if (request.date) continue;
      const state = states.get(`${request.currency}:latest`);
      if (state?.record) result.set(request.currency, state.record);
    }
    return result;
  }, [states, uniqueRequests]);

  return {
    states,
    latestRates,
    isLoading: queries.some((query) => query.isPending),
    hasError: queries.some((query) => query.isError),
    retry: () => Promise.all(queries.map((query) => query.refetch()))
  };
}

export function rateRequestKey(request: RateRequest): string {
  return `${request.currency}:${request.date ?? "latest"}`;
}
