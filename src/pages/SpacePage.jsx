import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetSpace, apiGetSpacePosts } from '../api';
import { useAuth } from '../contexts/AuthContext';
import PostCard from '../components/PostCard';
import PinnedPostsRail from '../components/PinnedPostsRail';
import TagPill from '../components/TagPill';
import ErrorPage from './ErrorPage';
import { getSharedSpaceUrl } from '../utils/appLinks';
import { sortPostsByCreatedAt } from '../utils/postOrdering';
import './SpacePage.css';

export default function SpacePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [space, setSpace] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pinnedPosts, setPinnedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const loadingRef = useRef(null);

  const activeTagId = selectedTag?.id || '';

  useEffect(() => {
    setSelectedTag(null);
  }, [id]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function loadSpaceAndPosts() {
      setLoading(true);
      setError('');
      setSpace(null);
      setPosts([]);
      setPinnedPosts([]);
      setPage(0);

      try {
        const [{ space: spaceData }, { posts: postData = [], pinnedPosts: pinnedData = [], hasMore: more = false }] =
          await Promise.all([
            apiGetSpace(id),
            apiGetSpacePosts(id, { page: 0, tag: activeTagId }),
          ]);

        if (cancelled) return;
        setSpace(spaceData);
        setPosts(postData);
        setPinnedPosts(sortPostsByCreatedAt(pinnedData));
        setHasMore(more);
      } catch {
        if (cancelled) return;
        setError('This space is not available to your account.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSpaceAndPosts();
    return () => {
      cancelled = true;
    };
  }, [id, user, activeTagId]);

  useEffect(() => {
    if (!loadingRef.current || !space) return undefined;
    let cancelled = false;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        const nextPage = page + 1;
        setPage(nextPage);
        setLoading(true);
        apiGetSpacePosts(id, { page: nextPage, tag: activeTagId })
          .then(({ posts: data = [], hasMore: more = false }) => {
            if (cancelled) return;
            setPosts((prev) => [...prev, ...data]);
            setHasMore(more);
            setLoading(false);
          })
          .catch(() => {
            if (!cancelled) {
              setHasMore(false);
              setLoading(false);
            }
          });
      }
    }, { threshold: 0.1 });

    observer.observe(loadingRef.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasMore, loading, page, id, space, activeTagId]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function getPostTags(post) {
    return post.post_tags?.map((item) => item.tags).filter(Boolean) || [];
  }

  function handlePostDeleted(postId) {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
    setPinnedPosts((prev) => prev.filter((post) => post.id !== postId));
  }

  function handlePostUpdated(updatedPost, updatedTags) {
    const nextPost = {
      ...updatedPost,
      post_tags: updatedTags.map((tag) => ({ tag_id: tag.id, tags: tag })),
    };

    setPosts((prev) => {
      if (updatedPost.space_id !== id) {
        return prev.filter((post) => post.id !== updatedPost.id);
      }

      return prev.map((post) => (post.id === updatedPost.id ? nextPost : post));
    });

    setPinnedPosts((prev) => {
      const others = prev.filter((post) => post.id !== updatedPost.id);

      if (updatedPost.space_id !== id || !updatedPost.is_pinned) {
        return others;
      }

      return sortPostsByCreatedAt([nextPost, ...others]);
    });
  }

  async function handleCopyLink() {
    if (!space?.share_link) return;

    try {
      await navigator.clipboard.writeText(getSharedSpaceUrl(space.share_link));
      setCopied(true);
    } catch {
      // Clipboard blocked
    }
  }

  const isOwner = space?.user_id === user?.id;

  if (error) {
    return (
      <ErrorPage
        embedded
        code="403"
        title="Space unavailable"
        description={error}
      />
    );
  }

  if (loading && !space) {
    return (
      <div className="space-page">
        <div className="space-page-feed">
          <div className="space-page-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-page">
      <div className="space-page-header">
        <div className="space-page-heading">
          <button className="space-page-back" onClick={() => navigate(-1)} aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="space-page-heading-copy">
            <h1 className="space-page-title">{space?.icon} {space?.name || 'Space'}</h1>
            <div className="space-page-meta">
              <span className="space-page-chip">{posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>
              <span className="space-page-chip">{isOwner ? 'Owner' : 'Shared'}</span>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="space-page-actions">
            <button className="btn btn-ghost" onClick={handleCopyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/create?space=${id}`)}>
              New Post
            </button>
          </div>
        )}
      </div>

      <PinnedPostsRail
        posts={pinnedPosts}
        createPath={isOwner ? `/create?space=${id}` : ''}
        createLabel="New Post"
      />

      <div className="space-page-feed">
        {selectedTag && (
          <div className="feed-filters">
            <TagPill
              name={selectedTag.name}
              pillColor={selectedTag.pill_color}
              textColor={selectedTag.text_color}
              onRemove={() => setSelectedTag(null)}
            />
          </div>
        )}

        {posts.map((post, index) => (
          <div key={post.id}>
            <PostCard
              post={post}
              tags={getPostTags(post)}
              onDeleted={handlePostDeleted}
              onUpdated={handlePostUpdated}
              onTagClick={(tag) => setSelectedTag((prev) => (prev?.id === tag.id ? null : tag))}
            />
            {index < posts.length - 1 && <hr className="post-separator" />}
          </div>
        ))}

        {!loading && posts.length === 0 && (
          <div className="space-page-empty">
            <h2>No posts yet</h2>
            <p>
              {selectedTag
                ? `No posts tagged "${selectedTag.name}".`
                : isOwner
                  ? 'Start with a new post.'
                  : 'Nothing shared here yet.'}
            </p>
            {isOwner && !selectedTag && (
              <button className="btn btn-primary" onClick={() => navigate(`/create?space=${id}`)}>
                New Post
              </button>
            )}
          </div>
        )}

        <div ref={loadingRef}>
          {loading && <div className="space-page-loading">Loading...</div>}
        </div>
      </div>
    </div>
  );
}
