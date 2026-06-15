import { Component } from "react";

import { clearStorage } from "../utils/storage";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  clearSession = () => {
    clearStorage();
    window.location.assign("/login");
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <main className="app-error-page">
        <section className="app-error-card">
          <h1>Frontend error</h1>
          <p>The app loaded, but React stopped while rendering this screen.</p>
          <pre>{error?.message || String(error)}</pre>
          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={this.clearSession}>
              <span>Clear Session</span>
            </button>
            <button className="btn btn-primary" type="button" onClick={this.reload}>
              <span>Reload</span>
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
