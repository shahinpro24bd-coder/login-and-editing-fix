<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Render the uploaded legacy website inside an isolated iframe at the index route to preserve its original CSS, scripts, and appearance without replacing TanStack Start.
- The legacy CMS adapter (public/website/preview-session.js) maps /api/public/cms/* calls to Lovable Cloud REST/RPC with the publishable key, so static hosts like Vercel need no server code or env keys.
- Verify editor credentials and session tokens only inside SECURITY DEFINER database functions; credential and session tables stay without client grants, and only cms_content is publicly readable.
- Open the public home by default and keep public navigation separate from the authenticated *2.html editor copies.
- Host original uploaded media using asset-pointer URLs and keep editable legacy HTML/CSS/JS in public/website for the preview.
- Preserve asset-pointer URLs on Vercel with an external rewrite to this project's preview origin; Vercel does not serve the platform asset path itself.
- Derive the root favicon from the original website brand mark and remove the template favicon so browser tabs and direct favicon requests never use template branding.
- The CMS schema (cms_* tables and SECURITY DEFINER functions) lives in this project's Lovable Cloud; preview-session.js must point at this project's backend URL and publishable key, never another project's.
