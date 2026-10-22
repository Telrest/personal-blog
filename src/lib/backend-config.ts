export type BackendConfig = { url: string; key: string };
// Shared by the build and browser so privileged keys cannot enter a public bundle.
// 构建与浏览器共用检查，阻止高权限密钥进入公开网页。
export function parseBackendConfig(urlValue?: string, keyValue?: string): BackendConfig | null {
  const url = urlValue?.trim() || ''; const key = keyValue?.trim() || '';
  if (!url && !key) return null;
  if (!url || !key) throw new Error('请同时设置 PUBLIC_SUPABASE_URL 和 PUBLIC_SUPABASE_PUBLISHABLE_KEY。');
  if (!key.startsWith('sb_publishable_')) throw new Error('浏览器只接受 Supabase publishable key；不能使用 secret 或 service_role key。');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Supabase 项目网址格式有误。'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('请使用 HTTPS 的 Supabase 项目根网址。');
  return {url:parsed.origin, key};
}
