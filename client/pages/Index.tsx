import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Briefcase,
  History,
  Home,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShoppingBag,
} from "lucide-react";

type BotMessage = {
  from: "bot";
  text: string;
  ts?: string;
  verification?: { label: string; code: number } | string | null;
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

const ANSWER_DETAILS: Record<
  number,
  {
    jenis: string;
    keterangan: string;
    statusRegistrasi: string;
    aksi: string;
    smartLicensing: string;
    aiTraining: string;
  }
> = {
  1: {
    jenis: "AI Generated",
    keterangan: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
    statusRegistrasi: "✅ Diizinkan",
    aksi: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed)",
  },
  2: {
    jenis: "AI Generated",
    keterangan:
      "Mengandung brand/karakter terkenal atau wajah manusia terkenal",
    statusRegistrasi: "❌ Tidak diizinkan",
    aksi: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  3: {
    jenis: "AI Generated",
    keterangan: "Mengandung wajah manusia biasa (tidak terkenal)",
    statusRegistrasi: "❌ Langsung tidak diizinkan → ✅ Jika selfie sukses",
    aksi: "Take Selfi Photo / Submit Review",
    smartLicensing: "Commercial Remix License (jika selfie sukses)",
    aiTraining: "❌ Tidak diizinkan (fixed)",
  },
  4: {
    jenis: "Human Generated",
    keterangan: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
    statusRegistrasi: "✅ Diizinkan",
    aksi: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "✅ Diizinkan (manual setting)",
  },
  5: {
    jenis: "Human Generated",
    keterangan:
      "Mengandung brand/karakter terkenal atau wajah manusia terkenal",
    statusRegistrasi: "❌ Tidak diizinkan",
    aksi: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  6: {
    jenis: "Human Generated",
    keterangan:
      "Mengandung wajah manusia biasa (bukan selebriti atau karakter terkenal)",
    statusRegistrasi: "❌ Langsung tidak diizinkan → ✅ Jika selfie sukses",
    aksi: "Take Selfi Photo / Submit Review",
    smartLicensing: "Commercial Remix License (jika selfie sukses)",
    aiTraining: "✅ Diizinkan (manual setting)",
  },
  7: {
    jenis: "AI Generated (Animasi)",
    keterangan: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
    statusRegistrasi: "✅ Diizinkan",
    aksi: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed)",
  },
  8: {
    jenis: "AI Generated (Animasi)",
    keterangan:
      "Mengandung brand/karakter terkenal atau wajah manusia terkenal",
    statusRegistrasi: "❌ Tidak diizinkan",
    aksi: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  9: {
    jenis: "AI Generated (Animasi)",
    keterangan: "Mengandung wajah manusia biasa (tidak terkenal)",
    statusRegistrasi: "❌ Langsung tidak diizinkan → ✅ Jika selfie sukses",
    aksi: "Take Selfi Photo / Submit Review",
    smartLicensing: "Commercial Remix License (jika selfie sukses)",
    aiTraining: "❌ Tidak diizinkan (fixed)",
  },
};

type HistoryTab = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const HISTORY_TABS: HistoryTab[] = [
  { id: "logo", label: "Logo", icon: Home },
  { id: "dashboard", label: "IP Assistant", icon: LayoutDashboard },
  { id: "ipfi-assistant", label: "IPFi Assistant", icon: Bot },
  { id: "marketplace", label: "NFT Marketplace", icon: ShoppingBag },
  { id: "portfolio", label: "My Portofolio", icon: Briefcase },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "history-chat", label: "History chat", icon: History },
];

const BRAND_NAME = "Radut Verse";
const BRAND_IMAGE_URL =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F52cfa9fa715049a49469c1473e1a313e";

const ACTIVE_HISTORY_TAB = "history-chat";

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
  const [activeDetail, setActiveDetail] = useState<number | null>(null);
  const detailData =
    activeDetail !== null ? ANSWER_DETAILS[activeDetail] : null;
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

  useEffect(() => {
    if (activeDetail === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveDetail(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeDetail]);

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
          const label = ANSWER_LABELS[finalAnswer] ?? `Kelompok ${finalAnswer}`;
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

  const renderBrandHeader = () => (
    <div className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-md bg-black"
        style={{
          backgroundImage: `url(${BRAND_IMAGE_URL})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />
      <div className="text-base font-semibold text-[#FF0088]">{BRAND_NAME}</div>
    </div>
  );

  const renderHistorySection = (options: { closeSidebar?: boolean } = {}) => {
    const { closeSidebar } = options;
    const additionalItems = HISTORY_TABS.slice(1);

    const renderSidebarRow = (item: HistoryTab, isActive: boolean) => {
      const Icon = item.icon;
      const itemClasses = [
      "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150",
      isActive
        ? "border-[#BD4385] bg-black text-[#FF0088] shadow-[0_6px_18px_rgba(189,67,133,0.15)]"
        : "border-transparent text-slate-300 hover:bg-white/5 hover:text-[#FF0088]",
    ].join(" ");
    const iconClasses = [
      "flex h-8 w-8 items-center justify-center rounded-md border border-[#BD4385] bg-black text-slate-400",
      isActive ? "text-[#FF0088]" : "",
    ].join(" ");
    return (
      <div className={itemClasses}>
        <span className={iconClasses}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[#FF0088]">{item.label}</span>
      </div>
    );
    };

    const handleNewChatClick = () => {
      handleNewChat();
      if (closeSidebar) setSidebarOpen(false);
    };

    return (
      <nav className="mt-2 flex-1 w-full text-slate-300">
        <ul className="flex flex-col gap-2">
          {additionalItems.map((item) => {
            const isActive = item.id === ACTIVE_HISTORY_TAB;
            if (item.id === "history-chat") {
              return (
                <li key={item.id} className="space-y-3">
                  <button
                    type="button"
                    onClick={handleNewChatClick}
                    className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-[#FF0088] text-left transition-colors duration-200 hover:bg-[#FF0088]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0088]/40"
                  >
                    + New chat
                  </button>
                  <div className="pl-10">
                    <div className="text-sm font-semibold text-[#FF0088]">
                      History
                    </div>
                    <div className="mt-2 space-y-2">
                      {sessions.length === 0 ? (
                        <div className="text-xs text-[#BD4385]">
                          Belum ada riwayat chat
                        </div>
                      ) : (
                        sessions.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between gap-2 text-xs text-slate-300"
                          >
                            <button
                              type="button"
                              className="flex-1 truncate text-left font-medium text-[#FF0088] hover:text-[#FF0088]/80"
                              onClick={() => {
                                loadSession(s.id);
                                if (closeSidebar) setSidebarOpen(false);
                              }}
                            >
                              {s.title}
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  loadSession(s.id);
                                  if (closeSidebar) setSidebarOpen(false);
                                }}
                                className="text-[11px] font-semibold text-[#FF0088] hover:text-[#FF0088]/80"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSession(s.id)}
                                className="text-[11px] text-slate-400 hover:text-slate-200"
                              >
                                Del
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </li>
              );
            }

            return <li key={item.id}>{renderSidebarRow(item, isActive)}</li>;
          })}
        </ul>
      </nav>
    );
  };

  const fadeUp = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 6 },
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="flex min-h-[100dvh] w-full md:overflow-hidden">
        <aside className="hidden md:flex w-64 flex-col bg-black text-slate-200 py-6 px-4 border-r border-slate-100/30 sticky top-0 max-h-screen min-h-screen overflow-y-auto">
          <div className="flex w-full flex-col gap-6">
            {renderBrandHeader()}
            {renderHistorySection()}
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
                className="relative w-64 bg-black text-slate-200 py-6 px-4 h-full overflow-y-auto border-r border-slate-100/30"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">{renderBrandHeader()}</div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-md text-slate-700 hover:bg-slate-200/60 transition-colors"
                    aria-label="Tutup menu"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-6">
                  {renderHistorySection({ closeSidebar: true })}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 flex min-h-0">
          <div className="chat-wrap w-full h-full min-h-0 flex flex-col bg-black">
            <motion.header
              className="flex items-center gap-3 px-4 py-3 border-b border-[#BD4385]/40 bg-black"
              variants={fadeUp}
              initial="initial"
              animate="animate"
            >
              <button
                type="button"
                className="md:hidden p-2 rounded-md text-[#FF0088] hover:bg-[#FF0088]/10 active:scale-[0.98] transition-all"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
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
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2Fcaea3727c7414261a029f9c3450b5e2b"
                alt="Radut Agent"
                className="h-9 w-9 rounded-full object-cover bg-[#FF0088]"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAssistantMenuOpen((s) => !s)}
                  className="btn-ghost inline-flex items-center gap-2 rounded-md px-2 py-1 text-lg font-semibold tracking-tight text-[#FF0088] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0088]/40"
                  aria-expanded={assistantMenuOpen}
                >
                  <span className="text-[#FF0088]">{selectedAssistant}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 text-slate-400"
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
            <div className="chat-box px-4 md:px-12 py-6 flex-1 overflow-y-auto bg-black">
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
                        <div className="bg-black border border-[#BD4385] text-[#BD4385] px-5 py-3 rounded-xl max-w-[88%] md:max-w-[70%] break-words shadow-sm">
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
                        <div className="bg-black border border-[#BD4385] px-4 py-3 rounded-xl max-w-[88%] md:max-w-[70%] break-words shadow-sm text-[#BD4385]">
                          <div>{msg.text}</div>
                          {verificationObject ? (
                            <div className="mt-2 text-xs text-slate-300">
                              Verifikasi akhir:{" "}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  setActiveDetail(verificationObject.code)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveDetail(verificationObject.code);
                                  }
                                }}
                                className="cursor-pointer text-[#FF0088] underline font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#FF0088]/40 rounded"
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
                          className="w-full h-auto max-w-[360px] max-h-[300px] object-contain block rounded-md border border-[#BD4385]"
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
                        Kelompok {activeDetail}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">
                        {detailData?.jenis ?? "Detail kelompok"}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDetail(null)}
                      className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      aria-label="Tutup detail kelompok"
                    >
                      ✕
                    </button>
                  </div>

                  {detailData ? (
                    <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-700">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Jenis Gambar
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.jenis}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Keterangan Tambahan
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.keterangan}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status Registrasi
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.statusRegistrasi}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Aksi / Opsi User
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.aksi}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Smart Licensing (Rekomendasi)
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.smartLicensing}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          AI Training
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {detailData.aiTraining}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      Data detail tidak ditemukan.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
