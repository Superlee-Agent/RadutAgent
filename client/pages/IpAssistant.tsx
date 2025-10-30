import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import DashboardLayout from "@/components/layout/DashboardLayout";
import ChatHeaderActions from "@/components/ip-assistant/ChatHeaderActions";
import SidebarExtras from "@/components/ip-assistant/SidebarExtras";
import ChatInput from "@/components/ip-assistant/ChatInput";
import { YouTubeStyleSearchResults } from "@/components/ip-assistant/YouTubeStyleSearchResults";
import { useIPRegistrationAgent } from "@/hooks/useIPRegistrationAgent";
import {
  getLicenseSettingsByGroup,
  GROUPS,
  requiresSelfieVerification,
  requiresSubmitReview,
} from "@/lib/groupLicense";
import { ANSWER_DETAILS } from "@/lib/ip-assistant/answer-details";
import {
  getCurrentTimestamp,
  getInitialBotMessage,
  getMessagePreview,
  isValidEthereumAddress,
  summaryFromAnswer,
  truncateAddress,
} from "@/lib/ip-assistant/utils";
import {
  CURRENT_SESSION_KEY,
  IP_ASSISTANT_AVATAR,
  STORAGE_KEY,
} from "@/lib/ip-assistant/constants";
import type {
  BotMessage,
  ChatSession,
  Message,
} from "@/lib/ip-assistant/types";

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
  const expandedMediaContainerRef = useRef<HTMLDivElement | null>(null);

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
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [expandedAsset, setExpandedAsset] = useState<any>(null);
  const [showAssetDetails, setShowAssetDetails] = useState<boolean>(false);
  const [showRemixMenu, setShowRemixMenu] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (activeDetail === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveDetail(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeDetail]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        showRemixMenu &&
        !target.closest("button:has(🔄)") &&
        !target.closest("[data-remix-menu]")
      ) {
        setShowRemixMenu(false);
      }
    }
    if (showRemixMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showRemixMenu]);

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

  // Get typing suggestions from the agent
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!input.trim() || input.length < 3) {
        setSuggestions([]);
        return;
      }

      try {
        setSuggestionsLoading(true);
        const response = await fetch("/api/get-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: input.trim(),
            context: messages.slice(-5), // Last 5 messages for context
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { suggestions: string[] };
          setSuggestions(data.suggestions.slice(0, 3)); // Show max 3 suggestions
        }
      } catch (error) {
        console.error("Failed to get suggestions:", error);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 800); // Debounce by 800ms

    return () => clearTimeout(timer);
  }, [input, messages]);

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
        let verification: { label: string; code: string } | string | undefined;

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

  const searchIP = useCallback(
    async (query: string, mediaType?: string | null) => {
      if (!query || query.trim().length === 0) {
        return;
      }

      const trimmedQuery = query.trim();
      const searchKey = `search-${Date.now()}`;

      try {
        setWaiting(true);

        console.log("[Search IP] Searching for:", trimmedQuery, { mediaType });

        const requestBody: any = {
          query: trimmedQuery,
        };

        if (mediaType) {
          requestBody.mediaType = mediaType;
        }

        const response = await fetch("/api/search-ip-assets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log("[Search IP] Response status:", response.status);

        if (!response.ok) {
          let errorMessage = `API Error: ${response.status}`;

          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            if (response.status === 400) {
              errorMessage = "Invalid search query";
            } else if (response.status === 500) {
              errorMessage = "Server error - unable to search IP assets";
            }
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("[Search IP] Response data:", data);
        const { results = [], message = "" } = data;

        setSearchResults(results);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.from === "search-ip" && (msg as any).status === "pending"
              ? {
                  ...msg,
                  status: "complete",
                  query: trimmedQuery,
                  results,
                  resultCount: results.length,
                }
              : msg,
          ),
        );

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (autoScrollNextRef.current) scrollToBottomImmediate();
          }, 0);
        });
      } catch (error: any) {
        const errorMessage = error?.message || "Failed to search IP assets";
        console.error("Search IP Error:", error);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.from === "search-ip" && (msg as any).status === "pending"
              ? {
                  ...msg,
                  status: "complete",
                  query: trimmedQuery,
                  error: errorMessage,
                }
              : msg,
          ),
        );

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (autoScrollNextRef.current) scrollToBottomImmediate();
          }, 0);
        });
      } finally {
        setWaiting(false);
      }
    },
    [scrollToBottomImmediate],
  );

  const searchByOwner = useCallback(
    async (ownerAddress: string, displayQuery?: string) => {
      if (!ownerAddress || ownerAddress.trim().length === 0) {
        return;
      }

      const trimmedAddress = ownerAddress.trim();
      const displayValue = displayQuery || trimmedAddress;

      try {
        setWaiting(true);

        console.log(
          "[Search By Owner] Searching for assets by owner:",
          trimmedAddress,
        );

        const response = await fetch("/api/search-by-owner", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerAddress: trimmedAddress,
          }),
        });

        console.log("[Search By Owner] Response status:", response.status);

        if (!response.ok) {
          let errorMessage = `API Error: ${response.status}`;

          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            if (response.status === 400) {
              errorMessage = "Invalid owner address format";
            } else if (response.status === 500) {
              errorMessage = "Server error - unable to search IP assets";
            }
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("[Search By Owner] Response data:", data);
        const { results = [], message = "" } = data;

        setSearchResults(results);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.from === "search-ip" && (msg as any).status === "pending"
              ? {
                  ...msg,
                  status: "complete",
                  query: displayValue,
                  results,
                  resultCount: results.length,
                }
              : msg,
          ),
        );

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (autoScrollNextRef.current) scrollToBottomImmediate();
          }, 0);
        });
      } catch (error: any) {
        const errorMessage =
          error?.message || "Failed to search IP assets by owner";
        console.error("Search By Owner Error:", error);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.from === "search-ip" && (msg as any).status === "pending"
              ? {
                  ...msg,
                  status: "complete",
                  query: displayValue,
                  error: errorMessage,
                }
              : msg,
          ),
        );

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (autoScrollNextRef.current) scrollToBottomImmediate();
          }, 0);
        });
      } finally {
        setWaiting(false);
      }
    },
    [scrollToBottomImmediate],
  );

  const handleSend = useCallback(async () => {
    const value = input.trim();
    const hasPreview = previewImage !== null;

    if (!value && !hasPreview) return;

    const ts = getCurrentTimestamp();

    if (value) {
      pushMessage({ from: "user", text: value, ts });
    }

    setInput("");
    scrollToBottomImmediate();
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (value.toLowerCase() === "register") {
      if (hasPreview) {
        pushMessage({
          from: "user-image",
          url: previewImage.url,
          ts,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await runDetection(previewImage.blob, previewImage.name);
        setPreviewImage(null);
      } else if (lastUploadBlobRef.current) {
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
    } else if (
      value.toLowerCase().includes("search") ||
      value.toLowerCase().includes("find") ||
      value.toLowerCase().includes("cari")
    ) {
      // Try to parse search intent using LLM
      try {
        const parseResponse = await fetch("/api/parse-search-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: value }),
        });

        const parseData = await parseResponse.json();

        if (parseData.ok && parseData.isSearchIntent) {
          if (parseData.searchType === "owner" && parseData.ownerAddress) {
            const ownerAddress = parseData.ownerAddress;
            autoScrollNextRef.current = false;
            pushMessage({
              from: "search-ip",
              status: "pending",
              query: ownerAddress,
              ts: getCurrentTimestamp(),
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            await searchByOwner(ownerAddress);
          } else if (
            parseData.searchType === "ip-name" &&
            parseData.searchQuery
          ) {
            const ipName = parseData.searchQuery;
            autoScrollNextRef.current = false;

            try {
              const resolveResponse = await fetch("/api/resolve-ip-name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ipName }),
              });

              const resolveData = await resolveResponse.json();

              if (resolveResponse.ok && resolveData.ok && resolveData.address) {
                const resolvedAddress = resolveData.address;
                console.log(
                  `[IP Assistant] Resolved ${ipName} to ${resolvedAddress}`,
                );
                pushMessage({
                  from: "search-ip",
                  status: "pending",
                  query: ipName,
                  ts: getCurrentTimestamp(),
                });
                await new Promise((resolve) => setTimeout(resolve, 300));
                await searchByOwner(resolvedAddress, ipName);
              } else {
                const errorMsg = resolveData.message || "Resolution failed";
                console.warn(
                  `[IP Assistant] Failed to resolve ${ipName}:`,
                  errorMsg,
                );
                pushMessage({
                  from: "bot",
                  text: `Could not resolve "${ipName}": ${errorMsg}`,
                  ts: getCurrentTimestamp(),
                });
              }
            } catch (resolveError) {
              console.error("Failed to resolve IP name:", resolveError);
              pushMessage({
                from: "bot",
                text: `Error resolving "${ipName}". Please try again.`,
                ts: getCurrentTimestamp(),
              });
            }
          } else if (parseData.searchQuery) {
            const query = parseData.searchQuery;
            const mediaType = parseData.mediaType || null;
            autoScrollNextRef.current = false;
            pushMessage({
              from: "search-ip",
              status: "pending",
              query,
              ts: getCurrentTimestamp(),
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            await searchIP(query, mediaType);
          } else {
            // Search intent detected but no query extracted - only process image if there's a preview
            if (hasPreview) {
              await runDetection(previewImage.blob, previewImage.name);
              setPreviewImage(null);
            }
          }
        } else {
          // Not a search intent - only process image if there's a preview
          if (hasPreview) {
            await runDetection(previewImage.blob, previewImage.name);
            setPreviewImage(null);
          }
        }
      } catch (error) {
        console.error("Failed to parse search intent", error);
        // Only process image if there's a preview
        if (hasPreview) {
          await runDetection(previewImage.blob, previewImage.name);
          setPreviewImage(null);
        }
      }
    } else if (value.toLowerCase() === "gradut") {
      // gradut function is empty
    } else if (hasPreview) {
      pushMessage({
        from: "bot",
        text: "To analyze this image, please type 'Register' and send.",
        ts: getCurrentTimestamp(),
      });
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
  }, [input, previewImage, pushMessage, runDetection, searchIP, searchByOwner]);

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
      const { totalCount, originalCount } = data;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.from === "ip-check" && (msg as any).status === "pending"
            ? {
                ...msg,
                status: "complete",
                address: trimmedAddress,
                originalCount,
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
      <SidebarExtras
        messages={messages}
        sessions={sessions}
        onNewChat={handleNewChat}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        closeSidebar={closeSidebar}
      />
    ),
    [deleteSession, handleNewChat, loadSession, messages, sessions],
  );

  const headerActions = (
    <ChatHeaderActions
      guestMode={guestMode}
      onToggleGuest={() => setGuestMode((value) => !value)}
      walletButtonText={walletButtonText}
      walletButtonDisabled={walletButtonDisabled}
      onWalletClick={handleWalletButtonClick}
      connectedAddressLabel={connectedAddressLabel}
    />
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
                  className="flex justify-end mb-3 px-1 md:px-2 last:mb-1"
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
                  className="flex items-start mb-3 gap-2 px-1 md:px-2 last:mb-1"
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
                  className="flex items-start mb-3 gap-2 px-1 md:px-2 last:mb-1"
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
                          ? "Registering��"
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
                            <span className="mx-1 text-slate-500">���</span>
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
                    className="flex items-start mb-3 last:mb-1 gap-2 px-1 md:px-2"
                  >
                    <div className="bg-slate-900/70 px-4 py-3 rounded-2xl max-w-[85%] md:max-w-[70%] break-words text-slate-100 font-medium text-sm md:text-[0.97rem] overflow-hidden">
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
                            <div className="bg-black/40 rounded-lg p-1.5 md:p-2">
                              <div className="text-xs text-slate-400 mb-0.5 md:mb-1">
                                Original
                              </div>
                              <div className="text-lg md:text-xl font-bold text-[#FF4DA6]">
                                {ipCheckMsg.originalCount}
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

            if (msg.from === "search-ip") {
              const searchMsg = msg as any;
              const isLoading = waiting && searchMsg.status === "pending";

              if (searchMsg.status === "pending") {
                return (
                  <motion.div
                    key={`search-ip-${index}`}
                    {...getBubbleMotionProps(index)}
                    className="flex items-start mb-3 last:mb-1 gap-2 px-1 md:px-2"
                  >
                    <div className="bg-slate-900/70 px-4 py-3 rounded-2xl max-w-[85%] md:max-w-[70%] break-words text-slate-100 font-medium text-sm md:text-[0.97rem] overflow-hidden">
                      <div className="text-slate-100 text-sm md:text-base">
                        Searching for IP assets matching "{searchMsg.query}"...
                      </div>
                      <div className="mt-2 md:mt-3 flex items-center gap-2">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </div>
                    </div>
                  </motion.div>
                );
              }

              if (searchMsg.status === "complete") {
                return (
                  <motion.div
                    key={`search-ip-result-${index}`}
                    {...getBubbleMotionProps(index)}
                    className="flex items-start mb-3 last:mb-1 gap-2 px-1 md:px-2"
                  >
                    <div className="bg-slate-900/70 border border-[#FF4DA6]/40 px-4 py-3 rounded-2xl max-w-[85%] md:max-w-[70%] break-words shadow-[0_12px_32px_rgba(0,0,0,0.3)] text-slate-100 backdrop-blur-lg transition-all duration-300 font-medium overflow-hidden">
                      {searchMsg.error ? (
                        <div className="text-red-400">
                          <div className="font-semibold mb-2 text-sm md:text-base">
                            Search Error
                          </div>
                          <div className="text-xs md:text-sm">
                            {searchMsg.error}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs md:text-[0.97rem] mb-2 md:mb-3">
                            Found{" "}
                            <span className="text-[#FF4DA6] font-bold">
                              {searchMsg.resultCount}
                            </span>{" "}
                            IP assets matching "{searchMsg.query}"
                          </div>
                          {searchMsg.resultCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchResults(searchMsg.results || []);
                                setShowSearchModal(true);
                              }}
                              className="mt-2 px-3 py-1.5 bg-[#FF4DA6]/20 text-[#FF4DA6] text-xs md:text-sm font-semibold rounded-lg hover:bg-[#FF4DA6]/30 transition-all duration-300"
                            >
                              View More
                            </button>
                          ) : (
                            <div className="text-xs text-slate-400 mt-2">
                              No matching assets found.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              }
            }

            if (msg.from === "user-image") {
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
            }
            return (
              <motion.div
                key={`other-${index}`}
                {...getBubbleMotionProps(index)}
                className="flex items-start mb-3 last:mb-1 px-3 md:px-8"
              >
                <div className="bg-slate-900/70 px-4 py-2.5 rounded-2xl max-w-[85%] md:max-w-[65%] break-words text-slate-100">
                  <div>{getMessagePreview(msg as any)}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        waiting={waiting}
        previewImage={previewImage}
        setPreviewImage={setPreviewImage}
        uploadRef={uploadRef}
        handleImage={handleImage}
        onSubmit={handleSend}
        inputRef={inputRef}
        handleKeyDown={handleKeyDown}
        toolsOpen={toolsOpen}
        setToolsOpen={setToolsOpen}
        suggestions={suggestions}
        setSuggestions={setSuggestions}
      />

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
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-slate-900/80 backdrop-blur-sm border border-[#FF4DA6]/20 p-6 shadow-xl"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]">
                    Group {activeDetail}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-100">
                    {ANSWER_DETAILS[activeDetail ?? ""]?.type ??
                      "Group details"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDetail(null)}
                  className="rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                  aria-label="Close detail modal"
                >
                  ✕
                </button>
              </div>

              {ANSWER_DETAILS[activeDetail] ? (
                <>
                  <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-300">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        Image Type
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.type}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        Additional Notes
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.notes}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        Registration Status
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.registrationStatus}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        User Action
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.action}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        Smart Licensing (Recommendation)
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.smartLicensing}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]/70">
                        AI Training
                      </dt>
                      <dd className="mt-1 text-slate-200">
                        {ANSWER_DETAILS[activeDetail ?? ""]?.aiTraining}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  Detail data not found.
                </p>
              )}
            </motion.div>
          </motion.div>
        ) : null}

        {showSearchModal && searchResults.length > 0 ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setShowSearchModal(false)}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <YouTubeStyleSearchResults
              searchResults={searchResults}
              onClose={() => setShowSearchModal(false)}
              onAssetClick={setExpandedAsset}
            />
            <motion.div className="hidden">
              <div className="flex items-start justify-between gap-4 mb-6 sticky top-0 bg-slate-900/80 -mx-6 px-6 py-4 border-b border-[#FF4DA6]/10">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]">
                    IP Assets
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-100">
                    Search Results ({searchResults.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSearchModal(false)}
                  className="rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                  aria-label="Close search modal"
                >
                  ��
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {searchResults.map((asset: any, idx: number) => (
                  <div
                    key={asset.ipId || idx}
                    className="group cursor-pointer flex flex-col h-full"
                  >
                    <div className="relative w-full aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:ring-2 ring-[#FF4DA6]/50 flex-shrink-0">
                      {asset.mediaUrl ? (
                        asset.mediaType?.startsWith("video") ? (
                          <div
                            className="w-full h-full cursor-pointer relative group/video"
                            onClick={() => setExpandedAsset(asset)}
                          >
                            <video
                              key={asset.ipId}
                              src={asset.mediaUrl}
                              poster={asset.thumbnailUrl}
                              className="w-full h-full object-cover"
                              preload="metadata"
                              playsInline
                              controls
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/video:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity">
                              <svg
                                className="w-12 h-12 text-white drop-shadow-lg"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3 3v18h18V3H3zm9 14V7l5 5-5 5z" />
                              </svg>
                            </div>
                          </div>
                        ) : asset.mediaType?.startsWith("audio") ? (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-purple-900 to-slate-900 cursor-pointer"
                            onClick={() => setExpandedAsset(asset)}
                          >
                            <svg
                              className="w-12 h-12 text-purple-300"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 3v9.28c-.47-.46-1.12-.75-1.84-.75-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                            <span className="text-xs text-purple-200 font-medium">
                              Audio
                            </span>
                          </div>
                        ) : (
                          <img
                            src={asset.mediaUrl}
                            alt={asset.title || "IP Asset"}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setExpandedAsset(asset)}
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              const parent = img.parentElement;
                              if (
                                parent &&
                                parent.querySelector("img") === img
                              ) {
                                img.replaceWith(
                                  Object.assign(document.createElement("div"), {
                                    className:
                                      "w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-800",
                                    innerHTML: `
                                      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                      </svg>
                                      <span class="text-xs">Failed to load</span>
                                    `,
                                  }),
                                );
                              }
                            }}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-800">
                          <svg
                            className="w-8 h-8"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="m4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-xs">No media</span>
                        </div>
                      )}

                      {asset.mediaType?.startsWith("video") && (
                        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs font-semibold text-white">
                          VIDEO
                        </div>
                      )}
                    </div>

                    <div className="pt-3 space-y-2 flex flex-col flex-grow">
                      <h3 className="text-sm font-semibold text-slate-100 line-clamp-2 group-hover:text-[#FF4DA6] transition-colors">
                        {asset.title || asset.name || "Untitled"}
                      </h3>

                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded font-semibold whitespace-nowrap ${
                            asset.isDerivative
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-green-500/20 text-green-300"
                          }`}
                        >
                          Original
                        </span>
                        {asset.score !== undefined && (
                          <span className="text-xs px-2 py-1 bg-[#FF4DA6]/20 text-[#FF4DA6] rounded font-semibold whitespace-nowrap">
                            {(asset.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {asset.description && (
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {asset.description}
                        </p>
                      )}

                      <div className="text-xs text-slate-500 space-y-1">
                        {asset.ownerAddress && (
                          <p className="font-mono text-xs">
                            {asset.ownerAddress.slice(0, 6)}...
                            {asset.ownerAddress.slice(-4)}
                          </p>
                        )}
                        {asset.mediaType && (
                          <p className="capitalize text-xs">
                            {asset.mediaType
                              .replace("video/", "")
                              .replace("audio/", "")
                              .replace("image/", "")
                              .toUpperCase()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {expandedAsset && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
            onClick={() => setExpandedAsset(null)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-4xl bg-slate-950/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-800/50 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/30 px-6 py-4 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100 line-clamp-2">
                  {expandedAsset.title ||
                    expandedAsset.name ||
                    "Untitled Asset"}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const container = expandedMediaContainerRef.current;
                    if (!container) return;

                    if (!isFullscreen) {
                      if (container.requestFullscreen) {
                        container.requestFullscreen().catch(() => {});
                      } else if ((container as any).webkitRequestFullscreen) {
                        (container as any).webkitRequestFullscreen();
                      } else if ((container as any).mozRequestFullScreen) {
                        (container as any).mozRequestFullScreen();
                      } else if ((container as any).msRequestFullscreen) {
                        (container as any).msRequestFullscreen();
                      }
                      setIsFullscreen(true);
                    } else {
                      if (document.fullscreenElement) {
                        if (document.exitFullscreen) {
                          document.exitFullscreen().catch(() => {});
                        } else if ((document as any).webkitExitFullscreen) {
                          (document as any).webkitExitFullscreen();
                        } else if ((document as any).mozCancelFullScreen) {
                          (document as any).mozCancelFullScreen();
                        } else if ((document as any).msExitFullscreen) {
                          (document as any).msExitFullscreen();
                        }
                      }
                      setIsFullscreen(false);
                    }
                  }}
                  className="flex-shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                  aria-label={
                    isFullscreen ? "Exit fullscreen" : "View fullscreen"
                  }
                  title={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
                >
                  {isFullscreen ? (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 6h12v12H6z M3 3h8v8H3z M13 13h8v8h-8z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8V4m0 0h4m-4 0l5 5m11-5v4m0-4h-4m4 0l-5 5M4 20v-4m0 4h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                      />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedAsset(null)}
                  className="flex-shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                  aria-label="Close"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Media Container */}
            <div
              ref={expandedMediaContainerRef}
              className="flex-1 flex items-center justify-center bg-gradient-to-b from-slate-900/50 to-slate-950/50 min-h-0 overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="w-full max-w-full aspect-video flex items-center justify-center bg-black/40 rounded-lg"
              >
                {expandedAsset.mediaType?.startsWith("video") ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <video
                      src={expandedAsset.mediaUrl}
                      poster={expandedAsset.thumbnailUrl}
                      className="w-full h-full object-contain"
                      controls
                      autoPlay
                      playsInline
                    />
                  </div>
                ) : expandedAsset.mediaType?.startsWith("audio") ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-6 py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="flex-shrink-0"
                    >
                      <svg
                        className="w-24 h-24 text-[#FF4DA6]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3v9.28c-.47-.46-1.12-.75-1.84-.75-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                    </motion.div>
                    <div className="w-full max-w-md">
                      <audio
                        src={expandedAsset.mediaUrl}
                        controls
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <img
                    src={expandedAsset.mediaUrl}
                    alt={
                      expandedAsset.title || expandedAsset.name || "IP Asset"
                    }
                    className="w-full h-full object-contain"
                  />
                )}
              </motion.div>
            </div>

            {/* Footer with Details and Actions */}
            <div className="border-t border-slate-800/30 bg-slate-950/95 backdrop-blur-xl px-6 py-6 sm:py-8 space-y-6 flex-shrink-0">
              {expandedAsset.description && (
                <p className="text-sm text-slate-300 leading-relaxed">
                  {expandedAsset.description}
                </p>
              )}

              {/* Metadata Badges */}
              <div className="flex flex-wrap gap-3">
                <span
                  className={`text-xs px-3 py-2 rounded-full font-semibold whitespace-nowrap backdrop-blur-sm border transition-all ${
                    expandedAsset.isDerivative
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  ✨ Original
                </span>

                {expandedAsset.score !== undefined && (
                  <span className="text-xs px-3 py-2 rounded-full bg-[#FF4DA6]/20 text-[#FF4DA6] border border-[#FF4DA6]/30 font-semibold whitespace-nowrap backdrop-blur-sm">
                    {(expandedAsset.score * 100).toFixed(0)}% Match
                  </span>
                )}

                {expandedAsset.mediaType && (
                  <span className="text-xs px-3 py-2 rounded-full bg-slate-800/60 text-slate-300 border border-slate-700/50 font-semibold whitespace-nowrap backdrop-blur-sm">
                    {expandedAsset.mediaType
                      ?.replace("video/", "")
                      .replace("audio/", "")
                      .replace("image/", "")
                      .toUpperCase() || "Media"}
                  </span>
                )}

                {expandedAsset.ownerAddress && (
                  <span className="text-xs px-3 py-2 rounded-full bg-slate-800/60 text-slate-300 border border-slate-700/50 font-mono whitespace-nowrap backdrop-blur-sm">
                    {expandedAsset.ownerAddress.slice(0, 8)}...
                    {expandedAsset.ownerAddress.slice(-6)}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRemixMenu(!showRemixMenu)}
                  disabled={!guestMode && !authenticated}
                  className="text-sm px-4 py-2.5 rounded-lg bg-[#FF4DA6] text-white font-semibold transition-all hover:shadow-lg hover:shadow-[#FF4DA6]/25 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/50"
                >
                  🔄 Remix
                </button>
                <button
                  type="button"
                  disabled={!authenticated}
                  className="text-sm px-4 py-2.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-blue-500/25 hover:bg-blue-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssetDetails(true)}
                  className="text-sm px-4 py-2.5 rounded-lg bg-slate-700/40 text-slate-200 border border-slate-600/50 font-semibold transition-all hover:shadow-lg hover:shadow-slate-700/25 hover:bg-slate-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50"
                >
                  Details
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {showRemixMenu && (guestMode || authenticated) && expandedAsset ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
              onClick={() => setShowRemixMenu(false)}
              aria-hidden="true"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 bg-slate-900/95 backdrop-blur-xl rounded-lg shadow-lg border border-slate-700/50 p-2 min-w-56"
            >
              <button
                type="button"
                className="w-full text-left px-4 py-3 text-sm text-slate-200 font-semibold hover:bg-slate-800/50 rounded-lg transition-colors"
                onClick={() => {
                  console.log("Remix with AI editor:", expandedAsset?.ipId);
                  setShowRemixMenu(false);
                }}
              >
                ✨ Remix with AI editor
              </button>
              <button
                type="button"
                className="w-full text-left px-4 py-3 text-sm text-slate-200 font-semibold hover:bg-slate-800/50 rounded-lg transition-colors"
                onClick={() => {
                  console.log("Remix to Video:", expandedAsset?.ipId);
                  setShowRemixMenu(false);
                }}
              >
                🎬 Remix to Video
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAssetDetails && expandedAsset ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
              onClick={() => setShowAssetDetails(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-full max-w-lg bg-slate-950/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-800/50 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-4 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/30 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  IP Asset Details
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAssetDetails(false)}
                  className="flex-shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
                  aria-label="Close"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      IP ID
                    </label>
                    <p className="text-sm text-slate-200 font-mono mt-2 break-all bg-slate-900/40 p-3 rounded-lg border border-slate-800/50">
                      {expandedAsset.ipId || "Not available"}
                    </p>
                  </div>

                  {expandedAsset.parentsCount &&
                    expandedAsset.parentsCount > 0 && (
                      <div className="pt-4 border-t border-slate-800/30">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          Derivative Status
                        </label>
                        <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-4">
                          <p className="text-sm text-blue-200">
                            This is a derivative work with{" "}
                            {expandedAsset.parentsCount} parent IP asset
                            {expandedAsset.parentsCount > 1 ? "s" : ""}.
                          </p>

                          {expandedAsset.parentIpDetails ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 gap-3">
                                {expandedAsset.parentIpDetails.parentIpIds?.map(
                                  (parentId: string, index: number) => (
                                    <div
                                      key={index}
                                      className="bg-slate-900/40 border border-slate-700/50 rounded p-3 space-y-2"
                                    >
                                      <div>
                                        <div className="text-xs text-slate-400 mb-1">
                                          Parent IP ID
                                        </div>
                                        <p className="text-xs text-slate-300 font-mono break-all">
                                          {parentId}
                                        </p>
                                      </div>

                                      {expandedAsset.parentIpDetails
                                        .licenseTermsIds &&
                                        expandedAsset.parentIpDetails
                                          .licenseTermsIds[index] && (
                                          <div>
                                            <div className="text-xs text-slate-400 mb-1">
                                              License Terms ID
                                            </div>
                                            <p className="text-xs text-slate-300 font-mono break-all">
                                              {
                                                expandedAsset.parentIpDetails
                                                  .licenseTermsIds[index]
                                              }
                                            </p>
                                          </div>
                                        )}

                                      {expandedAsset.parentIpDetails
                                        .licenseTemplates &&
                                        expandedAsset.parentIpDetails
                                          .licenseTemplates[index] && (
                                          <div>
                                            <div className="text-xs text-slate-400 mb-1">
                                              License Template
                                            </div>
                                            <p className="text-xs text-slate-300 font-mono break-all">
                                              {
                                                expandedAsset.parentIpDetails
                                                  .licenseTemplates[index]
                                              }
                                            </p>
                                          </div>
                                        )}
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-blue-300/70">
                              Parent IP details are being loaded...
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                  <div className="pt-4 border-t border-slate-800/30">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Asset Information
                    </label>
                    <div className="mt-4 space-y-3">
                      {expandedAsset.title && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            Title
                          </div>
                          <p className="text-sm text-slate-200">
                            {expandedAsset.title}
                          </p>
                        </div>
                      )}

                      {expandedAsset.ownerAddress && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            Owner Address
                          </div>
                          <p className="text-sm text-slate-200 font-mono break-all">
                            {expandedAsset.ownerAddress}
                          </p>
                        </div>
                      )}

                      {expandedAsset.mediaType && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            Media Type
                          </div>
                          <p className="text-sm text-slate-200">
                            {expandedAsset.mediaType
                              ?.replace("video/", "")
                              .replace("audio/", "")
                              .replace("image/", "")
                              .toUpperCase() || "Unknown"}
                          </p>
                        </div>
                      )}

                      {expandedAsset.score !== undefined && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            Match Score
                          </div>
                          <p className="text-sm text-slate-200">
                            {(expandedAsset.score * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {expandedAsset.licenses &&
                    expandedAsset.licenses.length > 0 && (
                      <div className="pt-4 border-t border-slate-800/30">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          Licenses
                        </label>
                        <div className="mt-4 space-y-3">
                          {expandedAsset.licenses.map(
                            (license: any, index: number) => (
                              <div
                                key={index}
                                className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4 space-y-3"
                              >
                                {license.templateName && (
                                  <div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      Template Name
                                    </div>
                                    <p className="text-sm text-slate-200 font-semibold">
                                      {license.templateName}
                                    </p>
                                  </div>
                                )}

                                {license.licenseTermsId && (
                                  <div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      License Terms ID
                                    </div>
                                    <p className="text-xs text-slate-300 font-mono break-all">
                                      {license.licenseTermsId}
                                    </p>
                                  </div>
                                )}

                                {license.terms && (
                                  <div className="space-y-2 pt-2 border-t border-slate-700/30">
                                    <div className="text-xs font-semibold text-slate-300 mb-2">
                                      Terms:
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {license.terms.commercialUse !==
                                        undefined && (
                                        <div>
                                          <span className="text-slate-400">
                                            Commercial Use:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.commercialUse
                                              ? "✓ Allowed"
                                              : "✗ Not Allowed"}
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.derivativesAllowed !==
                                        undefined && (
                                        <div>
                                          <span className="text-slate-400">
                                            Derivatives:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.derivativesAllowed
                                              ? "✓ Allowed"
                                              : "✗ Not Allowed"}
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.transferable !==
                                        undefined && (
                                        <div>
                                          <span className="text-slate-400">
                                            Transferable:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.transferable
                                              ? "✓ Yes"
                                              : "✗ No"}
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.commercialAttribution !==
                                        undefined && (
                                        <div>
                                          <span className="text-slate-400">
                                            Attribution Required:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.commercialAttribution
                                              ? "✓ Yes"
                                              : "✗ No"}
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.commercialRevShare !==
                                        undefined && (
                                        <div>
                                          <span className="text-slate-400">
                                            Rev Share:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {(
                                              Number(
                                                license.terms
                                                  .commercialRevShare,
                                              ) / 1000000
                                            ).toFixed(2)}
                                            %
                                          </p>
                                        </div>
                                      )}

                                      {license.licensingConfig?.mintingFee && (
                                        <div>
                                          <span className="text-slate-400">
                                            Minting Fee:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {(
                                              Number(
                                                license.licensingConfig
                                                  .mintingFee,
                                              ) / 1e18
                                            ).toFixed(6)}{" "}
                                            tokens
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.currency && (
                                        <div>
                                          <span className="text-slate-400">
                                            Currency:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.currency}
                                          </p>
                                        </div>
                                      )}

                                      {license.terms.expiration && (
                                        <div>
                                          <span className="text-slate-400">
                                            Expiration:
                                          </span>
                                          <p className="text-slate-200 font-semibold">
                                            {license.terms.expiration}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {license.createdAt && (
                                  <div className="pt-2 border-t border-slate-700/30">
                                    <div className="text-xs text-slate-500">
                                      Created:{" "}
                                      {new Date(
                                        license.createdAt,
                                      ).toLocaleDateString()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export { STORAGE_KEY, CURRENT_SESSION_KEY } from "@/lib/ip-assistant/constants";
export type {
  BotMessage,
  ChatSession,
  Message,
} from "@/lib/ip-assistant/types";

export default IpAssistant;
