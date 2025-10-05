import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type BotMessage = {
  from: "bot";
  text: string;
  ts?: string;
  verification?: string | null;
};

type Message =
  | { from: "user"; text: string; ts?: string }
  | BotMessage
  | { from: "user-image"; url: string; ts?: string };

const ANSWER_LABELS: Record<number, string> = {
  1: "Kelompok 1",
  2: "Kelompok 2",
  3: "Kelompok 3",
  4: "Kelompok 4",
  5: "Kelompok 5",
  6: "Kelompok 6",
  7: "Kelompok 7",
  8: "Kelompok 8",
  9: "Kelompok 9",
};

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "bot",
      text: "Halo, saya Radut Agent. Ketik 'gradut' untuk mulai analisa gambar.",
      ts: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Assistant selection / popover
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<string>("IP Assistant");
  const assistantMenuRef = useRef<HTMLDivElement | null>(null);
  const assistantOptions = [
    { id: "ip", label: "IP Assistant" },
    { id: "defi", label: "DeFi Assistant (Soon)", soon: true },
    { id: "nft", label: "NFT (Soon)", soon: true },
  ];

  const uploadRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const isMobileRef = useRef(false);
  const autoScrollNextRef = useRef(true);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        assistantMenuRef.current &&
        !assistantMenuRef.current.contains(e.target as Node)
      ) {
        setAssistantMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      isMobileRef.current = window.matchMedia("(max-width: 767px)").matches;
    }
  }, []);

  useEffect(() => {
    if (autoScrollNextRef.current) {
      scrollToBottom();
    }
    autoScrollNextRef.current = true;
    if (!waiting && !isMobileRef.current) inputRef.current?.focus?.();
  }, [messages, waiting]);

  function scrollToBottom() {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function pushMessage(msg: Message) {
    setMessages((m) => [...m, msg]);
  }

  async function handleSend() {
    const value = input.trim();
    if (!value) return;
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    pushMessage({ from: "user", text: value, ts });
    setInput("");
    await new Promise((r) => setTimeout(r, 50));
    if (value.toLowerCase() === "gradut") {
      pushMessage({
        from: "bot",
        text: "Silakan unggah gambar.",
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
      setTimeout(() => uploadRef.current?.click(), 400);
    }
    scrollToBottom();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function compressToBlob(
    file: File,
    maxWidth = 800,
    quality = 0.75,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!file.type || !file.type.startsWith("image/"))
        return reject(new Error("File is not an image"));
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.onload = () => {
          try {
            const scale = Math.min(1, maxWidth / img.width);
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            if (!ctx) return reject(new Error("Canvas not supported"));
            ctx.drawImage(img, 0, 0, w, h);
            c.toBlob(
              (blob) => {
                if (!blob) return reject(new Error("Compression failed"));
                resolve(blob);
              },
              "image/jpeg",
              quality,
            );
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = fr.result as string;
      };
      fr.onerror = () => reject(new Error("File read failed"));
      fr.readAsDataURL(file);
    });
  }

  async function compressAndEnsureSize(
    file: File,
    targetSize = 250 * 1024,
  ): Promise<Blob> {
    let quality = 0.75;
    let maxWidth = 800;
    let blob = await compressToBlob(file, maxWidth, quality);
    let tries = 0;
    while (blob.size > targetSize && tries < 6) {
      if (quality > 0.4) {
        quality = Math.max(0.35, quality - 0.15);
      } else {
        maxWidth = Math.max(300, Math.floor(maxWidth * 0.8));
      }
      try {
        blob = await compressToBlob(file, maxWidth, quality);
      } catch (err) {
        console.error("compression loop error:", err);
        break;
      }
      tries++;
    }
    return blob;
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const inputEl = e.currentTarget as HTMLInputElement;
      const file = inputEl.files?.[0];
      if (inputEl) inputEl.value = "";
      if (!file) return;

      const url = URL.createObjectURL(file);
      pushMessage({
        from: "user-image",
        url,
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
      autoScrollNextRef.current = true;
      setWaiting(true);

      let blob: Blob;
      try {
        blob = await compressAndEnsureSize(file, 250 * 1024);
      } catch (innerErr) {
        console.error(
          "Compression failed, will attempt sending original file",
          innerErr,
        );
        blob = file;
      }

      const form = new FormData();
      form.append("image", blob, file.name);

      const analyz = await fetch("/api/analyze", {
        method: "POST",
        body: form,
      });
      if (analyz.status === 413) {
        const json = await analyz.json().catch(() => ({}));
        autoScrollNextRef.current = false;
        pushMessage({
          from: "bot",
          text: "Gambar terlalu besar, coba kompres/resize sebelum unggah.",
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        setWaiting(false);
        return;
      }
      if (!analyz.ok) {
        const txt = await analyz.text().catch(() => "");
        console.error("/api/analyze failed:", analyz.status, txt);
        autoScrollNextRef.current = false;
        pushMessage({
          from: "bot",
          text: "Gagal analisa gambar.",
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        setWaiting(false);
        return;
      }

      const data = await analyz.json();

      const parsed = data?.parsed;
      let display = "(No analysis result)";
      let verification: string | undefined;

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
          const label = ANSWER_LABELS[finalAnswer] ?? `Jawaban ${finalAnswer}`;
          verification = `Verifikasi akhir: ${label}`;
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
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });

      (async () => {
        try {
          await fetch("/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } catch (e) {}
      })();
    } catch (err: any) {
      console.error("handleImage error:", err);
      const msg = err?.message
        ? `Gagal analisa gambar: ${err.message}`
        : "Gagal analisa gambar.";
      autoScrollNextRef.current = false;
      pushMessage({
        from: "bot",
        text: msg,
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } finally {
      setWaiting(false);
    }
  }

  const [sessions, setSessions] = useState<
    { id: string; title: string; messages: Message[]; ts: string }[]
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("radut_sessions");
      if (raw) setSessions(JSON.parse(raw));
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("radut_sessions", JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions]);

  function handleNewChat() {
    if (messages.length > 1) {
      const titleMsg = messages.find((m) => m.from === "user") as any;
      const title = titleMsg
        ? titleMsg.text.length > 30
          ? titleMsg.text.slice(0, 30) + "..."
          : titleMsg.text
        : `Session ${new Date().toLocaleString()}`;
      const s = {
        id: String(Date.now()),
        title,
        messages,
        ts: new Date().toLocaleString(),
      };
      setSessions((prev) => [s, ...prev].slice(0, 50));
    }
    setMessages([
      {
        from: "bot",
        text: "Halo, saya Radut Agent. Ketik 'gradut' untuk mulai analisa gambar.",
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setWaiting(false);
  }

  function loadSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (s) setMessages(s.messages);
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((p) => p.id !== id));
  }

  const fadeUp = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 6 },
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 p-0 md:p-0 md:overflow-hidden">
      <div className="w-full h-full min-h-0 flex gap-0 items-stretch">
        <aside className="hidden md:flex flex-col w-64 bg-slate-100 text-slate-700 py-4 px-4 h-full sticky top-0 overflow-y-auto items-start border-r border-slate-100">
          <div className="flex items-center w-full mt-0">
            <button
              onClick={handleNewChat}
              className="w-full py-3 px-4 bg-rose-600 text-white rounded-lg font-semibold text-sm text-left shadow-sm transition-colors duration-200 hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              + New chat
            </button>
          </div>
          <h2 className="mt-6 text-sm font-semibold text-slate-700">History</h2>
          <div className="mt-2 flex-1 space-y-2 w-full">
            {sessions.length === 0 ? (
              <div className="text-sm text-slate-500">
                Belum ada riwayat chat
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 w-full rounded-md hover:bg-slate-50 transition-colors"
                >
                  <button
                    className="text-left text-sm text-slate-800 truncate w-full"
                    onClick={() => loadSession(s.id)}
                  >
                    {s.title}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadSession(s.id)}
                      className="text-xs text-rose-600 hover:text-rose-700 transition-colors"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="fixed inset-0 bg-black/40"
                onClick={() => setSidebarOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.aside
                className="relative w-64 bg-slate-100 text-slate-700 py-4 px-4 h-full overflow-y-auto border-r border-slate-100"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <div className="flex items-center w-full mt-0 justify-between">
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-md text-slate-700 hover:bg-slate-200/60 transition-colors"
                  >
                    ✕
                  </button>
                  <button
                    onClick={handleNewChat}
                    className="py-2 px-3 bg-rose-600 text-white rounded-md font-semibold text-sm transition-colors hover:bg-rose-700"
                  >
                    + New chat
                  </button>
                </div>
                <h2 className="mt-6 text-sm font-semibold text-slate-700">
                  History
                </h2>
                <div className="mt-2 flex-1 space-y-2 w-full">
                  {sessions.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      Belum ada riwayat chat
                    </div>
                  ) : (
                    sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-2 w-full rounded-md hover:bg-slate-50 transition-colors"
                      >
                        <button
                          className="text-left text-sm text-slate-800 truncate w-full"
                          onClick={() => {
                            loadSession(s.id);
                            setSidebarOpen(false);
                          }}
                        >
                          {s.title}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              loadSession(s.id);
                              setSidebarOpen(false);
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 transition-colors"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 flex min-h-0">
          <div className="chat-wrap w-full h-full min-h-0 flex flex-col bg-transparent">
            <motion.header
              className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-transparent"
              variants={fadeUp}
              initial="initial"
              animate="animate"
            >
              <button
                type="button"
                className="md:hidden p-2 rounded-md hover:bg-slate-100 active:scale-[0.98] transition-all"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2F46077e6f073142ff88affb7cda7757fd%2F774634956f9848d4a3769e8b64c9ce31?format=webp&width=800"
                alt="Radut Agent"
                className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAssistantMenuOpen((s) => !s)}
                  className="text-lg font-semibold tracking-tight text-slate-900 inline-flex items-center gap-2 focus:outline-none"
                  aria-expanded={assistantMenuOpen}
                >
                  {selectedAssistant}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {assistantMenuOpen && (
                  <div
                    ref={assistantMenuRef}
                    className="absolute left-0 mt-2 w-52 bg-white border border-slate-100 rounded-md shadow-sm z-50"
                  >
                    <div className="py-2">
                      {assistantOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setSelectedAssistant(opt.label);
                            setAssistantMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between"
                        >
                          <span>{opt.label}</span>
                          {opt.soon ? (
                            <span className="text-xs text-slate-400">Soon</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.header>
            <div className="chat-box px-4 md:px-12 py-6 flex-1 overflow-y-auto bg-transparent">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => {
                  if (msg.from === "user") {
                    return (
                      <motion.div
                        key={`u-${i}`}
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
                        <div className="bg-rose-200 text-slate-900 px-5 py-3 rounded-xl max-w-[88%] md:max-w-[70%] break-words shadow-sm">
                          {msg.text}
                        </div>
                      </motion.div>
                    );
                  }
                  if (msg.from === "bot") {
                    return (
                      <motion.div
                        key={`b-${i}`}
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
                          if (i === messages.length - 1) {
                            scrollToBottom();
                          }
                        }}
                        layout
                      >
                        <div className="bg-white border border-slate-100 px-4 py-3 rounded-xl max-w-[88%] md:max-w-[70%] break-words shadow-sm">
                          <div>{msg.text}</div>
                          {msg.verification ? (
                            <div className="mt-2 text-xs text-slate-400">
                              {msg.verification}
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  }
                  return (
                    <motion.div
                      key={`img-${i}`}
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
                          alt="Upload"
                          className="w-full h-auto max-w-[360px] max-h-[300px] object-contain block rounded-md border border-slate-200"
                          onLoad={() => scrollToBottom()}
                          onError={() => scrollToBottom()}
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
                    <div className="bg-white border border-slate-100 px-3 py-2 rounded-lg">
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
              className="chat-input flex items-center gap-3 px-6 py-3 border-t bg-transparent flex-none sticky bottom-0 z-10"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              autoComplete="off"
            >
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 active:scale-[0.98] transition-all"
                onClick={() => uploadRef.current?.click()}
                aria-label="Attach image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-600"
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
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan…"
                disabled={waiting}
                className="flex-1 resize-none p-3 rounded-xl border border-slate-100 bg-white min-h-[48px] max-h-36 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-rose-100 transition-shadow duration-200"
              />

              <button
                type="submit"
                disabled={waiting || !input.trim()}
                className="p-2 rounded-full bg-rose-600 text-white disabled:opacity-50 shadow-md hover:bg-rose-700 active:scale-[0.98] transition-all"
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
          </div>
        </main>
      </div>
    </div>
  );
}
