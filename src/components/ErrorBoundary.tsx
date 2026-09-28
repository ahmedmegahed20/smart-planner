import React from 'react';

/**
 * Last line of defence against a silent white screen.
 *
 * Before this existed, any exception thrown during render — most likely in a
 * provider, a theme/i18n init, or the first data load — unmounted the whole
 * tree and left an empty <div id="root">, which on Android is indistinguishable
 * from a failed WebView or a bad asset path. That is exactly the failure mode
 * that is hardest to diagnose, because there is nothing on screen and nothing in
 * the log unless JavaScript console output is being forwarded.
 *
 * This does not hide the problem: it surfaces it, with a way out.
 *
 *   - Development: the real error and component stack are shown.
 *   - Production: only a short, non-sensitive message plus a retry/reload,
 *     and the details go to the console so `adb logcat` still captures them.
 *
 * `reset()` re-mounts the subtree, which recovers from a transient failure
 * (e.g. storage was momentarily unavailable during boot). Reloading the document
 * is the stronger option when the failure is in module or store initialisation.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

const isDev = (): boolean => {
  try {
    return !import.meta.env.PROD;
  } catch {
    return false;
  }
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info });

    // Always log, in both modes. Capacitor's WebChromeClient forwards console
    // output into logcat under the `chromium` tag, so this single line is what
    // turns a white screen into a diagnosable one in the field.
    console.error('[ErrorBoundary] render failed', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null, info: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const dev = isDev();

    return (
      <div
        role="alert"
        className="flex h-full min-h-screen w-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center"
      >
        <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
        <p className="max-w-sm text-sm text-fg-2">
          The app hit an unexpected error and stopped rendering this screen.
        </p>

        {dev ? (
          <pre className="max-h-64 w-full max-w-lg overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-surface p-3 text-left text-xs text-danger-2">
            {String(error?.stack || error)}
            {info?.componentStack || ''}
          </pre>
        ) : (
          <p className="max-w-sm text-xs text-fg-3">
            Details were written to the device log.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="min-h-11 rounded-md border border-hairline px-4 text-sm font-medium text-fg transition-colors hover:bg-hover"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
