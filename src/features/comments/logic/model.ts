export const COMMENT_MAX_LENGTH = 3000;

export type Comment = {
  id: string;
  github_login: string;
  body: string;
  created_at: string;
};

export type CommentCursor = Pick<Comment, 'id' | 'created_at'>;
export type CommentPage = { rows: Comment[]; nextCursor: CommentCursor | null };

export interface CommentStore {
  list(cursor: CommentCursor | null): Promise<CommentPage>;
  post(body: string): Promise<Comment>;
  openThread(): Promise<void>;
}

// A user-facing rejection, such as the server's comment rate limit.
export class CommentRejected extends Error {}
