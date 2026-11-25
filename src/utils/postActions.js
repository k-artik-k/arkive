import { apiCreatePost } from '../api';

export function mapTagsToPostRelations(tags = []) {
  return tags.map((tag) => ({
    tag_id: tag.id,
    tags: tag,
  }));
}

export async function duplicatePostWithTags(post, tags = []) {
  const title = post.title?.trim() || 'Untitled';
  try {
    const { post: created } = await apiCreatePost({
      title: `${title} (Copy)`,
      subtitle: post.subtitle || '',
      body: post.body || '',
      is_markdown: Boolean(post.is_markdown),
      is_draft: true,
      is_pinned: false,
      passphrase_hash: post.passphrase_hash || null,
      encrypted_body: post.encrypted_body || null,
      date_tag: post.date_tag || null,
      space_id: post.space_id || null,
      tag_ids: tags.map((tag) => tag.id).filter(Boolean),
    });
    return { data: created, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
