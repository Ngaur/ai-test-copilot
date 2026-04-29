import client from "./client";
import type { LoadTest, PastSession, TestCase } from "@/types";
import type { ReportSummary } from "./chat";

export const listSessions = (): Promise<PastSession[]> =>
  client.get<PastSession[]>("/sessions").then((r) => r.data);

export const getSessionTestCases = (
  sessionId: string,
): Promise<{ session_id: string; count: number; test_cases: TestCase[] }> =>
  client
    .get(`/sessions/${sessionId}/test-cases`)
    .then((r) => r.data);

export const getSessionFeatureFiles = (
  sessionId: string,
): Promise<{ session_id: string; content: string }> =>
  client
    .get(`/sessions/${sessionId}/feature-files`)
    .then((r) => r.data);

export const getSessionPlaywrightTest = (
  sessionId: string,
): Promise<{ session_id: string; content: string }> =>
  client
    .get(`/sessions/${sessionId}/playwright-test`)
    .then((r) => r.data);

export const deleteSession = (sessionId: string): Promise<{ ok: boolean; session_id: string }> =>
  client.delete(`/sessions/${sessionId}`).then((r) => r.data);

export const getSessionReportSummary = (sessionId: string): Promise<ReportSummary> =>
  client.get(`/report/summary/${sessionId}`).then((r) => r.data);

export const reExecuteSession = (sessionId: string): Promise<{ session_id: string; status: string }> =>
  client.post(`/sessions/${sessionId}/re-execute`).then((r) => r.data);

export const getSessionExecutionStatus = (
  sessionId: string,
): Promise<{ session_id: string; has_execution: boolean; execution_status: string | null }> =>
  client.get(`/sessions/${sessionId}/execution-status`).then((r) => r.data);

export const getSessionLoadTests = (sessionId: string): Promise<{ load_tests: LoadTest[] }> =>
  client.get(`/sessions/${sessionId}/load-tests`).then((r) => r.data);
