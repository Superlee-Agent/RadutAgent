import { RequestHandler } from "express";

const IDP_CHECK = new Map<string, { status: number; body: any; ts: number }>();

export const handleCheckIpAssets: any = async (req: any, res: any) => {
  try {
    const idempotencyKey = (req.get("Idempotency-Key") ||
      req.get("Idempotency-Key")) as string | undefined;
    if (idempotencyKey && IDP_CHECK.has(idempotencyKey)) {
      const cached = IDP_CHECK.get(idempotencyKey)!;
      if (Date.now() - cached.ts < 60_000) {
        res.status(cached.status).json({ ok: true, ...cached.body });
        return;
      } else {
        IDP_CHECK.delete(idempotencyKey);
      }
    }

    const { address } = req.body;

    if (!address || typeof address !== "string") {
      return res
        .status(400)
        .json({
          ok: false,
          error: "address_required",
          message: "Address is required",
        });
    }

    const trimmedAddress = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "invalid_address",
          message: "Invalid Ethereum address format",
        });
    }

    const apiKey = process.env.STORY_API_KEY;
    if (!apiKey) {
      console.error("STORY_API_KEY environment variable not configured");
      return res
        .status(500)
        .json({
          ok: false,
          error: "server_config_missing",
          message: "Server configuration error: STORY_API_KEY not set",
        });
    }

    let allAssets: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100;
    const maxIterations = 10;
    let iterations = 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      while (hasMore && iterations < maxIterations) {
        iterations += 1;

        try {
          const response = await fetch(
            "https://api.storyapis.com/api/v4/assets",
            {
              method: "POST",
              headers: {
                "X-Api-Key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                where: {
                  ownerAddress: trimmedAddress,
                },
                pagination: {
                  limit,
                  offset,
                },
              }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Story API Error: ${response.status} - ${errorText}`,
              {
                address: trimmedAddress,
                offset,
                iteration: iterations,
              },
            );

            let errorDetail = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorDetail = errorJson.message || errorJson.error || errorText;
            } catch {
              // Keep the raw text if not JSON
            }

            clearTimeout(timeoutId);
            return res
              .status(response.status)
              .json({
                ok: false,
                error: `story_api_error`,
                details: errorDetail,
                status: response.status,
              });
          }

          const data = await response.json();

          if (!data) {
            console.error("Empty response from Story API", {
              address: trimmedAddress,
              offset,
              iteration: iterations,
            });
            break;
          }

          const assets = Array.isArray(data) ? data : data?.data || [];

          if (!Array.isArray(assets)) {
            console.warn("Unexpected response format from Story API", {
              address: trimmedAddress,
              offset,
              iteration: iterations,
              dataKeys: Object.keys(data || {}),
              dataType: typeof data,
            });
            break;
          }

          const validAssets = assets.filter((asset: any) => {
            if (!asset || typeof asset !== "object") {
              console.warn("Invalid asset object", { asset });
              return false;
            }
            return true;
          });

          allAssets = allAssets.concat(validAssets);

          const pagination = data?.pagination;
          hasMore = pagination?.hasMore === true && validAssets.length > 0;
          offset += limit;

          if (
            pagination?.hasMore === false ||
            !pagination ||
            validAssets.length === 0
          ) {
            hasMore = false;
          }
        } catch (fetchError: any) {
          if (fetchError.name === "AbortError") {
            console.error("Request timeout while fetching IP assets", {
              address: trimmedAddress,
              offset,
              iteration: iterations,
            });
            clearTimeout(timeoutId);
            return res
              .status(504)
              .json({
                ok: false,
                error: "timeout",
                details:
                  "The Story API is responding slowly. Please try again in a moment.",
              });
          }

          console.error("Fetch request failed for Story API", {
            address: trimmedAddress,
            offset,
            iteration: iterations,
            error: fetchError?.message,
            errorType: fetchError?.name,
          });
          clearTimeout(timeoutId);
          return res
            .status(500)
            .json({
              ok: false,
              error: "network_error",
              details: fetchError?.message || "Unable to connect to Story API",
            });
        }
      }

      clearTimeout(timeoutId);

      if (iterations >= maxIterations) {
        console.warn("Max iterations reached when fetching IP assets", {
          address: trimmedAddress,
          assetsCollected: allAssets.length,
        });
      }

      const originalCount = allAssets.filter((asset: any) => {
        return !asset.isDerivative;
      }).length;

      const remixCount = allAssets.filter((asset: any) => {
        return asset.isDerivative;
      }).length;

      const totalCount = allAssets.length;

      const body = {
        address: trimmedAddress,
        totalCount,
        originalCount,
        remixCount,
      };
      if (idempotencyKey)
        IDP_CHECK.set(idempotencyKey, { status: 200, body, ts: Date.now() });
      res.json({ ok: true, ...body });
    } catch (innerError: any) {
      clearTimeout(timeoutId);
      throw innerError;
    }
  } catch (error: any) {
    console.error("Check IP Assets Error:", error);
    res
      .status(500)
      .json({
        ok: false,
        error: error?.message || "Internal server error",
        details:
          process.env.NODE_ENV !== "production"
            ? error?.stack
            : "An unexpected error occurred",
      });
  }
};
