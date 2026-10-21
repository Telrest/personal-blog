export type Lab = {
  id: string;
  number: string;
  icon: string;
  /** 标题里用 \n 表示换行 / \n marks a line break in the title. */
  title: string;
  summary: string;
  href: string;
  meta: string;
};

// 新增实验只要往这里加一条，首页和总览页会同时更新。
// Add one entry here and both the home section and the index page update.
export const labs: Lab[] = [
  {
    id: 'quicksort',
    number: '001',
    icon: 'code',
    title: '小伙的\n快乐排序',
    summary: 'C 写的快排，编译成 WebAssembly 在浏览器里跑。输入数字，一步步看它怎样分组。',
    href: 'lab/quicksort/',
    meta: 'C · WebAssembly',
  },
  {
    id: 'photo',
    number: '002',
    icon: 'image',
    title: '小伙的\n照片打印',
    summary: '把照片拆成几万个字符再拼回来。示例用本站图标，也可以换成你自己的照片。',
    href: 'lab/photo/',
    meta: 'C → JavaScript',
  },
];
