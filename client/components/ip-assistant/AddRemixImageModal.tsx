import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SearchResult {
  ipId?: string;
  title?: string;
  name?: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  ownerAddress?: string;
  isDerivative?: boolean;
  score?: number;
  [key: string]: any;
}

interface PreviewImage {
  blob: Blob;
  name: string;
  url: string;
}

interface AddRemixImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (asset: SearchResult) => void;
  isLoading?: boolean;
}

export const AddRemixImageModal = ({
  isOpen,
  onClose,
  onSelectImage,
  isLoading = false,
}: AddRemixImageModalProps) => {
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch("/api/ipfi-assistant/search-ips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchInput,
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchInput]);

  const handleSelectAsset = async (asset: SearchResult) => {
    try {
      if (asset.mediaUrl) {
        const response = await fetch(asset.mediaUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to fetch image`);
        }
        const blob = await response.blob();
        const fileName = asset.title || asset.name || "IP Asset";

        onSelectImage({
          ...asset,
          blob,
          name: fileName,
          url: asset.mediaUrl,
        });
        onClose();
      }
    } catch (error) {
      console.error("Failed to load image:", error);
      alert("Failed to load image. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
          onClick={onClose}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />

        <motion.div
          className="relative z-10 w-full max-w-4xl max-h-[90vh] rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800/50 shadow-2xl overflow-hidden flex flex-col"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Header */}
          <div className="sticky top-0 z-20 flex items-start justify-between gap-4 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/30 px-6 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#FF4DA6] mb-1">
                Add Additional Image
              </p>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                Search IP Assets
              </h2>
            </div>
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-[#FF4DA6]/20 hover:text-[#FF4DA6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
              aria-label="Close modal"
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
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </motion.button>
          </div>

          {/* Search Input */}
          <div className="px-6 py-4 border-b border-slate-800/30 bg-slate-900/50 backdrop-blur-sm">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search by title, description, owner, or IP ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
                className="flex-1 px-4 py-2 bg-slate-900/60 rounded-lg text-slate-100 placeholder-slate-500 border border-slate-700/50 focus:border-[#FF4DA6]/50 focus:ring-1 focus:ring-[#FF4DA6]/30 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || !searchInput.trim()}
                className="px-4 py-2 bg-[#FF4DA6]/20 hover:bg-[#FF4DA6]/30 disabled:opacity-50 disabled:cursor-not-allowed text-[#FF4DA6] font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {searchResults.map((asset, idx) => (
                  <motion.div
                    key={asset.ipId || idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.2,
                      delay: idx * 0.05,
                    }}
                    className="group cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => handleSelectAsset(asset)}
                  >
                    <div className="relative w-full aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:ring-2 ring-[#FF4DA6]/50">
                      {asset.mediaUrl ? (
                        asset.mediaType?.startsWith("video") ? (
                          <div className="w-full h-full relative">
                            <video
                              src={asset.mediaUrl}
                              poster={asset.thumbnailUrl}
                              className="w-full h-full object-cover"
                              preload="metadata"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-purple-900 to-slate-900">
                            <svg
                              className="w-8 h-8 text-slate-300"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 3v9.28c-.47-.46-1.12-.74-1.84-.74-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5V7h4V3h-4zm0 0" />
                            </svg>
                            <span className="text-xs text-slate-400">Audio</span>
                          </div>
                        ) : (
                          <img
                            src={asset.mediaUrl}
                            alt={asset.title || asset.name}
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <svg
                            className="w-12 h-12 text-slate-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {asset.title || asset.name || "Untitled"}
                      </p>
                      {asset.ownerAddress && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {asset.ownerAddress}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : searchInput.trim() && !searching ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 text-slate-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <p className="text-slate-400">No results found</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Try searching with different keywords
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-slate-400">
                    Search for IP assets to get started
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Search by title, description, owner, or IP ID
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
