import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import DashboardLayout from "@/components/layout/DashboardLayout";

type BotMessage = {
  from: "bot";
  text: string;
  ts?: string;
  verification?: { label: string; code: number } | string | null;
};

export type Message =
  | { from: "user"; text: string; ts?: string }
  | BotMessage
  | { from: "user-image"; url: string; ts?: string };

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  ts: string;
};

const ANSWER_LABELS: Record<number, string> = {
  1: "Group 1",
  2: "Group 2",
  3: "Group 3",
  4: "Group 4",
  5: "Group 5",
  6: "Group 6",
  7: "Group 7",
  8: "Group 8",
  9: "Group 9",
  10: "Group 10",
  11: "Group 11",
  12: "Group 12",
};

const ANSWER_DETAILS: Record<
  number,
  {
    type: string;
    notes: string;
    registrationStatus: string;
    action: string;
    smartLicensing: string;
    aiTraining: string;
  }
> = {
  // AI: 1-4
  1: {
    type: "AI Generated",
    notes: "No human faces, no famous brands or characters",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee and revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  2: {
    type: "AI Generated",
    notes: "Partial/covered/blurred human face (non-public), no clear brand",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  3: {
    type: "AI Generated",
    notes: "Contains regular human faces (non-public)",
    registrationStatus:
      "❌ Not allowed → ✅ Allowed if selfie verification succeeds",
    action: "Take Selfie Photo / Submit Review",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  4: {
    type: "AI Generated",
    notes: "Contains famous brands/characters or public figure faces",
    registrationStatus: "❌ Not allowed",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  // Human: 5-8
  5: {
    type: "Human Generated",
    notes: "No human faces, no famous brands or characters",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee and revenue share)",
    aiTraining: "✅ Allowed (manual setting)",
  },
  6: {
    type: "Human Generated",
    notes: "Partial/covered/blurred human face (non-public), no clear brand",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "✅ Allowed (manual setting)",
  },
  7: {
    type: "Human Generated",
    notes: "Contains regular human faces (non-celebrity)",
    registrationStatus:
      "❌ Not allowed → ✅ Allowed if selfie verification succeeds",
    action: "Take Selfie Photo / Submit Review",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "✅ Allowed (manual setting)",
  },
  8: {
    type: "Human Generated",
    notes: "Contains famous brands/characters or public figure faces",
    registrationStatus: "❌ Not allowed",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  // AI Animation: 9-12
  9: {
    type: "AI Generated (Animation)",
    notes: "No human faces, no famous brands or characters",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee and revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  10: {
    type: "AI Generated (Animation)",
    notes: "Partial/covered/blurred human face (non-public)",
    registrationStatus: "✅ Allowed",
    action: "-",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  11: {
    type: "AI Generated (Animation)",
    notes: "Contains regular human faces (non-public)",
    registrationStatus:
      "❌ Not allowed → ✅ Allowed if selfie verification succeeds",
    action: "Take Selfie Photo / Submit Review",
    smartLicensing: "Commercial Remix License (upon successful selfie)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  12: {
    type: "AI Generated (Animation)",
    notes: "Contains famous brands/characters or public figure faces",
    registrationStatus: "❌ Not allowed",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
};

const truncateAddress = (address: string) => {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getCurrentTimestamp = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const getInitialBotMessage = (): BotMessage => ({
  from: "bot",
  text: "Hello, I am Radut Agent. Type 'gradut' to start an image analysis.",
  ts: getCurrentTimestamp(),
});

const getMessagePreview = (message: Message) => {
  if (message.from === "user-image") {
    return "Image uploaded";
  }
  if (message.text.trim().length === 0) {
    return "(Empty message)";
  }
  if (message.text.length <= 40) {
    return message.text;
  }
  return `${message.text.slice(0, 40)}...`;
};

const IP_ASSISTANT_AVATAR =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F885c66a9b5da433b9a8c619e8679d4c7";

export const STORAGE_KEY = "radut_sessions";
export const CURRENT_SESSION_KEY = "radut_current_session";

const IpAssistant = () => {
  const [messages, setMessages] = useState<Message[]>([getInitialBotMessage()]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [activeDetail, setActiveDetail] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const uploadRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const isMobileRef = useRef(false);
  const autoScrollNextRef = useRef(true);

  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    if (typeof window !== "undefined") {
      isMobileRef.current = window.matchMedia("(max-width: 767px)").matches;
    }
  }, []);

  useEffect(() => {
    if (autoScrollNextRef.current) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
    autoScrollNextRef.current = true;
    if (!waiting && !isMobileRef.current) inputRef.current?.focus?.();
  }, [messages, waiting]);

  useEffect(() => {
    if (activeDetail === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveDetail(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeDetail]);

  const primaryWalletAddress = useMemo(() => {
    if (wallets && wallets.length > 0) {
      const walletWithAddress = wallets.find((wallet) => wallet.address);
      if (walletWithAddress?.address) {
        return walletWithAddress.address;
      }
    }
    return user?.wallet?.address ?? null;
  }, [wallets, user?.wallet?.address]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CURRENT_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to restore current session", error);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[];
        if (Array.isArray(parsed)) {
          setSessions(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to parse stored sessions", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error("Failed to persist sessions", error);
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to persist current session", error);
    }
  }, [messages]);

  const handleWalletButtonClick = useCallback(() => {
    if (!ready) return;
    if (authenticated) {
      logout();
    } else {
      void login({ loginMethods: ["wallet"] });
    }
  }, [ready, authenticated, login, logout]);

  const walletButtonText = authenticated
    ? "Disconnect"
    : ready
      ? "Connect Wallet"
      : "Loading Wallet";

  const walletButtonDisabled = !ready && !authenticated;

  const connectedAddressLabel =
    authenticated && primaryWalletAddress
      ? truncateAddress(primaryWalletAddress)
      : null;

  const pushMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const saveSession = useCallback((history: Message[]) => {
    if (history.length <= 1) return;
    const firstUserMessage = history.find((message) => message.from === "user");
    const title = firstUserMessage
      ? firstUserMessage.text.length > 30
        ? `${firstUserMessage.text.slice(0, 30)}...`
        : firstUserMessage.text
      : `Session ${new Date().toLocaleString()}`;

    const newSession: ChatSession = {
      id: String(Date.now()),
      title,
      messages: history,
      ts: new Date().toLocaleString(),
    };

    setSessions((prev) => [newSession, ...prev].slice(0, 50));
  }, []);

  const handleNewChat = useCallback(() => {
    saveSession([...messages]);
    setMessages([getInitialBotMessage()]);
    setWaiting(false);
  }, [messages, saveSession]);

  const loadSession = useCallback(
    (id: string) => {
      const session = sessions.find((item) => item.id === id);
      if (session) {
        setMessages(session.messages);
        autoScrollNextRef.current = false;
      }
    },
    [sessions],
  );

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    const value = input.trim();
    if (!value) return;
    const ts = getCurrentTimestamp();
    pushMessage({ from: "user", text: value, ts });
    setInput("");
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (value.toLowerCase() === "gradut") {
      pushMessage({
        from: "bot",
        text: "Please upload an image.",
        ts: getCurrentTimestamp(),
      });
      setTimeout(() => uploadRef.current?.click(), 400);
    }
    autoScrollNextRef.current = true;
  }, [input, pushMessage]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const compressToBlob = useCallback(
    async (file: File, maxWidth = 800, quality = 0.75): Promise<Blob> =>
      new Promise((resolve, reject) => {
        if (!file.type || !file.type.startsWith("image/")) {
          reject(new Error("File is not an image"));
          return;
        }
        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => {
          img.onload = () => {
            try {
              const scale = Math.min(1, maxWidth / img.width);
              const width = Math.round(img.width * scale);
              const height = Math.round(img.height * scale);
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                reject(new Error("Canvas not supported"));
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    reject(new Error("Compression failed"));
                    return;
                  }
                  resolve(blob);
                },
                "image/jpeg",
                quality,
              );
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
      }),
    [],
  );

  const compressAndEnsureSize = useCallback(
    async (file: File, targetSize = 250 * 1024): Promise<Blob> => {
      let quality = 0.75;
      let maxWidth = 800;
      let blob = await compressToBlob(file, maxWidth, quality);
      let attempts = 0;
      while (blob.size > targetSize && attempts < 6) {
        if (quality > 0.4) {
          quality = Math.max(0.35, quality - 0.15);
        } else {
          maxWidth = Math.max(300, Math.floor(maxWidth * 0.8));
        }
        try {
          blob = await compressToBlob(file, maxWidth, quality);
        } catch (error) {
          console.error("Compression loop error", error);
          break;
        }
        attempts += 1;
      }
      return blob;
    },
    [compressToBlob],
  );

  const handleImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const inputEl = event.currentTarget as HTMLInputElement;
        const file = inputEl.files?.[0];
        if (inputEl) inputEl.value = "";
        if (!file) return;

        const url = URL.createObjectURL(file);
        pushMessage({
          from: "user-image",
          url,
          ts: getCurrentTimestamp(),
        });
        autoScrollNextRef.current = true;
        setWaiting(true);

        let blob: Blob;
        try {
          blob = await compressAndEnsureSize(file, 250 * 1024);
        } catch (error) {
          console.error("Compression failed, sending original file", error);
          blob = file;
        }

        const form = new FormData();
        form.append("image", blob, file.name);

        const response = await fetch("/api/analyze", {
          method: "POST",
          body: form,
        });

        if (response.status === 413) {
          autoScrollNextRef.current = false;
          pushMessage({
            from: "bot",
            text: "The image is too large. Please compress or resize before uploading.",
            ts: getCurrentTimestamp(),
          });
          setWaiting(false);
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          console.error("/api/analyze failed:", response.status, text);
          autoScrollNextRef.current = false;
          pushMessage({
            from: "bot",
            text: "Image analysis failed.",
            ts: getCurrentTimestamp(),
          });
          setWaiting(false);
          return;
        }

        const data = await response.json();
        const parsed = data?.parsed;
        let display = "(No analysis result)";
        let verification: { label: string; code: number } | string | undefined;

        if (parsed && typeof parsed === "object") {
          const reason =
            typeof parsed.reason === "string" ? parsed.reason.trim() : "";
          display = reason || "(No analysis result)";

          const finalAnswer =
            typeof parsed.selected_answer === "number" &&
            Number.isInteger(parsed.selected_answer)
              ? parsed.selected_answer
              : null;

          if (finalAnswer != null) {
            const label = ANSWER_LABELS[finalAnswer] ?? `Group ${finalAnswer}`;
            verification = { label, code: finalAnswer };
          }
        } else {
          const rawText = data?.raw ? String(data.raw).trim() : "";
          display = rawText || "(No analysis result)";
        }

        autoScrollNextRef.current = false;
        pushMessage({
          from: "bot",
          text: display,
          verification,
          ts: getCurrentTimestamp(),
        });

        void (async () => {
          try {
            await fetch("/api", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
          } catch (error) {
            console.error("Failed to persist analysis", error);
          }
        })();
      } catch (error: any) {
        console.error("handleImage error", error);
        const message = error?.message
          ? `Image analysis failed: ${error.message}`
          : "Image analysis failed.";
        autoScrollNextRef.current = false;
        pushMessage({
          from: "bot",
          text: message,
          ts: getCurrentTimestamp(),
        });
      } finally {
        setWaiting(false);
      }
    },
    [compressAndEnsureSize, pushMessage],
  );

  const sidebarExtras = useCallback(
    ({ closeSidebar }: { closeSidebar: () => void }) => (
      <div className="mt-2 flex-1 w-full text-slate-300">
        <button
          type="button"
          onClick={() => {
            handleNewChat();
            closeSidebar();
          }}
          className="mb-4 w-full rounded-lg border-0 px-4 py-2.5 text-sm font-semibold text-[#FF4DA6] text-left transition-colors duration-200 hover:bg-[#FF4DA6]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40"
        >
          + New chat
        </button>
        <div className="pl-10 space-y-4">
          <div>
            <div className="text-sm font-semibold text-[#FF4DA6]">
              Current chat
            </div>
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
                      className="rounded-md border border-[#FF4DA6]/20 bg-black/40 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#FF4DA6]">
                          {message.from === "bot"
                            ? "Assistant"
                            : message.from === "user"
                              ? "You"
                              : "You"}
                        </span>
                        {message.ts ? (
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
                        loadSession(session.id);
                        closeSidebar();
                      }}
                    >
                      {session.title}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          loadSession(session.id);
                          closeSidebar();
                        }}
                        className="text-[11px] font-semibold text-[#FF4DA6] hover:text-[#FF4DA6]/80 border-0 bg-transparent"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSession(session.id)}
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
    ),
    [deleteSession, handleNewChat, loadSession, messages, sessions],
  );

  const headerActions = (
    <>
      {connectedAddressLabel ? (
        <span className="hidden text-xs font-medium text-[#FF4DA6]/80 sm:inline">
          {connectedAddressLabel}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleWalletButtonClick}
        disabled={walletButtonDisabled}
        className="inline-flex items-center rounded-lg border border-[#FF4DA6]/50 px-3 py-1.5 text-sm font-semibold text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {walletButtonText}
      </button>
    </>
  );

  return (
    <DashboardLayout
      title="IP Assistant"
      avatarSrc={IP_ASSISTANT_AVATAR}
      actions={headerActions}
      sidebarExtras={sidebarExtras}
    >
      <div className="chat-box px-4 md:px-12 py-6 flex-1 overflow-y-auto bg-transparent">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            if (msg.from === "user") {
              return (
                <motion.div
                  key={`user-${index}`}
                  className="flex justify-end mb-3 px-3 md:px-8"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{
                    type: "spring",
                    stiffness: 340,
                    damping: 26,
                  }}
                  layout
                >
                  <div className="bg-gradient-to-r from-[#FF4DA6] to-[#ff77c2] text-white px-5 py-3 rounded-2xl max-w-[88%] md:max-w-[70%] break-words shadow-[0_18px_32px_rgba(0,0,0,0.35)]">
                    {msg.text}
                  </div>
                </motion.div>
              );
            }

            if (msg.from === "bot") {
              const verificationObject =
                msg.verification && typeof msg.verification === "object"
                  ? msg.verification
                  : null;
              const verificationText =
                msg.verification && typeof msg.verification === "string"
                  ? msg.verification
                  : null;

              return (
                <motion.div
                  key={`bot-${index}`}
                  className="flex items-start mb-2 gap-2 px-3 md:px-8"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{
                    type: "spring",
                    stiffness: 340,
                    damping: 26,
                  }}
                  onAnimationComplete={() => {
                    if (index === messages.length - 1) {
                      setTimeout(() => {
                        chatEndRef.current?.scrollIntoView({
                          behavior: "smooth",
                        });
                      }, 0);
                    }
                  }}
                  layout
                >
                  <div className="bg-slate-900/70 border border-[#FF4DA6]/40 px-4 py-3 rounded-2xl max-w-[88%] md:max-w-[70%] break-words shadow-[0_18px_34px_rgba(0,0,0,0.4)] text-slate-100 backdrop-blur-sm">
                    <div>{msg.text}</div>
                    {verificationObject ? (
                      <div className="mt-2 text-xs text-[#FF4DA6]">
                        Final verification:{" "}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setActiveDetail(verificationObject.code)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveDetail(verificationObject.code);
                            }
                          }}
                          className="cursor-pointer text-[#FF4DA6] font-semibold underline underline-offset-2 decoration-[#FF4DA6]/60 outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30 rounded"
                        >
                          {verificationObject.label}
                        </span>
                      </div>
                    ) : verificationText ? (
                      <div className="mt-2 text-xs text-slate-300">
                        {verificationText}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={`image-${index}`}
                className="flex justify-end mb-3 px-3 md:px-8"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 22,
                }}
                layout
              >
                <div className="rounded-md overflow-hidden max-w-[88%] md:max-w-[70%]">
                  <img
                    src={msg.url}
                    alt="Uploaded"
                    className="w-full h-auto max-w-[360px] max-h-[300px] object-contain block rounded-md border border-[#FF4DA6]"
                    onLoad={() =>
                      chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                    onError={() =>
                      chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <AnimatePresence>
          {waiting && (
            <motion.div
              className="flex items-start mb-2 gap-2 px-3 md:px-8"
              aria-live="polite"
              aria-label="Bot is typing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div className="bg-slate-900/70 border border-[#FF4DA6]/40 px-3 py-2 rounded-lg text-[#FF4DA6] shadow-[0_18px_34px_rgba(0,0,0,0.38)] backdrop-blur-sm">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>

      <form
        className="chat-input flex items-center gap-3 px-6 py-3 border-t border-white/10 bg-gradient-to-r from-slate-900/70 to-black/70 flex-none sticky bottom-0 z-10 backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
        autoComplete="off"
      >
        <button
          type="button"
          className="p-2 rounded-full border border-[#FF4DA6]/40 bg-transparent text-[#FF4DA6] hover:bg-[#FF4DA6]/10 active:scale-[0.98] transition-all"
          onClick={() => uploadRef.current?.click()}
          aria-label="Attach image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 002.828 2.828L21 9.828V7h-5.828z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h7"
            />
          </svg>
        </button>

        <textarea
          ref={inputRef as any}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={waiting}
          className="flex-1 resize-none p-3 rounded-2xl border border-white/20 bg-white/5 text-white placeholder:text-white/50 min-h-[48px] max-h-36 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/40 transition-shadow duration-200 backdrop-blur"
        />

        <button
          type="submit"
          disabled={waiting || !input.trim()}
          className="p-2 rounded-full border border-[#FF4DA6] bg-transparent text-[#FF4DA6] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_12px_24px_rgba(0,0,0,0.25)] hover:bg-[#FF4DA6]/10 active:scale-[0.98] transition-all"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M2.94 2.94a1.5 1.5 0 012.12 0L17 14.88V17a1 1 0 01-1 1h-2.12L2.94 5.06a1.5 1.5 0 010-2.12z" />
          </svg>
        </button>
      </form>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImage}
      />

      {activeDetail !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setActiveDetail(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Group {activeDetail}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {ANSWER_DETAILS[activeDetail]?.type ?? "Group details"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetail(null)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                aria-label="Close detail modal"
              >
                ✕
              </button>
            </div>

            {ANSWER_DETAILS[activeDetail] ? (
              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-700">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Image Type
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.type}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Additional Notes
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.notes}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Registration Status
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.registrationStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    User Action
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.action}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Smart Licensing (Recommendation)
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.smartLicensing}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    AI Training
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {ANSWER_DETAILS[activeDetail]?.aiTraining}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Detail data not found.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
};

export default IpAssistant;
