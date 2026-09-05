import {
  forwardRef,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "./Actions";

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  id?: string;
}
type FieldControl = {
  id: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

/** Render-prop composition also supports a consumer's own native control. */
export function Field({
  label,
  hint,
  error,
  required,
  id,
  describedBy,
  children,
}: FieldProps & {
  describedBy?: string;
  children: (control: FieldControl) => ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const description =
    [
      describedBy,
      hint ? `${inputId}-hint` : null,
      error ? `${inputId}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="su-field">
      <label htmlFor={inputId}>
        {label}
        {required && (
          <>
            {" "}
            <span className="su-field-required">(required)</span>
          </>
        )}
      </label>
      {children({
        id: inputId,
        required,
        "aria-describedby": description,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <div id={`${inputId}-hint`} className="su-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${inputId}-error`} className="su-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { suffix?: string };
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      required,
      id,
      suffix,
      className = "",
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) {
    return (
      <Field {...{ label, hint, error, required, id, describedBy }}>
        {(control) => (
          <div className="su-input-wrap">
            <input
              {...props}
              {...control}
              ref={ref}
              className={`su-input ${className}`}
            />
            {suffix && <span className="su-input-suffix">{suffix}</span>}
          </div>
        )}
      </Field>
    );
  },
);
export type SelectFieldProps = FieldProps &
  SelectHTMLAttributes<HTMLSelectElement>;
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      label,
      hint,
      error,
      required,
      id,
      className = "",
      "aria-describedby": describedBy,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <Field {...{ label, hint, error, required, id, describedBy }}>
        {(control) => (
          <select
            {...props}
            {...control}
            ref={ref}
            className={`su-select ${className}`}
          >
            {children}
          </select>
        )}
      </Field>
    );
  },
);
export type TextAreaFieldProps = FieldProps &
  TextareaHTMLAttributes<HTMLTextAreaElement>;
export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextAreaFieldProps
>(function TextAreaField(
  {
    label,
    hint,
    error,
    required,
    id,
    className = "",
    "aria-describedby": describedBy,
    ...props
  },
  ref,
) {
  return (
    <Field {...{ label, hint, error, required, id, describedBy }}>
      {(control) => (
        <textarea
          {...props}
          {...control}
          ref={ref}
          className={`su-textarea ${className}`}
        />
      )}
    </Field>
  );
});

export function Checkbox({
  label,
  hint,
  id,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={`su-check ${className}`}>
      <label htmlFor={inputId}>
        <input
          {...props}
          id={inputId}
          type="checkbox"
          aria-describedby={
            [props["aria-describedby"], hint ? `${inputId}-hint` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={`${inputId}-hint`} className="su-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
export function Switch(props: Omit<Parameters<typeof Checkbox>[0], "role">) {
  return (
    <Checkbox
      {...props}
      role="switch"
      className={`su-switch ${props.className ?? ""}`}
    />
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly ChoiceOption<T>[];
  name?: string;
}) {
  const generatedName = useId();
  return (
    <fieldset className="su-choice">
      <legend>{label}</legend>
      <div className="su-choice-options">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name ?? generatedName}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Controlled file choice: storage/upload belongs to the consuming feature. */
export function ImagePicker({
  label = "Equipment photo",
  previewUrl,
  fileName,
  onChange,
  maxBytes = 5 * 1024 * 1024,
  placeholder,
}: {
  label?: string;
  previewUrl?: string;
  fileName?: string;
  onChange: (file: File | null) => void;
  maxBytes?: number;
  placeholder?: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="su-image-picker">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={`${label} preview`}
          onError={() => {
            setError("This image could not be read. Choose another photo.");
            onChange(null);
            if (input.current) input.current.value = "";
          }}
        />
      ) : (
        <div className="su-image-placeholder" aria-hidden="true">
          {placeholder ?? <ImagePlus size={48} />}
        </div>
      )}
      <label htmlFor={id} className="su-upload-label">
        {fileName ? "Replace photo" : "Add a photo"}
        <span className="su-hint">
          {fileName ??
            `Optional · JPG, PNG or WebP · up to ${Math.round(maxBytes / 1024 / 1024)} MB`}
        </span>
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error || undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > maxBytes
          ) {
            setError(
              `Choose a JPG, PNG or WebP image up to ${Math.round(maxBytes / 1024 / 1024)} MB.`,
            );
            event.target.value = "";
            return;
          }
          setError("");
          onChange(file);
        }}
      />
      {error && (
        <p id={`${id}-error`} className="su-field-error" role="alert">
          {error}
        </p>
      )}
      {fileName && (
        <Button
          variant="quiet"
          onClick={() => {
            onChange(null);
            setError("");
            if (input.current) input.current.value = "";
          }}
        >
          <X size={16} aria-hidden="true" /> Remove photo
        </Button>
      )}
    </div>
  );
}
