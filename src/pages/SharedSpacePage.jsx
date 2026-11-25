import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiCheckSharedPost, apiResolveShareLink } from '../api';
import ErrorPage from './ErrorPage';

export default function SharedSpacePage() {
  const { shareLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const sharedPostId = searchParams.get('post');

  useEffect(() => {
    let cancelled = false;

    async function resolveShareLink() {
      setStatus('loading');
      try {
        const { space } = await apiResolveShareLink(shareLink);
        if (cancelled) return;

        if (space?.id) {
          if (sharedPostId) {
            try {
              const { exists } = await apiCheckSharedPost(shareLink, sharedPostId);
              if (!cancelled && exists) {
                navigate(`/post/${sharedPostId}`, { replace: true });
                return;
              }
            } catch {
              // Fall back to space page
            }
          }

          navigate(`/space/${space.id}`, { replace: true });
          return;
        }
      } catch {
        // Space unavailable
      }

      if (!cancelled) {
        setStatus('unavailable');
      }
    }

    resolveShareLink();
    return () => {
      cancelled = true;
    };
  }, [navigate, shareLink, sharedPostId]);

  if (status === 'loading') {
    return (
      <div style={{ width: 'min(100%, 760px)', margin: '0 auto', padding: '24px', color: 'var(--text-muted)' }}>
        Opening...
      </div>
    );
  }

  return (
    <ErrorPage
      embedded
      code="403"
      title="Space unavailable"
      description="This shared link requires permission. Ask the owner to add your username, then try again."
    />
  );
}
