"use client";

import { useState } from "react";

type PasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  name?: string;
  placeholder?: string;
};

export function PasswordInput({
  value,
  onChange,
  required = false,
  minLength,
  autoComplete,
  name,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ display: "flex", alignItems: "stretch", gap: 8, width: "100%" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        name={name}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0 }}
      />
      <button
        type="button"
        className="button ghost"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
        aria-pressed={visible}
        style={{ whiteSpace: "nowrap", padding: "10px 12px", minHeight: 44 }}
      >
        {visible ? "Ocultar" : "Ver"}
      </button>
    </span>
  );
}
