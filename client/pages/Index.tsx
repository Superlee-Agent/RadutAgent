import { useEffect, useRef, useState } from "react";

type Message =
  | { from: "user"; text: string; ts?: string }
  | { from: "bot"; text: string; ts?: string }
  | { from: "user-image"; url: string; ts?: string };

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
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollToBottom();
    // autofocus input when not waiting
    if (!waiting) inputRef.current?.focus?.();
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

  // allow Enter to send, Shift+Enter for newline
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

  // Try compressing repeatedly until below targetSize (bytes) or minQuality and reduce dimensions
  async function compressAndEnsureSize(
    file: File,
    targetSize = 250 * 1024,
  ): Promise<Blob> {
    let quality = 0.75;
    let maxWidth = 800;
    let blob = await compressToBlob(file, maxWidth, quality);
    let tries = 0;
    while (blob.size > targetSize && tries < 6) {
      // reduce quality first, then dimensions
      if (quality > 0.4) {
        quality = Math.max(0.35, quality - 0.15);
      } else {
        maxWidth = Math.max(300, Math.floor(maxWidth * 0.8));
      }
      try {
        blob = await compressToBlob(file, maxWidth, quality);
      } catch (err) {
        // if compression fails mid-loop, break to fallback
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
      // clear input safely
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
      setWaiting(true);

      // compress on client and ensure under target size
      let blob: Blob;
      try {
        blob = await compressAndEnsureSize(file, 250 * 1024); // 250KB target
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
        pushMessage({
          from: "bot",
          text: "Gambar terlalu besar, coba kompres/resize sebelum unggah.",
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        setWaiting(false);
        scrollToBottom();
        return;
      }
      if (!analyz.ok) {
        const txt = await analyz.text().catch(() => "");
        console.error("/api/analyze failed:", analyz.status, txt);
        pushMessage({
          from: "bot",
          text: "Gagal analisa gambar.",
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        setWaiting(false);
        scrollToBottom();
        return;
      }

      const data = await analyz.json();

      // Prefer the structured parsed result from the server (minimized, no debug)
      const parsed = data?.parsed;
      let display = "(No analysis result)";
      if (parsed && typeof parsed === "object") {
        const reason = parsed.reason ?? null;
        // Hide numeric selected_answer for all cases; display only the human-readable reason
        display = reason || "(No analysis result)";
      } else {
        const rawText = data?.raw ? String(data.raw).trim() : "";
        display = rawText || "(No analysis result)";
      }
      pushMessage({
        from: "bot",
        text: display,
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });

      // Still call the deterministic router endpoint in the background for logging/side-effects
      (async () => {
        try {
          await fetch("/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } catch (e) {
          /* ignore background router errors */
        }
      })();
    } catch (err: any) {
      console.error("handleImage error:", err);
      const msg = err?.message
        ? `Gagal analisa gambar: ${err.message}`
        : "Gagal analisa gambar.";
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
      scrollToBottom();
    }
  }

  // session management: save/load chat sessions to localStorage
  const [sessions, setSessions] = useState<
    { id: string; title: string; messages: Message[]; ts: string }[]
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("radut_sessions");
      if (raw) setSessions(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("radut_sessions", JSON.stringify(sessions));
    } catch (e) {
      // ignore
    }
  }, [sessions]);

  function handleNewChat() {
    // save current session if it has user content
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
    // reset to initial bot welcome
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

  return (
    <div className="h-screen bg-gradient-to-br from-red-50 via-pink-50 to-white p-0 md:p-0 md:overflow-hidden">
      <div className="w-full h-full flex gap-0 items-stretch">
        {/* Sidebar - visible on md+ */}
        <aside className="hidden md:flex flex-col w-64 bg-gradient-to-b from-gray-200 to-pink-50 text-pink-700 pt-2 pb-4 px-4 h-full sticky top-0 overflow-y-auto items-start border-r border-pink-100">
          <div className="flex items-center w-full mt-0">
            <button
              onClick={handleNewChat}
              className="w-full py-2 px-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-md font-semibold text-sm text-left"
            >
              + New chat
            </button>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-pink-700">History</h2>
          <div className="mt-2 flex-1 space-y-2 w-full">
            {sessions.length === 0 ? (
              <div className="text-sm text-pink-600">
                Belum ada riwayat chat
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 w-full rounded-md hover:bg-pink-100"
                >
                  <button
                    className="text-left text-sm text-pink-700 truncate w-full"
                    onClick={() => loadSession(s.id)}
                  >
                    {s.title}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadSession(s.id)}
                      className="text-xs text-pink-600"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="text-xs text-slate-400"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="relative w-64 bg-gradient-to-b from-gray-200 to-pink-50 text-pink-700 pt-2 pb-4 px-4 h-full overflow-y-auto border-r border-pink-100">
              <div className="flex items-center w-full mt-0 justify-between">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-md text-pink-700"
                >
                  ✕
                </button>
                <button
                  onClick={handleNewChat}
                  className="py-2 px-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-md font-semibold text-sm"
                >
                  + New chat
                </button>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-pink-700">
                History
              </h2>
              <div className="mt-2 flex-1 space-y-2 w-full">
                {sessions.length === 0 ? (
                  <div className="text-sm text-pink-600">
                    Belum ada riwayat chat
                  </div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 w-full rounded-md hover:bg-pink-100"
                    >
                      <button
                        className="text-left text-sm text-pink-700 truncate w-full"
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
                          className="text-xs text-pink-600"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => deleteSession(s.id)}
                          className="text-xs text-slate-400"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Main chat area */}
        <main className="flex-1 flex justify-center">
          <div className="chat-wrap w-full h-full flex flex-col bg-white">
            <header className="flex items-center gap-3 px-4 py-2 border-b border-pink-200 bg-white">
              <button
                type="button"
                className="md:hidden p-2 rounded-md"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-pink-700"
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
                className="w-10 h-10 rounded-full object-cover ring-2 ring-pink-200"
              />
              <h1 className="text-lg font-semibold tracking-tight text-pink-700">
                Radut Agent
              </h1>
            </header>
            <div className="chat-box px-6 py-4 flex-1 overflow-y-auto bg-pink-50">
              {messages.map((msg, i) =>
                msg.from === "user" ? (
                  <div key={i} className="flex justify-end mb-3">
                    <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-lg max-w-[70%] break-words">
                      {msg.text}
                      <div className="text-xs text-pink-100 mt-1 text-right">
                        {msg.ts}
                      </div>
                    </div>
                  </div>
                ) : msg.from === "bot" ? (
                  <div key={i} className="flex items-start mb-2 gap-2">
                    <div className="bg-white border border-pink-200 px-4 py-2 rounded-lg max-w-[70%] break-words">
                      {msg.text}
                      <div className="text-xs text-pink-400 mt-1">{msg.ts}</div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-end mb-3">
                    <div className="rounded-md overflow-hidden max-w-[70%]">
                      <img
                        src={msg.url}
                        alt="Upload"
                        className="w-full h-auto max-w-[360px] max-h-[300px] object-contain block rounded-md border border-pink-300"
                      />
                      <div className="text-xs text-slate-400 mt-1 text-right">
                        {msg.ts}
                      </div>
                    </div>
                  </div>
                ),
              )}
              {waiting && (
                <div
                  className="flex items-start mb-2 gap-2"
                  aria-live="polite"
                  aria-label="Bot is typing"
                >
                  <div className="bg-white border border-pink-200 px-3 py-2 rounded-lg">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              className="chat-input flex items-center gap-2 px-4 py-3 border-t bg-white flex-none sticky bottom-0 z-10"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              autoComplete="off"
            >
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100"
                onClick={() => uploadRef.current?.click()}
                aria-label="Attach image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-pink-600"
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
                className="flex-1 resize-none p-2 rounded-md border border-pink-200 bg-white min-h-[40px] max-h-32 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-pink-200"
              />

              <button
                type="submit"
                disabled={waiting || !input.trim()}
                className="p-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white disabled:opacity-50"
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
