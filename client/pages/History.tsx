import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { CURRENT_SESSION_KEY, STORAGE_KEY } from "@/lib/ip-assistant/constants";
import { getMessagePreview } from "@/lib/ip-assistant/utils";
import { type ChatSession, type Message } from "@/lib/ip-assistant/types";

type DisplaySession = {
  id: string;
  title: string;
  ts: string;
  messages: Message[];
  isCurrent?: boolean;
};

const History = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string>("current");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const rawSessions = sessionStorage.getItem(STORAGE_KEY);
      if (rawSessions) {
        const parsed = JSON.parse(rawSessions) as ChatSession[];
        if (Array.isArray(parsed)) {
          setSessions(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to parse stored sessions", error);
    }

    try {
      const rawCurrent = sessionStorage.getItem(CURRENT_SESSION_KEY);
      if (rawCurrent) {
        const parsed = JSON.parse(rawCurrent) as Message[];
        if (Array.isArray(parsed)) {
          setCurrentMessages(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to parse current session", error);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error("Failed to persist sessions", error);
    }
  }, [sessions]);

  const combinedSessions = useMemo<DisplaySession[]>(() => {
    const result: DisplaySession[] = [];
    if (currentMessages.length > 0) {
      const lastTimestamp =
        currentMessages[currentMessages.length - 1]?.ts ?? "";
      result.push({
        id: "current",
        title: "Current conversation",
        ts: lastTimestamp,
        messages: currentMessages,
        isCurrent: true,
      });
    }
    sessions.forEach((session) => {
      result.push({
        id: session.id,
        title: session.title,
        ts: session.ts,
        messages: session.messages,
      });
    });
    return result;
  }, [currentMessages, sessions]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return combinedSessions;
    return combinedSessions.filter((session) => {
      if (session.title.toLowerCase().includes(query)) return true;
      return session.messages.some(
        (message) =>
          "text" in message && message.text.toLowerCase().includes(query),
      );
    });
  }, [combinedSessions, search]);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setActiveId("current");
      return;
    }
    const active = filteredSessions.find((session) => session.id === activeId);
    if (!active) {
      setActiveId(filteredSessions[0]?.id ?? "current");
    }
  }, [filteredSessions, activeId]);

  const activeSession = filteredSessions.find(
    (session) => session.id === activeId,
  );

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== id));
    if (activeId === id) {
      setActiveId("current");
    }
  };

  const handleClearHistory = () => {
    setSessions([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear history", error);
    }
  };

  const renderSessionList = (mobile = false) => (
    <div className={mobile ? "space-y-3" : "mt-4 flex-1 overflow-y-auto pr-1"}>
      {filteredSessions.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-center text-xs text-slate-300">
          No history available yet.
        </div>
      ) : (
        filteredSessions.map((session) => {
          const isActive = session.id === activeId;
          const previewMessage = session.messages
            .slice()
            .reverse()
            .find((message) => message.from !== "user-image");
          return (
            <div
              key={session.id}
              className={`rounded-xl border px-4 py-3 transition-colors duration-150 ${isActive ? "border-[#FF4DA6]/60 bg-black/60 text-[#FF4DA6]" : "border-white/10 bg-white/5 text-slate-200 hover:border-[#FF4DA6]/40"}`}
            >
              <button
                type="button"
                onClick={() => setActiveId(session.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold">
                    {session.title}
                    {session.isCurrent ? " (active)" : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {previewMessage
                      ? getMessagePreview(previewMessage)
                      : "No text messages yet"}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                    <span>{session.messages.length} messages</span>
                    {session.ts ? <span>{session.ts}</span> : null}
                  </div>
                </div>
              </button>
              {!session.isCurrent ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(session.id)}
                    className="text-[11px] font-semibold uppercase tracking-wide text-[#FF4DA6] transition-colors duration-150 hover:text-[#FF4DA6]/80"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <DashboardLayout title="Chat History">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="hidden w-80 flex-col border-r border-white/10 px-6 py-8 text-sm text-slate-300 md:flex">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 py-[7px] pl-[11px] pr-0 text-xs uppercase tracking-wide text-slate-300">
            <span className="text-[10px] font-semibold text-[#FF4DA6]">
              Search
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter conversations"
              className="flex-1 bg-transparent text-[12px] text-white placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          {renderSessionList()}
          <button
            type="button"
            onClick={handleClearHistory}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#FF4DA6]/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15"
          >
            Clear saved history
          </button>
        </aside>

        <section className="flex-1 min-h-0">
          <div className="md:hidden px-4 py-4">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 py-[7px] pl-[11px] pr-0 text-xs uppercase tracking-wide text-slate-300">
              <span className="text-[10px] font-semibold text-[#FF4DA6]">
                Search
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter conversations"
                className="flex-1 bg-transparent text-[12px] text-white placeholder:text-slate-400 focus:outline-none"
              />
            </label>
            <div className="mt-4 space-y-3">
              {renderSessionList(true)}
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-full rounded-lg border border-[#FF4DA6]/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15"
              >
                Clear saved history
              </button>
            </div>
          </div>

          <div className="flex h-full flex-1 flex-col px-4 pb-6 pt-2 md:px-10">
            {activeSession ? (
              <>
                <header className="flex flex-col gap-2 border-b border-white/5 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {activeSession.title}
                    </h2>
                    <div className="text-xs text-slate-400">
                      {activeSession.isCurrent
                        ? "Live conversation snapshot"
                        : `Saved on ${activeSession.ts}`}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {activeSession.messages.length} messages
                  </div>
                </header>
                <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur">
                  {activeSession.messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-300">
                      No messages recorded for this conversation.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeSession.messages.map((message, index) => {
                        if (message.from === "user") {
                          return (
                            <div
                              key={`user-${index}`}
                              className="flex justify-end"
                            >
                              <div className="max-w-[80%] rounded-2xl bg-gradient-to-r from-[#FF4DA6] to-[#ff77c2] px-4 py-3 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                                {message.text}
                                {message.ts ? (
                                  <div className="mt-1 text-[10px] text-white/70">
                                    {message.ts}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        }
                        if (message.from === "bot") {
                          return (
                            <div
                              key={`bot-${index}`}
                              className="flex justify-start"
                            >
                              <div className="max-w-[80%] rounded-2xl border border-[#FF4DA6]/40 bg-black/60 px-4 py-3 text-sm text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                                {message.text}
                                {message.ts ? (
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    {message.ts}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        }
                        if (message.from === "user-image") {
                          return (
                            <div
                              key={`image-${index}`}
                              className="flex justify-end"
                            >
                              <div className="max-w-[80%] overflow-hidden rounded-xl border border-[#FF4DA6]/60">
                                <img
                                  src={message.url}
                                  alt="Uploaded"
                                  className="max-h-60 w-full object-contain"
                                />
                                {message.ts ? (
                                  <div className="bg-black/60 px-3 py-1 text-[10px] text-slate-300">
                                    {message.ts}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`other-${index}`}
                            className="flex justify-start"
                          >
                            <div className="max-w-[80%] rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                              {getMessagePreview(message)}
                              {"ts" in message && message.ts ? (
                                <div className="mt-1 text-[10px] text-slate-400">
                                  {message.ts}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
                Select a conversation from the list to review its messages.
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default History;
