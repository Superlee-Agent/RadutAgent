import { useCallback, useState } from "react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Switch } from "@/components/ui/switch";

const sections = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "integrations", label: "Integrations" },
];

const Settings = () => {
  const [toggles, setToggles] = useState({
    darkMode: true,
    autosaveDrafts: false,
    emailUpdates: true,
    smsAlerts: false,
    pushNotifications: true,
    shareActivity: false,
    allowTraining: false,
  });

  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [retention, setRetention] = useState("90");
  const [weeklyDigest, setWeeklyDigest] = useState("friday");

  const handleToggleChange = useCallback(
    (key: keyof typeof toggles) => (checked: boolean) => {
      setToggles((prev) => ({ ...prev, [key]: checked }));
    },
    [],
  );

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const integrations = [
    {
      name: "Privy",
      description: "Wallet authentication and onboarding",
      status: "Connected",
    },
    {
      name: "Supabase",
      description: "Data storage and realtime sync",
      status: "Not Connected",
    },
    {
      name: "Zapier",
      description: "Automated workflows and notifications",
      status: "Connected",
    },
  ];

  return (
    <DashboardLayout title="Settings">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 flex-col border-r border-white/10 px-6 py-8 text-sm text-slate-300 lg:flex">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sections
          </div>
          <nav className="mt-4 flex flex-col gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="rounded-md border border-transparent px-3 py-2 text-left font-medium text-slate-300 transition-colors duration-150 hover:border-[#FF4DA6]/50 hover:text-[#FF4DA6]"
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1 min-h-0">
          <div className="relative h-full overflow-y-auto px-4 py-6 md:px-10">
            <div className="space-y-12 pb-16">
              <section id="general" className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">
                    General preferences
                  </h2>
                  <p className="text-sm text-slate-300">
                    Control interface behavior, localization, and productivity
                    shortcuts.
                  </p>
                </header>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Dark mode
                        </h3>
                        <p className="text-xs text-slate-300">
                          Automatically match the dashboard theme to your system
                          preferences.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.darkMode}
                        onCheckedChange={handleToggleChange("darkMode")}
                        aria-label="Toggle dark mode"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Autosave drafts
                        </h3>
                        <p className="text-xs text-slate-300">
                          Keep partial prompts and responses for 24 hours for
                          quick recovery.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.autosaveDrafts}
                        onCheckedChange={handleToggleChange("autosaveDrafts")}
                        aria-label="Toggle autosave drafts"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur lg:col-span-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
                        Interface language
                        <select
                          value={language}
                          onChange={(event) => setLanguage(event.target.value)}
                          className="rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/40"
                        >
                          <option value="en">English</option>
                          <option value="id">Indonesian</option>
                          <option value="ja">日本語</option>
                          <option value="es">Español</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
                        Timezone
                        <select
                          value={timezone}
                          onChange={(event) => setTimezone(event.target.value)}
                          className="rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/40"
                        >
                          <option value="UTC">
                            Coordinated Universal Time (UTC)
                          </option>
                          <option value="Asia/Jakarta">Jakarta (GMT+7)</option>
                          <option value="America/New_York">
                            New York (GMT-5)
                          </option>
                          <option value="Europe/London">London (GMT+1)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section id="notifications" className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">
                    Notifications
                  </h2>
                  <p className="text-sm text-slate-300">
                    Choose how you are notified about agent activity, analysis
                    completions, and system alerts.
                  </p>
                </header>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Email summaries
                        </h3>
                        <p className="text-xs text-slate-300">
                          Receive a digest of new activity and licensing updates
                          every week.
                        </p>
                        <label className="mt-3 flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
                          Delivery schedule
                          <select
                            value={weeklyDigest}
                            onChange={(event) =>
                              setWeeklyDigest(event.target.value)
                            }
                            className="rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/40"
                          >
                            <option value="monday">Monday</option>
                            <option value="wednesday">Wednesday</option>
                            <option value="friday">Friday</option>
                          </select>
                        </label>
                      </div>
                      <Switch
                        checked={toggles.emailUpdates}
                        onCheckedChange={handleToggleChange("emailUpdates")}
                        aria-label="Toggle email updates"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          SMS alerts
                        </h3>
                        <p className="text-xs text-slate-300">
                          Get instant alerts when verification steps require
                          attention.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.smsAlerts}
                        onCheckedChange={handleToggleChange("smsAlerts")}
                        aria-label="Toggle SMS alerts"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur lg:col-span-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          In-app push notifications
                        </h3>
                        <p className="text-xs text-slate-300">
                          Display floating alerts inside the dashboard when the
                          assistant completes an analysis.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.pushNotifications}
                        onCheckedChange={handleToggleChange(
                          "pushNotifications",
                        )}
                        aria-label="Toggle push notifications"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section id="privacy" className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">
                    Privacy & retention
                  </h2>
                  <p className="text-sm text-slate-300">
                    Decide how your data is stored and whether anonymized
                    results are shared for training.
                  </p>
                </header>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Analytics sharing
                        </h3>
                        <p className="text-xs text-slate-300">
                          Share usage metrics to improve dashboard stability and
                          roadmap planning.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.shareActivity}
                        onCheckedChange={handleToggleChange("shareActivity")}
                        aria-label="Toggle analytics sharing"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Allow AI training
                        </h3>
                        <p className="text-xs text-slate-300">
                          Contribute anonymized results to improve Radut Agent
                          detection accuracy.
                        </p>
                      </div>
                      <Switch
                        checked={toggles.allowTraining}
                        onCheckedChange={handleToggleChange("allowTraining")}
                        aria-label="Toggle AI training"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur lg:col-span-2">
                    <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
                      Chat retention window
                      <select
                        value={retention}
                        onChange={(event) => setRetention(event.target.value)}
                        className="rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/40"
                      >
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                        <option value="180">180 days</option>
                        <option value="365">365 days</option>
                      </select>
                    </label>
                    <p className="mt-3 text-xs text-slate-400">
                      Retention preferences apply to all conversation history
                      stored locally in this workspace.
                    </p>
                  </div>
                </div>
              </section>

              <section id="integrations" className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">
                    Integrations
                  </h2>
                  <p className="text-sm text-slate-300">
                    Manage third-party services connected to your IP Assistant
                    workspace.
                  </p>
                </header>
                <div className="grid gap-4">
                  {integrations.map((integration) => (
                    <div
                      key={integration.name}
                      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          {integration.name}
                        </h3>
                        <p className="text-xs text-slate-300">
                          {integration.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border border-[#FF4DA6]/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15"
                      >
                        {integration.status === "Connected"
                          ? "Manage"
                          : "Connect"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
