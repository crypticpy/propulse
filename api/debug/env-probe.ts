// TEMPORARY diagnostic endpoint — reports which Supabase host the runtime
// resolves and the status of a minimal REST probe. No secrets are returned
// (the host is already public in the client bundle; only lengths of keys).
// Delete after the spots outage diagnosis is complete.
export const config = { runtime: "edge" };

export default async function handler(): Promise<Response> {
  const rawUrl = (
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ""
  ).trim();
  const hasServerUrl = process.env.SUPABASE_URL !== undefined;
  const serverUrlLen = (process.env.SUPABASE_URL ?? "").length;
  const viteUrlLen = (process.env.VITE_SUPABASE_URL ?? "").length;
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ""
  ).trim();

  let origin = "unparseable";
  try {
    origin = new URL(rawUrl).origin;
  } catch {
    /* keep "unparseable" */
  }

  let probeStatus = -1;
  let probeBody = "";
  if (origin !== "unparseable" && anonKey) {
    try {
      const response = await fetch(
        `${origin}/rest/v1/spot_history?select=spotted_at&order=spotted_at.desc&limit=1`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        },
      );
      probeStatus = response.status;
      probeBody = (await response.text()).slice(0, 300);
    } catch (error) {
      probeStatus = -2;
      probeBody = error instanceof Error ? error.message : String(error);
    }
  }

  return new Response(
    JSON.stringify({
      origin,
      rawUrlLen: rawUrl.length,
      hasServerUrl,
      serverUrlLen,
      viteUrlLen,
      anonKeyLen: anonKey.length,
      probeStatus,
      probeBody,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
