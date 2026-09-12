/**
 * PasswordInput — password field with a show/hide toggle.
 *
 * Shared by AuthModal and LoginPage (previously duplicated verbatim in
 * both, see #1093). The two call sites disagree on the input's background
 * utility class (`bg-su-line/10` in the modal vs `bg-void-black/50` on the
 * full page), so that one class stays a prop instead of being baked in.
 */

import { useState } from "react";

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

export interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
  /** Background utility class for the input. Defaults to the AuthModal
   * variant; LoginPage passes `bg-void-black/50`. */
  bgClassName?: string;
}

export function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  disabled,
  autoFocus,
  inputRef,
  maxLength = 128,
  bgClassName = "bg-su-line/10",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        className={`w-full ${bgClassName} border border-su-line/40 rounded-lg px-3 py-2.5 pr-10 text-sm text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-su-muted hover:text-su-text transition-colors"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeSlashIcon className="w-4.5 h-4.5" />
        ) : (
          <EyeIcon className="w-4.5 h-4.5" />
        )}
      </button>
    </div>
  );
}
