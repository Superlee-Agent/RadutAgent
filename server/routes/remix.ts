import { StoryClient, StoryConfig } from "@story-protocol/core-sdk";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PUBLIC_SPG_CONTRACT = process.env.VITE_PUBLIC_SPG_COLLECTION;
const STORY_RPC = process.env.VITE_PUBLIC_STORY_RPC || "https://mainnet.storyrpc.io";

export const handleRemix = async (req: any, res: any) => {
  try {
    const { parentIpId, licenseTermsId, useGuestMode } = req.body as {
      parentIpId: string;
      licenseTermsId: string;
      useGuestMode: boolean;
    };

    if (!parentIpId) {
      return res.status(400).json({
        ok: false,
        error: "missing_parent_ip_id",
        message: "Parent IP ID is required",
      });
    }

    if (!licenseTermsId) {
      return res.status(400).json({
        ok: false,
        error: "missing_license_terms_id",
        message: "License terms ID is required",
      });
    }

    if (!PUBLIC_SPG_CONTRACT) {
      console.error("VITE_PUBLIC_SPG_COLLECTION is not configured");
      return res.status(503).json({
        ok: false,
        error: "spg_contract_missing",
        message: "SPG contract not configured on server",
      });
    }

    let account;

    if (useGuestMode) {
      const privateKey = process.env.VITE_GUEST_PRIVATE_KEY;
      if (!privateKey) {
        return res.status(503).json({
          ok: false,
          error: "guest_key_missing",
          message: "Guest mode wallet not configured",
        });
      }

      account = privateKeyToAccount(`0x${privateKey.replace(/^0x/, "")}`);
    } else {
      return res.status(400).json({
        ok: false,
        error: "authenticated_remix_not_implemented",
        message: "Authenticated remix requires wallet provider setup",
      });
    }

    const config: StoryConfig = {
      account: account,
      transport: http(STORY_RPC),
      chainId: "mainnet",
    };

    const client = StoryClient.newClient(config);

    console.log("[Remix] Starting derivative registration for:", {
      parentIpId,
      licenseTermsId,
      spgContract: PUBLIC_SPG_CONTRACT,
    });

    const response = await client.ipAsset.registerDerivativeIpAsset({
      nft: {
        type: "mint",
        spgNftContract: PUBLIC_SPG_CONTRACT,
      },
      derivData: {
        parentIpIds: [parentIpId],
        licenseTermsIds: [licenseTermsId],
      },
    });

    console.log("[Remix] Success:", { ipId: response.ipId, txHash: response.txHash });

    return res.status(200).json({
      ok: true,
      ipId: response.ipId,
      txHash: response.txHash,
      blockNumber: response.blockNumber,
    });
  } catch (error: any) {
    console.error("[Remix] Error:", error);
    const message =
      error?.message || error?.toString?.() || "Failed to remix IP asset";
    return res.status(500).json({
      ok: false,
      error: "remix_failed",
      message,
    });
  }
};
