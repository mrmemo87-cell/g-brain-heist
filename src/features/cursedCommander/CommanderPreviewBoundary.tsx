import React from 'react';

type Props = { children: React.ReactNode; fallback: React.ReactNode };

// A failed preview chunk/render must not take down the existing Game tab.
export default class CommanderPreviewBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
