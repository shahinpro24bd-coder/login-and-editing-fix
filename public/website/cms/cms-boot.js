/* CMS boot — runs in <head>, before anything is painted.

   Fixes the "old content flashes first on a new device" problem:
   1. The database requests start immediately (instead of at the end of <body>).
   2. On a device with no local cache the page is held back from painting until
      the saved content + font + colour have been applied, so a visitor never
      sees the stale built-in text/colour first.
   The hold is released as soon as the data lands, or after a short safety
   timeout / on any network error, so the page can never stay blank. */
(function () {
  var page = window.CMS_PAGE || "index";
  var CACHE_KEY = "cms-cache:" + page;
  var SETTINGS_KEY = "cms-settings";
  var TIMEOUT_MS = 1500;

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

  function get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /* 1) kick off both requests as early as possible */
  function load(url) {
    return fetch(url + "&t=" + Date.now(), {
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
      });
  }

  window.__CMS_BOOT = {
    page: page,
    content: load("/api/public/cms/content?page=" + encodeURIComponent(page)),
    settings: load("/api/public/cms/content?page=site-settings"),
  };

  /* 2) hold the first paint only when this device has nothing cached yet */
  var hasCache = !!get(CACHE_KEY) || !!get(SETTINGS_KEY);
  if (hasCache) {
    window.__CMS_GATE = { release: function () {} };
    return;
  }

  var root = document.documentElement;
  var style = document.createElement("style");
  style.id = "cms-gate-style";
  style.textContent =
    "html.cms-gate body{visibility:hidden !important}" +
    "html.cms-gate{background:#fff}";
  (document.head || root).appendChild(style);
  root.className += (root.className ? " " : "") + "cms-gate";

  var released = false;
  function release() {
    if (released) return;
    released = true;
    root.className = root.className.replace(/(^|\s)cms-gate(\s|$)/, "$1$2").trim();
  }

  window.__CMS_GATE = { release: release };
  setTimeout(release, TIMEOUT_MS);
  window.addEventListener("load", function () {
    setTimeout(release, 300);
  });
})();
