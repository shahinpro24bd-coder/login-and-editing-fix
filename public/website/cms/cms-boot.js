/* CMS boot — runs in <head>, before anything is painted.

   Never reveal built-in or browser-cached content as the saved website:
   1. The database requests start immediately (instead of at the end of <body>).
   2. On every device the page is held back from painting until
      the saved content + font + colour have been applied, so a visitor never
      sees the stale built-in text/colour first.
   Network errors/timeouts show a retry notice, not obsolete information. */
(function () {
  var page = window.CMS_PAGE || "index";
  var TIMEOUT_MS = 12000;

  /* A picture replaced from the editor is shown whole (never cropped):
     its frame takes the new picture's own shape instead of the fixed one. */
  var fit = document.createElement("style");
  fit.id = "cms-full-image-style";
  fit.textContent =
    "img[data-cms-replaced]{height:auto !important;min-height:0 !important;max-height:none !important;" +
    "aspect-ratio:auto !important;object-fit:contain !important;object-position:center !important}" +
    ".hero32:has(> img[data-cms-replaced]),.service-detail-portrait:has(> img[data-cms-replaced])" +
    "{aspect-ratio:auto !important;height:auto !important}";
  (document.head || document.documentElement).appendChild(fit);

  /* 1) kick off both requests as early as possible */
  function load(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(url + "&t=" + Date.now(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("unavailable");
        return r.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.items)) throw new Error("bad");
        return d.items;
      })
      .catch(function () {
        return null; // null = request failed
      }).finally(function () { clearTimeout(timer); });
  }

  window.__CMS_BOOT = {
    page: page,
    content: load("/api/public/cms/content?page=" + encodeURIComponent(page)),
    settings: load("/api/public/cms/content?page=site-settings"),
  };

  /* 2) only a successful read of BOTH content and settings may reveal it */
  var root = document.documentElement;
  var style = document.createElement("style");
  style.id = "cms-gate-style";
  style.textContent =
    "html.cms-gate body{visibility:hidden !important}" +
    "html.cms-gate{background:var(--bs-body-bg,Canvas)}" +
    "#cms-load-status{visibility:visible !important;position:fixed;inset:0;z-index:2147483647;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;" +
    "padding:24px;text-align:center;background:var(--bs-body-bg,Canvas);color:var(--bs-body-color,CanvasText)}";
  (document.head || root).appendChild(style);
  root.className += (root.className ? " " : "") + "cms-gate";

  var released = false;
  function release() {
    if (released) return;
    released = true;
    clearTimeout(noticeTimer);
    var notice = document.getElementById("cms-load-status");
    if (notice) notice.remove();
    root.className = root.className.replace(/(^|\s)cms-gate(\s|$)/, "$1$2").trim();
  }

  function fail() {
    if (released || document.getElementById("cms-load-status")) return;
    var notice = document.createElement("div");
    notice.id = "cms-load-status";
    notice.setAttribute("role", "alert");
    var text = document.createElement("p");
    text.textContent = "সংরক্ষিত তথ্য লোড করা যায়নি। পুরনো বা ভুল তথ্য দেখানো হচ্ছে না।";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-primary";
    retry.textContent = "আবার চেষ্টা করুন";
    retry.onclick = function () { location.reload(); };
    notice.appendChild(text);
    notice.appendChild(retry);
    (document.body || root).appendChild(notice);
  }
  window.__CMS_GATE = { release: release, fail: fail };
  var noticeTimer = setTimeout(fail, TIMEOUT_MS);
})();
