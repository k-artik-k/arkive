import { useEffect, useState } from 'react';
import { apiCreateTag, apiGetSpaces, apiGetTags, apiUpdatePost } from '../api';
import { useAuth } from '../contexts/AuthContext';
import TagPill from './TagPill';
import './PostOrganizerDialog.css';

const DEFAULT_TAG_COLOR = '#3b82f6';
const DEFAULT_TEXT_COLOR = '#ffffff';

export default function PostOrganizerDialog({ post, tags = [], onClose, onSaved }) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(post.space_id || '');
  const [selectedTagIds, setSelectedTagIds] = useState(tags.map((tag) => tag.id));
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedSpaceId(post.space_id || '');
    setSelectedTagIds(tags.map((tag) => tag.id));
  }, [post, tags]);

  useEffect(() => {
    if (!user) return;

    async function fetchOptions() {
      try {
        const [{ owned: spaceData = [] }, { tags: tagData = [] }] = await Promise.all([
          apiGetSpaces(),
          apiGetTags(),
        ]);
        setSpaces(spaceData);
        setAllTags([...tagData].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        setError('Unable to load spaces or tags.');
      }
    }

    fetchOptions();
  }, [user]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function toggleTag(tagId) {
    setSelectedTagIds((prev) => (
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    ));
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name || !user) return;

    setCreatingTag(true);
    setError('');

    try {
      const { tag: data } = await apiCreateTag({
        name,
        pill_color: DEFAULT_TAG_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      });
      setAllTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTagIds((prev) => (prev.includes(data.id) ? prev : [...prev, data.id]));
      setNewTagName('');
    } catch (createError) {
      setError(createError?.message || 'Could not create that tag.');
    } finally {
      setCreatingTag(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');

    try {
      const { post: updatedPost } = await apiUpdatePost(post.id, {
        space_id: selectedSpaceId || null,
        tag_ids: selectedTagIds,
      });

      const nextTags = allTags.filter((tag) => selectedTagIds.includes(tag.id));
      onSaved?.(updatedPost, nextTags);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not update this post.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content post-organizer-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="post-organizer-header">
          <p className="post-organizer-kicker">Post Tools</p>
          <h3 className="post-organizer-title">Organize post</h3>
          <p className="post-organizer-subtitle">{post.title || 'Untitled'}</p>
        </div>

        <div className="post-organizer-body">
          <section className="post-organizer-section">
            <div className="post-organizer-label-row">
              <span className="post-organizer-label">Space</span>
              <span className="post-organizer-count">
                {selectedSpaceId ? 'Shared in a space' : 'Private only'}
              </span>
            </div>
            <select
              className="post-organizer-select"
              value={selectedSpaceId}
              onChange={(event) => setSelectedSpaceId(event.target.value)}
            >
              <option value="">Private only</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.icon} {space.name}
                </option>
              ))}
            </select>
            <p className="post-organizer-hint">Pick a space or keep it private.</p>
          </section>

          <section className="post-organizer-section">
            <div className="post-organizer-label-row">
              <span className="post-organizer-label">Tags</span>
              <span className="post-organizer-count">{selectedTagIds.length} selected</span>
            </div>

            {allTags.length > 0 ? (
              <div className="post-organizer-tag-grid">
                {allTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`post-organizer-tag-option ${selected ? 'selected' : ''}`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      <TagPill
                        name={tag.name}
                        pillColor={tag.pill_color}
                        textColor={tag.text_color}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="post-organizer-hint">No tags yet.</p>
            )}

            <div className="post-organizer-create-row">
              <input
                type="text"
                value={newTagName}
                placeholder="Create a quick tag"
                maxLength={20}
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreateTag();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCreateTag}
                disabled={creatingTag || !newTagName.trim()}
              >
                {creatingTag ? 'Adding...' : 'Add Tag'}
              </button>
            </div>
          </section>

          {error && <p className="post-organizer-error">{error}</p>}
        </div>

        <div className="post-organizer-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
