import { Dispatch, SetStateAction } from "react";

interface PreviewImage {
  blob: Blob;
  name: string;
  url: string;
}

interface RemixImageProps {
  previewImage: PreviewImage | null;
  setPreviewImage: Dispatch<SetStateAction<PreviewImage | null>>;
}

export const RemixImage = ({
  previewImage,
  setPreviewImage,
}: RemixImageProps) => {
  if (!previewImage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 bg-slate-900/40 rounded-lg p-2">
      <div className="relative flex-shrink-0">
        <img
          src={previewImage.url}
          alt="Preview"
          className="h-16 w-16 object-cover rounded-lg"
        />
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="absolute -top-2 -left-2 p-1 bg-red-500/80 text-white hover:bg-red-600 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
          aria-label="Remove preview"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z" />
          </svg>
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 truncate">{previewImage.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">Ready to send</p>
      </div>
    </div>
  );
};
