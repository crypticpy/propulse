import { handlePropagationProxy } from "../_lib/propagationProxy";

export default function handler(request: Request): Promise<Response> {
  return handlePropagationProxy(request, "path");
}
