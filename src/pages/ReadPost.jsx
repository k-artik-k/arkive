import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { apiDeletePost, apiGetPost, apiGetPostIds, apiUpdatePost } from '../api';
import { useAuth } from '../contexts/AuthContext';
import RichTextEditor from '../components/RichTextEditor';
import TagPill from '../components/TagPill';
import ConfirmDialog from '../components/ConfirmDialog';
import PassphraseDialog from '../components/PassphraseDialog';
import PostActionsMenu from '../components/PostActionsMenu';
import PostOrganizerDialog from '../components/PostOrganizerDialog';
import ErrorPage from './ErrorPage';
import { sanitizeHTML } from '../utils/sanitize';
import { formatDate } from '../utils/dateHelpers';
import { duplicatePostWithTags } from '../utils/postActions';
import { getPostShareUrl } from '../utils/appLinks';
import { lockPostBody, unlockPostBody } from '../utils/postCrypto';
import './ReadPost.css';

export default function ReadPost() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shouldStartEditing = searchParams.get('edit') === '1';

  const [post, setPost] = useState(null);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editIsMarkdown, setEditIsMarkdown] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [decryptedBody, setDecryptedBody] = useState(null);
  const [unlockedPassphrase, setUnlockedPassphrase] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [allPostIds, setAllPostIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPost() {
      setLoading(true);
      setPost(null);
      setDecryptedBody(null);
      setUnlockedPassphrase(null);
      setShowPassphrase(false);
      setSaveError('');

      try {
        const { post: data } = await apiGetPost(id);
        if (cancelled || !data) return;

        setPost(data);
        setEditTitle(data.title);
        setEditSubtitle(data.subtitle || '');
        setEditBody(data.body || '');
        setEditIsMarkdown(Boolean(data.is_markdown));
        setTags(data.post_tags?.map((item) => item.tags).filter(Boolean) || []);
        const owner = data.user_id === user?.id;
        setIsOwner(owner);
        setEditing(owner && shouldStartEditing);
      } catch {
        if (!cancelled) {
          setPost(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPost();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, shouldStartEditing]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    apiGetPostIds()
      .then(({ ids = [] }) => {
        if (!cancelled) setAllPostIds(ids);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    function handleKey(e) {
      if (editing) return;
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const idx = allPostIds.indexOf(id);
      if (idx === -1) return;

      if (e.key === 'ArrowLeft' && idx > 0) {
        navigate(`/post/${allPostIds[idx - 1]}`);
      } else if (e.key === 'ArrowRight' && idx < allPostIds.length - 1) {
        navigate(`/post/${allPostIds[idx + 1]}`);
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [allPostIds, id, navigate, editing]);

  async function handleDecrypt(passphrase) {
    try {
      const decryptedText = await unlockPostBody(post.passphrase_hash, post.encrypted_body, passphrase);
      setDecryptedBody(decryptedText);
      setUnlockedPassphrase(passphrase);
      setEditBody(decryptedText);
      setShowPassphrase(false);
      return null;
    } catch (err) {
      return err?.message || 'Decryption failed. Check your passphrase.';
    }
  }

  async function handleSave() {
    if (!editTitle.trim()) {
      setSaveError('Title is required.');
      return;
    }

    setSaving(true);
    setSaveError('');
    const sanitized = editIsMarkdown ? editBody : sanitizeHTML(editBody);

    try {
      const payload = {
        title: editTitle.trim(),
        subtitle: editSubtitle.trim(),
        is_markdown: editIsMarkdown,
      };

      if (post.passphrase_hash) {
        if (!unlockedPassphrase) {
          setSaveError('Unlock the post before saving changes.');
          setSaving(false);
          return;
        }
        const locked = await lockPostBody(sanitized, unlockedPassphrase);
        payload.passphrase_hash = locked.passphraseHash;
        payload.encrypted_body = locked.encryptedBody;
        payload.body = '';
      } else {
        payload.body = sanitized;
      }

      const { post: data } = await apiUpdatePost(id, payload);
      if (data) {
        setPost(data);
        setTags(data.post_tags?.map((item) => item.tags).filter(Boolean) || []);
        if (post.passphrase_hash) {
          setDecryptedBody(sanitized);
        }
      }

      navigate(`/post/${id}`, { replace: true });
      setEditing(false);
    } catch (err) {
      setSaveError(err?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await apiDeletePost(id);
      navigate('/');
    } catch (err) {
      setShowDelete(false);
      setSaveError(err?.message || 'Could not delete post.');
    }
  }

  async function handleToggleDraft() {
    if (!post) return;
    try {
      const { post: data } = await apiUpdatePost(post.id, { is_draft: !post.is_draft });
      if (data) {
        setPost((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // ignore toggle error
    }
  }

  async function handleTogglePin() {
    if (!post) return;
    try {
      const { post: data } = await apiUpdatePost(post.id, { is_pinned: !post.is_pinned });
      if (data) {
        setPost((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // ignore toggle error
    }
  }

  async function handleDuplicate() {
    if (!post) return;

    const { data } = await duplicatePostWithTags(post, tags);
    if (data?.id) {
      navigate(`/post/${data.id}?edit=1`);
    }
  }

  function handlePostUpdated(updatedPost, updatedTags) {
    setPost(updatedPost);
    setTags(updatedTags);
  }

  if (loading) {
    return (
      <div className="read-post-page">
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <ErrorPage
        embedded
        code="404"
        title="Post unavailable"
        description="This post is private, deleted, or unavailable to your account."
      />
    );
  }

  if (post.passphrase_hash && decryptedBody === null && !showPassphrase) {
    return (
      <div className="read-post-page">
        <div className="read-post-nav">
          <button className="read-post-nav-btn" onClick={() => navigate(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="read-post-nav-spacer" />
          <PostActionsMenu
            postId={post.id}
            shareUrl={getPostShareUrl(post)}
            canManage={isOwner}
            isDraft={post.is_draft}
            isPinned={post.is_pinned}
            onEdit={() => navigate(`/post/${post.id}?edit=1`)}
            onOrganize={() => setShowOrganizer(true)}
            onDuplicate={handleDuplicate}
            onTogglePin={handleTogglePin}
            onToggleDraft={handleToggleDraft}
            onDelete={() => setShowDelete(true)}
          />
        </div>
        <div className="read-post-locked">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2>{post.title}</h2>
          <p>This post is locked</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowPassphrase(true)}>
            Unlock
          </button>
        </div>
        {showDelete && (
          <ConfirmDialog
            title="Delete Post"
            message="Are you sure you want to delete this post? This action cannot be undone."
            onConfirm={handleDelete}
            onCancel={() => setShowDelete(false)}
            confirmText="Delete"
            danger
          />
        )}
        {showOrganizer && isOwner && (
          <PostOrganizerDialog
            post={post}
            tags={tags}
            onClose={() => setShowOrganizer(false)}
            onSaved={handlePostUpdated}
          />
        )}
      </div>
    );
  }

  if (showPassphrase) {
    return (
      <div className="read-post-page">
        <PassphraseDialog mode="unlock" onSubmit={handleDecrypt} onCancel={() => setShowPassphrase(false)} />
      </div>
    );
  }

  const displayBody = decryptedBody !== null ? decryptedBody : post.body;

  return (
    <div className="read-post-page">
      <div className="read-post-nav">
        <button className="read-post-nav-btn" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="read-post-nav-actions">
          {isOwner && !editing && (
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate(`/post/${post.id}?edit=1`, { replace: true })}>
              Edit
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => {
                  navigate(`/post/${post.id}`, { replace: true });
                  setEditing(false);
                  setSaveError('');
                  setEditTitle(post.title);
                  setEditSubtitle(post.subtitle || '');
                  setEditBody(displayBody);
                  setEditIsMarkdown(Boolean(post.is_markdown));
                }}
              >
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <PostActionsMenu
              postId={post.id}
              shareUrl={getPostShareUrl(post)}
              canManage={isOwner}
              isDraft={post.is_draft}
              isPinned={post.is_pinned}
              onEdit={() => navigate(`/post/${post.id}?edit=1`, { replace: true })}
              onOrganize={() => setShowOrganizer(true)}
              onDuplicate={handleDuplicate}
              onTogglePin={handleTogglePin}
              onToggleDraft={handleToggleDraft}
              onDelete={() => setShowDelete(true)}
            />
          )}
        </div>
      </div>

      {saveError && (
        <p style={{ color: 'var(--danger)', fontSize: 13, maxWidth: 'var(--page-reading-max)', margin: '0 auto 12px' }}>
          {saveError}
        </p>
      )}

      {editing ? (
        <>
          <input className="read-post-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
          <input className="read-post-subtitle" value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} placeholder="Subtitle" />
          <div className="read-post-edit-body">
            <RichTextEditor
              content={editBody}
              onChange={setEditBody}
              isMarkdown={editIsMarkdown}
              onToggleMode={setEditIsMarkdown}
            />
          </div>
        </>
      ) : (
        <>
          <h1 className="read-post-title" style={{ cursor: isOwner ? 'text' : 'default' }}>{post.title}</h1>
          {post.subtitle && <div className="read-post-subtitle">{post.subtitle}</div>}
          <div className="read-post-meta">
            {tags.map((tag) => (
              <TagPill
                key={tag.id}
                name={tag.name}
                pillColor={tag.pill_color}
                textColor={tag.text_color}
              />
            ))}
            {post.spaces && (
              <span className="read-post-space">
                {post.spaces.icon} {post.spaces.name}
              </span>
            )}
            {post.is_pinned && (
              <span className="read-post-pin" title="Pinned" aria-label="Pinned">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 17v5" />
                  <path d="M8 4h8" />
                  <path d="m9 4 1 7-3 3h10l-3-3 1-7" />
                </svg>
              </span>
            )}
            <span className="read-post-date">{formatDate(post.created_at)}</span>
            {post.is_draft && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 8px', borderRadius: 'var(--radius-pill)' }}>
                Draft
              </span>
            )}
          </div>
          <div className="read-post-body" dangerouslySetInnerHTML={{ __html: sanitizeHTML(displayBody) }} />
        </>
      )}

      {showDelete && (
        <ConfirmDialog
          title="Delete Post"
          message="Are you sure you want to delete this post? This action cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          confirmText="Delete"
          danger
        />
      )}

      {showOrganizer && isOwner && post && (
        <PostOrganizerDialog
          post={post}
          tags={tags}
          onClose={() => setShowOrganizer(false)}
          onSaved={handlePostUpdated}
        />
      )}
    </div>
  );
}
