import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useBandActivity } from "./useBandActivity";
import type { ReactNode } from "react";
it("retains snapshot age across cached HTTP 200 responses while preserving Map consumers", async () => {
  const fetchedAt = "2026-09-05T00:00:00Z";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,json:async()=>({meta:{fetchedAt},bands:[{band:"20m",count_60m:10,obs_20m:5,reporters_20m:3,count_10m_recent:5,count_10m_prior:5}]})}));
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper = ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const {result,unmount} = renderHook(()=>useBandActivity(),{wrapper});
  await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.get("20m")?.obs20m).toBe(5);
  expect(result.current.data?.fetchedAt).toBe(Date.parse(fetchedAt));
  await act(async()=> { await result.current.refetch(); });
  expect(result.current.data?.fetchedAt).toBe(Date.parse(fetchedAt));
  unmount(); client.clear(); vi.unstubAllGlobals();
});
