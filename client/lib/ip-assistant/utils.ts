import { ANSWER_DETAILS } from "./answer-details";
import type { BotMessage, Message } from "./types";

export const truncateAddress = (address: string) => {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const getCurrentTimestamp = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export const getInitialBotMessage = (): BotMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  from: "bot",
  text: "Hello, I am Radut Agent. Attach an image and I'll analyze it automatically.",
  ts: getCurrentTimestamp(),
});

export const isValidEthereumAddress = (address: string): boolean => {
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
};

export const getMessagePreview = (message: Message) => {
  if (message.from === "user-image") {
    return "Image upload";
  }
  if (message.from === "register") {
    return `Register: ${message.title}`;
  }
  if (message.from === "ip-check") {
    if (message.status === "pending") return "IP Check (pending)";
    if (message.error) return "IP Check Error";
    return `IP Assets: ${message.totalCount ?? 0}`;
  }
  if (message.from === "search-ip") {
    if (message.status === "pending") return "Search IP (pending)";
    if (message.error) return "Search Error";
    const count = message.resultCount ?? message.results?.length ?? 0;
    return `Search Results: ${count}`;
  }
  if ("text" in message) {
    const text = message.text.trim();
    if (text.length === 0) return "(Empty message)";
    if (text.length <= 48) return text;
    return `${text.slice(0, 48)}...`;
  }
  return "(Unknown message)";
};

export const summaryFromAnswer = (code: string): string => {
  const info = ANSWER_DETAILS[code];
  if (info) return `${info.type} · ${info.notes}.`;
  return "(Unknown classification)";
};
