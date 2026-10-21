export const site = {
  name: 'Telrest',
  title: "Telrest's personal blog",
  description: '记录想法，分享见解，也为有趣的小作品留一个位置。这里是 Telrest 的个人空间。',
  github: 'https://github.com/Telrest',
};

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

export const posts: PublishedPost[] = [];
export const categories = ['全部', '见解与思考', '学习笔记', '生活随记'];
