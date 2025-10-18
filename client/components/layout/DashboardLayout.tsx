import { type ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { APP_NAV_ITEMS, type AppNavItem } from "@/config/navigation";

const BRAND_NAME = "Radut Verse";
const BRAND_IMAGE_URL =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F52cfa9fa715049a49469c1473e1a313e";

const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

type DashboardLayoutProps = {
  title: string;
  avatarSrc?: string;
  actions?: ReactNode;
  children: ReactNode;
  navItems?: AppNavItem[];
  sidebarExtras?: (options: { closeSidebar: () => void }) => ReactNode;
};

export const DashboardLayout = ({
  title,
  avatarSrc,
  actions,
  children,
  navItems = APP_NAV_ITEMS,
  sidebarExtras,
}: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderBrandHeader = () => (
    <div className="flex w-full items-center gap-3 rounded-xl border border-[#FF4DA6]/15 px-4 py-3 text-sm font-medium text-slate-300 bg-gradient-to-r from-[#FF4DA6]/5 to-transparent backdrop-blur-sm hover:border-[#FF4DA6]/25 hover:bg-gradient-to-r hover:from-[#FF4DA6]/10 hover:to-transparent transition-all duration-300">
      <span
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF4DA6]/20 to-[#FF4DA6]/5 border border-[#FF4DA6]/20"
        style={{
          backgroundImage: `url(${BRAND_IMAGE_URL})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />
      <div className="text-base font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DA6] to-[#ff77c2]">
        {BRAND_NAME}
      </div>
    </div>
  );

  const renderNavItems = (closeSidebar?: () => void) => (
    <nav className="mt-6 flex-1 w-full text-slate-300 space-y-1">
      <ul className="flex flex-col gap-1">
        {navItems.map((item) => {
          const ItemIcon = item.icon;
          return (
            <li key={item.id}>
              <NavLink
                to={item.to}
                className={({ isActive }) => {
                  const baseClasses =
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300";
                  const activeClasses =
                    "bg-gradient-to-r from-[#FF4DA6]/20 to-[#FF4DA6]/5 text-[#FF4DA6] border border-[#FF4DA6]/40 shadow-[0_8px_24px_rgba(255,77,166,0.15)]";
                  const inactiveClasses =
                    "text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5 hover:border-[#FF4DA6]/20";
                  return [
                    baseClasses,
                    isActive ? activeClasses : inactiveClasses,
                  ].join(" ");
                }}
                onClick={() => closeSidebar?.()}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-500 transition-all duration-300 group-hover:bg-slate-700/60 group-hover:text-slate-300">
                  <ItemIcon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const sidebar = (
    <div className="flex w-full flex-col gap-6">
      {renderBrandHeader()}
      {renderNavItems(() => setSidebarOpen(false))}
      {sidebarExtras
        ? sidebarExtras({ closeSidebar: () => setSidebarOpen(false) })
        : null}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      <div className="flex min-h-[100dvh] w-full md:overflow-hidden">
        <aside className="hidden md:flex w-64 flex-col bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-black/80 text-slate-100 py-6 px-4 border-r border-[#FF4DA6]/10 sticky top-0 max-h-screen min-h-screen overflow-y-auto backdrop-blur-xl">
          {sidebar}
        </aside>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="fixed inset-0 bg-black/40"
                onClick={() => setSidebarOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.aside
                className="relative w-64 bg-gradient-to-b from-slate-950/95 via-slate-950/85 to-black/90 text-slate-100 py-6 px-4 h-full overflow-y-auto border-r border-[#FF4DA6]/10 backdrop-blur-xl"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">{renderBrandHeader()}</div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-md border-0 bg-transparent text-[#FF4DA6] hover:bg-[#FF4DA6]/10 transition-colors"
                    aria-label="Close menu"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-6">
                  {renderNavItems(() => setSidebarOpen(false))}
                  {sidebarExtras
                    ? sidebarExtras({
                        closeSidebar: () => setSidebarOpen(false),
                      })
                    : null}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 flex min-h-0 md:min-h-[100dvh]">
          <div className="chat-wrap w-full md:h-full md:min-h-0 flex flex-col bg-gradient-to-b from-slate-950/50 via-slate-950/30 to-black">
            <motion.header
              className="flex items-center gap-4 px-6 py-4 border-b border-[#FF4DA6]/10 bg-gradient-to-r from-slate-950/60 via-[#FF4DA6]/5 to-slate-950/60 backdrop-blur-xl"
              variants={fadeUp}
              initial="initial"
              animate="animate"
            >
              <button
                type="button"
                className="md:hidden p-2 rounded-md border-0 bg-transparent text-[#FF4DA6] hover:bg-[#FF4DA6]/10 active:scale-[0.98] transition-all"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Dashboard avatar"
                  className="h-10 w-10 rounded-lg object-cover border border-[#FF4DA6]/20 ring-2 ring-[#FF4DA6]/10"
                />
              ) : null}
              <div>
                <h1 className="text-lg font-bold tracking-wider bg-gradient-to-r from-[#FF4DA6] to-[#ff77c2] bg-clip-text text-transparent">
                  {title}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-3">{actions}</div>
            </motion.header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
