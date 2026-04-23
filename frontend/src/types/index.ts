export type SessionStatus =
  | "idle"
  | "parsing"
  | "awaiting_questionnaire"
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

export interface QuestionnaireAnswers {
  s1: {
    product_name: string;
    auth_type: string;
    base_url: string;
    user_roles: string[];
  };
  s2: {
    p1_endpoints: string[];
    error_codes: Record<string, string>;
    idempotent_endpoints: string[];
  };
  s3: {
    validation_rules: string;
    pii_fields: string[];
    data_constraints: string;
  };
  s4: {
    user_journeys: Array<{ name: string; goal: string; steps: string }>;
    state_machines: string;
    failure_scenarios: string;
  };
  s5: {
    test_types: string[];
    negative_pct: string;
    custom_tags: string[];
  };
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
