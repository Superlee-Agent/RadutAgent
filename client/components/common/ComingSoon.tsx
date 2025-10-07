import type { ReactNode } from "react";

interface ComingSoonProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

const ComingSoon = ({ title, description, actions }: ComingSoonProps) => (
  <div className="flex flex-1 items-center justify-center px-4 py-16">
    <div className="max-w-xl text-center space-y-4">
      <span className="inline-flex items-center justify-center rounded-full border border-[#FF4DA6]/40 bg-[#FF4DA6]/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-[#FF4DA6]">
        Coming Soon
      </span>
      <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      {description ? (
        <p className="text-sm text-slate-300 sm:text-base">{description}</p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex justify-center">{actions}</div>
      ) : null}
    </div>
  </div>
);

export default ComingSoon;
