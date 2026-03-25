import client from "./client";

export interface JiraConfig {
  server_url: string;
  username: string;
  api_token: string;
}

export interface JiraConfigResponse extends JiraConfig {
  configured: boolean;
}

export const getJiraSettings = async (): Promise<JiraConfigResponse> => {
  const res = await client.get("/settings/jira");
  return res.data;
};

export const saveJiraSettings = async (cfg: JiraConfig) => {
  const res = await client.put("/settings/jira", cfg);
  return res.data as { ok: boolean; message: string };
};

export const testJiraConnection = async (cfg: JiraConfig) => {
  const res = await client.post("/settings/jira/test", cfg);
  return res.data as { ok: boolean; message: string };
};

export const fetchJiraTickets = async (sessionId: string, issueKeys: string[]) => {
  const res = await client.post(`/documents/jira?session_id=${sessionId}`, { issue_keys: issueKeys });
  return res.data as { fetched: string[]; errors: string[]; message: string };
};
