import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import type { CurrencyCode } from "../../../domain/currency";
import { rateQueryFreshness } from "../../../platform/exchange-rates/rateQueryFreshness";
import { HttpExchangeRateProvider } from "../../../platform/exchange-rates/httpExchangeRateProvider";
import { resolveLocalApiUrl } from "../../../platform/runtime/localApiUrl";
import { createRateCache } from "../../../platform/exchange-rates/createRateCache";
import { ExchangeRateError, type ExchangeRateProvider, type RateRecord } from "../../../platform/exchange-rates/types";

const rateCache = createRateCache();
const exchangeRateProvider: ExchangeRateProvider = new HttpExchangeRateProvider(
  resolveLocalApiUrl(process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_URL || "https://pjac53rgd3.execute-api.us-east-1.amazonaws.com/rates"),
  fetch,
  rateCache
);

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
      staleTime: rateQueryFreshness,
      retry: false,
      enabled: request.currency === baseCurrency || Boolean(request.currency)
    }))
  });

  const states = useMemo(() => {
    const result = new Map<string, { state: RateQueryState; record?: RateRecord; error?: string }>();
    uniqueRequests.forEach((request, index) => {
      const query = queries[index];
      const key = `${request.currency}:${request.date ?? "latest"}`;
      if (!query) {
        result.set(key, { state: "unavailable" });
        return;
      }
      const state: RateQueryState = query.isPending
        ? "loading"
        : query.data?.status === "stale"
          ? "stale"
          : query.error instanceof ExchangeRateError && query.error.code === "no_rate_available"
            ? "unavailable"
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

  const unavailableCurrencies = useMemo(
    () => [...new Set(uniqueRequests
      .filter((request) => request.currency !== baseCurrency && states.get(`${request.currency}:${request.date ?? "latest"}`)?.state === "unavailable")
      .map((request) => request.currency))],
    [baseCurrency, states, uniqueRequests]
  );

  return {
    states,
    latestRates,
    isLoading: queries.some((query) => query.isPending),
    hasError: queries.some((query) => query.isError && !(query.error instanceof ExchangeRateError && query.error.code === "no_rate_available")),
    unavailableCurrencies,
    retry: () => Promise.all(queries.map((query) => query.refetch()))
  };
}

export function rateRequestKey(request: RateRequest): string {
  return `${request.currency}:${request.date ?? "latest"}`;
}
