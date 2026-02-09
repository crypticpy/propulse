/**
 * BioSection — Operator bio and photo showcase.
 *
 * Displays the operator's profile photo alongside their bio text.
 * Supports markdown formatting, photo URL input, and generous
 * character limits for detailed station descriptions.
 */

import { useState, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { ImageUploadButton } from "@/components/ui/ImageUploadButton";
import { useImageUrl } from "@/hooks/useImageUrl";
import { MarkdownRenderer } from "./MarkdownRenderer";

const MAX_BIO_LENGTH = 10_000;

export function BioSection() {
  const bio = useProfileStore((s) => s.bio);
  const setBio = useProfileStore((s) => s.setBio);
  const profileImageUrl = useProfileStore((s) => s.profileImageUrl);
  const setProfileImageUrl = useProfileStore((s) => s.setProfileImageUrl);
  const profileImageId = useProfileStore((s) => s.profileImageId);
  const setProfileImageId = useProfileStore((s) => s.setProfileImageId);
  const { url: uploadedImageUrl } = useImageUrl(profileImageId);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(bio);
  const [imageDraft, setImageDraft] = useState(profileImageUrl);
  const [imageError, setImageError] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Sync drafts when store changes externally (e.g., backup restore, ingestion)
  useEffect(() => {
    if (!isEditing) {
      setDraft(bio);
      setImageDraft(profileImageUrl);
      setImgError(false);
    }
  }, [bio, profileImageUrl, isEditing]);

  const handleSave = () => {
    setBio(draft.trim());
    setProfileImageUrl(imageDraft.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(bio);
    setImageDraft(profileImageUrl);
    setIsEditing(false);
  };

  const displayImageUrl = uploadedImageUrl || profileImageUrl;
  const isEmpty = !bio && !displayImageUrl;

  // ─── Read mode ──────────────────────────────────────────────────────────

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            About
          </h3>
          <button
            onClick={() => {
              setDraft(bio);
              setImageDraft(profileImageUrl);
              setIsEditing(true);
            }}
            className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
          >
            {isEmpty ? "Add Bio" : "Edit"}
          </button>
        </div>

        {isEmpty ? (
          <EmptyState onAdd={() => setIsEditing(true)} />
        ) : (
          <div className="flex gap-5">
            {/* Photo */}
            {displayImageUrl && !imgError && (
              <div className="shrink-0">
                <div className="w-28 h-28 rounded-xl overflow-hidden border border-white/10 bg-void-black">
                  <img
                    src={displayImageUrl}
                    alt="Operator"
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                </div>
              </div>
            )}
            {/* Bio text */}
            <div className="flex-1 min-w-0">
              {bio ? (
                <MarkdownRenderer
                  text={bio}
                  className="text-gray-300 leading-relaxed"
                />
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No bio written yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Edit mode ──────────────────────────────────────────────────────────

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        About
      </h3>

      {/* Upload photo */}
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Upload Photo</label>
        <ImageUploadButton
          imageId={profileImageId}
          onImageChange={(id) => setProfileImageId(id)}
          aspect={1}
          cropShape="round"
          maxOutputWidth={500}
          maxOutputHeight={500}
          quality={0.85}
          label="Upload Photo"
        />
      </div>

      {/* Photo URL input */}
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">
          Profile Photo URL (alternative)
        </label>
        <div className="flex gap-3 items-start">
          {/* Preview */}
          <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-void-black shrink-0 flex items-center justify-center">
            {imageDraft && !imageError ? (
              <img
                src={imageDraft}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-8 h-8 text-gray-600"
              >
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                />
              </svg>
            )}
          </div>
          <input
            type="url"
            value={imageDraft}
            onChange={(e) => {
              setImageDraft(e.target.value);
              setImageError(false);
            }}
            placeholder="https://example.com/photo.jpg"
            className="flex-1 bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm
                       text-gray-200 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none"
          />
        </div>
        {imageError && (
          <p className="text-xs text-alert-red mt-1">
            Could not load image — check the URL.
          </p>
        )}
      </div>

      {/* Bio textarea */}
      <label
        htmlFor="bio-textarea"
        className="block text-xs text-gray-500 mb-1"
      >
        Bio
      </label>
      <textarea
        id="bio-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_BIO_LENGTH))}
        placeholder="Tell others about your station, operating history, interests, achievements, and antenna farm..."
        rows={8}
        className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm
                   text-gray-200 leading-relaxed focus:border-plasma-orange/50 focus:outline-none resize-y"
      />
      <p className="text-xs text-gray-600 mt-1.5">
        Supports **bold**, *italic*, [links](url), and - lists.
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {draft.length.toLocaleString()}/{MAX_BIO_LENGTH.toLocaleString()}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10
                       text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs rounded-lg bg-plasma-orange text-white
                       hover:bg-plasma-orange/80 font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full py-6 rounded-xl border border-dashed border-white/10
                 hover:border-plasma-orange/30 transition-colors group text-center"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-8 h-8 mx-auto text-gray-600 group-hover:text-plasma-orange/60 transition-colors mb-2"
      >
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
          fill="currentColor"
        />
      </svg>
      <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors">
        Add your bio and photo
      </p>
      <p className="text-xs text-gray-600 mt-0.5">
        Tell others about your station, history, and interests
      </p>
    </button>
  );
}
