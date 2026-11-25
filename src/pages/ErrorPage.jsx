import { useNavigate } from 'react-router-dom';
import './ErrorPage.css';

const ERROR_PRESETS = {
  404: {
    code: '404',
    title: 'Page not found',
    description: 'The page you are looking for does not exist or may have been moved.',
  },
  403: {
    code: '403',
    title: 'Access unavailable',
    description: 'You do not have permission to view this resource. Ask the owner to add your username.',
  },
  500: {
    code: '500',
    title: 'Something went wrong',
    description: 'An unexpected error occurred while rendering this page.',
  },
};

export default function ErrorPage({
  code = '404',
  title,
  description,
  embedded = false,
  onRetry,
}) {
  const navigate = useNavigate();
  const preset = ERROR_PRESETS[code] || ERROR_PRESETS[500];
  const heading = title || preset.title;
  const copy = description || preset.description;

  return (
    <div className={`error-page ${embedded ? 'embedded' : 'standalone'}`}>
      <div className="error-card">
        <div className="error-badge">{preset.code}</div>
        <h1 className="error-title">{heading}</h1>
        <p className="error-description">{copy}</p>
        <div className="error-actions">
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Try again
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
            Go home
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
