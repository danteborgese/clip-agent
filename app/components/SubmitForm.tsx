"use client";

import { useActionState } from "react";
import { createClipJobAction, type ClipJobFormState } from "@/app/actions/clip-jobs";
import { FloatingInput, FloatingTextarea } from "./FloatingField";

const initialFormState: ClipJobFormState = { status: "idle" };

interface SubmitFormProps {
  onJobCreated: (jobId: string) => void;
}

export function SubmitForm({ onJobCreated }: SubmitFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: ClipJobFormState, formData: FormData) => {
      const result = await createClipJobAction(prev, formData);
      if (result.status === "success") {
        onJobCreated(result.jobId);
      }
      return result;
    },
    initialFormState
  );

  const formKey = state.status === "success" ? state.jobId : "form";
  const errorMessage = state.status === "error" ? state.message : "";

  return (
    <form key={formKey} action={formAction} className="w-full space-y-5">
      <div className="animate-entrance delay-1">
        <FloatingInput
          label="YouTube URL"
          name="url"
          type="url"
          required
        />
      </div>

      <div className="animate-entrance delay-2">
        <FloatingTextarea
          label="Clip instruction"
          name="instruction"
          rows={3}
          required
        />
      </div>

      <div className="animate-entrance delay-3 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full h-12 rounded text-sm font-medium text-white bg-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {isPending ? (
            <>
              <svg className="spinner w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" strokeLinecap="round" />
              </svg>
              Processing...
            </>
          ) : (
            "Create Clip →"
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded px-4 py-3 text-sm bg-[#FEE] border border-[#ECC] text-[#900] animate-entrance delay-0">
          <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}
    </form>
  );
}
