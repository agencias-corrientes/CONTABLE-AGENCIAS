"use client";

import { useState } from "react";

function formatAgencyCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "-" + digits.slice(3);
  return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
}

export function AgencyCodeInput({ name, defaultValue = "", placeholder = "Código: 251-001-01" }: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(formatAgencyCode(defaultValue));
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      value={value}
      onChange={(event) => setValue(formatAgencyCode(event.target.value))}
      placeholder={placeholder}
      pattern="[0-9]{3}-[0-9]{3}-[0-9]{2}"
      title="El formato se completa automáticamente: 251-001-01"
      aria-label="Código del subagente o ambulante"
      required
    />
  );
}
