import { useState, useEffect, useRef } from 'react';
import { apiGetPinnedPosts, apiGetPosts } from '../api';
import { useAuth } from '../contexts/AuthContext';
import PostCard from '../components/PostCard';
import PinnedPostsRail from '../components/PinnedPostsRail';
import TagPill from '../components/TagPill';
import ErrorPage from './ErrorPage';
import { sortPostsByCreatedAt } from '../utils/postOrdering';
import './Home.css';

export default function Home({ searchQuery = '' }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [pinnedPosts, setPinnedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const loadingRef = useRef(null);

  const activeTagId = selectedTag?.id || '';

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError('');
      setPosts([]);
      setPinnedPosts([]);
      setPage(0);
      setHasMore(true);

      try {
        const [{ posts: postData = [], hasMore: more = false }, { posts: pinnedData = [] }] =
          await Promise.all([
            apiGetPosts({ page: 0, search: searchQuery, tag: activeTagId, drafts: draftsOnly }),
            apiGetPinnedPosts({ search: searchQuery, tag: activeTagId, drafts: draftsOnly }),
          ]);
        if (cancelled) return;
        setPosts(postData);
        setPinnedPosts(sortPostsByCreatedAt(pinnedData));
        setHasMore(more);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Unable to load posts.');
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [user, searchQuery, activeTagId, draftsOnly]);

  // Infinite scroll
  useEffect(() => {
    if (!loadingRef.current) return undefined;
    let cancelled = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          setLoading(true);
          apiGetPosts({ page: nextPage, search: searchQuery, tag: activeTagId, drafts: draftsOnly })
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
      },
      { threshold: 0.1 }
    );
    observer.observe(loadingRef.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasMore, loading, page, searchQuery, activeTagId, draftsOnly]);

  function getPostTags(post) {
    return post.post_tags?.map((pt) => pt.tags).filter(Boolean) || [];
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

    setPosts((prev) => prev.map((post) => (post.id === updatedPost.id ? nextPost : post)));

    setPinnedPosts((prev) => {
      const others = prev.filter((post) => post.id !== updatedPost.id);
      return updatedPost.is_pinned ? sortPostsByCreatedAt([nextPost, ...others]) : others;
    });
  }

  function handleTagClick(tag) {
    setSelectedTag((prev) => (prev?.id === tag.id ? null : tag));
  }

  if (error) {
    return (
      <ErrorPage
        embedded
        code="500"
        title="Unable to load posts"
        description={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const filterBar = (
    <div className="feed-filters">
      <button
        type="button"
        className={`feed-filter-btn ${!draftsOnly ? 'active' : ''}`}
        onClick={() => setDraftsOnly(false)}
      >
        All
      </button>
      <button
        type="button"
        className={`feed-filter-btn ${draftsOnly ? 'active' : ''}`}
        onClick={() => setDraftsOnly(true)}
      >
        Drafts
      </button>
      {selectedTag && (
        <div className="feed-filter-tag">
          <TagPill
            name={selectedTag.name}
            pillColor={selectedTag.pill_color}
            textColor={selectedTag.text_color}
            onRemove={() => setSelectedTag(null)}
          />
        </div>
      )}
    </div>
  );

  if (!loading && posts.length === 0 && pinnedPosts.length === 0) {
    return (
      <div className="home-page">
        <div className="home-feed">{filterBar}</div>
        <div className="home-empty">
          <h2>{searchQuery || selectedTag || draftsOnly ? 'No posts found' : 'No posts yet'}</h2>
          <p>
            {searchQuery
              ? `No posts matching "${searchQuery}"`
              : draftsOnly
                ? 'You have no saved drafts.'
                : selectedTag
                  ? `No posts tagged "${selectedTag.name}".`
                  : 'Click + to create your first post'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <PinnedPostsRail posts={pinnedPosts} createPath="/create" createLabel="New Post" />

      <div className="home-feed">
        {filterBar}
        {posts.map((post, i) => (
          <div key={post.id}>
            <PostCard
              post={post}
              tags={getPostTags(post)}
              onDeleted={handlePostDeleted}
              onUpdated={handlePostUpdated}
              onTagClick={handleTagClick}
            />
            {i < posts.length - 1 && <hr className="post-separator" />}
          </div>
        ))}
        <div ref={loadingRef}>
          {loading && <div className="home-loading">Loading...</div>}
        </div>
      </div>
    </div>
  );
}
