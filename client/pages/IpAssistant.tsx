import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useIPRegistrationAgent } from "@/hooks/useIPRegistrationAgent";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  getLicenseSettingsByGroup,
  GROUPS,
  requiresSelfieVerification,
  requiresSubmitReview,
} from "@/lib/groupLicense";

type BotMessage = {
  id?: string;
  from: "bot";
  text: string;
  ts?: string;
  verification?: { label: string; code: string } | string | null;
  ctxKey?: string;
  isProcessing?: boolean;
};

export type Message =
  | { id?: string; from: "user"; text: string; ts?: string }
  | BotMessage
  | { id?: string; from: "user-image"; url: string; ts?: string }
  | {
      id?: string;
      from: "register";
      group: number;
      title: string;
      description: string;
      ctxKey: string;
      ts?: string;
    }
  | {
      id?: string;
      from: "ip-check";
      status: "pending" | "loading" | "complete";
      address?: string;
      originalCount?: number;
      remixCount?: number;
      totalCount?: number;
      error?: string;
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
    notes: "AI-generated image; No human face; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "2": {
    type: "AI Generated",
    notes: "AI-generated image; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "3": {
    type: "AI Generated",
    notes: "AI-generated image; Famous person's face; full face visible",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "4": {
    type: "AI Generated",
    notes:
      "AI-generated image; Famous person's face; not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "5": {
    type: "AI Generated",
    notes:
      "AI-generated image; Regular person's face (not famous); full face visible",
    registrationStatus: "❌ Cannot be registered directly",
    action:
      "Take Selfie Photo → If selfie verification succeeds: IP can be registered; if it fails: Submit Review",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)  — if verification succeeds",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "6": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Wajah orang biasa (tidak terkenal); wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "7": {
    type: "Human Generated",
    notes: "Original non-AI image; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "8": {
    type: "Human Generated",
    notes: "Original non-AI image; Famous person's face; full face visible",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "9": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Famous person's face; not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "��� Allowed (user-configurable)",
  },
  "10": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Regular person's face (not famous); full face visible",
    registrationStatus: "❌ Cannot be registered directly",
    action:
      "Take Selfie Photo → If selfie verification succeeds: IP can be registered; if it fails: Submit Review",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)  — if verification succeeds",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "11": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Regular person's face (not famous); not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "12": {
    type: "AI Generated (Animation)",
    notes: "AI-generated 2D/3D animation; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "13": {
    type: "AI Generated (Animation)",
    notes: "AI-generated 2D/3D animation; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "14": {
    type: "Human Generated (Animation)",
    notes: "Original non-AI 2D/3D animation; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "15": {
    type: "Human Generated (Animation)",
    notes: "Original non-AI 2D/3D animation; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
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
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  from: "bot",
  text: "Hello, I am Radut Agent. Attach an image and I'll analyze it automatically.",
  ts: getCurrentTimestamp(),
});

const getMessagePreview = (message: Message) => {
  if (message.from === "user-image") {
    return "Image uploaded";
  }
  if ((message as any).from === "register") {
    return `Register IP: ${(message as any).title}`;
  }
  if ((message as any).from === "ip-check") {
    const ipMsg = message as any;
    if (ipMsg.status === "pending") {
      return "IP Assets Check (pending address input)";
    }
    if (ipMsg.error) {
      return `IP Check Error: ${ipMsg.error.slice(0, 30)}...`;
    }
    const eligible =
      ipMsg.totalCount > 20 ? " �� STORY OG CARD NFT ELIGIBLE" : "";
    return `IP Assets: ${ipMsg.totalCount} (${ipMsg.originalCount} original, ${ipMsg.remixCount} remixes)${eligible}`;
  }
  if ("text" in message && message.text.trim().length === 0) {
    return "(Empty message)";
  }
  if ("text" in message && message.text.length <= 40) {
    return message.text;
  }
  if ("text" in message) {
    return `${message.text.slice(0, 40)}...`;
  }
  return "(Unknown message)";
};

const IP_ASSISTANT_AVATAR =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F885c66a9b5da433b9a8c619e8679d4c7";

export const STORAGE_KEY = "radut_sessions";
export const CURRENT_SESSION_KEY = "radut_current_session";

const isValidEthereumAddress = (address: string): boolean => {
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
};

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
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedImagesRef = useRef<Set<string>>(new Set());

  // throttled scroll helpers to avoid excessive layout work on mobile
  const lastScrollRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);
  const scrollToBottom = useCallback(
    (options?: { behavior?: ScrollBehavior }) => {
      const now = Date.now();
      if (now - lastScrollRef.current < 150) return; // throttle to ~150ms
      lastScrollRef.current = now;
      if (typeof window !== "undefined") {
        if (scrollRafRef.current)
          cancelAnimationFrame(scrollRafRef.current as any);
        scrollRafRef.current = requestAnimationFrame(() => {
          try {
            chatEndRef.current?.scrollIntoView({
              behavior: options?.behavior ?? "smooth",
              block: "end",
              inline: "nearest",
            });
          } catch (e) {}
          scrollRafRef.current = null;
        });
      }
    },
    [],
  );

  // Immediate (non-smooth) scroll used when user sends a message to avoid perceived lag
  const scrollToBottomImmediate = useCallback(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current as any);
    try {
      chatEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
        inline: "nearest",
      });
      // ensure the scrollable container is fully scrolled to bottom as a fallback
      const el = chatEndRef.current;
      if (el) {
        const parent = el.parentElement as HTMLElement | null;
        if (parent && parent.scrollTo) {
          parent.scrollTo({
            top: parent.scrollHeight,
            left: 0,
            behavior: "auto",
          });
        }
      }
    } catch (e) {}
    lastScrollRef.current = Date.now();
  }, []);

  // Common motion props for all message bubbles to ensure uniform animation and consistent scrolling behavior
  const getBubbleMotionProps = useCallback(
    (index: number) => ({
      initial: { opacity: 0, x: 20, scale: 0.95 },
      animate: { opacity: 1, x: 0, scale: 1 },
      exit: { opacity: 0, x: 20, scale: 0.95 },
      transition: {
        type: "spring",
        damping: 20,
        stiffness: 300,
        mass: 0.8,
        delay: Math.min(index * 0.03, 0.15),
      },
      layout: true,
      onAnimationComplete: () => {
        // when the animation for the last message finishes, ensure immediate scroll
        if (index === messages.length - 1 && autoScrollNextRef.current) {
          scrollToBottomImmediate();
        }
      },
    }),
    [messages.length, scrollToBottomImmediate],
  );

  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    if (typeof window !== "undefined") {
      isMobileRef.current = window.matchMedia("(max-width: 767px)").matches;
    }
  }, []);

  useEffect(() => {
    if (autoScrollNextRef.current) {
      // use throttled scroll helper instead of raw timeouts
      scrollToBottomImmediate();
    }
    autoScrollNextRef.current = true;
    if (!waiting && !isMobileRef.current) inputRef.current?.focus?.();
  }, [messages, waiting]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current as any);
      }
    };
  }, []);

  const { registerState, executeRegister, resetRegister } =
    useIPRegistrationAgent();
  const [mintingFee, setMintingFee] = useState<number | "">("");
  const [revShare, setRevShare] = useState<number | "">("");
  const [aiTrainingManual, setAiTrainingManual] = useState<boolean>(true);
  const [loadingRegisterFor, setLoadingRegisterFor] = useState<string | null>(
    null,
  );
  const [guestMode, setGuestMode] = useState<boolean>(false);
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{
    blob: Blob;
    name: string;
    url: string;
  } | null>(null);
  const [registerEdits, setRegisterEdits] = useState<
    Record<
      string,
      {
        title: string;
        description: string;
        editingTitle: boolean;
        editingDesc: boolean;
      }
    >
  >({});
  const [ipCheckInput, setIpCheckInput] = useState<string>("");
  const [ipCheckLoading, setIpCheckLoading] = useState<string | null>(null);

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

  useEffect(() => {
    setIpCheckInput("");
    setIpCheckLoading(null);
    // Clean up old blobs from analysisContextsRef to prevent memory leak
    // Keep only the last 10 contexts, remove older ones
    const contexts = Array.from(analysisContextsRef.current.entries());
    if (contexts.length > 10) {
      const toRemove = contexts.slice(0, contexts.length - 10);
      toRemove.forEach(([key]) => {
        analysisContextsRef.current.delete(key);
      });
    }
  }, [messages]);

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
      const raw = sessionStorage.getItem(CURRENT_SESSION_KEY);
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
      const raw = sessionStorage.getItem(STORAGE_KEY);
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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error("Failed to persist sessions", error);
    }
  }, [sessions]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(messages));
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

  const pushMessage = useCallback(
    (msg: Message) => {
      const id =
        (msg as any).id ||
        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const msgWithId = { ...(msg as any), id } as Message;
      setMessages((prev) => {
        const next = [...prev, msgWithId];
        // If the message is from the user (text or image), bot, or an ip-check bubble, ensure immediate scroll so UI feels responsive
        const from = (msgWithId as any).from;
        if (
          from === "user" ||
          from === "user-image" ||
          from === "bot" ||
          from === "ip-check"
        ) {
          // allow DOM to update then scroll immediately
          requestAnimationFrame(() => {
            try {
              // small timeout to ensure layout is ready
              setTimeout(() => {
                if (autoScrollNextRef.current) scrollToBottomImmediate();
              }, 0);
            } catch (e) {}
          });
        }
        return next;
      });
    },
    [scrollToBottomImmediate],
  );

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

  const runDetection = useCallback(
    async (blob: Blob, fileName: string) => {
      // show explicit processing message
      const processingId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const processingTs = getCurrentTimestamp();
      pushMessage({
        id: processingId,
        from: "bot",
        text: "Processing image, please wait…",
        ts: processingTs,
        isProcessing: true,
      });
      setWaiting(true);
      try {
        // First, upload and analyze the image
        const form = new FormData();
        form.append("image", blob, fileName);
        lastUploadBlobRef.current = blob;
        lastUploadNameRef.current = fileName;

        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });

        if (response.status === 413) {
          autoScrollNextRef.current = false;
          // update processing message to error
          setMessages((prev) =>
            prev.map((m) =>
              (m as any).id === processingId
                ? {
                    ...(m as BotMessage),
                    text: "The image is too large. Please compress or resize before uploading.",
                    isProcessing: false,
                  }
                : m,
            ),
          );
          setWaiting(false);
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          console.error("/api/upload failed:", response.status, text);
          autoScrollNextRef.current = false;
          setMessages((prev) =>
            prev.map((m) =>
              (m as any).id === processingId
                ? {
                    ...(m as BotMessage),
                    text: "Image analysis failed.",
                    isProcessing: false,
                  }
                : m,
            ),
          );
          setWaiting(false);
          return;
        }

        const data = await response.json();
        let display = (data as any)?.display || "(No analysis result)";
        let verification: { label: string; code: number } | string | undefined;

        if (
          typeof (data as any)?.group === "number" &&
          (data as any)?.details
        ) {
          const g = (data as any).group as number;
          const d = (data as any).details as Record<string, any>;
          lastAnalysisFactsRef.current = d;
          verification = { label: `Detail`, code: String(g) as any };
        } else {
          const rawText = data?.raw ? String(data.raw).trim() : "";
          display = rawText || "(No analysis result)";
        }

        const ctxKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (lastUploadBlobRef.current) {
          analysisContextsRef.current.set(ctxKey, {
            blob: lastUploadBlobRef.current,
            name: lastUploadNameRef.current || "image.jpg",
            facts: lastAnalysisFactsRef.current || null,
          });
        }

        // update processing message to indicate completion
        setMessages((prev) =>
          prev.map((m) =>
            (m as any).id === processingId
              ? {
                  ...(m as BotMessage),
                  text: "Analysis completed.",
                  isProcessing: false,
                }
              : m,
          ),
        );

        // small delay so user sees the 'completed' state before the result bubble
        await new Promise((resolve) => setTimeout(resolve, 350));

        // push actual result bubble
        pushMessage({
          from: "bot",
          text: display,
          verification,
          ts: getCurrentTimestamp(),
          ctxKey,
        });
        autoScrollNextRef.current = true;
      } catch (error: any) {
        console.error("runDetection error", error);
        const message = error?.message
          ? `Image analysis failed: ${error.message}`
          : "Image analysis failed.";
        // update the processing message to show the error
        setMessages((prev) =>
          prev.map((m) =>
            (m as any).id === processingId
              ? { ...(m as BotMessage), text: message, isProcessing: false }
              : m,
          ),
        );
        autoScrollNextRef.current = true;
      } finally {
        setWaiting(false);
      }
    },
    [pushMessage],
  );

  const handleSend = useCallback(async () => {
    const value = input.trim();
    const hasPreview = previewImage !== null;

    if (!value && !hasPreview) return;

    const ts = getCurrentTimestamp();

    if (hasPreview) {
      pushMessage({
        from: "user-image",
        url: previewImage.url,
        ts,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await runDetection(previewImage.blob, previewImage.name);
      setPreviewImage(null);
    }

    if (value) {
      pushMessage({ from: "user", text: value, ts });
    }

    setInput("");
    scrollToBottomImmediate();
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (value.toLowerCase() === "register") {
      if (lastUploadBlobRef.current) {
        await runDetection(
          lastUploadBlobRef.current,
          lastUploadNameRef.current || "image.jpg",
        );
      } else {
        pushMessage({
          from: "bot",
          text: "Please upload an image.",
          ts: getCurrentTimestamp(),
        });
        setTimeout(() => uploadRef.current?.click(), 400);
      }
    } else if (value.toLowerCase() === "check ip") {
      autoScrollNextRef.current = false;
      pushMessage({
        from: "ip-check",
        status: "pending",
        ts: getCurrentTimestamp(),
      });
    } else if (value.toLowerCase() === "gradut") {
      // gradut function is empty
    }
    autoScrollNextRef.current = true;

    if (isMobileRef.current) {
      try {
        inputRef.current?.blur?.();
        try {
          (document.activeElement as HTMLElement | null)?.blur?.();
        } catch (e) {}
        setTimeout(() => {
          inputRef.current?.blur?.();
          try {
            (document.activeElement as HTMLElement | null)?.blur?.();
          } catch (e) {}
        }, 50);
      } catch (e) {
        // ignore
      }
    }
  }, [input, previewImage, pushMessage, runDetection]);

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

  const checkIpAssets = useCallback(async (address: string) => {
    if (!address || address.trim().length === 0) {
      return;
    }

    const trimmedAddress = address.trim();
    const loadingKey = `ip-check-${Date.now()}`;

    try {
      setIpCheckLoading(loadingKey);

      console.log("[IP Check] Sending address:", trimmedAddress);

      const response = await fetch("/api/check-ip-assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: trimmedAddress,
        }),
      });

      console.log("[IP Check] Response status:", response.status);

      if (!response.ok) {
        let errorMessage = `API Error: ${response.status}`;
        let errorDetails = "";

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          errorDetails = errorData.details || "";
        } catch {
          // Failed to parse error response, use status-based message
          if (response.status === 400) {
            errorMessage = "Invalid Ethereum address format";
          } else if (response.status === 500) {
            errorMessage = "Server error - unable to fetch IP assets";
          }
        }

        const fullError = errorDetails
          ? `${errorMessage}: ${errorDetails}`
          : errorMessage;
        throw new Error(fullError);
      }

      const data = await response.json();
      console.log("[IP Check] Response data:", data);
      const { totalCount, originalCount, remixCount } = data;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.from === "ip-check" && (msg as any).status === "pending"
            ? {
                ...msg,
                status: "complete",
                address: trimmedAddress,
                originalCount,
                remixCount,
                totalCount,
              }
            : msg,
        ),
      );
      // ensure the UI scrolls to show the completed ip-check result immediately
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (autoScrollNextRef.current) scrollToBottomImmediate();
        }, 0);
      });
      setIpCheckInput("");
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to fetch IP assets";
      console.error("IP Assets Check Error:", error);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.from === "ip-check" && (msg as any).status === "pending"
            ? {
                ...msg,
                status: "complete",
                address: trimmedAddress,
                error: errorMessage,
              }
            : msg,
        ),
      );
      // ensure the UI scrolls to show the error result immediately
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (autoScrollNextRef.current) scrollToBottomImmediate();
        }, 0);
      });
    } finally {
      setIpCheckLoading(null);
    }
  }, []);

  const handleImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const inputEl = event.currentTarget as HTMLInputElement;
        const files = inputEl.files ? Array.from(inputEl.files) : [];
        if (inputEl) inputEl.value = "";
        if (files.length === 0) return;

        const f = files[0];
        let blob: Blob;
        try {
          blob = await compressAndEnsureSize(f, 250 * 1024);
        } catch (error) {
          console.error("Compression failed, sending original file", error);
          blob = f;
        }

        const url = URL.createObjectURL(blob);
        lastUploadBlobRef.current = blob;
        lastUploadNameRef.current = f.name || "image.jpg";

        setPreviewImage({
          blob,
          name: f.name || "image.jpg",
          url,
        });
      } catch (error: any) {
        console.error("handleImage error", error);
        const message = error?.message
          ? `Image upload failed: ${error.message}`
          : "Image upload failed.";
        pushMessage({
          from: "bot",
          text: message,
          ts: getCurrentTimestamp(),
        });
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
            "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 " +
            (guestMode
              ? "bg-[#FF4DA6] text-white hover:bg-[#ff77c2]"
              : "text-[#FF4DA6] hover:bg-[#FF4DA6]/15")
          }
        >
          Guest
        </button>
        <button
          type="button"
          onClick={handleWalletButtonClick}
          disabled={walletButtonDisabled}
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="chat-box px-3 sm:px-4 md:px-12 pt-4 pb-24 flex-1 overflow-y-auto bg-transparent scroll-smooth">
        <AnimatePresence initial={false} mode="popLayout">
          {messages.map((msg, index) => {
            if (msg.from === "user") {
              return (
                <motion.div
                  key={`user-${index}`}
                  {...getBubbleMotionProps(index)}
                  className="flex justify-end mb-2 px-2 md:px-4"
                >
                  <div className="bg-[#ff4da6] text-white px-4 py-2 rounded-2xl max-w-[85%] md:max-w-[65%] break-words text-[0.95rem]">
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
                  {...getBubbleMotionProps(index)}
                  className="flex items-start mb-2 gap-2 px-2 md:px-4"
                >
                  <div className="bg-slate-900/70 px-4 py-2.5 rounded-2xl max-w-[85%] md:max-w-[65%] break-words text-slate-100 text-[0.95rem]">
                    <div className="flex items-center gap-3">
                      {msg.isProcessing ? (
                        <div className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-[#FF4DA6]/10 p-1">
                          <svg
                            className="h-4 w-4 text-[#FF4DA6] animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="9"
                              stroke="currentColor"
                              strokeOpacity="0.15"
                              strokeWidth="3"
                            />
                            <path
                              d="M21.5 12a9.5 9.5 0 00-9.5-9.5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      ) : null}
                      <div>{msg.text}</div>
                    </div>
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
                          const isAuthEnabled = guestMode || authenticated;
                          if (!canRegister) return null;
                          if (!isAuthEnabled) {
                            return (
                              <>
                                {" "}
                                <span className="mx-1 text-slate-400">•</span>
                                <span className="text-[#FF4DA6]/60 text-xs">
                                  (Connect wallet or use guest mode to register)
                                </span>
                              </>
                            );
                          }
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
                  {...getBubbleMotionProps(index)}
                  className="flex items-start mb-2 gap-2 px-2 md:px-4"
                >
                  <div className="bg-slate-900/70 px-4 py-2.5 rounded-2xl max-w-[85%] md:max-w-[65%] break-words text-slate-100">
                    <div className="text-sm font-semibold text-[#FF4DA6]">
                      Smart Licensing
                    </div>
                    <div className="mt-1 text-slate-200">
                      {(() => {
                        const ctxKey = (msg as any).ctxKey as
                          | string
                          | undefined;
                        const meta = ctxKey ? registerEdits[ctxKey] : undefined;
                        const titleVal = meta?.title ?? msg.title;
                        const descVal = meta?.description ?? msg.description;
                        return (
                          <>
                            <div className="mt-1 font-medium flex items-center gap-2">
                              {meta?.editingTitle ? (
                                <>
                                  <input
                                    type="text"
                                    value={titleVal}
                                    onChange={(e) => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title: e.target.value,
                                          description:
                                            prev[ctxKey]?.description ??
                                            msg.description,
                                          editingTitle: true,
                                          editingDesc:
                                            prev[ctxKey]?.editingDesc ?? false,
                                        },
                                      }));
                                    }}
                                    className="min-w-0 flex-1 rounded-md bg-black/30 p-2 text-slate-100"
                                  />
                                  <button
                                    type="button"
                                    className="text-xs text-[#FF4DA6] hover:underline border-0 bg-transparent"
                                    onClick={() => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title:
                                            prev[ctxKey]?.title ?? msg.title,
                                          description:
                                            prev[ctxKey]?.description ??
                                            msg.description,
                                          editingTitle: false,
                                          editingDesc:
                                            prev[ctxKey]?.editingDesc ?? false,
                                        },
                                      }));
                                    }}
                                  >
                                    Done
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="truncate">{titleVal}</span>
                                  <button
                                    type="button"
                                    className="ml-1 text-xs text-[#FF4DA6] hover:underline border-0 bg-transparent"
                                    onClick={() => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title: titleVal,
                                          description:
                                            prev[ctxKey]?.description ??
                                            msg.description,
                                          editingTitle: true,
                                          editingDesc:
                                            prev[ctxKey]?.editingDesc ?? false,
                                        },
                                      }));
                                    }}
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="mt-1 text-sm whitespace-pre-line">
                              {meta?.editingDesc ? (
                                <div className="flex items-start gap-2">
                                  <textarea
                                    value={descVal}
                                    onChange={(e) => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title:
                                            prev[ctxKey]?.title ?? msg.title,
                                          description: e.target.value,
                                          editingTitle:
                                            prev[ctxKey]?.editingTitle ?? false,
                                          editingDesc: true,
                                        },
                                      }));
                                    }}
                                    className="w-full rounded-md bg-black/30 p-2 text-slate-100 resize-none"
                                    rows={3}
                                  />
                                  <button
                                    type="button"
                                    className="text-xs text-[#FF4DA6] hover:underline border-0 bg-transparent mt-1"
                                    onClick={() => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title:
                                            prev[ctxKey]?.title ?? msg.title,
                                          description:
                                            prev[ctxKey]?.description ??
                                            msg.description,
                                          editingTitle:
                                            prev[ctxKey]?.editingTitle ?? false,
                                          editingDesc: false,
                                        },
                                      }));
                                    }}
                                  >
                                    Done
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2">
                                  <div className="whitespace-pre-line break-words flex-1">
                                    {descVal}
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs text-[#FF4DA6] hover:underline border-0 bg-transparent"
                                    onClick={() => {
                                      if (!ctxKey) return;
                                      setRegisterEdits((prev) => ({
                                        ...prev,
                                        [ctxKey]: {
                                          title:
                                            prev[ctxKey]?.title ?? msg.title,
                                          description: descVal,
                                          editingTitle:
                                            prev[ctxKey]?.editingTitle ?? false,
                                          editingDesc: true,
                                        },
                                      }));
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
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
                          className="mt-1 w-full rounded-md bg-black/30 p-2 text-slate-100"
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
                            setRevShare(
                              Math.min(100, Math.max(0, isNaN(n) ? 0 : n)),
                            );
                          }}
                          className="mt-1 w-full rounded-md bg-black/30 p-2 text-slate-100"
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
                          const ctxKey2 = (msg as any).ctxKey as
                            | string
                            | undefined;
                          const editedMeta = ctxKey2
                            ? registerEdits[ctxKey2]
                            : undefined;
                          const displayTitle =
                            (editedMeta?.title &&
                            editedMeta.title.trim().length > 0
                              ? editedMeta.title
                              : msg.title) || `IP Asset`;
                          const displayDesc =
                            editedMeta?.description ?? msg.description;
                          const file = new File(
                            [blob],
                            ctx?.name || `image-${Date.now()}.jpg`,
                            { type: blob.type || "image/jpeg" },
                          );
                          let ethProvider: any = guestMode
                            ? undefined
                            : (window as any).ethereum;
                          try {
                            if (
                              !guestMode &&
                              wallets &&
                              wallets[0]?.getEthereumProvider
                            ) {
                              ethProvider =
                                await wallets[0].getEthereumProvider();
                            }
                          } catch {}
                          const mf =
                            mintingFee === "" ? undefined : Number(mintingFee);
                          const rs =
                            revShare === "" ? undefined : Number(revShare);
                          await executeRegister(
                            groupNum,
                            file,
                            mf,
                            rs,
                            aiTrainingManual,
                            { title: displayTitle, prompt: displayDesc },
                            ethProvider,
                          );
                        }}
                        disabled={
                          registerState.status === "minting" ||
                          !analysisContextsRef.current.get(
                            (msg as any).ctxKey || "",
                          )?.blob ||
                          (!guestMode && !authenticated)
                        }
                        title={
                          !guestMode && !authenticated
                            ? "Connect wallet or enable guest mode to register"
                            : ""
                        }
                        className="rounded-md bg-[#FF4DA6]/20 px-4 py-2 text-sm font-semibold text-[#FF4DA6] hover:bg-[#FF4DA6]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {registerState.status === "minting"
                          ? "Registering…"
                          : !guestMode && !authenticated
                            ? "Register IP (requires auth)"
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

            if (msg.from === "ip-check") {
              const ipCheckMsg = msg as any;
              const isLoading =
                ipCheckLoading !== null && ipCheckMsg.status === "pending";

              if (ipCheckMsg.status === "pending") {
                return (
                  <motion.div
                    key={`ip-check-${index}`}
                    {...getBubbleMotionProps(index)}
                    className="flex items-start mb-2 last:mb-1 gap-2 px-3 md:px-8"
                  >
                    <div className="bg-slate-900/70 px-2 sm:px-3 md:px-[1.2rem] py-2 md:py-3 rounded-2xl md:rounded-3xl w-[calc(100vw-3rem)] sm:w-full sm:max-w-[85%] md:max-w-[70%] break-words text-slate-100 font-medium text-sm md:text-[0.97rem] overflow-hidden">
                      <div className="text-slate-100 text-sm md:text-base">
                        Please enter a wallet address to check your IP assets:
                      </div>
                      <div className="mt-2 md:mt-3 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={ipCheckInput}
                          onChange={(e) => setIpCheckInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !isLoading &&
                              isValidEthereumAddress(ipCheckInput)
                            ) {
                              e.preventDefault();
                              checkIpAssets(ipCheckInput);
                            }
                          }}
                          placeholder="0x..."
                          className="flex-1 rounded-lg bg-black/30 px-2 md:px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/30"
                          aria-label="Wallet address input"
                        />
                        <button
                          type="button"
                          onClick={() => checkIpAssets(ipCheckInput)}
                          disabled={
                            isLoading || !isValidEthereumAddress(ipCheckInput)
                          }
                          className="rounded-lg bg-[#FF4DA6]/20 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-[#FF4DA6] whitespace-nowrap hover:bg-[#FF4DA6]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
                          aria-label="Check IP assets for wallet address"
                        >
                          {isLoading ? (
                            <span className="flex items-center gap-1 md:gap-2">
                              <span className="dot" />
                              <span className="dot" />
                              <span className="dot" />
                            </span>
                          ) : (
                            "Check"
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              if (ipCheckMsg.status === "complete") {
                return (
                  <motion.div
                    key={`ip-check-result-${index}`}
                    {...getBubbleMotionProps(index)}
                    className="flex items-start mb-2 last:mb-1 gap-2 px-3 md:px-8"
                  >
                    <div className="bg-slate-900/70 border border-[#FF4DA6]/40 px-2 sm:px-3 md:px-[1.2rem] py-2 md:py-3 rounded-2xl md:rounded-3xl w-[calc(100vw-3rem)] sm:w-full sm:max-w-[85%] md:max-w-[70%] break-words shadow-[0_12px_32px_rgba(0,0,0,0.3)] text-slate-100 backdrop-blur-lg transition-all duration-300 font-medium overflow-hidden">
                      {ipCheckMsg.error ? (
                        <div className="text-red-400">
                          <div className="font-semibold mb-2 text-sm md:text-base">
                            Error
                          </div>
                          <div className="text-xs md:text-sm">
                            {ipCheckMsg.error}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs md:text-[0.97rem] mb-2 md:mb-3 break-all">
                            Address:{" "}
                            <span className="text-[#FF4DA6] font-mono text-[0.85rem] md:text-[0.97rem]">
                              {truncateAddress(ipCheckMsg.address)}
                            </span>
                          </div>
                          <div className="space-y-2 md:space-y-3">
                            <div className="text-base md:text-lg font-bold text-[#FF4DA6]">
                              Total IP Assets: {ipCheckMsg.totalCount}
                            </div>
                            <div className="grid grid-cols-2 gap-2 md:gap-3">
                              <div className="bg-black/40 rounded-lg p-1.5 md:p-2">
                                <div className="text-xs text-slate-400 mb-0.5 md:mb-1">
                                  Original
                                </div>
                                <div className="text-lg md:text-xl font-bold text-[#FF4DA6]">
                                  {ipCheckMsg.originalCount}
                                </div>
                              </div>
                              <div className="bg-black/40 rounded-lg p-1.5 md:p-2">
                                <div className="text-xs text-slate-400 mb-0.5 md:mb-1">
                                  Remixes
                                </div>
                                <div className="text-lg md:text-xl font-bold text-[#FF4DA6]">
                                  {ipCheckMsg.remixCount}
                                </div>
                              </div>
                            </div>
                            {ipCheckMsg.totalCount > 20 ? (
                              <div className="mt-2 md:mt-3 p-2 md:p-3 rounded-lg bg-[#FF4DA6]/20">
                                <div className="flex items-start md:items-center gap-1.5 md:gap-2 mb-1">
                                  <span className="text-base md:text-lg flex-shrink-0">
                                    ✨
                                  </span>
                                  <div className="font-bold text-[#FF4DA6] text-xs md:text-sm break-words">
                                    STORY OG CARD NFT ELIGIBLE
                                  </div>
                                </div>
                                <div className="text-xs text-slate-300 leading-tight">
                                  Congratulations! You are eligible for a STORY
                                  OG CARD NFT.
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 md:mt-3 p-2 md:p-3 rounded-lg bg-slate-700/20">
                                <div className="flex items-start md:items-center gap-1.5 md:gap-2 mb-1">
                                  <span className="text-base md:text-lg flex-shrink-0">
                                    ℹ️
                                  </span>
                                  <div className="font-bold text-slate-300 text-xs md:text-sm">
                                    NOT ELIGIBLE
                                  </div>
                                </div>
                                <div className="text-xs text-slate-400 leading-tight">
                                  You are not eligible for a STORY OG CARD NFT
                                  at this time.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              }
            }

            return (
              <motion.div
                key={`image-${index}`}
                {...getBubbleMotionProps(index)}
                className="flex justify-end mb-3 last:mb-1 px-3 md:px-8"
              >
                <div className="rounded-md overflow-hidden max-w-[88%] md:max-w-[70%]">
                  <img
                    src={msg.url}
                    alt="Uploaded"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto max-w-[90vw] sm:max-w-[420px] md:max-w-[720px] max-h-[50vh] object-contain block rounded-md"
                    onLoad={() => {
                      const imgKey = `img-${index}-${msg.url}`;
                      if (!loadedImagesRef.current.has(imgKey)) {
                        loadedImagesRef.current.add(imgKey);
                        if (
                          index === messages.length - 1 &&
                          autoScrollNextRef.current
                        ) {
                          // throttle scrolling for performance
                          scrollToBottomImmediate();
                        }
                      }
                    }}
                    onError={() => {
                      const imgKey = `img-${index}-${msg.url}`;
                      if (!loadedImagesRef.current.has(imgKey)) {
                        loadedImagesRef.current.add(imgKey);
                        if (
                          index === messages.length - 1 &&
                          autoScrollNextRef.current
                        ) {
                          // throttle scrolling for performance
                          scrollToBottomImmediate();
                        }
                      }
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </div>

      <form
        className="chat-input flex items-center gap-2 px-3 sm:px-[1.45rem] py-3.5 border-t-0 md:border-t md:border-[#FF4DA6]/10 bg-slate-950/60 md:bg-gradient-to-r md:from-slate-950/60 md:via-[#FF4DA6]/5 md:to-slate-950/60 flex-none sticky bottom-0 z-10 backdrop-blur-xl transition-all duration-300"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
        autoComplete="off"
      >
        <div className="flex-1 flex flex-col gap-2 bg-slate-900/60 rounded-2xl pl-2 pr-4 py-2 focus-within:ring-2 focus-within:ring-[#FF4DA6]/30 transition-all duration-300">
          {previewImage && (
            <div className="flex items-center gap-2 bg-slate-900/40 rounded-lg p-2">
              <img
                src={previewImage.url}
                alt="Preview"
                className="h-16 w-16 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">
                  {previewImage.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Ready to send</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="flex-shrink-0 p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
                aria-label="Remove preview"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex-shrink-0 p-1.5 text-[#FF4DA6] hover:bg-[#FF4DA6]/20 rounded-lg active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
            onClick={() => uploadRef.current?.click()}
            onPointerDown={(e) => e.preventDefault()}
            aria-label="Add attachment"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>

          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex-shrink-0 p-1.5 text-[#FF4DA6] hover:bg-[#FF4DA6]/20 rounded-lg active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                aria-label="Tools menu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-48 p-0 bg-slate-900/95 border border-[#FF4DA6]/20 rounded-lg backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-[#FF4DA6]/20 first:rounded-t-lg transition-colors"
              >
                IP Assistant
              </button>
              <button
                type="button"
                disabled
                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-[#FF4DA6]/20 last:rounded-b-lg transition-colors cursor-not-allowed opacity-60"
              >
                IPFI (coming soon)
              </button>
            </PopoverContent>
          </Popover>

          <textarea
            ref={inputRef as any}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={waiting}
            className="flex-1 resize-none px-4 py-0 bg-transparent text-white placeholder:text-slate-400 min-h-[40px] max-h-32 overflow-y-auto focus:outline-none font-medium text-[0.97rem] disabled:opacity-50"
          />
          </div>
        </div>

        <button
          type="submit"
          disabled={waiting || (!input.trim() && !previewImage)}
          className="flex-shrink-0 p-2 rounded-lg bg-[#FF4DA6]/20 text-[#FF4DA6] hover:bg-[#FF4DA6]/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
          aria-label="Send message"
          onPointerDown={(e) => e.preventDefault()}
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

      <AnimatePresence>
        {activeDetail !== null ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setActiveDetail(null)}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.div
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group {activeDetail}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    {ANSWER_DETAILS[activeDetail ?? ""]?.type ??
                      "Group details"}
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
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default IpAssistant;
