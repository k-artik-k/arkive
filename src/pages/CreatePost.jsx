import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiCreatePost, apiGetSpaces, apiGetTags } from '../api';
import { useAuth } from '../contexts/AuthContext';
import RichTextEditor from '../components/RichTextEditor';
import TagPill from '../components/TagPill';
import PassphraseDialog from '../components/PassphraseDialog';
import { sanitizeHTML } from '../utils/sanitize';
import { formatLocalDateTag, parseDiaryDate } from '../utils/dateHelpers';
import { lockPostBody } from '../utils/postCrypto';
import './CreatePost.css';

export default function CreatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSpaceId = searchParams.get('space') || '';
  const tagDropdownRef = useRef(null);
  const appliedSpaceRef = useRef('');

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [isMarkdown, setIsMarkdown] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [allSpaces, setAllSpaces] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaceId);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [dateTag, setDateTag] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadMeta() {
      try {
        const [{ tags = [] }, { owned = [] }] = await Promise.all([
          apiGetTags(),
          apiGetSpaces(),
        ]);
        if (cancelled) return;
        setAllTags([...tags].sort((a, b) => a.name.localeCompare(b.name)));
        setAllSpaces(owned);
      } catch {
        // ignore metadata load error
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Apply space's linked tag once when the selected space changes
  useEffect(() => {
    if (!selectedSpaceId || allTags.length === 0 || allSpaces.length === 0) return;
    if (appliedSpaceRef.current === selectedSpaceId) return;

    const linkedTagId = allSpaces.find((space) => space.id === selectedSpaceId)?.tag_id;
    appliedSpaceRef.current = selectedSpaceId;
    if (!linkedTagId) return;

    const tag = allTags.find((item) => item.id === linkedTagId);
    if (tag) {
      setSelectedTags((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]));
    }
  }, [allSpaces, allTags, selectedSpaceId]);

  useEffect(() => {
    if (!selectedSpaceId || allSpaces.length === 0) return;
    const stillOwned = allSpaces.some((space) => space.id === selectedSpaceId);
    if (!stillOwned) {
      setSelectedSpaceId('');
    }
  }, [allSpaces, selectedSpaceId]);

  useEffect(() => {
    function handleClick(event) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target)) {
        setShowTagDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedSpace = useMemo(
    () => allSpaces.find((space) => space.id === selectedSpaceId) || null,
    [allSpaces, selectedSpaceId]
  );

  function toggleTag(tag) {
    setSelectedTags((prev) => {
      const exists = prev.find((item) => item.id === tag.id);
      if (exists) return prev.filter((item) => item.id !== tag.id);
      return [...prev, tag];
    });
  }

  async function handleSave(isDraft) {
    if (!title.trim()) {
      setSaveError('Title is required.');
      return;
    }

    setSaving(true);
    setSaveError('');

    const sanitizedBody = isMarkdown ? body : sanitizeHTML(body);
    const diaryDate = parseDiaryDate(title);

    let passphraseHash = null;
    let encryptedBody = null;

    try {
      if (passphrase) {
        const locked = await lockPostBody(sanitizedBody, passphrase);
        passphraseHash = locked.passphraseHash;
        encryptedBody = locked.encryptedBody;
      }

      await apiCreatePost({
        title: title.trim(),
        subtitle: subtitle.trim(),
        body: passphraseHash ? '' : sanitizedBody,
        is_markdown: isMarkdown,
        is_draft: isDraft,
        passphrase_hash: passphraseHash,
        encrypted_body: encryptedBody,
        date_tag: dateTag || formatLocalDateTag(diaryDate),
        space_id: selectedSpaceId || null,
        tag_ids: selectedTags.map((tag) => tag.id),
      });

      navigate(selectedSpaceId ? `/space/${selectedSpaceId}` : '/');
    } catch (error) {
      setSaveError(error?.message || 'Could not save this post.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="create-post-page">
      <div className="create-post-header">
        <button className="create-post-back" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="create-post-heading">New Post</h1>
        </div>
      </div>

      <div className="create-post-shell">
        <div className="create-post-meta-grid">
          <div className="create-post-meta-card">
            <label className="create-post-meta-label" htmlFor="post-space">Space</label>
            <select
              id="post-space"
              className="create-post-space-select"
              value={selectedSpaceId}
              onChange={(e) => {
                appliedSpaceRef.current = '';
                setSelectedSpaceId(e.target.value);
              }}
            >
              <option value="">Private only</option>
              {allSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.icon} {space.name}
                </option>
              ))}
            </select>
            <p className="create-post-meta-hint">
              {selectedSpace
                ? `Shared in ${selectedSpace.name}.`
                : 'Private.'}
            </p>
          </div>

          <div className="create-post-meta-card">
            <label className="create-post-meta-label" htmlFor="post-date">Date</label>
            <input
              id="post-date"
              type="date"
              className="create-post-date-input"
              value={dateTag}
              onChange={(e) => setDateTag(e.target.value)}
            />
            <p className="create-post-meta-hint">Optional.</p>
          </div>
        </div>

        {selectedSpace && (
          <div className="create-post-space-banner">
            <span>{selectedSpace.icon}</span>
            <span>{selectedSpace.name}</span>
          </div>
        )}

        <input
          className="create-post-title-input"
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveError('');
          }}
        />

        <div className="create-post-subtitle-row">
          <input
            className="create-post-subtitle-input"
            type="text"
            placeholder="Short note"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />

          <div className="create-post-tags-dropdown" ref={tagDropdownRef}>
            <button
              className="create-post-tags-btn"
              type="button"
              onClick={() => setShowTagDropdown((prev) => !prev)}
            >
              <span>Tags</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showTagDropdown && (
              <div className="tags-dropdown-menu">
                {allTags.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    No tags yet.
                  </div>
                )}

                {allTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="tags-dropdown-item"
                    onClick={() => toggleTag(tag)}
                  >
                    <input type="checkbox" checked={!!selectedTags.find((item) => item.id === tag.id)} readOnly style={{ accentColor: tag.pill_color }} />
                    <TagPill name={tag.name} pillColor={tag.pill_color} textColor={tag.text_color} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedTags.length > 0 && (
          <div className="create-post-selected-tags">
            {selectedTags.map((tag) => (
              <TagPill key={tag.id} name={tag.name} pillColor={tag.pill_color} textColor={tag.text_color} onRemove={() => toggleTag(tag)} />
            ))}
          </div>
        )}

        <div className="create-post-editor-wrap">
          <RichTextEditor
            content={body}
            onChange={setBody}
            isMarkdown={isMarkdown}
            onToggleMode={setIsMarkdown}
            placeholder="Write..."
          />
        </div>

        {saveError && <p className="create-post-error">{saveError}</p>}

        <div className="create-post-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              if (passphrase) {
                setPassphrase(null);
              } else {
                setShowPassphrase(true);
              }
            }}
          >
            {passphrase ? (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> Locked</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 5 5" /></svg> Lock</>
            )}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => handleSave(true)} disabled={saving}>
            Draft
          </button>
          <button type="button" className="btn btn-primary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>

      {showPassphrase && (
        <PassphraseDialog
          mode="set"
          onSubmit={(value) => {
            setPassphrase(value);
            setShowPassphrase(false);
          }}
          onCancel={() => setShowPassphrase(false)}
        />
      )}
    </div>
  );
}
