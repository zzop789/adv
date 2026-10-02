import type { UIName, UIRegistry, UIEntry, UISnapshot, UIHandle } from './types';

type Listener = () => void;

/**
 * Framework-independent screen state. A name has at most one live instance.
 * Use a new params reference to publish changed props; callbacks are preserved.
 */
export class UIManager<Params extends object> {
  private readonly registry = new Map<string, Readonly<{ layer: string }>>();
  private readonly listeners = new Set<Listener>();
  private snapshot: UISnapshot<Params> = Object.freeze({ entries: Object.freeze([]) });
  private nextInstanceId = 0;
  private disposed = false;
  private notifying = false;
  private notificationPending = false;

  constructor(registry: UIRegistry<Params>) {
    for (const [name, definition] of Object.entries(registry)) {
      if (!name.trim()) throw new Error('界面名称不能为空。');
      if (
        typeof definition !== 'object' || definition === null || !('layer' in definition)
        || typeof definition.layer !== 'string' || !definition.layer.trim()
      ) {
        throw new Error(`界面 ${name} 必须指定有效的 layer。`);
      }
      // Copy the registration so caller mutations cannot move an existing screen.
      this.registry.set(name, Object.freeze({ layer: definition.layer }));
    }
  }

  readonly getSnapshot = (): UISnapshot<Params> => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Open/update one screen and bring it to the front, preserving other screens. */
  open<Name extends UIName<Params>>(name: Name, params: Params[Name]): UIHandle<Params, Name> {
    return this.present(name, params, false);
  }

  /** Open/update one screen and close every other screen in its registered layer. */
  show<Name extends UIName<Params>>(name: Name, params: Params[Name]): UIHandle<Params, Name> {
    return this.present(name, params, true);
  }

  close(name: UIName<Params>): boolean {
    this.requireRegistration(name);
    if (this.disposed) return false;
    const entry = this.snapshot.entries.find((candidate) => candidate.name === name);
    return entry ? this.closeInstance(name, entry.instanceId) : false;
  }

  closeLayer(layer: string): number {
    if (this.disposed) return 0;
    const entries = this.snapshot.entries.filter((entry) => entry.layer !== layer);
    const removed = this.snapshot.entries.length - entries.length;
    if (removed > 0) this.commit(entries);
    return removed;
  }

  closeTop(layer?: string): boolean {
    if (this.disposed) return false;
    const entries = this.snapshot.entries;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (layer === undefined || entry.layer === layer) return this.closeInstance(entry.name, entry.instanceId);
    }
    return false;
  }

  isOpen(name: UIName<Params>): boolean {
    this.requireRegistration(name);
    return this.snapshot.entries.some((entry) => entry.name === name);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.commit([]);
    } finally {
      // During a notification, finish publishing the empty snapshot before clearing.
      if (!this.notifying) this.listeners.clear();
    }
  }

  private requireRegistration(name: string): Readonly<{ layer: string }> {
    const registration = this.registry.get(name);
    if (!registration) throw new Error(`界面未注册：${name}。`);
    return registration;
  }

  private present<Name extends UIName<Params>>(
    name: Name,
    params: Params[Name],
    exclusive: boolean,
  ): UIHandle<Params, Name> {
    const { layer } = this.requireRegistration(name);
    if (this.disposed) throw new Error('UIManager 已销毁，不能打开界面。');
    const previous = this.snapshot.entries.find((entry) => entry.name === name);
    const instanceId = previous?.instanceId ?? ++this.nextInstanceId;
    const entry = previous && Object.is(previous.params, params)
      ? previous
      : this.createEntry(name, layer, instanceId, params);
    const remaining = this.snapshot.entries.filter((candidate) => (
      candidate.name !== name && (!exclusive || candidate.layer !== layer)
    ));
    // Capture the instance before observers run: they may close or reopen this name.
    const handle = this.createHandle(name, instanceId);
    this.commit([...remaining, entry]);
    return handle;
  }

  private createEntry<Name extends UIName<Params>>(
    name: Name,
    layer: string,
    instanceId: number,
    params: Params[Name],
  ): UIEntry<Params> {
    return Object.freeze({ name, layer, instanceId, params }) as UIEntry<Params>;
  }

  private createHandle<Name extends UIName<Params>>(name: Name, instanceId: number): UIHandle<Params, Name> {
    return Object.freeze({
      name,
      instanceId,
      update: (params: Params[Name]) => this.updateInstance(name, instanceId, params),
      close: () => this.closeInstance(name, instanceId),
    });
  }

  private updateInstance<Name extends UIName<Params>>(name: Name, instanceId: number, params: Params[Name]): boolean {
    if (this.disposed) return false;
    const previous = this.snapshot.entries.find((entry) => entry.name === name && entry.instanceId === instanceId);
    if (!previous) return false;
    if (Object.is(previous.params, params)) return true;
    const replacement = this.createEntry(name, previous.layer, instanceId, params);
    this.commit(this.snapshot.entries.map((entry) => entry === previous ? replacement : entry));
    return true;
  }

  private closeInstance(name: UIName<Params>, instanceId: number): boolean {
    if (this.disposed) return false;
    const entries = this.snapshot.entries.filter((entry) => entry.name !== name || entry.instanceId !== instanceId);
    if (entries.length === this.snapshot.entries.length) return false;
    this.commit(entries);
    return true;
  }

  private commit(entries: readonly UIEntry<Params>[]): void {
    const previous = this.snapshot.entries;
    if (previous.length === entries.length && previous.every((entry, index) => entry === entries[index])) return;
    this.snapshot = Object.freeze({ entries: Object.freeze([...entries]) });
    this.notify();
  }

  private notify(): void {
    this.notificationPending = true;
    if (this.notifying) return;
    this.notifying = true;
    const errors: unknown[] = [];
    try {
      // Reentrant mutations commit immediately, then notify without recursive dispatch.
      while (this.notificationPending) {
        this.notificationPending = false;
        for (const listener of [...this.listeners]) {
          if (!this.listeners.has(listener)) continue;
          try { listener(); } catch (error) { errors.push(error); }
        }
      }
    } finally {
      this.notifying = false;
      if (this.disposed) this.listeners.clear();
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'UIManager 界面状态通知失败。');
  }
}
