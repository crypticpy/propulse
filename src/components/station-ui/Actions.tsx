import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";
import { LoaderCircle } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  pending?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      pending = false,
      disabled,
      type = "button",
      className = "",
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={`su-button su-button--${variant} ${className}`}
      >
        {pending && (
          <LoaderCircle aria-hidden="true" className="su-spinner" size={18} />
        )}
        {children}
      </button>
    );
  },
);

export interface IconButtonProps extends Omit<ButtonProps, "aria-label"> {
  label: string;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, className = "", ...props }, ref) {
    return (
      <Button
        {...props}
        ref={ref}
        aria-label={label}
        title={label}
        className={`su-icon-button ${className}`}
      />
    );
  },
);

export function ActionLink({
  variant = "secondary",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Exclude<ButtonVariant, "danger">;
}) {
  return (
    <a {...props} className={`su-button su-button--${variant} ${className}`} />
  );
}
