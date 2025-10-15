import { useCallback, useState } from "react";
import { sha256HexOfFile, keccakOfJson } from "@/lib/utils/crypto";
import {
  uploadFile,
  uploadJSON,
  extractCid,
  toIpfsUri,
  toHttps,
} from "@/lib/utils/ipfs";
import { createLicenseTerms, LicenseSettings } from "@/lib/license/terms";
import { StoryClient, PILFlavor, WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";
import { createWalletClient, custom, parseEther } from "viem";
import {
  getLicenseSettingsByGroup,
  requiresSelfieVerification,
  requiresSubmitReview,
} from "@/lib/groupLicense";

export type RegisterState = {
  status:
    | "idle"
    | "compressing"
    | "uploading-image"
    | "creating-metadata"
    | "uploading-metadata"
    | "minting"
    | "success"
    | "error";
  progress: number;
  error: any;
  ipId?: string;
  txHash?: string;
};

async function compressImage(file: File): Promise<File> {
  // Simple browser-side downscale to JPEG
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        const maxW = 1024;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL("image/jpeg", 0.9);
        resolve(url);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = fr.result as string;
    };
    fr.onerror = () => reject(new Error("File read failed"));
    fr.readAsDataURL(file);
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

export function useIPRegistrationAgent() {
  const [registerState, setRegisterState] = useState<RegisterState>({
    status: "idle",
    progress: 0,
    error: null,
  });

  const executeRegister = useCallback(
    async (
      group: number,
      file: File,
      mintingFee?: number,
      revShare?: number,
      aiTrainingManual?: boolean,
      intent?: { title?: string; prompt?: string },
      ethereumProvider?: any,
    ) => {
      try {
        const licenseSettings = getLicenseSettingsByGroup(
          group,
          aiTrainingManual,
          mintingFee,
          revShare,
        );
        if (requiresSelfieVerification(group)) {
          setRegisterState({
            status: "idle",
            progress: 0,
            error: "Selfie verification required before registration.",
          });
          return { success: false, reason: "selfie_required" } as const;
        }
        if (requiresSubmitReview(group)) {
          setRegisterState({
            status: "idle",
            progress: 0,
            error: "Submit review required.",
          });
          return { success: false, reason: "submit_review" } as const;
        }
        if (!licenseSettings)
          throw new Error("Cannot register: licenseSettings null");

        setRegisterState({ status: "compressing", progress: 10, error: null });
        const compressedFile = await compressImage(file);

        setRegisterState((p) => ({
          ...p,
          status: "uploading-image",
          progress: 25,
        }));
        const fileUpload = await uploadFile(compressedFile);
        const imageCid = extractCid(fileUpload.cid || fileUpload.url);
        const imageGateway = fileUpload.https || toHttps(imageCid);
        const imageHash = await sha256HexOfFile(compressedFile);

        setRegisterState((p) => ({
          ...p,
          status: "creating-metadata",
          progress: 50,
        }));
        const ipMetadata = {
          title: intent?.title || file.name,
          description: intent?.prompt || "",
          image: imageGateway,
          imageHash,
          mediaUrl: imageGateway,
          mediaHash: imageHash,
          mediaType: compressedFile.type || "image/jpeg",
          creators: [],
          aiMetadata: intent?.prompt
            ? { prompt: intent.prompt, generator: "user", model: "rule-based" }
            : undefined,
          license: licenseSettings,
        };

        setRegisterState((p) => ({
          ...p,
          status: "uploading-metadata",
          progress: 60,
        }));
        const ipMetaUpload = await uploadJSON(ipMetadata);
        const ipMetaCid = extractCid(ipMetaUpload.cid || ipMetaUpload.url);
        const ipMetadataURI = toIpfsUri(ipMetaCid);
        const ipMetadataHash = keccakOfJson(ipMetadata);

        setRegisterState((p) => ({ ...p, status: "minting", progress: 75 }));
        // SDK integration pending env/deps (Story Protocol). Guard to avoid silent failure.
        const spg = (import.meta as any).env?.VITE_PUBLIC_SPG_COLLECTION;
        if (!spg) throw new Error("SPG collection env not set (VITE_PUBLIC_SPG_COLLECTION)");
        const rpcUrl = (import.meta as any).env?.VITE_PUBLIC_STORY_RPC;
        if (!rpcUrl) throw new Error("RPC URL not set (VITE_PUBLIC_STORY_RPC)");

        // Build license terms for Story SDK
        const licenseTermsData = [
          {
            terms: PILFlavor.commercialRemix({
              commercialRevShare: Number(licenseSettings.revShare) || 0,
              defaultMintingFee: parseEther(String(licenseSettings.licensePrice || 0)),
              currency: WIP_TOKEN_ADDRESS,
            }),
          },
        ];

        // Init wallet client via Privy provider
        const provider = ethereumProvider || (globalThis as any).ethereum;
        if (!provider) throw new Error("No EIP-1193 provider found. Connect wallet first.");
        const walletClient = createWalletClient({ transport: custom(provider) });
        const [addr] = await walletClient.getAddresses();
        if (!addr) throw new Error("No wallet address available");

        const story = StoryClient.newClient({
          account: addr as any,
          transport: custom(provider),
          chainId: "aeneid",
        });

        const result: any = await story.ipAsset.mintAndRegisterIpAssetWithPilTerms({
          spgNftContract: spg as `0x${string}`,
          recipient: addr as `0x${string}`,
          licenseTermsData,
          ipMetadata: {
            ipMetadataURI,
            ipMetadataHash: ipMetadataHash as any,
            nftMetadataURI: ipMetadataURI,
            nftMetadataHash: ipMetadataHash as any,
          },
          allowDuplicates: true,
        });

        setRegisterState({ status: "success", progress: 100, error: null, ipId: result?.ipId, txHash: result?.txHash || result?.transactionHash });
        return { success: true, ipId: result?.ipId, txHash: result?.txHash || result?.transactionHash, imageUrl: imageGateway, ipMetadataUrl: toHttps(ipMetaCid) } as const;
      } catch (error: any) {
        setRegisterState({ status: "error", progress: 0, error });
        return {
          success: false,
          error: error?.message || String(error),
        } as const;
      }
    },
    [],
  );

  const resetRegister = useCallback(() => {
    setRegisterState({ status: "idle", progress: 0, error: null });
  }, []);

  return { registerState, executeRegister, resetRegister } as const;
}
