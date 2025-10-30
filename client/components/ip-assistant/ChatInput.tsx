import type {
  ChangeEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import { motion } from "framer-motion";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { RemixImage } from "./RemixImage";

type PreviewImage = {
  blob: Blob;
  name: string;
  url: string;
};

type ChatInputProps = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  waiting: boolean;
  previewImage: (PreviewImage & { isRemixImage?: boolean }) | null;
  setPreviewImage: Dispatch<
    SetStateAction<(PreviewImage & { isRemixImage?: boolean }) | null>
  >;
  uploadRef: MutableRefObject<HTMLInputElement | null>;
  handleImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => Promise<void> | void;
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement>;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  toolsOpen: boolean;
  setToolsOpen: Dispatch<SetStateAction<boolean>>;
  suggestions: string[];
  setSuggestions: Dispatch<SetStateAction<string[]>>;
  onRemixRegisterWarning?: () => void;
};

const ChatInput = ({
  input,
  setInput,
  waiting,
  previewImage,
  setPreviewImage,
  uploadRef,
  handleImage,
  onSubmit,
  inputRef,
  handleKeyDown,
  toolsOpen,
  setToolsOpen,
  suggestions,
  setSuggestions,
  onRemixRegisterWarning,
}: ChatInputProps) => (
  <form
    className="chat-input flex items-center gap-2 px-3 sm:px-[1.45rem] py-3.5 border-t-0 md:border-t md:border-[#FF4DA6]/10 bg-slate-950/60 md:bg-gradient-to-r md:from-slate-950/60 md:via-[#FF4DA6]/5 md:to-slate-950/60 flex-none sticky bottom-0 z-10 backdrop-blur-xl transition-all duration-300"
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const isRemixWithRegister =
        previewImage?.isRemixImage && input.toLowerCase().includes("register");
      if (isRemixWithRegister) {
        onRemixRegisterWarning?.();
      } else {
        void onSubmit();
      }
    }}
    autoComplete="off"
  >
    <div className="flex-1 flex flex-col gap-2 bg-slate-900/60 rounded-2xl pl-2 pr-4 py-2 focus-within:ring-2 focus-within:ring-[#FF4DA6]/30 transition-all duration-300">
      <RemixImage
        previewImage={previewImage}
        setPreviewImage={setPreviewImage}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex-shrink-0 p-1.5 text-[#FF4DA6] hover:bg-[#FF4DA6]/20 rounded-lg active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
          onClick={() => uploadRef.current?.click()}
          onPointerDown={(event) => event.preventDefault()}
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

      {suggestions.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex flex-col gap-1.5 px-4 py-2 border-t border-slate-700/50"
        >
          <p className="text-xs text-slate-400 font-medium">Suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion + index}
                type="button"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => {
                  setInput(suggestion);
                  setSuggestions([]);
                  inputRef.current?.focus?.();
                }}
                className="px-3 py-1.5 text-xs bg-gradient-to-r from-[#FF4DA6]/20 to-[#FF4DA6]/10 text-[#FF4DA6] rounded-lg hover:from-[#FF4DA6]/30 hover:to-[#FF4DA6]/20 transition-all duration-200 hover:scale-105 cursor-pointer font-medium border border-[#FF4DA6]/20 hover:border-[#FF4DA6]/40"
              >
                {suggestion}
              </motion.button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </div>

    <button
      type="submit"
      disabled={waiting || (!input.trim() && !previewImage)}
      className="flex-shrink-0 p-2 rounded-lg bg-[#FF4DA6]/20 text-[#FF4DA6] hover:bg-[#FF4DA6]/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
      aria-label="Send message"
      onPointerDown={(event) => event.preventDefault()}
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
);

export default ChatInput;
