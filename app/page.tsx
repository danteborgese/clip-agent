"use client";

import { useActionState } from "react";

import { createClipJobAction, type ClipJobFormState } from "@/app/actions/clip-jobs";

const initialFormState: ClipJobFormState = { status: "idle" };

export default function Home() {
  const [state, formAction, isPending] = useActionState(createClipJobAction, initialFormState);

  const formKey =
    state.status === "success" ? state.jobId : "form";

  const message =
    state.status === "error"
      ? state.message
      : state.status === "success"
        ? `Job queued: ${state.jobId}`
        : "";

  const status: "idle" | "loading" | "success" | "error" =
    state.status === "error"
      ? "error"
      : state.status === "success"
        ? "success"
        : isPending
          ? "loading"
          : "idle";

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Clip Agent</h1>
      <form key={formKey} action={formAction} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            Source URL (YouTube)
          </label>
          <input
            id="url"
            name="url"
            type="url"
            defaultValue=""
            placeholder="https://www.youtube.com/watch?v=..."
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="instruction" className="block text-sm font-medium text-gray-700 mb-1">
            What to clip (instruction)
          </label>
          <textarea
            id="instruction"
            name="instruction"
            defaultValue=""
            placeholder="e.g. Clip the part where he talks about the limiting factor."
            required
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
      </form>
      {message && (
        <p
          className={`mt-4 text-sm ${
            status === "error" ? "text-red-600" : "text-gray-600"
          }`}
        >
          {message}
        </p>
      )}
    </main>
  );
}
