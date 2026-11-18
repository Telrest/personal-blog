import { backend } from "../../../shared/data/supabase";
import { validateSnapshot } from "../../../shared/contracts/publication";
import { openArticleComments } from "../../comments/data/supabase-comments";
import type { Publisher } from "../logic/publication-workflow";

export async function invokePublisher<T>(body: Record<string, unknown>) {
  const { data, error } = await backend().functions.invoke("blog-publish", {
    body,
  });
  if (error) {
    let explanation = "发布服务未连接，请完成服务端配置；云端草稿不会被删除。";
    if ("context" in error && error.context instanceof Response) {
      try {
        const result = await error.context.json();
        if (typeof result.error === "string") explanation = result.error;
      } catch {}
    }
    throw new Error(explanation);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const publisher: Publisher = {
  capabilities: () => invokePublisher({ action: "capabilities" }),
  preview: ({ id, version }) =>
    invokePublisher({ action: "preview", id, version }),
  publish: ({ id, version }, expectedRevision) =>
    invokePublisher({ action: "publish", id, version, expectedRevision }),
  status: ({ slug, revision_id }) =>
    invokePublisher({ action: "status", slug, revision: revision_id }),
  cleanup: (proof) => invokePublisher({ action: "cleanup", ...proof }),
  async snapshot({ id, version }) {
    const { data, error } = await backend().rpc("private_draft_snapshot", {
      p_id: id,
      p_expected_version: version,
    });
    if (error)
      throw new Error(
        error.code === "40001"
          ? "草稿版本已改变，请重新载入。"
          : "请先执行发布与备份的第二份建库脚本。",
      );
    return validateSnapshot(data);
  },
  prepareComments: ({ id, slug }) => openArticleComments(id, slug),
};
