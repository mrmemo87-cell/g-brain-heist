class AIHostService {
  private initialized = false;
  private heartbeatIntervalId: number | null = null;

  init(): () => void {
    if (typeof window === 'undefined' || this.initialized) {
      return () => {};
    }

    this.initialized = true;

    // Establish a lightweight heartbeat so we can extend with real host logic later
    this.startHeartbeat();

    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    return () => this.stop();
  }

  stop() {
    if (!this.initialized) {
      return;
    }

    this.initialized = false;
    this.clearHeartbeat();

    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  private startHeartbeat() {
    this.clearHeartbeat();

    // No-op heartbeat that could be extended to ping a backend service.
    this.heartbeatIntervalId = window.setInterval(() => {
      // Intentionally left blank. Acts as a placeholder for future host sync logic.
    }, 60000);
  }

  private clearHeartbeat() {
    if (this.heartbeatIntervalId !== null) {
      window.clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  private handleVisibilityChange = () => {
    if (!this.initialized) return;

    if (document.visibilityState === 'visible') {
      this.startHeartbeat();
    } else {
      this.clearHeartbeat();
    }
  };

  private handleBeforeUnload = () => {
    this.stop();
  };
}

export const aiHostService = new AIHostService();
