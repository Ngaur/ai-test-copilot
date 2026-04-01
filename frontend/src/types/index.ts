export type SessionStatus =
  | "idle"
  | "parsing"
  | "generating"
  | "awaiting_test_data_or_generate"
  | "awaiting_review"
  | "improving"
  | "generating_schema"
  | "awaiting_test_data"
  | "generating_automation"
  | "awaiting_playwright_confirmation"
  | "ready_to_execute"
  | "executing"
  | "done"
  | "error";

export interface TestStep {
  step_number: number;
  action: string;
  expected_result: string;
}

export interface TestCase {
  id: string;
  title: string;
  module: string;
  test_type: string;
  priority: string;
  endpoint: string;
  preconditions: string[];
  steps: TestStep[];
  expected_result: string;
  postconditions: string[];
  notes: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Session {
  sessionId: string;
  threadId: string | null;
  status: SessionStatus;
  filename: string;
}

export interface PastSession {
  session_id: string;
  filename: string;
  created_at: string;
  updated_at: string;
  has_feature_files: boolean;
  has_playwright: boolean;
}
