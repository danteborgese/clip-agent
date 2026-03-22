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
      className="mui-field relative w-full cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Border container */}
      <fieldset
        className="absolute inset-0 rounded pointer-events-none transition-colors duration-200 px-2"
        style={{
          border: focused ? "2px solid #000" : "1px solid #C4C4C4",
          margin: focused ? "0" : "0",
        }}
      >
        <legend
          className="invisible h-0 text-xs px-0.5 transition-all duration-200"
          style={{
            maxWidth: active ? "100%" : "0.01px",
            fontFamily: "var(--font-sans)",
          }}
        >
          {label}
        </legend>
      </fieldset>

      {/* Floating label */}
      <label
        htmlFor={id}
        className="absolute left-3.5 transition-all duration-200 pointer-events-none origin-top-left"
        style={{
          fontFamily: "var(--font-sans)",
          top: active ? "0" : "50%",
          transform: active
            ? "translateY(-50%) scale(0.75)"
            : "translateY(-50%) scale(1)",
          color: focused ? "#000" : "#888",
          background: active ? "#FFFFFF" : "transparent",
          padding: active ? "0 5px" : "0",
        }}
      >
        {label}
      </label>

      {/* Input */}
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
        className="relative w-full bg-transparent outline-none text-sm text-black px-3.5 h-14"
        style={{ fontFamily: "var(--font-sans)" }}
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
      className="mui-field relative w-full cursor-text"
      onClick={() => textareaRef.current?.focus()}
    >
      {/* Border container */}
      <fieldset
        className="absolute inset-0 rounded pointer-events-none transition-colors duration-200 px-2"
        style={{
          border: focused ? "2px solid #000" : "1px solid #C4C4C4",
        }}
      >
        <legend
          className="invisible h-0 text-xs px-0.5 transition-all duration-200"
          style={{
            maxWidth: active ? "100%" : "0.01px",
            fontFamily: "var(--font-sans)",
          }}
        >
          {label}
        </legend>
      </fieldset>

      {/* Floating label */}
      <label
        htmlFor={id}
        className="absolute left-3.5 transition-all duration-200 pointer-events-none origin-top-left"
        style={{
          fontFamily: "var(--font-sans)",
          top: active ? "0" : "24px",
          transform: active
            ? "translateY(-50%) scale(0.75)"
            : "translateY(-50%) scale(1)",
          color: focused ? "#000" : "#888",
          background: active ? "#FFFFFF" : "transparent",
          padding: active ? "0 5px" : "0",
        }}
      >
        {label}
      </label>

      {/* Textarea */}
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
        className="relative w-full bg-transparent outline-none text-sm text-black px-3.5 pt-4 pb-3 resize-none"
        style={{ fontFamily: "var(--font-sans)" }}
      />
    </div>
  );
}
