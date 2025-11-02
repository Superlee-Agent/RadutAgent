import type { FC } from "react";
import { getMessagePreview } from "@/lib/ip-assistant/utils";
import type { ChatSession, Message } from "@/lib/ip-assistant/types";

type SidebarExtrasProps = {
  messages: Message[];
  sessions: ChatSession[];
  onNewChat: () => void;
  onLoadSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  closeSidebar: () => void;
  onOpenWhitelistMonitor: () => void;
};

const SidebarExtras: FC<SidebarExtrasProps> = ({
  messages,
  sessions,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  closeSidebar,
  onOpenWhitelistMonitor,
}) => (
  <div className="mt-2 flex-1 w-full text-slate-300">
    <button
      type="button"
      onClick={() => {
        onNewChat();
        closeSidebar();
      }}
      className="mb-4 w-full rounded-lg border-0 px-4 py-2.5 text-sm font-semibold text-[#FF4DA6] text-left transition-colors duration-200 hover:bg-[#FF4DA6]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40"
    >
      + New chat
    </button>
    <div className="mb-4 border-t border-slate-700/50 pt-4">
      <button
        type="button"
        onClick={() => {
          onOpenWhitelistMonitor();
          closeSidebar();
        }}
        className="w-full rounded-lg border-0 px-4 py-2.5 text-sm font-semibold text-slate-300 text-left transition-colors duration-200 hover:bg-slate-700/50 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Whitelist Monitor
      </button>
    </div>
    <div className="pl-10 space-y-4">
      <div>
        <div className="text-sm font-semibold text-[#FF4DA6]">Current chat</div>
        <div className="mt-2 space-y-2">
          {messages.length === 0 ? (
            <div className="text-xs text-[#BD4385]">No messages yet</div>
          ) : (
            [...messages]
              .slice(-6)
              .reverse()
              .map((message, index) => (
                <div
                  key={`current-${index}-${message.from}`}
                  className="rounded-md bg-black/40 px-3 py-2 text-xs text-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#FF4DA6]">
                      {message.from === "bot"
                        ? "Assistant"
                        : message.from === "user"
                          ? "You"
                          : "You"}
                    </span>
                    {"ts" in message && message.ts ? (
                      <span className="text-[10px] text-slate-400">
                        {message.ts}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-slate-200">
                    {getMessagePreview(message)}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-[#FF4DA6]">
          Saved conversations
        </div>
        <div className="mt-2 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-xs text-[#BD4385]">No saved chats</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-2 text-xs text-slate-300"
              >
                <button
                  type="button"
                  className="flex-1 truncate text-left font-medium text-[#FF4DA6] hover:text-[#FF4DA6]/80 border-0 bg-transparent"
                  onClick={() => {
                    onLoadSession(session.id);
                    closeSidebar();
                  }}
                >
                  {session.title}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadSession(session.id);
                      closeSidebar();
                    }}
                    className="text-[11px] font-semibold text-[#FF4DA6] hover:text-[#FF4DA6]/80 border-0 bg-transparent"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(session.id)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 border-0 bg-transparent"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </div>
);

export default SidebarExtras;
