/**
 * Microsoft Graph API client — stub when credentials not configured.
 * Do not fake success; return explicit not-configured when absent.
 */

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
};

export function getGraphConfig(): GraphConfig | null {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri: process.env.MICROSOFT_GRAPH_REDIRECT_URI ?? undefined,
  };
}

export function isGraphConfigured(): boolean {
  return getGraphConfig() !== null;
}
