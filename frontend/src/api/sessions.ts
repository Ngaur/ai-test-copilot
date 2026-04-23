import client from "./client";
import type { PastSession, TestCase } from "@/types";

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
