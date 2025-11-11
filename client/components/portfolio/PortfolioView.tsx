import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useStoryTokens } from "@/hooks/useStoryTokens";
import { AlertCircle, Wallet, Zap } from "lucide-react";

export const PortfolioView = () => {
  const { authenticated, ready } = usePrivy();
  const { address, tokens, nfts, loading, error, refetch } = useStoryTokens();

  useEffect(() => {
    if (authenticated && address && !loading) {
      const interval = setInterval(refetch, 30000); // Refetch every 30 seconds
      return () => clearInterval(interval);
    }
  }, [authenticated, address, loading, refetch]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-2xl w-full space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-xl text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4DA6]/10">
              <Wallet className="h-6 w-6 text-[#FF4DA6]" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Connect Your Wallet
          </h2>
          <p className="text-sm text-slate-300 sm:text-base">
            Connect your wallet to view your tokens and NFTs on Story mainnet
          </p>
        </div>
      </div>
    );
  }

  if (loading && tokens.length === 0 && nfts.length === 0) {
    return (
      <div className="flex flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="w-full max-w-6xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              Loading Portfolio...
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 px-4 py-6 sm:px-6 sm:py-8 overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto space-y-8">
        {/* Address Section */}
        {address && (
          <div className="px-4 py-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
              Connected Wallet
            </p>
            <p className="text-sm font-mono text-slate-200 break-all">{address}</p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tokens Section */}
        <div>
          <div className="mb-4 space-y-1">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#FF4DA6]" />
              Token Balances
            </h2>
            <p className="text-sm text-slate-400">
              Your token holdings on Story mainnet
            </p>
          </div>

          {tokens.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {tokens.map((token) => (
                <Card
                  key={token.address}
                  className="border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{token.symbol}</CardTitle>
                        <CardDescription className="text-xs">
                          {token.name}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#FF4DA6]">
                          {parseFloat(token.balanceFormatted).toFixed(4)}
                        </p>
                        <p className="text-xs text-slate-400">{token.symbol}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs space-y-1">
                      <p className="text-slate-400">
                        Raw Balance: <span className="text-slate-300 font-mono">
                          {token.balance}
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Contract: <span className="text-slate-300 font-mono text-[10px] break-all">
                          {token.address}
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-6 py-12 text-center">
              <p className="text-sm text-slate-400">No tokens found</p>
            </div>
          )}
        </div>

        {/* NFTs Section */}
        <div>
          <div className="mb-4 space-y-1">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#FF4DA6]" />
              NFT Collections
            </h2>
            <p className="text-sm text-slate-400">
              Your NFT holdings on Story mainnet
            </p>
          </div>

          {nfts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {nfts.map((nft) => (
                <Card
                  key={nft.address}
                  className="border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{nft.name}</CardTitle>
                        <CardDescription className="text-xs uppercase tracking-wide">
                          {nft.type}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#FF4DA6]">
                          {nft.balance}
                        </p>
                        <p className="text-xs text-slate-400">
                          {nft.balance === "1" ? "Item" : "Items"}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs space-y-1">
                      <p className="text-slate-400">
                        Type: <span className="text-slate-300">{nft.type}</span>
                      </p>
                      <p className="text-slate-400">
                        Contract: <span className="text-slate-300 font-mono text-[10px] break-all">
                          {nft.address}
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-6 py-12 text-center">
              <p className="text-sm text-slate-400">No NFTs found</p>
            </div>
          )}
        </div>

        {/* Empty State */}
        {tokens.length === 0 && nfts.length === 0 && !error && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-6 py-12 text-center">
            <p className="text-sm text-slate-400">
              No tokens or NFTs found on Story mainnet
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
