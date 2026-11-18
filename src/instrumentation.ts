import { captureRequestError, registerObservability } from "@/lib/observability/next";

export const register = () => registerObservability({ project: "founderfit", service: "founderfit-web" });
export const onRequestError = captureRequestError;
