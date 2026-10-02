type Listener = () => void;

export class EditNotifications {
  private readonly listeners = new Set<Listener>();
  private notifying = false;
  private notificationPending = false;
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  publish(): void {
    this.notificationPending = true;
    if (this.notifying) return;
    this.notifying = true;
    const errors: unknown[] = [];
    try {
      while (this.notificationPending) {
        this.notificationPending = false;
        for (const listener of [...this.listeners]) {
          if (!this.listeners.has(listener)) continue;
          try { listener(); } catch (error) { errors.push(error); }
        }
      }
    } finally {
      this.notifying = false;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, '剧情编辑状态通知失败。');
  }
}
