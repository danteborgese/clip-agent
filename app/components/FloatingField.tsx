"use client";

import { useState, useRef, useId } from "react";

interface FloatingInputProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}

export function FloatingInput({ label, name, type = "text", required, defaultValue = "" }: FloatingInputProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(!!defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = focused || filled;

  return (
    <div
      className="w-full relative cursor-text"
      onClick={() => inputRef.current?.focus()}
      style={{
        border: `1px solid ${focused ? "#10B981" : "#2a2a2a"}`,
        padding: "16px",
        paddingTop: active ? "24px" : "16px",
        paddingBottom: active ? "8px" : "16px",
        background: "transparent",
        transition: "border-color 0.2s ease, padding 0.2s ease",
        height: "56px",
      }}
    >
      <label
        htmlFor={id}
        className="absolute pointer-events-none"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          left: "16px",
          top: active ? "8px" : "50%",
          fontSize: active ? "10px" : "13px",
          transform: active ? "none" : "translateY(-50%)",
          color: focused ? "#10B981" : "#6B7280",
          transition: "all 0.2s ease",
        }}
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          setFilled(!!e.target.value);
        }}
        onChange={(e) => setFilled(!!e.target.value)}
        className="w-full bg-transparent outline-none"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "14px",
          color: "#FAFAFA",
          opacity: active ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      />
    </div>
  );
}

interface FloatingTextareaProps {
  label: string;
  name: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
}

export function FloatingTextarea({ label, name, rows = 3, required, defaultValue = "" }: FloatingTextareaProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(!!defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const active = focused || filled;

  return (
    <div
      className="w-full relative cursor-text"
      onClick={() => textareaRef.current?.focus()}
      style={{
        border: `1px solid ${focused ? "#10B981" : "#2a2a2a"}`,
        padding: "16px",
        paddingTop: active ? "28px" : "16px",
        background: "transparent",
        height: "120px",
        transition: "border-color 0.2s ease, padding 0.2s ease",
      }}
    >
      <label
        htmlFor={id}
        className="absolute pointer-events-none"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          left: "16px",
          top: active ? "10px" : "20px",
          fontSize: active ? "10px" : "13px",
          color: focused ? "#10B981" : "#6B7280",
          transition: "all 0.2s ease",
        }}
      >
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          setFilled(!!e.target.value);
        }}
        onChange={(e) => setFilled(!!e.target.value)}
        className="w-full bg-transparent outline-none resize-none"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "14px",
          color: "#FAFAFA",
          opacity: active ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      />
    </div>
  );
}
