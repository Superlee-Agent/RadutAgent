import { RequestHandler } from "express";

export const handleResolveIpName: RequestHandler = async (req, res) => {
  try {
    const { ipName } = req.body;

    if (!ipName || typeof ipName !== "string") {
      return res.status(400).json({
        ok: false,
        error: "ip_name_required",
        message: "IP name is required",
      });
    }

    const trimmedName = ipName.trim();

    // Validate .ip name format
    if (!trimmedName.endsWith(".ip")) {
      return res.status(400).json({
        ok: false,
        error: "invalid_ip_name",
        message: "Must be a valid .ip name (e.g., myname.ip)",
      });
    }

    console.log("[Resolve IP Name] Resolving:", trimmedName);

    try {
      // Call Blockscout API to resolve .ip name
      // Chain ID 1514 is Story Protocol Testnet
      const response = await fetch(
        `https://bens.services.blockscout.com/api/v1/1514/domains/${encodeURIComponent(trimmedName)}?only_active=true`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        console.warn(
          `[Resolve IP Name] Blockscout API error: ${response.status}`,
        );

        if (response.status === 404) {
          return res.status(404).json({
            ok: false,
            error: "ip_name_not_found",
            message: `IP name "${trimmedName}" not found or not registered`,
          });
        }

        return res.status(response.status).json({
          ok: false,
          error: "blockscout_api_error",
          message: `Failed to resolve IP name: ${response.status}`,
        });
      }

      const data = await response.json();

      if (!data.resolved_address?.hash) {
        return res.status(404).json({
          ok: false,
          error: "resolution_failed",
          message: `Could not resolve "${trimmedName}" to an address`,
        });
      }

      const resolvedAddress = data.resolved_address.hash;

      console.log("[Resolve IP Name] Resolved to:", {
        ipName: trimmedName,
        address: resolvedAddress,
      });

      res.json({
        ok: true,
        ipName: trimmedName,
        address: resolvedAddress,
      });
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        console.error("[Resolve IP Name] Request timeout");
        return res.status(504).json({
          ok: false,
          error: "timeout",
          message: "Blockscout API is responding slowly. Please try again.",
        });
      }

      console.error("[Resolve IP Name] Fetch error:", fetchError?.message);
      return res.status(500).json({
        ok: false,
        error: "network_error",
        message: fetchError?.message || "Unable to connect to Blockscout API",
      });
    }
  } catch (error: any) {
    console.error("[Resolve IP Name] Error:", error);
    res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error",
      details:
        process.env.NODE_ENV !== "production"
          ? error?.stack
          : "An unexpected error occurred",
    });
  }
};
