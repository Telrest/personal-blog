import { authenticatePublisher } from "./data/supabase.ts";
import { PublishingService } from "./logic/service.ts";
import { PublishError } from "../_shared/publication.ts";
const allowed = new Set([
  "https://telrest.github.io",
  "http://127.0.0.1:4321",
  "http://127.0.0.1:4322",
]);
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": allowed.has(origin)
      ? origin
      : "https://telrest.github.io",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.has(origin))
    return reply({ error: "此来源不能使用发布服务。" }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return reply({ error: "仅接受 POST 请求。" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply({ error: "请先登录。" }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      key = Deno.env.get("SUPABASE_ANON_KEY")!;
    const cloud = await authenticatePublisher(url, key, authorization);
    const text = await request.text();
    if (text.length > 16000) throw new PublishError("请求过大。", 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new PublishError("请求格式有误。");
    }
    const token = Deno.env.get("BLOG_GITHUB_TOKEN");
    if (input.action === "capabilities")
      return reply({
        configured: Boolean(token),
        message: token
          ? "发布服务已连接。"
          : "发布服务还需要配置 GitHub 仓库写入凭据。",
      });
    if (!token)
      throw new PublishError("发布服务尚未配置 GitHub 仓库写入凭据。", 503);
    const service = new PublishingService(token, cloud);
    if (input.action === "preview")
      return reply(await service.preview(input.id, input.version));
    if (input.action === "publish")
      return reply(
        await service.publish(input.id, input.version, input.expectedRevision),
      );
    if (input.action === "status")
      return reply(
        await service.live(String(input.slug), String(input.revision)),
      );
    if (input.action === "cleanup") return reply(await service.cleanup(input));
    throw new PublishError("不支持的操作。");
  } catch (error) {
    return error instanceof PublishError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "发布服务暂时未完成，请保留草稿并稍后重试。" }, 502);
  }
});
