export type BotMessage = {
  id?: string;
  from: "bot";
  text: string;
  ts?: string;
  verification?: { label: string; code: string } | string | null;
  ctxKey?: string;
  isProcessing?: boolean;
  action?: {
    type: "remix";
    label: string;
    imageBlob: Blob;
    imageName: string;
    ipId: string;
    title: string;
  };
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
    }
  | {
      id?: string;
      from: "search-ip";
      status: "pending" | "complete";
      query?: string;
      results?: any[];
      resultCount?: number;
      error?: string;
      ts?: string;
    };

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  ts: string;
};
