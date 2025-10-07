import { type LucideIcon, LayoutDashboard, Bot, ShoppingBag, Briefcase, Settings, History } from "lucide-react";

export type AppNavItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { id: "ip-assistant", label: "IP Assistant", to: "/", icon: LayoutDashboard },
  { id: "ipfi-assistant", label: "IPFi Assistant", to: "/ipfi-assistant", icon: Bot },
  { id: "nft-marketplace", label: "NFT Marketplace", to: "/nft-marketplace", icon: ShoppingBag },
  { id: "my-portfolio", label: "My Portfolio", to: "/my-portfolio", icon: Briefcase },
  { id: "settings", label: "Settings", to: "/settings", icon: Settings },
  { id: "history", label: "Chat History", to: "/history", icon: History },
];
