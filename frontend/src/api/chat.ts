import client from "./client";
import type { QuestionnaireAnswers, SessionStatus, TestCase } from "@/types";

export interface StartSessionResponse {
  thread_id: string;
  session_id: string;
  status: SessionStatus;
  message: string;
}

export interface ReviewRequest {
  thread_id: string;
  approved: boolean;
  feedback?: string;
}

export interface ReviewResponse {
  thread_id: string;
  message: string;
  status: SessionStatus;
}

export interface StatusResponse {
  session_id: string;
  thread_id: string;
  status: SessionStatus;
  test_cases_count: number;
  current_step: string;
  last_message: string;
}

export const uploadDocument = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post("/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as { file_id: string; session_id: string; filename: string; message: string };
};

export const startSession = async (sessionId: string): Promise<StartSessionResponse> => {
  const res = await client.post(`/chat/start?session_id=${sessionId}`);
  return res.data;
};

export const sendMessage = async (threadId: string, sessionId: string, message: string) => {
  const res = await client.post(`/chat/${threadId}/message`, {
    session_id: sessionId,
    message,
    thread_id: threadId,
  });
  return res.data as { thread_id: string; status: SessionStatus; message: string };
};

export const submitReview = async (body: ReviewRequest): Promise<ReviewResponse> => {
  const res = await client.post(`/chat/${body.thread_id}/review`, body);
  return res.data;
};

export const getStatus = async (threadId: string, sessionId: string): Promise<StatusResponse> => {
  const res = await client.get(`/chat/${threadId}/status`, { params: { session_id: sessionId } });
  return res.data;
};

export const getTestCases = async (threadId: string): Promise<{ count: number; test_cases: TestCase[] }> => {
  const res = await client.get(`/chat/${threadId}/test-cases`);
  return res.data;
};

export const uploadTestData = async (
  threadId: string,
  file: File,
): Promise<{ thread_id: string; rows_loaded: number; status: string; message: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post(`/documents/test-data?thread_id=${threadId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const uploadEarlyTestData = async (
  threadId: string,
  file: File,
): Promise<{ thread_id: string; rows_loaded: number; status: string; message: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post(`/documents/test-data-early?thread_id=${threadId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const skipEarlyTestData = async (threadId: string) => {
  const res = await client.post(`/chat/${threadId}/skip-early-data`);
  return res.data as { thread_id: string; status: string; message: string };
};

export const uploadContextDoc = async (sessionId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post(`/documents/context?session_id=${sessionId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as { session_id: string; filename: string; message: string };
};

export const downloadTestCases = async (threadId: string): Promise<void> => {
  const res = await client.get(`/chat/${threadId}/test-cases/export`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `test_cases_${threadId.slice(0, 8)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

export const executeTests = async (threadId: string) => {
  const res = await client.post(`/chat/${threadId}/execute`);
  return res.data;
};

export const getGeneratedTest = async (threadId: string): Promise<{ thread_id: string; file_path: string; content: string }> => {
  const res = await client.get(`/chat/${threadId}/generated-test`);
  return res.data;
};

export const getPlaywrightTest = async (threadId: string): Promise<{ thread_id: string; file_path: string; content: string }> => {
  const res = await client.get(`/chat/${threadId}/playwright-test`);
  return res.data;
};

export const confirmPlaywright = async (threadId: string) => {
  const res = await client.post(`/chat/${threadId}/confirm-playwright`);
  return res.data as { thread_id: string; status: SessionStatus; message: string };
};

export const skipPlaywright = async (threadId: string) => {
  const res = await client.post(`/chat/${threadId}/skip-playwright`);
  return res.data as { thread_id: string; status: SessionStatus; message: string };
};

export const generateReport = async () => {
  const res = await client.get("/report/generate");
  return res.data as { report_url: string };
};

export const submitQuestionnaire = async (
  threadId: string,
  answers: QuestionnaireAnswers,
): Promise<{ thread_id: string; status: string; message: string }> => {
  const res = await client.post(`/chat/${threadId}/questionnaire`, {
    thread_id: threadId,
    answers,
  });
  return res.data;
};
