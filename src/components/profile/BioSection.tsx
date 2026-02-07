/**
 * Editable bio section with character limit.
 * Displays bio in read mode with edit toggle, or a textarea in edit mode.
 */

import { useState, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";

const MAX_BIO_LENGTH = 2000;

export function BioSection() {
  const bio = useProfileStore((s) => s.bio);
  const setBio = useProfileStore((s) => s.setBio);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(bio);

  // Sync draft when store bio changes externally (e.g., backup restore)
  useEffect(() => {
    if (!isEditing) setDraft(bio);
  }, [bio, isEditing]);

  const handleSave = () => {
    setBio(draft.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(bio);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Bio
          </h3>
          <button
            onClick={() => {
              setDraft(bio);
              setIsEditing(true);
            }}
            className="text-xs text-plasma-orange hover:text-plasma-orange/80"
          >
            {bio ? "Edit" : "Add Bio"}
          </button>
        </div>
        {bio ? (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{bio}</p>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No bio yet. Tell others about your station and interests.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Bio
      </h3>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_BIO_LENGTH))}
        placeholder="Tell others about your station, interests, and operating style..."
        rows={4}
        className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none resize-y"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {draft.length}/{MAX_BIO_LENGTH}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 text-xs rounded-lg bg-plasma-orange text-white hover:bg-plasma-orange/80 font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
