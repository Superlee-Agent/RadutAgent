import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  createPublicClient,
  http,
  getContract,
  erc20Abi,
  erc721Abi,
} from "viem";
import { WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";

const STORY_MAINNET_RPC =
  import.meta.env.VITE_PUBLIC_STORY_RPC || "https://aeneid.storyrpc.io";
const STORY_CHAIN_ID = 1516; // Story mainnet

// Common token addresses on Story mainnet
const COMMON_TOKENS = [
  {
    address: WIP_TOKEN_ADDRESS,
    symbol: "WIP",
    decimals: 18,
    name: "Wrapped IP",
  },
];

// Common NFT collection addresses on Story mainnet
const COMMON_NFTS: Array<{
  address: string;
  name: string;
  type: "ERC721" | "ERC1155";
}> = import.meta.env.VITE_PUBLIC_SPG_COLLECTION
  ? [
      {
        address: import.meta.env.VITE_PUBLIC_SPG_COLLECTION,
        name: "Story Protocol Genesis Collection",
        type: "ERC721",
      },
    ]
  : [];

export type TokenBalance = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
};

export type NFTData = {
  address: string;
  name: string;
  type: "ERC721" | "ERC1155";
  balance: string;
  tokenIds?: string[];
};

export type StoryPortfolioData = {
  address: string | null;
  tokens: TokenBalance[];
  nfts: NFTData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useStoryTokens(): StoryPortfolioData {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [address, setAddress] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get wallet address
  useEffect(() => {
    if (!authenticated || !wallets || wallets.length === 0) {
      setAddress(null);
      setTokens([]);
      setNfts([]);
      return;
    }

    const walletWithAddress = wallets.find((wallet) => wallet.address);
    if (walletWithAddress?.address) {
      setAddress(walletWithAddress.address);
    }
  }, [authenticated, wallets]);

  const fetchTokenAndNFTData = useCallback(async () => {
    if (!address) {
      setTokens([]);
      setNfts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const publicClient = createPublicClient({
        transport: http(STORY_MAINNET_RPC),
      });

      const fetchedTokens: TokenBalance[] = [];
      const fetchedNFTs: NFTData[] = [];

      // Fetch token balances
      const userAddress = address as `0x${string}`;
      for (const token of COMMON_TOKENS) {
        try {
          const contract = getContract({
            address: token.address as `0x${string}`,
            abi: erc20Abi,
            client: publicClient,
          });

          const [balance, decimals, symbol] = await Promise.all([
            contract.read.balanceOf([userAddress]),
            contract.read.decimals(),
            contract.read.symbol(),
          ]);

          if (balance > 0n) {
            const decimalCount = Number(decimals);
            const divisor = BigInt(10 ** decimalCount);
            const formattedBalance = (balance / divisor).toString();

            fetchedTokens.push({
              address: token.address,
              symbol: symbol || token.symbol,
              name: token.name,
              decimals: decimalCount,
              balance: balance.toString(),
              balanceFormatted: formattedBalance,
            });
          }
        } catch (err) {
          console.warn(`Warning fetching token ${token.symbol}:`, err);
        }
      }

      // Fetch NFT balances
      for (const nft of COMMON_NFTS) {
        try {
          const contract = getContract({
            address: nft.address as `0x${string}`,
            abi: erc721Abi,
            client: publicClient,
          });

          const balance = await contract.read.balanceOf([userAddress]);

          if (balance > 0n) {
            fetchedNFTs.push({
              address: nft.address,
              name: nft.name,
              type: nft.type,
              balance: balance.toString(),
            });
          }
        } catch (err) {
          console.warn(`Warning fetching NFT ${nft.name}:`, err);
        }
      }

      setTokens(fetchedTokens);
      setNfts(fetchedNFTs);
    } catch (err) {
      console.error("Error fetching portfolio data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch portfolio data",
      );
      setTokens([]);
      setNfts([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Fetch on address change or authentication change
  useEffect(() => {
    if (authenticated && address) {
      fetchTokenAndNFTData();
    }
  }, [authenticated, address, fetchTokenAndNFTData]);

  return {
    address,
    tokens,
    nfts,
    loading,
    error,
    refetch: fetchTokenAndNFTData,
  };
}
