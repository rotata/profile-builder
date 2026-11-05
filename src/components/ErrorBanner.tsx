import type { ApiError } from "@/shared/contract";

const TITLES: Record<ApiError["code"], string> = {
  llm_not_configured: "The assistant isn't set up yet",
  llm_auth_failed: "The API key was rejected",
  llm_unavailable: "The assistant is temporarily unavailable",
  invalid_request: "That message couldn't be sent",
  not_found: "Not found",
  internal: "Something went wrong",
};

type ErrorBannerProps = { error: ApiError; onRetry?: () => void };

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  const retryable = error.code === "llm_unavailable" || error.code === "internal";
  return (
    <div role="alert" data-testid="error-banner" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-900">{TITLES[error.code]}</p>
      <p className="text-red-800">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium text-red-900 underline">
          {retryable ? "Try again" : "Dismiss"}
        </button>
      )}
    </div>
  );
}
