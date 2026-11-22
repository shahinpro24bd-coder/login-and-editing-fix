/* Website CMS adapter: talks directly to the website database from the browser,
   so it works the same on any static host with no host keys.
   Login, session checks and saves are verified inside the database. */
(function () {
  var API = "https://c--36594716-123b-4170-b32a-f30e91ed8480-prod.lovable.cloud/rest/v1";
  var KEY = "sb_publishable_y-TaSf9aucP7UA-Jil-XHw_sgwyyMTG";
  var TOKEN_KEY = "cms-admin-token";
  var MAX_IMAGE = 4 * 1024 * 1024;
  var originalFetch = window.fetch.bind(window);

  function headers() {
    return { apikey: KEY, "Content-Type": "application/json", Accept: "application/json" };
  }
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function rpc(name, args) {
    return originalFetch(API + "/rpc/" + name, {
      method: "POST", headers: headers(), body: JSON.stringify(args), cache: "no-store",
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, d: d }; });
    });
  }
  function isEditor() { return /2\.html$/.test(location.pathname); }
  function bodyOf(options) {
    try { return JSON.parse((options && options.body) || "{}"); } catch (e) { return {}; }
  }

  async function checkSession() {
    var t = getToken();
    if (!t || !isEditor()) return false;
    var res = await rpc("cms_check", { p_token: t });
    if (res.ok && res.d === true) return true;
    // Only forget the login when the database really says it expired,
    // never because the database was briefly unreachable.
    if (res.ok) setToken(null);
    else throw new Error("unavailable");
    return false;
  }

  window.fetch = async function (input, options) {
    var url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin || url.pathname.indexOf("/api/public/cms/") !== 0) {
      return originalFetch(input, options);
    }
    var method = ((options && options.method) || "GET").toUpperCase();
    var path = url.pathname.replace("/api/public/cms/", "");

    try {
      if (path === "content") {
        var page = url.searchParams.get("page") || "index";
        var r = await originalFetch(
          API + "/cms_content?select=item&page=eq." + encodeURIComponent(page),
          { headers: headers(), cache: "no-store" }
        );
        if (!r.ok) return json({ error: "unavailable" }, 503);
        var rows = await r.json();
        return json({ items: rows.map(function (row) { return row.item; }) });
      }

      if (path === "login" && method === "GET") {
        return json({ authenticated: await checkSession() });
      }

      if (path === "login" && method === "POST") {
        if (!isEditor()) return json({ error: "এডিটর পৃষ্ঠা থেকে লগইন করুন" }, 403);
        var creds = bodyOf(options);
        var res = await rpc("cms_login", {
          p_username: String(creds.username || ""),
          p_password: String(creds.password || ""),
        });
        if (!res.ok) {
          var msg = String((res.d && (res.d.message || res.d.error)) || "");
          if (/too many attempts/i.test(msg)) {
            return json({ error: "অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন" }, 429);
          }
          return json({ error: "সার্ভারের সাথে সংযোগ হচ্ছে না, কিছুক্ষণ পরে আবার চেষ্টা করুন" }, 503);
        }
        if (!res.d) return json({ error: "ইউজারনেম বা পাসওয়ার্ড ভুল" }, 401);
        setToken(res.d);
        return json({ ok: true });
      }

      if (path === "logout") {
        var t = getToken();
        if (t) await rpc("cms_logout", { p_token: t });
        setToken(null);
        return json({ ok: true });
      }

      if (path === "save" && method === "POST") {
        var token = getToken();
        if (!token || !isEditor()) return json({ error: "লগইন করুন" }, 401);
        var payload = bodyOf(options);
        var saved = await rpc("cms_save", {
          p_token: token, p_page: payload.page, p_items: payload.items || [],
        });
        if (!saved.ok) {
          var why = String((saved.d && (saved.d.message || saved.d.error)) || "");
          if (/not authenticated/i.test(why)) {
            setToken(null);
            return json({ error: "লগইনের মেয়াদ শেষ, আবার লগইন করুন" }, 401);
          }
          if (/invalid input/i.test(why)) return json({ error: "ভুল তথ্য, সেভ হয়নি" }, 400);
          return json({ error: "সার্ভারের সাথে সংযোগ হচ্ছে না, কিছুক্ষণ পরে আবার সেভ করুন" }, 503);
        }
        return json({ ok: true, saved: saved.d });
      }

      if (path === "password" && method === "POST") {
        var pt = getToken();
        if (!pt || !isEditor()) return json({ error: "লগইন করুন" }, 401);
        var pw = bodyOf(options);
        var changed = await rpc("cms_change_password", {
          p_token: pt, p_old: String(pw.old || ""), p_new: String(pw.next || ""),
        });
        if (!changed.ok) {
          var pwWhy = String((changed.d && (changed.d.message || changed.d.error)) || "");
          if (/not authenticated/i.test(pwWhy)) {
            setToken(null);
            return json({ error: "লগইনের মেয়াদ শেষ, আবার লগইন করুন" }, 401);
          }
          if (/weak password/i.test(pwWhy)) return json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন" }, 400);
          return json({ error: "সার্ভারের সাথে সংযোগ হচ্ছে না, কিছুক্ষণ পরে আবার চেষ্টা করুন" }, 503);
        }
        if (changed.d !== true) return json({ error: "বর্তমান পাসওয়ার্ড ভুল" }, 401);
        return json({ ok: true });
      }

      if (path === "upload" && method === "POST") {
        if (!(await checkSession())) return json({ error: "লগইন করুন" }, 401);
        var up = bodyOf(options);
        var data = String(up.data || "");
        if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(data)) return json({ error: "ছবি নয়" }, 400);
        if (data.length > MAX_IMAGE) return json({ error: "ছবি অনেক বড়" }, 413);
        return json({ url: data });
      }
    } catch (e) {
      return json({ error: "সার্ভারের সাথে সংযোগ হচ্ছে না, কিছুক্ষণ পরে আবার চেষ্টা করুন" }, 503);
    }
    return json({ error: "Unknown request" }, 400);
  };
})();
