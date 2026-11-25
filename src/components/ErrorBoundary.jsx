import { Component } from 'react';
import '../pages/ErrorPage.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-page standalone">
          <div className="error-card">
            <div className="error-badge">500</div>
            <h1 className="error-title">Something went wrong</h1>
            <p className="error-description">
              arKive hit an unexpected error while displaying this view.
            </p>
            <div className="error-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.assign('/');
                }}
              >
                Reload arKive
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
