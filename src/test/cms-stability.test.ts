import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loader = readFileSync('public/website/cms/cms-content.js', 'utf8');
const adapter = readFileSync('public/website/preview-session.js', 'utf8');
const execute = (source: string) => new Function('window', 'document', 'fetch', 'localStorage', 'CustomEvent', 'requestAnimationFrame', 'location', source)(window, document, window.fetch, localStorage, CustomEvent, (fn: () => void) => fn(), location);
type CmsWindow = Window & {
  CMS_PAGE: string;
  CMS_LOAD_OK?: boolean;
  CMS_LOADED?: boolean;
  CMS_SETTINGS?: unknown;
  CMS_THEME: { apply: ReturnType<typeof vi.fn> };
  __CMS_BOOT: { page: string; content: Promise<unknown>; settings: Promise<unknown> };
  __CMS_GATE: { release: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> };
};
const cms = window as unknown as CmsWindow;
async function load(content: unknown, settings: unknown) {
  cms.__CMS_BOOT = { page: 'index', content: Promise.resolve(content), settings: Promise.resolve(settings) };
  execute(loader);
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Saved website stability', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<p data-cms-id="heading">Built-in old text</p>';
    cms.CMS_PAGE = 'index';
    delete cms.CMS_LOAD_OK;
    delete cms.CMS_LOADED;
    delete cms.CMS_SETTINGS;
    cms.CMS_THEME = { apply: vi.fn() };
    cms.__CMS_GATE = { release: vi.fn(), fail: vi.fn() };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('never displays browser-cached text instead of verified saved text', async () => {
    localStorage.setItem('cms-cache:index', JSON.stringify([{ cms_id: 'heading', kind: 'text', value: 'Old cached text' }]));
    await load([{ cms_id: 'heading', kind: 'text', value: 'Current admin text' }], []);
    expect(document.querySelector('p')?.textContent).toBe('Current admin text');
    expect(cms.CMS_LOAD_OK).toBe(true);
    expect(cms.__CMS_GATE.release).toHaveBeenCalledOnce();
  });

  it('does not reveal fallback information or allow editing when content fails', async () => {
    await load(null, []);
    expect(cms.CMS_LOAD_OK).toBe(false);
    expect(cms.__CMS_GATE.release).not.toHaveBeenCalled();
    expect(cms.__CMS_GATE.fail).toHaveBeenCalledOnce();
  });

  it('does not reveal default colours or allow saving when settings fail', async () => {
    await load([{ cms_id: 'heading', kind: 'text', value: 'Current admin text' }], null);
    expect(cms.CMS_LOAD_OK).toBe(false);
    expect(cms.CMS_THEME.apply).not.toHaveBeenCalled();
    expect(cms.__CMS_GATE.release).not.toHaveBeenCalled();
  });

  it('accepts successfully loaded empty pages without treating them as outages', async () => {
    await load([], []);
    expect(cms.CMS_LOAD_OK).toBe(true);
    expect(cms.__CMS_GATE.release).toHaveBeenCalledOnce();
  });

  it('blocks save requests before any database write if saved reads failed', async () => {
    window.history.replaceState({}, '', '/website/index2.html');
    localStorage.setItem('cms-admin-token', 'test-only-token');
    cms.CMS_LOAD_OK = false;
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    execute(adapter);
    const response = await window.fetch('/api/public/cms/save', { method: 'POST', body: JSON.stringify({ page: 'index', items: [] }) });
    expect(response.status).toBe(409);
    expect(network).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });
});