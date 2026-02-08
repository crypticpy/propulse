const SOURCE_FROM_PAGE = "propulse-daemon-client";
const SOURCE_TO_PAGE = "propulse-daemon-bridge";

let currentSessionId = null;

const port = chrome.runtime.connect({ name: "propulse-daemon-bridge" });

function postToPage(message, transfer) {
  try {
    if (transfer && transfer.length > 0) window.postMessage(message, "*", transfer);
    else window.postMessage(message, "*");
  } catch {
    // ignore
  }
}

postToPage({ source: SOURCE_TO_PAGE, type: "ready" });

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.source !== SOURCE_FROM_PAGE) return;

  const { type, sessionId, url, text } = data;
  if (type === "connect") {
    currentSessionId = sessionId ?? null;
    port.postMessage({ type: "connect", sessionId: currentSessionId, url });
    return;
  }
  if (type === "disconnect") {
    port.postMessage({ type: "disconnect", sessionId: currentSessionId });
    return;
  }
  if (type === "send") {
    if (!currentSessionId || sessionId !== currentSessionId) return;
    port.postMessage({ type: "send", sessionId: currentSessionId, text });
  }
});

port.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;
  if (currentSessionId && msg.sessionId && msg.sessionId !== currentSessionId) return;

  if (msg.type === "binary" && msg.data instanceof ArrayBuffer) {
    postToPage(
      { source: SOURCE_TO_PAGE, type: "binary", sessionId: msg.sessionId, data: msg.data },
      [msg.data],
    );
    return;
  }

  postToPage({ source: SOURCE_TO_PAGE, ...msg });
});

