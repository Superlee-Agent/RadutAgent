import { useEffect, useRef, useState } from "react";

type Message =
  | { from: "user"; text: string; ts?: string }
  | { from: "bot"; text: string; ts?: string }
  | { from: "user-image"; url: string; ts?: string };

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([
    { from: "bot", text: "Halo, saya GradutBot. Ketik 'gradut' untuk mulai analisa gambar.", ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  ]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
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
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    pushMessage({ from: "user", text: value, ts });
    setInput("");
    await new Promise((r) => setTimeout(r, 50));
    if (value.toLowerCase() === "gradut") {
      pushMessage({ from: "bot", text: "Silakan unggah gambar.", ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
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

  async function compressToBlob(file: File, maxWidth = 800, quality = 0.75): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!file.type || !file.type.startsWith("image/")) return reject(new Error("File is not an image"));
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
              quality
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
  async function compressAndEnsureSize(file: File, targetSize = 250 * 1024): Promise<Blob> {
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
      pushMessage({ from: "user-image", url, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      setWaiting(true);

      // compress on client and ensure under target size
      let blob: Blob;
      try {
        blob = await compressAndEnsureSize(file, 250 * 1024); // 250KB target
      } catch (innerErr) {
        console.error("Compression failed, will attempt sending original file", innerErr);
        blob = file;
      }

      const form = new FormData();
      form.append("image", blob, file.name);

      const analyz = await fetch("/api/analyze", { method: "POST", body: form });
      if (analyz.status === 413) {
        const json = await analyz.json().catch(() => ({}));
        pushMessage({ from: "bot", text: "Gambar terlalu besar, coba kompres/resize sebelum unggah.", ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        setWaiting(false);
        scrollToBottom();
        return;
      }
      if (!analyz.ok) {
        const txt = await analyz.text().catch(() => "");
        console.error("/api/analyze failed:", analyz.status, txt);
        pushMessage({ from: "bot", text: "Gagal analisa gambar.", ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
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
      pushMessage({ from: "bot", text: display, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });

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
      const msg = err?.message ? `Gagal analisa gambar: ${err.message}` : "Gagal analisa gambar.";
      pushMessage({ from: "bot", text: msg, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    } finally {
      setWaiting(false);
      scrollToBottom();
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="chat-wrap max-w-2xl mx-auto shadow-lg rounded-md overflow-hidden bg-white">
        <header className="flex items-center gap-3 px-4 py-3 border-b">
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">G</div>
          <h1 className="text-lg font-semibold tracking-tight">GradutBot</h1>
        </header>
        <div className="chat-box p-4 h-[60vh] overflow-y-auto bg-slate-50">
          {messages.map((msg, i) =>
            msg.from === "user" ? (
              <div key={i} className="flex justify-end mb-3">
                <div className="bg-green-500 text-white px-3 py-2 rounded-lg max-w-[70%] break-words">
                  {msg.text}
                  <div className="text-xs text-slate-200 mt-1 text-right">{msg.ts}</div>
                </div>
              </div>
            ) : msg.from === "bot" ? (
              <div key={i} className="flex items-start mb-3 gap-3">
                <div className="bg-white border px-3 py-2 rounded-lg max-w-[70%] break-words">
                  {msg.text}
                  <div className="text-xs text-slate-400 mt-1">{msg.ts}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end mb-3">
                <div className="rounded-md overflow-hidden max-w-[70%]">
                  <img src={msg.url} alt="Upload" className="w-full h-auto block" />
                  <div className="text-xs text-slate-400 mt-1 text-right">{msg.ts}</div>
                </div>
              </div>
            )
          )}
          {waiting && (
            <div className="flex items-start mb-3 gap-3" aria-live="polite" aria-label="Bot is typing">
              <div className="bg-white border px-3 py-2 rounded-lg">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form
          className="chat-input flex items-center gap-2 p-3 border-t"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          autoComplete="off"
        >
          <button type="button" className="p-2 rounded-full hover:bg-slate-100" onClick={() => uploadRef.current?.click()} aria-label="Attach image">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 002.828 2.828L21 9.828V7h-5.828z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h7" />
            </svg>
          </button>

          <textarea
            ref={inputRef as any}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan…"
            disabled={waiting}
            className="flex-1 resize-none p-2 rounded-md border bg-white min-h-[40px] max-h-32 overflow-y-auto"
          />

          <button type="submit" disabled={waiting || !input.trim()} className="p-2 rounded-full bg-green-500 text-white disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
    </div>
  );
}
