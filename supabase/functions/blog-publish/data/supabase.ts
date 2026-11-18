import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { PublishError } from "../../_shared/publication.ts";

export async function authenticatePublisher(
  url: string,
  key: string,
  authorization: string,
) {
  const userClient = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Always verify the JWT against Auth; never trust decoded browser claims.
  // 必须通过 Auth 校验会话，不能信任浏览器传来的作者编号。
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(authorization.slice(7));
  if (authError || !user)
    throw new PublishError("登录已失效，请重新登录。", 401);
  const { data: owner, error: ownerError } =
    await userClient.rpc("is_blog_owner");
  if (ownerError || owner !== true)
    throw new PublishError("仅作者可以发布文章。", 403);
  return {
    snapshot: async (id: string, version: number) => {
      const { data, error } = await userClient.rpc("private_draft_snapshot", {
        p_id: id,
        p_expected_version: version,
      });
      if (error)
        throw new PublishError(
          error.code === "40001"
            ? "草稿已更新，请重新载入。"
            : "无法读取完整备份，请确认已执行第二份建库脚本。",
          error.code === "40001" ? 409 : 400,
        );
      return data;
    },
    remove: async (id: string, version: number) => {
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!secret)
        throw new PublishError("清理服务未配置，云端草稿会继续保留。", 503);
      const admin = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc("delete_private_draft_after_publish", {
        p_owner_id: user.id,
        p_id: id,
        p_expected_version: version,
      });
      if (error)
        throw new PublishError(
          "草稿已更新或权限改变，未清理云端，请重新检查。",
          409,
        );
    },
  };
}
