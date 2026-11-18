// Only published material belongs here. 私密草稿应保存在独立的受保护存储中。
export type PublishedPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  category: string;
  tags: string[];
  cover?: string;
};

// Published files alone feed the public listing. 公开列表只读取明确发布的文件。
import { getPublishedPosts } from "./posts";
export const posts: PublishedPost[] = (await getPublishedPosts()).map((p) => ({
  slug: p.slug,
  title: p.title,
  description: p.summary,
  publishedAt: p.published_at,
  updatedAt: p.updated_at,
  category: p.category,
  tags: p.tags,
}));
export const categories = [
  ...new Set([
    "全部",
    "见解与思考",
    "学习笔记",
    "生活随记",
    ...posts.map((p) => p.category),
  ]),
];
