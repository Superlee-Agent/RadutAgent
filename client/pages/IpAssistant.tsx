import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useIPRegistrationAgent } from "@/hooks/useIPRegistrationAgent";
import {
  getLicenseSettingsByGroup,
  GROUPS,
  requiresSelfieVerification,
  requiresSubmitReview,
} from "@/lib/groupLicense";

type BotMessage = {
  from: "bot";
  text: string;
  ts?: string;
  verification?: { label: string; code: string } | string | null;
  ctxKey?: string;
};

export type Message =
  | { from: "user"; text: string; ts?: string }
  | BotMessage
  | { from: "user-image"; url: string; ts?: string }
  | {
      from: "register";
      group: number;
      title: string;
      description: string;
      ctxKey: string;
      ts?: string;
    };

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  ts: string;
};

const ANSWER_DETAILS: Record<
  string,
  {
    type: string;
    notes: string;
    registrationStatus: string;
    action: string;
    smartLicensing: string;
    aiTraining: string;
  }
> = {
  "1": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Tidak ada wajah orang; Tidak ada brand/karakter terkenal",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed, tidak bisa diubah)",
  },
  "2": {
    type: "AI Generated",
    notes: "Gambar hasil AI; Mengandung brand/karakter terkenal",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "3": {
    type: "AI Generated",
    notes: "Gambar hasil AI; Wajah orang terkenal; wajah terlihat full",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "4": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Wajah orang terkenal; wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed, tidak bisa diubah)",
  },
  "5": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Wajah orang biasa (tidak terkenal); wajah terlihat full",
    registrationStatus: "❌ Tidak bisa diregistrasi langsung",
    action:
      "Take Selfie Photo → Jika verifikasi selfie sukses: IP bisa diregistrasi; jika gagal: Submit Review",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual) — jika verifikasi sukses",
    aiTraining: "❌ Tidak diizinkan (fixed, tidak bisa diubah)",
  },
  "6": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Wajah orang biasa (tidak terkenal); wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed, tidak bisa diubah)",
  },
  "7": {
    type: "Human Generated",
    notes: "Gambar asli non AI; Mengandung brand/karakter terkenal",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "8": {
    type: "Human Generated",
    notes: "Gambar asli non AI; Wajah orang terkenal; wajah terlihat full",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "9": {
    type: "Human Generated",
    notes:
      "Gambar asli non AI; Wajah orang terkenal; wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "✅ Diizinkan (manual setting oleh user)",
  },
  "10": {
    type: "Human Generated",
    notes:
      "Gambar asli non AI; Wajah orang biasa (tidak terkenal); wajah terlihat full",
    registrationStatus: "❌ Tidak bisa diregistrasi langsung",
    action:
      "Take Selfie Photo → Jika verifikasi selfie sukses: IP bisa diregistrasi; jika gagal: Submit Review",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual) — jika verifikasi sukses",
    aiTraining: "✅ Diizinkan (manual setting oleh user)",
  },
  "11": {
    type: "Human Generated",
    notes:
      "Gambar asli non AI; Wajah orang biasa (tidak terkenal); wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "✅ Diizinkan (manual setting oleh user)",
  },
  "12": {
    type: "AI Generated (Animation)",
    notes:
      "Gambar animasi 2D/3D hasil AI; Tidak mengandung brand/karakter terkenal",
    registrationStatus: "�� IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "❌ Tidak diizinkan (fixed, tidak bisa diubah)",
  },
  "13": {
    type: "AI Generated (Animation)",
    notes: "Gambar animasi 2D/3D hasil AI; Mengandung brand/karakter terkenal",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "14": {
    type: "Human Generated (Animation)",
    notes:
      "Gambar animasi 2D/3D asli non AI; Tidak mengandung brand/karakter terkenal",
    registrationStatus: "✅ IP bisa diregistrasi",
    action: "-",
    smartLicensing:
      "Commercial Remix License (minting fee & revenue share manual)",
    aiTraining: "✅ Diizinkan (manual setting oleh user)",
  },
  "15": {
    type: "Human Generated (Animation)",
    notes:
      "Gambar animasi 2D/3D asli non AI; Mengandung brand/karakter terkenal",
    registrationStatus: "❌ IP tidak bisa diregistrasi",
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
  text: "Hello, I am Radut Agent. Attach an image to analyze.",
  ts: getCurrentTimestamp(),
});

const getMessagePreview = (message: Message) => {
  if (message.from === "user-image") {
    return "Image uploaded";
  }
  if ((message as any).from === "register") {
    return `Register IP: ${(message as any).title}`;
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
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const uploadRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const isMobileRef = useRef(false);
  const autoScrollNextRef = useRef(true);
  const lastUploadBlobRef = useRef<Blob | null>(null);
  const lastUploadNameRef = useRef<string>("");
  const lastAnalysisFactsRef = useRef<Record<string, any> | null>(null);
  const analysisContextsRef = useRef<
    Map<string, { blob: Blob; name: string; facts: Record<string, any> | null }>
  >(new Map());

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

  const { registerState, executeRegister, resetRegister } =
    useIPRegistrationAgent();
  const [mintingFee, setMintingFee] = useState<number | "">("");
  const [revShare, setRevShare] = useState<number | "">("");
  const [aiTrainingManual, setAiTrainingManual] = useState<boolean>(true);
  const [loadingRegisterFor, setLoadingRegisterFor] = useState<string | null>(
    null,
  );
  const [guestMode, setGuestMode] = useState<boolean>(false);

  useEffect(() => {
    if (activeDetail === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveDetail(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeDetail]);

  useEffect(() => {
    resetRegister();
    setMintingFee("");
    setRevShare("");
    setAiTrainingManual(true);
  }, [activeDetail, resetRegister]);

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

  const summaryFromAnswer = (code: string): string => {
    const info = ANSWER_DETAILS[code];
    if (info) return `${info.type} · ${info.notes}.`;
    return "(Unknown classification)";
  };

  const handleImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const inputEl = event.currentTarget as HTMLInputElement;
        const files = inputEl.files ? Array.from(inputEl.files) : [];
        if (inputEl) inputEl.value = "";
        if (files.length === 0) return;

        // Show previews
        for (const f of files) {
          const url = URL.createObjectURL(f);
          pushMessage({ from: "user-image", url, ts: getCurrentTimestamp() });
        }
        autoScrollNextRef.current = true;
        setWaiting(true);

        // Compress and build form
        const form = new FormData();
        for (const f of files) {
          let blob: Blob;
          try {
            blob = await compressAndEnsureSize(f, 250 * 1024);
          } catch (error) {
            console.error("Compression failed, sending original file", error);
            blob = f;
          }
          form.append("image", blob, f.name || "image.jpg");
          lastUploadBlobRef.current = blob;
          lastUploadNameRef.current = f.name || "image.jpg";
        }

        const response = await fetch("/api/upload", {
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
        let display = "(No analysis result)";
        let verification: { label: string; code: number } | string | undefined;

        if (
          typeof (data as any)?.group === "number" &&
          (data as any)?.details
        ) {
          const g = (data as any).group as number;
          const d = (data as any).details as Record<string, any>;
          lastAnalysisFactsRef.current = d;
          verification = { label: `Detail`, code: String(g) as any };
          let caption = "";
          let detectedBrand = "";
          let detectedCharacter = "";
          try {
            const blob = lastUploadBlobRef.current;
            if (blob) {
              const form = new FormData();
              form.append(
                "image",
                blob,
                lastUploadNameRef.current || "image.jpg",
              );
              if (lastAnalysisFactsRef.current) {
                form.append(
                  "facts",
                  JSON.stringify(lastAnalysisFactsRef.current),
                );
              }
              const res = await fetch("/api/describe", {
                method: "POST",
                body: form,
              });
              if (res.ok) {
                const j = await res.json();
                const t = typeof j.title === "string" ? j.title : "";
                const dsc =
                  typeof j.description === "string" ? j.description : "";
                detectedBrand =
                  typeof j.brand === "string" ? (j.brand || "").trim() : "";
                detectedCharacter =
                  typeof j.character === "string"
                    ? (j.character || "").trim()
                    : "";
                const br = detectedBrand ? ` — Brand: ${detectedBrand}` : "";
                const ch = detectedCharacter
                  ? ` — Character: ${detectedCharacter}`
                  : "";
                caption = [t, dsc].filter(Boolean).join(" — ") + (br || ch);
              }
            }
          } catch {}
          if (!caption) {
            const info =
              ANSWER_DETAILS[String(g) as keyof typeof ANSWER_DETAILS];
            caption = [info?.type, info?.notes].filter(Boolean).join(" — ");
          }
          if (caption && caption.length > 140) {
            caption = caption.slice(0, 139) + "…";
          }
          const facts = d || {};
          const licenseSettings = getLicenseSettingsByGroup(g);

          // Gunakan peta grup sebagai sumber kebenaran agar teks relevan dan tidak menyesatkan
          const brandGroups = [2, 7, 13, 15];
          const famousFullGroups = [3, 8];
          const famousNotFullGroups = [4, 9];
          const ordinaryFullGroups = [5, 10];
          const ordinaryNotFullGroups = [6, 11];
          const animationGroups = [12, 13, 14, 15];
          const aiGroups = [1, 2, 3, 4, 5, 6, 12, 13];

          const isAnimGroup = animationGroups.includes(g);
          const isAIGroup = aiGroups.includes(g);
          const isBrandGroup = brandGroups.includes(g);

          const brandName = isBrandGroup
            ? (detectedBrand || detectedCharacter || "").trim()
            : "";

          // Klasifikasi berbasis grup saja (bukan flag mentah), agar konsisten
          let classification = isAnimGroup
            ? isAIGroup
              ? "Animasi AI"
              : "Animasi non-AI"
            : isAIGroup
              ? "Gambar AI"
              : "Foto non-AI";

          if (isBrandGroup) {
            classification += ` dengan ${brandName ? (detectedBrand ? "merek " + brandName : "karakter " + brandName) : "merek/karakter terkenal"}`;
          } else if (famousFullGroups.includes(g)) {
            classification += " dengan wajah figur publik penuh";
          } else if (famousNotFullGroups.includes(g)) {
            classification += " dengan figur publik tidak penuh";
          } else if (ordinaryFullGroups.includes(g)) {
            classification += " dengan wajah orang biasa penuh";
          } else if (ordinaryNotFullGroups.includes(g)) {
            classification += " dengan wajah orang biasa tidak penuh";
          } else {
            classification += " tanpa wajah/merek";
          }

          // Keputusan berbasis grup + licenseSettings
          let verdict = "";
          if (licenseSettings) {
            if (famousNotFullGroups.includes(g)) {
              verdict =
                "IP ini bisa diregister karena figur publik tidak terlihat penuh.";
            } else if (ordinaryNotFullGroups.includes(g)) {
              verdict =
                "IP ini bisa diregister karena wajah tidak terlihat penuh.";
            } else if (isAnimGroup && !isBrandGroup) {
              verdict =
                "IP ini bisa diregister karena animasi tanpa merek/karakter.";
            } else if (
              !isBrandGroup &&
              !famousFullGroups.includes(g) &&
              !ordinaryFullGroups.includes(g)
            ) {
              verdict =
                "IP ini bisa diregister karena tidak menampilkan wajah/merek.";
            } else {
              verdict =
                "IP ini bisa diregister karena memenuhi kriteria kebijakan.";
            }
          } else if (requiresSelfieVerification(g)) {
            verdict =
              "IP ini tidak bisa diregister langsung karena perlu verifikasi selfie (wajah orang biasa terlihat penuh).";
          } else if (requiresSubmitReview(g)) {
            if (isBrandGroup) {
              verdict = `IP ini tidak bisa diregister langsung karena ${brandName ? `${detectedBrand ? "mengandung merek" : "mengandung karakter"} ${brandName}` : "mengandung merek/karakter terkenal"}.`;
            } else if (famousFullGroups.includes(g)) {
              verdict =
                "IP ini tidak bisa diregister langsung karena menampilkan wajah figur publik secara penuh.";
            } else {
              verdict =
                "IP ini tidak bisa diregister langsung karena perlu peninjauan.";
            }
          } else if (g === 0) {
            verdict = "Analisis tidak pasti; kirim untuk peninjauan.";
          } else {
            verdict = "IP ini tidak bisa diregister.";
          }

          display = `Ini ${classification}. ${verdict}`;
        } else {
          const rawText = data?.raw ? String(data.raw).trim() : "";
          display = rawText || "(No analysis result)";
        }

        autoScrollNextRef.current = false;
        const ctxKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (lastUploadBlobRef.current) {
          analysisContextsRef.current.set(ctxKey, {
            blob: lastUploadBlobRef.current,
            name: lastUploadNameRef.current || "image.jpg",
            facts: lastAnalysisFactsRef.current || null,
          });
        }
        pushMessage({
          from: "bot",
          text: display,
          verification,
          ts: getCurrentTimestamp(),
          ctxKey,
        });
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={guestMode}
          onClick={() => setGuestMode((v) => !v)}
          className={
            "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 border " +
            (guestMode
              ? "bg-[#FF4DA6] text-white border-[#FF4DA6] hover:bg-[#ff77c2]"
              : "text-[#FF4DA6] border-[#FF4DA6]/50 hover:bg-[#FF4DA6]/15")
          }
        >
          Guest
        </button>
        <button
          type="button"
          onClick={handleWalletButtonClick}
          disabled={walletButtonDisabled}
          className="inline-flex items-center rounded-lg border border-[#FF4DA6]/50 px-3 py-1.5 text-sm font-semibold text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {walletButtonText}
        </button>
      </div>
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
                    type: "tween",
                    duration: 0.3,
                    ease: [0.22, 1, 0.36, 1],
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
                    type: "tween",
                    duration: 0.3,
                    ease: [0.22, 1, 0.36, 1],
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
                        {(() => {
                          const codeStr = String(verificationObject.code);
                          const info =
                            ANSWER_DETAILS[
                              codeStr as keyof typeof ANSWER_DETAILS
                            ];
                          const canRegisterByText =
                            !!info && info.registrationStatus.includes("✅");
                          const canRegisterByGroup =
                            !!getLicenseSettingsByGroup(Number(codeStr));
                          const canRegister =
                            canRegisterByText || canRegisterByGroup;
                          if (!canRegister) return null;
                          return (
                            <>
                              {" "}
                              <span className="mx-1 text-slate-400">•</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={async () => {
                                  const ctxKeyForMsg = (msg as any).ctxKey as
                                    | string
                                    | undefined;
                                  if (!ctxKeyForMsg) return;
                                  if (loadingRegisterFor === ctxKeyForMsg)
                                    return;
                                  setLoadingRegisterFor(ctxKeyForMsg);
                                  const groupNum = Number(codeStr);
                                  let title = "";
                                  let desc = "";
                                  try {
                                    const ctx =
                                      analysisContextsRef.current.get(
                                        ctxKeyForMsg,
                                      );
                                    const blob = ctx?.blob;
                                    const name = ctx?.name || "image.jpg";
                                    const facts = ctx?.facts || null;
                                    if (blob) {
                                      const form = new FormData();
                                      form.append("image", blob, name);
                                      if (facts) {
                                        form.append(
                                          "facts",
                                          JSON.stringify(facts),
                                        );
                                      }
                                      const res = await fetch("/api/describe", {
                                        method: "POST",
                                        body: form,
                                      });
                                      if (res.ok) {
                                        const j = await res.json();
                                        title =
                                          typeof j.title === "string"
                                            ? j.title
                                            : "";
                                        desc =
                                          typeof j.description === "string"
                                            ? j.description
                                            : "";
                                      }
                                    }
                                  } catch {}
                                  if (!title)
                                    title =
                                      ANSWER_DETAILS[
                                        String(
                                          codeStr,
                                        ) as keyof typeof ANSWER_DETAILS
                                      ]?.type || "IP Asset";
                                  if (!desc)
                                    desc = summaryFromAnswer(String(codeStr));
                                  if (title.length > 60)
                                    title = title.slice(0, 59) + "…";
                                  if (desc.length > 120)
                                    desc = desc.slice(0, 119) + "…";
                                  pushMessage({
                                    from: "register",
                                    group: groupNum,
                                    title,
                                    description: desc,
                                    ctxKey: ctxKeyForMsg,
                                    ts: getCurrentTimestamp(),
                                  });
                                  setLoadingRegisterFor(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveDetail(codeStr);
                                  }
                                }}
                                className={`cursor-pointer text-[#FF4DA6] font-semibold underline underline-offset-2 decoration-[#FF4DA6]/60 outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30 rounded ${loadingRegisterFor === (msg as any).ctxKey ? "pointer-events-none opacity-70" : ""}`}
                              >
                                {loadingRegisterFor === (msg as any).ctxKey ? (
                                  <>
                                    Please wait
                                    <span className="ml-2 inline-flex align-middle">
                                      <span className="dot" />
                                      <span className="dot" />
                                      <span className="dot" />
                                    </span>
                                  </>
                                ) : (
                                  "Register"
                                )}
                              </span>
                            </>
                          );
                        })()}
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

            if (msg.from === "register") {
              const groupNum = msg.group;
              const info =
                ANSWER_DETAILS[String(groupNum) as keyof typeof ANSWER_DETAILS];
              const isManualAI =
                GROUPS.DIRECT_REGISTER_MANUAL_AI.includes(groupNum);
              return (
                <motion.div
                  key={`register-${index}`}
                  className="flex items-start mb-2 gap-2 px-3 md:px-8"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{
                    type: "tween",
                    duration: 0.32,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  layout
                >
                  <div className="bg-slate-900/70 border border-[#FF4DA6]/40 px-4 py-3 rounded-2xl max-w-[88%] md:max-w-[70%] break-words shadow-[0_18px_34px_rgba(0,0,0,0.4)] text-slate-100 backdrop-blur-sm w-full">
                    <div className="text-sm font-semibold text-[#FF4DA6]">
                      Register This IP
                    </div>
                    <div className="mt-1 text-slate-200">
                      <div className="mt-1 font-medium">{msg.title}</div>
                      <div className="mt-1 text-sm whitespace-pre-line">
                        {msg.description}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="text-sm text-slate-300">
                        Minting Fee
                        <input
                          type="number"
                          min={0}
                          value={mintingFee === "" ? "" : mintingFee}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMintingFee(v === "" ? "" : Number(v));
                          }}
                          className="mt-1 w-full rounded-md border border-slate-600 bg-black/30 p-2 text-slate-100"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Rev Share (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={revShare === "" ? "" : revShare}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") return setRevShare("");
                            const n = Number(v);
                            setRevShare(Math.min(100, Math.max(0, isNaN(n) ? 0 : n)));
                          }}
                          className="mt-1 w-full rounded-md border border-slate-600 bg-black/30 p-2 text-slate-100"
                        />
                      </label>
                      <label className="text-sm text-slate-300 flex items-center gap-2 sm:col-span-1">
                        <input
                          type="checkbox"
                          checked={aiTrainingManual}
                          onChange={(e) =>
                            setAiTrainingManual(e.target.checked)
                          }
                          disabled={!isManualAI}
                          className="h-4 w-4"
                        />
                        <span>Allow AI Training</span>
                      </label>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          const ctxKey = (msg as any).ctxKey as
                            | string
                            | undefined;
                          if (!ctxKey)
                            return alert("No analysis context found.");
                          const ctx = analysisContextsRef.current.get(ctxKey);
                          const blob = ctx?.blob;
                          if (!blob)
                            return alert("No uploaded image to register.");
                          const displayTitle = msg.title || `IP Asset`;
                          const file = new File(
                            [blob],
                            ctx?.name || `image-${Date.now()}.jpg`,
                            { type: blob.type || "image/jpeg" },
                          );
                          let ethProvider: any = guestMode
                            ? undefined
                            : (window as any).ethereum;
                          try {
                            if (!guestMode && wallets && wallets[0]?.getEthereumProvider) {
                              ethProvider = await wallets[0].getEthereumProvider();
                            }
                          } catch {}
                          const mf = mintingFee === "" ? undefined : Number(mintingFee);
                          const rs = revShare === "" ? undefined : Number(revShare);
                          await executeRegister(
                            groupNum,
                            file,
                            mf,
                            rs,
                            aiTrainingManual,
                            { title: displayTitle, prompt: msg.description },
                            ethProvider,
                          );
                        }}
                        disabled={
                          registerState.status === "minting" ||
                          !analysisContextsRef.current.get(
                            (msg as any).ctxKey || "",
                          )?.blob
                        }
                        className="rounded-md border border-[#FF4DA6] px-4 py-2 text-sm font-semibold text-[#FF4DA6] hover:bg-[#FF4DA6]/10 disabled:opacity-50"
                      >
                        {registerState.status === "minting"
                          ? "Registering…"
                          : "Register IP"}
                      </button>
                      <div className="text-xs text-slate-400">
                        Status: {registerState.status}{" "}
                        {registerState.progress
                          ? `(${registerState.progress}%)`
                          : ""}
                        {registerState.status === "success" &&
                        registerState.ipId ? (
                          <>
                            {" "}
                            <span className="mx-1 text-slate-500">•</span>
                            <a
                              href={`https://aeneid.explorer.story.foundation/ipa/${registerState.ipId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#FF4DA6] hover:underline"
                            >
                              View
                            </a>
                          </>
                        ) : null}
                        {registerState.error ? (
                          <span className="ml-2 text-red-500">
                            {String(
                              registerState.error?.message ||
                                registerState.error,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
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
                  type: "tween",
                  duration: 0.28,
                  ease: [0.22, 1, 0.36, 1],
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
                  {ANSWER_DETAILS[activeDetail ?? ""]?.type ?? "Group details"}
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
              <>
                <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-700">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Image Type
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.type}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Additional Notes
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.notes}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Registration Status
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.registrationStatus}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      User Action
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.action}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Smart Licensing (Recommendation)
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.smartLicensing}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      AI Training
                    </dt>
                    <dd className="mt-1 text-slate-800">
                      {ANSWER_DETAILS[activeDetail ?? ""]?.aiTraining}
                    </dd>
                  </div>
                </dl>
              </>
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
