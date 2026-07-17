import { handlePropagationProxy } from "../_lib/propagationProxy.js";

export default function handler(request: Request): Promise<Response> {
  return handlePropagationProxy(request, "capabilities");
}
