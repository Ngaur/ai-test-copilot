import { CheckCircle2, Loader2, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getJiraSettings, saveJiraSettings, testJiraConnection } from "@/api/settings";
import type { JiraConfig } from "@/api/settings";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const [form, setForm] = useState<JiraConfig>({ server_url: "", username: "", api_token: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    getJiraSettings()
      .then((d) => setForm({ server_url: d.server_url, username: d.username, api_token: d.api_token }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof JiraConfig, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTestResult(null);
    setSaveMsg(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testJiraConnection(form);
      setTestResult({ ok: true, message: res.message });
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.response?.data?.detail ?? "Connection failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveJiraSettings(form);
      setSaveMsg("Settings saved successfully.");
    } catch {
      setSaveMsg("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <p className="font-semibold text-text-primary text-sm">Settings</p>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Section heading */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#0052CC]/15 border border-[#0052CC]/30 flex items-center justify-center">
              <span className="text-[#0052CC] text-xs font-bold">J</span>
            </div>
            <p className="text-sm font-semibold text-text-primary">Jira Integration</p>
          </div>
          <p className="text-xs text-text-secondary -mt-3 leading-relaxed">
            Connect to Jira to pull ticket content as context when generating test cases.
            Supports Jira Cloud and Jira Server / Data Center.
          </p>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          ) : (
            <div className="space-y-3">
              <Field
                label="Jira Server URL"
                placeholder="https://yourcompany.atlassian.net"
                value={form.server_url}
                onChange={(v) => set("server_url", v)}
              />
              <Field
                label="Username / Email"
                placeholder="you@company.com"
                value={form.username}
                onChange={(v) => set("username", v)}
              />
              <Field
                label="API Token"
                placeholder="ATATT3xFfGF0..."
                value={form.api_token}
                onChange={(v) => set("api_token", v)}
                type="password"
                hint={
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    Generate API token ↗
                  </a>
                }
              />

              {/* Test result */}
              {testResult && (
                <div
                  className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                    testResult.ok
                      ? "bg-success/10 border border-success/20 text-success"
                      : "bg-danger/10 border border-danger/20 text-danger"
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" /> : <X size={13} className="mt-0.5 flex-shrink-0" />}
                  {testResult.message}
                </div>
              )}

              {saveMsg && (
                <p className="text-xs text-text-secondary text-center">{saveMsg}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-3">
          <button
            onClick={handleTest}
            disabled={testing || loading || !form.server_url || !form.api_token}
            className="flex items-center gap-1.5 text-xs border border-border px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !form.server_url || !form.api_token}
              className="flex items-center gap-1.5 text-xs bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
      />
    </div>
  );
}
