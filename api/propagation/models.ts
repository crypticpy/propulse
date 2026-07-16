import { handlePropagationProxy } from "../_lib/propagationProxy";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handlePropagationProxy(request, "models");
}
