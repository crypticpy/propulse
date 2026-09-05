import {
  useId,
  type HTMLAttributes,
  type ReactNode,
  type DetailsHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

export function Stack({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`su-stack ${className}`} />;
}
export function Inline({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`su-inline ${className}`} />;
}
export function Grid({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`su-grid ${className}`} />;
}
export function Surface({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`su-surface ${className}`} />;
}
export function Divider() {
  return <hr className="su-divider" />;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="su-page-header">
      <div>
        {eyebrow && <p className="su-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && (
          <div className="su-page-description">{description}</div>
        )}
      </div>
      {actions && <div className="su-inline">{actions}</div>}
    </header>
  );
}
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      {...props}
      aria-labelledby={id}
      className={`su-section ${className}`}
    >
      <header className="su-section-heading">
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p className="su-hint">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
export function ActionBar({
  children,
  leading,
}: {
  children: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="su-action-bar">
      {leading && <div>{leading}</div>}
      <div className="su-inline">{children}</div>
    </div>
  );
}
export function Disclosure({
  title,
  summary,
  className = "",
  children,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: string;
  summary?: string;
}) {
  return (
    <details {...props} className={`su-disclosure ${className}`}>
      <summary>
        <span>{title}</span>
        {summary && <span className="su-hint">{summary}</span>}
        <ChevronDown aria-hidden="true" size={18} />
      </summary>
      <div className="su-disclosure-content">{children}</div>
    </details>
  );
}
