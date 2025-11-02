import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface WhitelistEntry {
  hash: string;
  metadata: {
    ipId: string;
    title: string;
    timestamp?: number;
    pHash?: string;
    visionDescription?: string;
    matchType?: string;
    similarity?: number;
    // Asset details
    ownerAddress?: string;
    mediaType?: string;
    score?: number;
    description?: string;
    // License info
    licenses?: any[];
    licenseTermsIds?: string[];
    licenseVisibility?: string;
    // Royalty config
    maxMintingFee?: string;
    maxRts?: string;
    maxRevenueShare?: number;
    // Derivative info
    isDerivative?: boolean;
    parentsCount?: number;
    parentIpIds?: string[];
    parentIpDetails?: any;
    // All other fields
    [key: string]: any;
  };
}

interface WhitelistStats {
  totalEntries: number;
  derivatives: number;
  originals: number;
  lastUpdated: string;
}

export const WhitelistMonitor: React.FC = () => {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [stats, setStats] = useState<WhitelistStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "original" | "derivative"
  >("all");
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  const fetchWhitelist = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/_admin/remix-hashes-full");
      if (!response.ok) throw new Error("Failed to fetch whitelist");

      const data = await response.json();
      const entries = data.entries || [];

      let derivatives = 0;
      entries.forEach((entry: WhitelistEntry) => {
        if (entry.metadata?.isDerivative) derivatives++;
      });

      setEntries(entries);
      setStats({
        totalEntries: entries.length,
        derivatives,
        originals: entries.length - derivatives,
        lastUpdated: new Date(data.lastUpdated || Date.now()).toLocaleString(),
      });
    } catch (err) {
      console.error("Failed to fetch whitelist:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhitelist();
    const interval = setInterval(fetchWhitelist, 30000);
    return () => clearInterval(interval);
  }, []);

  const clearWhitelist = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear the entire whitelist? This action cannot be undone.",
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/_admin/clear-remix-hashes", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to clear whitelist");

      setEntries([]);
      setStats({
        totalEntries: 0,
        derivatives: 0,
        originals: 0,
        lastUpdated: new Date().toLocaleString(),
      });
    } catch (err) {
      console.error("Failed to clear whitelist:", err);
      alert("Failed to clear whitelist");
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (hash: string) => {
    if (!window.confirm("Delete this entry?")) return;

    try {
      const response = await fetch("/api/_admin/delete-remix-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });

      if (!response.ok) throw new Error("Failed to delete entry");

      setEntries((prev) => prev.filter((e) => e.hash !== hash));
      setStats(
        (prev) =>
          prev && {
            ...prev,
            totalEntries: prev.totalEntries - 1,
          },
      );
    } catch (err) {
      console.error("Failed to delete entry:", err);
      alert("Failed to delete entry");
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.metadata?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.metadata?.ipId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.hash?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      filterType === "all" ||
      (filterType === "derivative" && entry.metadata?.isDerivative) ||
      (filterType === "original" && !entry.metadata?.isDerivative);

    return matchesSearch && matchesType;
  });

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length <= 10) return addr;
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const truncateHash = (hash: string) => {
    if (!hash) return "";
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-6xl mx-auto p-4 md:p-6"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#FF4DA6] mb-2">
          Whitelist Monitor
        </h2>
        <p className="text-slate-400 text-sm md:text-base">
          Manage and monitor all whitelisted remix assets
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-slate-800/50 border border-[#FF4DA6]/30 rounded-lg p-4"
          >
            <div className="text-slate-400 text-sm">Total Entries</div>
            <div className="text-3xl font-bold text-[#FF4DA6] mt-2">
              {stats.totalEntries}
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-slate-800/50 border border-blue-400/30 rounded-lg p-4"
          >
            <div className="text-slate-400 text-sm">Original IPs</div>
            <div className="text-3xl font-bold text-blue-400 mt-2">
              {stats.originals}
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-slate-800/50 border border-purple-400/30 rounded-lg p-4"
          >
            <div className="text-slate-400 text-sm">Derivatives</div>
            <div className="text-3xl font-bold text-purple-400 mt-2">
              {stats.derivatives}
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-slate-800/50 border border-slate-600/30 rounded-lg p-4"
          >
            <div className="text-slate-400 text-sm">Last Updated</div>
            <div className="text-xs font-medium text-slate-200 mt-2 break-all">
              {stats.lastUpdated}
            </div>
          </motion.div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Search</label>
            <input
              type="text"
              placeholder="Title, IP ID, or hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-slate-900/50 border border-slate-600/50 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/30"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Type</label>
            <select
              value={filterType}
              onChange={(e) =>
                setFilterType(
                  e.target.value as "all" | "original" | "derivative",
                )
              }
              className="w-full rounded-lg bg-slate-900/50 border border-slate-600/50 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF4DA6]/30"
            >
              <option value="all">All Types</option>
              <option value="original">Original IPs</option>
              <option value="derivative">Derivatives</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchWhitelist}
              disabled={loading}
              className="flex-1 rounded-lg bg-[#FF4DA6]/20 hover:bg-[#FF4DA6]/30 text-[#FF4DA6] font-medium px-3 py-2 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={clearWhitelist}
              disabled={loading || entries.length === 0}
              className="flex-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium px-3 py-2 transition-colors disabled:opacity-50"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400">
          Showing {filteredEntries.length} of {entries.length} entries
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            {loading ? "Loading..." : "No entries found"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    IP ID
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Hash
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Registered
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Type
                  </th>
                  <th className="px-4 py-3 text-center text-slate-400 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, idx) => (
                  <motion.tr
                    key={entry.hash}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-b border-slate-700/30 hover:bg-slate-900/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-100 font-medium">
                      <div
                        className="cursor-pointer hover:text-[#FF4DA6] transition-colors max-w-xs truncate"
                        title={entry.metadata?.title}
                        onClick={() =>
                          setExpandedHash(
                            expandedHash === entry.hash ? null : entry.hash,
                          )
                        }
                      >
                        {entry.metadata?.title || "N/A"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {truncateAddress(entry.metadata?.ipId || "")}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {truncateHash(entry.hash)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(entry.metadata?.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          entry.metadata?.isDerivative
                            ? "bg-purple-400/10 text-purple-400"
                            : "bg-blue-400/10 text-blue-400"
                        }`}
                      >
                        {entry.metadata?.isDerivative
                          ? "Derivative"
                          : "Original"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteEntry(entry.hash)}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                        title="Delete entry"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                        </svg>
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Expanded Details - ALL Fields */}
        {expandedHash && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-700/50 bg-slate-900/50 p-6"
          >
            {entries.find((e) => e.hash === expandedHash) && (
              <div className="space-y-4 text-sm">
                {/* Hash Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 font-semibold block mb-2">
                      SHA256 Hash:
                    </span>
                    <div className="text-slate-200 font-mono break-all text-xs bg-slate-900/50 p-2 rounded">
                      {expandedHash}
                    </div>
                  </div>
                  {entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.pHash && (
                    <div>
                      <span className="text-slate-400 font-semibold block mb-2">
                        Perceptual Hash:
                      </span>
                      <div className="text-slate-200 font-mono break-all text-xs bg-slate-900/50 p-2 rounded">
                        {
                          entries.find((e) => e.hash === expandedHash)?.metadata
                            ?.pHash
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Asset Details from Details Modal */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    Asset Details:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Owner:</span>
                      <div className="text-slate-200 font-mono truncate">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.ownerAddress || "N/A"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Media Type:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.mediaType || "N/A"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Match Score:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.score !== null &&
                        entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.score !== undefined
                          ? (
                              (entries.find((e) => e.hash === expandedHash)
                                ?.metadata?.score ?? 0) * 100
                            ).toFixed(1) + "%"
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Parents Count:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.parentsCount ?? "0"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {entries.find((e) => e.hash === expandedHash)?.metadata
                  ?.description && (
                  <div className="border-t border-slate-700/30 pt-4">
                    <span className="text-slate-400 font-semibold block mb-2">
                      Description:
                    </span>
                    <div className="text-slate-200 text-xs leading-relaxed bg-slate-900/50 p-3 rounded">
                      {
                        entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.description
                      }
                    </div>
                  </div>
                )}

                {/* Royalty Configuration */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    Royalty Configuration:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Max Minting Fee:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.maxMintingFee === "0"
                          ? "Unlimited"
                          : entries.find((e) => e.hash === expandedHash)
                              ?.metadata?.maxMintingFee || "N/A"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Max RTS:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.maxRts === "0"
                          ? "Unlimited"
                          : entries.find((e) => e.hash === expandedHash)
                              ?.metadata?.maxRts || "N/A"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Max Rev Share:</span>
                      <div className="text-slate-200">
                        {entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.maxRevenueShare || 0}
                        %
                      </div>
                    </div>
                  </div>
                </div>

                {/* License Terms */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    License Terms:
                  </span>
                  {entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.licenses &&
                  entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.licenses.length > 0 ? (
                    <div className="space-y-2">
                      {entries
                        .find((e) => e.hash === expandedHash)
                        ?.metadata?.licenses?.map(
                          (license: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-slate-900/50 p-3 rounded text-xs border border-slate-700/30"
                            >
                              <div className="grid grid-cols-2 gap-2 text-slate-200">
                                {license.terms?.derivativesAllowed && (
                                  <div>
                                    <span className="text-slate-500">
                                      Derivatives:
                                    </span>
                                    <span className="text-green-400">
                                      {" "}
                                      ✓ Allowed
                                    </span>
                                  </div>
                                )}
                                {license.terms?.commercialUse && (
                                  <div>
                                    <span className="text-slate-500">
                                      Commercial:
                                    </span>
                                    <span className="text-green-400">
                                      {" "}
                                      ✓ Allowed
                                    </span>
                                  </div>
                                )}
                                {license.terms?.transferable && (
                                  <div>
                                    <span className="text-slate-500">
                                      Transferable:
                                    </span>
                                    <span className="text-green-400">
                                      {" "}
                                      ✓ Yes
                                    </span>
                                  </div>
                                )}
                                {license.terms?.defaultMintingFee && (
                                  <div>
                                    <span className="text-slate-500">
                                      Minting Fee:
                                    </span>
                                    <span className="text-slate-200">
                                      {license.terms.defaultMintingFee}
                                    </span>
                                  </div>
                                )}
                                {license.terms?.commercialRevShare && (
                                  <div>
                                    <span className="text-slate-500">
                                      Rev Share:
                                    </span>
                                    <span className="text-slate-200">
                                      {license.terms.commercialRevShare}%
                                    </span>
                                  </div>
                                )}
                                {license.templateName && (
                                  <div>
                                    <span className="text-slate-500">
                                      Template:
                                    </span>
                                    <span className="text-slate-200">
                                      {license.templateName}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ),
                        )}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs">
                      No license data available
                    </div>
                  )}
                </div>

                {/* Parent IPs */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    Parent IPs:
                  </span>
                  {entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.parentIpIds &&
                  entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.parentIpIds.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      {entries
                        .find((e) => e.hash === expandedHash)
                        ?.metadata?.parentIpIds?.map(
                          (parentId: string, idx: number) => (
                            <div
                              key={idx}
                              className="text-slate-200 font-mono break-all text-slate-300"
                            >
                              {parentId.substring(0, 6)}...
                              {parentId.substring(parentId.length - 4)}
                            </div>
                          ),
                        )}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs">No parent IPs</div>
                  )}
                </div>

                {/* Vision Description */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-2">
                    Vision Analysis:
                  </span>
                  {entries.find((e) => e.hash === expandedHash)?.metadata
                    ?.visionDescription ? (
                    <div className="text-slate-200 text-xs leading-relaxed bg-slate-900/50 p-3 rounded">
                      {
                        entries.find((e) => e.hash === expandedHash)?.metadata
                          ?.visionDescription
                      }
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs">
                      No vision data available
                    </div>
                  )}
                </div>

                {/* Parent IP Details (if available) */}
                {entries.find((e) => e.hash === expandedHash)?.metadata
                  ?.parentIpDetails && (
                  <div className="border-t border-slate-700/30 pt-4">
                    <span className="text-slate-400 font-semibold block mb-3">
                      Parent IP Details:
                    </span>
                    <div className="bg-slate-900/50 p-3 rounded text-xs space-y-1">
                      {typeof entries.find((e) => e.hash === expandedHash)
                        ?.metadata?.parentIpDetails === "object" ? (
                        <pre className="text-slate-200 overflow-auto max-h-48 text-[0.7rem] leading-tight">
                          {JSON.stringify(
                            entries.find((e) => e.hash === expandedHash)
                              ?.metadata?.parentIpDetails,
                            null,
                            2,
                          )}
                        </pre>
                      ) : (
                        <div className="text-slate-300">
                          {String(
                            entries.find((e) => e.hash === expandedHash)
                              ?.metadata?.parentIpDetails,
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Data Capture Summary */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    Capture Summary:
                  </span>
                  <div className="bg-slate-900/50 p-3 rounded text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="text-slate-500">Total Fields:</span>
                        <span className="text-[#FF4DA6] ml-2 font-semibold">
                          {
                            Object.entries(
                              entries.find((e) => e.hash === expandedHash)
                                ?.metadata || {},
                            ).filter(
                              ([_, v]) =>
                                v !== undefined && v !== null && v !== "",
                            ).length
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Captured At:</span>
                        <span className="text-slate-200 ml-2">
                          {formatDate(
                            entries.find((e) => e.hash === expandedHash)
                              ?.metadata?.timestamp,
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-700/30 text-slate-400 text-[0.75rem]">
                      ✅ Details modal data auto-captured from Story API
                    </div>
                  </div>
                </div>

                {/* All Raw Fields from Modal */}
                <div className="border-t border-slate-700/30 pt-4">
                  <span className="text-slate-400 font-semibold block mb-3">
                    All Fields (Raw Data):
                  </span>
                  <div className="bg-slate-900/50 p-4 rounded space-y-2 max-h-96 overflow-y-auto">
                    {entries.find((e) => e.hash === expandedHash)?.metadata ? (
                      <div className="space-y-2 text-xs font-mono">
                        {Object.entries(
                          entries.find((e) => e.hash === expandedHash)
                            ?.metadata || {},
                        )
                          .filter(
                            ([_, value]) =>
                              value !== undefined &&
                              value !== null &&
                              value !== "",
                          )
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="break-words bg-slate-800/30 p-2 rounded hover:bg-slate-800/50 transition-colors"
                            >
                              <span className="text-[#FF4DA6] font-semibold">
                                {key}:
                              </span>
                              <span className="text-slate-300 ml-2 block mt-1">
                                {typeof value === "object" ? (
                                  <pre className="text-[0.65rem] overflow-auto max-h-32 leading-tight">
                                    {JSON.stringify(value, null, 2)}
                                  </pre>
                                ) : value &&
                                  typeof value === "string" &&
                                  value.length > 80 ? (
                                  <div className="break-words whitespace-pre-wrap text-[0.75rem]">
                                    {value}
                                  </div>
                                ) : (
                                  String(value)
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-slate-400 text-xs">
                        No raw data available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
