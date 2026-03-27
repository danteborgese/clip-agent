"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createClipJobAction, type ClipJobFormState } from "@/app/actions/clip-jobs";
import { FloatingInput, FloatingTextarea } from "./FloatingField";
import { FileUpload } from "./ui/file-upload";

const initialFormState: ClipJobFormState = { status: "idle" };

type InputMode = "url" | "upload";

interface SubmitFormProps {
  onJobCreated: (jobId: string) => void;
  defaultUrl?: string;
  defaultInstruction?: string;
}

export function SubmitForm({ onJobCreated, defaultUrl, defaultInstruction }: SubmitFormProps) {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (prev: ClipJobFormState, formData: FormData) => {
      console.log("[SubmitForm] formAction called", { inputMode, hasFile: !!uploadedFile, prev });
      if (inputMode === "upload" && uploadedFile) {
        formData.set("video_file", uploadedFile);
      }
      formData.set("input_mode", inputMode);
      console.log("[SubmitForm] calling createClipJobAction...");
      const result = await createClipJobAction(prev, formData);
      console.log("[SubmitForm] createClipJobAction result:", result);
      if (result.status === "success") {
        console.log("[SubmitForm] job created, notifying parent:", result.jobId);
        onJobCreated(result.jobId);
      }
      return result;
    },
    initialFormState
  );

  const formKey = state.status === "success" ? state.jobId : "form";
  const errorMessage = state.status === "error" ? state.message : "";

  const handleFileUpload = (files: File[]) => {
    console.log("[SubmitForm] files uploaded:", files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    if (files.length > 0) {
      setUploadedFile(files[0]);
    }
  };

  return (
    <form key={formKey} action={formAction} className="w-full" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Mode toggle */}
      <div className="animate-entrance delay-0 flex gap-2">
        <button
          type="button"
          onClick={() => setInputMode("upload")}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            fontWeight: 500,
            padding: "6px 14px",
            background: inputMode === "upload" ? "#10B981" : "transparent",
            color: inputMode === "upload" ? "#0A0A0A" : "#6B7280",
            border: inputMode === "upload" ? "none" : "1px solid #2A2A2A",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          upload_video
        </button>
        <button
          type="button"
          onClick={() => setInputMode("url")}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            fontWeight: 500,
            padding: "6px 14px",
            background: inputMode === "url" ? "#10B981" : "transparent",
            color: inputMode === "url" ? "#0A0A0A" : "#6B7280",
            border: inputMode === "url" ? "none" : "1px solid #2A2A2A",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          youtube_url
        </button>
      </div>

      {/* Input area */}
      <div className="animate-entrance delay-1">
        {inputMode === "url" ? (
          <FloatingInput
            label="youtube_url"
            name="url"
            type="url"
            required
            defaultValue={defaultUrl}
          />
        ) : (
          <FileUpload onChange={handleFileUpload} />
        )}
      </div>

      <div className="animate-entrance delay-2">
        <FloatingTextarea
          label="clip_instruction"
          name="instruction"
          rows={3}
          required
          defaultValue={defaultInstruction}
        />
      </div>

      <div className="animate-entrance delay-3" style={{ marginTop: "12px" }}>
        <button
          type="submit"
          disabled={isPending || (inputMode === "upload" && !uploadedFile)}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 500,
            background: "#10B981",
            color: "#0A0A0A",
            height: "48px",
            border: "none",
          }}
        >
          {isPending ? (
            <>
              <svg className="spinner w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" strokeLinecap="round" />
              </svg>
              processing...
            </>
          ) : (
            "$ create_clip"
          )}
        </button>
      </div>

      {errorMessage && (
        <div
          className="flex items-start gap-3 animate-entrance delay-0"
          style={{
            background: "#1A0A0A",
            border: "1px solid #3D1515",
            padding: "16px 20px",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "13px",
              fontWeight: 700,
              color: "#EF4444",
              flexShrink: 0,
            }}
          >
            [!]
          </span>
          <div>
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "13px",
                fontWeight: 500,
                color: "#EF4444",
              }}
            >
              pipeline_error
            </p>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "12px",
                color: "#9B4444",
                marginTop: "4px",
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
