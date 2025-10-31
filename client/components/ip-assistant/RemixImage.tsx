import { Dispatch, SetStateAction } from "react";

interface PreviewImage {
  blob: Blob;
  name: string;
  url: string;
}

interface PreviewImagesState {
  remixImage: PreviewImage | null;
  additionalImage: PreviewImage | null;
}

interface RemixImageProps {
  previewImages: PreviewImagesState;
  setPreviewImages: Dispatch<SetStateAction<PreviewImagesState>>;
  onAddImageClick?: () => void;
}

const ImageItem = ({
  image,
  onRemove,
  label,
}: {
  image: PreviewImage | null;
  onRemove: () => void;
  label: string;
}) => {
  if (!image) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative flex-shrink-0">
        <img
          src={image.url}
          alt={label}
          className="h-16 w-16 object-cover rounded-lg"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-2 -left-2 p-1 bg-red-500/80 text-white hover:bg-red-600 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
          aria-label={`Remove ${label}`}
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
        <p className="text-xs text-slate-300 truncate">{image.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">Ready to send</p>
      </div>
    </div>
  );
};

export const RemixImage = ({
  previewImages,
  setPreviewImages,
  onAddImageClick,
}: RemixImageProps) => {
  if (!previewImages.remixImage && !previewImages.additionalImage) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 bg-slate-900/40 rounded-lg p-3">
      <div className="flex flex-1 items-center gap-4 min-w-0">
        {previewImages.remixImage && (
          <ImageItem
            image={previewImages.remixImage}
            onRemove={() =>
              setPreviewImages((prev) => ({
                ...prev,
                remixImage: null,
              }))
            }
            label="Remix Image"
          />
        )}

        {previewImages.additionalImage && (
          <>
            {previewImages.remixImage && (
              <div className="w-px h-12 bg-slate-700/50" />
            )}
            <ImageItem
              image={previewImages.additionalImage}
              onRemove={() =>
                setPreviewImages((prev) => ({
                  ...prev,
                  additionalImage: null,
                }))
              }
              label="Additional Image"
            />
          </>
        )}
      </div>

      {previewImages.remixImage && !previewImages.additionalImage && (
        <button
          type="button"
          onClick={onAddImageClick}
          className="flex-shrink-0 p-2 text-[#FF4DA6] hover:bg-[#FF4DA6]/20 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4DA6]/30"
          aria-label="Add additional image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      )}
    </div>
  );
};
