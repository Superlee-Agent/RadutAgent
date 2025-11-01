import { useCallback, useState } from "react";
import { sha256HexOfFile, keccakOfJson } from "@/lib/utils/crypto";
import {
  uploadFile,
  uploadJSON,
  extractCid,
  toIpfsUri,
  toHttps,
} from "@/lib/utils/ipfs";
import {
  StoryClient,
  PILFlavor,
  WIP_TOKEN_ADDRESS,
} from "@story-protocol/core-sdk";
import { createWalletClient, custom, parseEther, http } from "viem";
import {
  getLicenseSettingsByGroup,
  requiresSelfieVerification,
  requiresSubmitReview,
  isAiGeneratedGroup,
} from "@/lib/groupLicense";
import { privateKeyToAccount } from "viem/accounts";

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
        // Verify watermark to prevent re-registration of remixed images
        setRegisterState({ status: "compressing", progress: 5, error: null });
        try {
          const formData = new FormData();
          formData.append("image", file);

          const verifyResponse = await fetch("/api/verify-watermark", {
            method: "POST",
            body: formData,
          });

          if (verifyResponse.ok) {
            const watermarkCheck = await verifyResponse.json();
            if (watermarkCheck.blockRegistration) {
              setRegisterState({
                status: "error",
                progress: 0,
                error: watermarkCheck.message || "This image is a remix and cannot be registered as a new IP.",
              });
              return { success: false, reason: "watermark_detected" } as const;
            }
          }
        } catch (watermarkError) {
          console.warn("Watermark verification failed, continuing:", watermarkError);
          // Don't block registration if watermark check fails
        }

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
        let creatorAddr: string | undefined;
        try {
          const providerTmp: any =
            ethereumProvider || (globalThis as any).ethereum;
          if (providerTmp) {
            const walletClientTmp = createWalletClient({
              transport: custom(providerTmp),
            });
            const addrs = await walletClientTmp.getAddresses();
            if (addrs && addrs[0]) creatorAddr = String(addrs[0]);
          }
        } catch {}
        if (!creatorAddr) {
          try {
            const guestPk = (import.meta as any).env?.VITE_GUEST_PRIVATE_KEY;
            if (guestPk) {
              const normalized = String(guestPk).startsWith("0x")
                ? String(guestPk)
                : `0x${String(guestPk)}`;
              const guestAccount = privateKeyToAccount(
                normalized as `0x${string}`,
              );
              creatorAddr = guestAccount.address;
            }
          } catch {}
        }
        const ipMetadata = {
          name: intent?.title || file.name,
          title: intent?.title || file.name,
          description: intent?.prompt || "",
          image: imageGateway,
          imageHash,
          mediaUrl: imageGateway,
          mediaHash: imageHash,
          mediaType: compressedFile.type || "image/jpeg",
          creators: creatorAddr
            ? [
                {
                  name: creatorAddr,
                  address: creatorAddr,
                  contributionPercent: 100,
                },
              ]
            : [],
          attributes: [
            {
              trait_type: "Status",
              value: isAiGeneratedGroup(group)
                ? "AI Generated"
                : "Human Generated",
            },
          ],
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
        if (!spg)
          throw new Error(
            "SPG collection env not set (VITE_PUBLIC_SPG_COLLECTION)",
          );
        const rpcUrl = (import.meta as any).env?.VITE_PUBLIC_STORY_RPC;
        if (!rpcUrl) throw new Error("RPC URL not set (VITE_PUBLIC_STORY_RPC)");

        // Build license terms for Story SDK
        const licenseTermsData = [
          {
            terms: PILFlavor.commercialRemix({
              commercialRevShare: Number(licenseSettings.revShare) || 0,
              defaultMintingFee: parseEther(
                String(licenseSettings.licensePrice || 0),
              ),
              currency: WIP_TOKEN_ADDRESS,
            }),
          },
        ];

        // Init wallet client via Privy provider if available, otherwise fallback to guest key
        const provider = ethereumProvider;
        let addr: string | undefined;
        let story: any;
        if (provider) {
          try {
            const chainIdHex: string = await provider.request({
              method: "eth_chainId",
            });
            if (chainIdHex?.toLowerCase() !== "0x523") {
              try {
                await provider.request({
                  method: "wallet_switchEthereumChain",
                  params: [{ chainId: "0x523" }],
                });
              } catch (e) {
                const rpcUrl = (import.meta as any).env?.VITE_PUBLIC_STORY_RPC;
                try {
                  await provider.request({
                    method: "wallet_addEthereumChain",
                    params: [
                      {
                        chainId: "0x523",
                        chainName: "Aeneid",
                        nativeCurrency: {
                          name: "IP",
                          symbol: "IP",
                          decimals: 18,
                        },
                        rpcUrls: rpcUrl
                          ? [rpcUrl]
                          : ["https://aeneid.storyrpc.io"],
                      },
                    ],
                  });
                } catch {}
                try {
                  await provider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: "0x523" }],
                  });
                } catch {}
              }
            }
          } catch {}
          const walletClient = createWalletClient({
            transport: custom(provider),
          });
          const [a] = await walletClient.getAddresses();
          if (!a) throw new Error("No wallet address available");
          addr = a as string;
          story = StoryClient.newClient({
            account: addr as any,
            transport: custom(provider),
            chainId: "aeneid",
          });
        } else {
          const guestPk = (import.meta as any).env?.VITE_GUEST_PRIVATE_KEY;
          if (!guestPk)
            throw new Error(
              "No wallet connected and guest key not configured (VITE_GUEST_PRIVATE_KEY).",
            );
          const normalized = String(guestPk).startsWith("0x")
            ? String(guestPk)
            : `0x${String(guestPk)}`;
          const guestAccount = privateKeyToAccount(normalized as `0x${string}`);
          addr = guestAccount.address;
          story = StoryClient.newClient({
            account: guestAccount as any,
            transport: http(rpcUrl),
            chainId: "aeneid",
          });
        }

        const result: any =
          await story.ipAsset.mintAndRegisterIpAssetWithPilTerms({
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

        setRegisterState({
          status: "success",
          progress: 100,
          error: null,
          ipId: result?.ipId,
          txHash: result?.txHash || result?.transactionHash,
        });
        return {
          success: true,
          ipId: result?.ipId,
          txHash: result?.txHash || result?.transactionHash,
          imageUrl: imageGateway,
          ipMetadataUrl: toHttps(ipMetaCid),
        } as const;
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
