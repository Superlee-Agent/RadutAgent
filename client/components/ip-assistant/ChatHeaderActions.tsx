import type { FC } from "react";

type ChatHeaderActionsProps = {
  guestMode: boolean;
  onToggleGuest: () => void;
  walletButtonText: string;
  walletButtonDisabled: boolean;
  onWalletClick: () => void;
  connectedAddressLabel?: string | null;
};

const ChatHeaderActions: FC<ChatHeaderActionsProps> = ({
  guestMode,
  onToggleGuest,
  walletButtonText,
  walletButtonDisabled,
  onWalletClick,
  connectedAddressLabel,
}) => (
  <>
    {connectedAddressLabel ? (
      <span className="hidden text-xs font-medium text-[#FF4DA6]/80 sm:inline">
        {connectedAddressLabel}
      </span>
    ) : null}
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={guestMode}
        onClick={onToggleGuest}
        className={
          "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 " +
          (guestMode
            ? "bg-[#FF4DA6] text-white hover:bg-[#ff77c2]"
            : "text-[#FF4DA6] hover:bg-[#FF4DA6]/15")
        }
      >
        Guest
      </button>
      <button
        type="button"
        onClick={onWalletClick}
        disabled={walletButtonDisabled}
        className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-[#FF4DA6] transition-colors duration-200 hover:bg-[#FF4DA6]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {walletButtonText}
      </button>
    </div>
  </>
);

export default ChatHeaderActions;
