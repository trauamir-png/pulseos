/*!
 * PulseOS tracker — small, async, no dependencies.
 * <script src="https://YOUR_PULSEOS_DOMAIN/tracker.js" data-site="SITE_KEY" defer></script>
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("tracker.js") !== -1) return scripts[i];
    }
    return null;
  })();

  if (!currentScript) return;

  var SITE_KEY = currentScript.getAttribute("data-site");
  if (!SITE_KEY) return;

  var ENDPOINT = (function () {
    try {
      return new URL(currentScript.src).origin + "/api/collect";
    } catch (e) {
      return "/api/collect";
    }
  })();

  var HEARTBEAT_INTERVAL_MS = 30000;
  var DEDUPE_WINDOW_MS = 500;
  var SESSION_STORAGE_KEY = "pulseos_sid";

  var lastPath = null;
  var lastSentAt = 0;

  function getSessionId() {
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setSessionId(id) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    } catch (e) {
      /* storage unavailable (private mode) — session just won't persist across reloads */
    }
  }

  function send(payload) {
    payload.site = SITE_KEY;
    var sid = getSessionId();
    if (sid) payload.sessionId = sid;

    var body = JSON.stringify(payload);

    function handleResponse(sessionId) {
      if (sessionId) setSessionId(sessionId);
    }

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "text/plain" });
        navigator.sendBeacon(ENDPOINT, blob);
        // sendBeacon has no readable response; the session id we already hold stays
        // valid for the session lifetime, so this is fine for heartbeats/events.
        // The first pageview uses fetch (below path) so we can capture a fresh id.
        return;
      } catch (e) {
        /* fall through to fetch */
      }
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: body,
      keepalive: true,
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (json && json.sessionId) handleResponse(json.sessionId);
      })
      .catch(function () {});
  }

  function sendWithSessionCapture(payload) {
    payload.site = SITE_KEY;
    var sid = getSessionId();
    if (sid) payload.sessionId = sid;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (json && json.sessionId) setSessionId(json.sessionId);
      })
      .catch(function () {});
  }

  function trackPageview() {
    var path = location.pathname + location.search;
    var now = Date.now();
    if (path === lastPath && now - lastSentAt < DEDUPE_WINDOW_MS) return;
    lastPath = path;
    lastSentAt = now;

    sendWithSessionCapture({
      type: "pageview",
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      referrer: document.referrer,
      search: location.search,
    });
  }

  function trackEvent(eventName, properties) {
    if (!eventName) return;
    send({
      type: "event",
      eventName: String(eventName).slice(0, 100),
      properties: properties || {},
      pathname: location.pathname,
    });
  }

  function sendHeartbeat() {
    if (document.visibilityState !== "visible") return;
    send({ type: "heartbeat", pathname: location.pathname });
  }

  // --- SPA navigation support (History API) ---
  function patchHistory(method) {
    var original = history[method];
    return function () {
      var result = original.apply(this, arguments);
      setTimeout(trackPageview, 0);
      return result;
    };
  }

  try {
    history.pushState = patchHistory("pushState");
    history.replaceState = patchHistory("replaceState");
    window.addEventListener("popstate", function () {
      setTimeout(trackPageview, 0);
    });
  } catch (e) {
    /* history API unavailable — single-page navigation tracking only */
  }

  // --- Automatic link click tracking ---
  document.addEventListener(
    "click",
    function (event) {
      var el = event.target;
      while (el && el !== document.body && el.tagName !== "A") el = el.parentElement;
      if (!el || el.tagName !== "A") return;

      var href = el.getAttribute("href") || "";

      if (href.indexOf("tel:") === 0) {
        trackEvent("phone_click", { href: href });
      } else if (href.indexOf("mailto:") === 0) {
        trackEvent("email_click", { href: href });
      } else if (/(^https?:\/\/)?(www\.)?(wa\.me|api\.whatsapp\.com)\//i.test(href)) {
        trackEvent("whatsapp_click", { href: href });
      } else if (/^https?:\/\//i.test(href) && href.indexOf(location.hostname) === -1) {
        trackEvent("external_link_click", { href: href });
      }
    },
    true
  );

  // --- Public API ---
  window.pulse = {
    track: trackEvent,
  };

  trackPageview();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") sendHeartbeat();
  });
})();
