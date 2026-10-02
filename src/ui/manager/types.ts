export type UIName<Params extends object> = Extract<keyof Params, string>;

export type UIRegistry<Params extends object> = {
  readonly [Name in UIName<Params>]: Readonly<{ layer: string }>;
};

/** Entries are ordered back to front; params keep their original references. */
export type UIEntry<Params extends object> = {
  [Name in UIName<Params>]: Readonly<{
    name: Name;
    layer: string;
    instanceId: number;
    params: Params[Name];
  }>;
}[UIName<Params>];

export interface UISnapshot<Params extends object> {
  readonly entries: readonly UIEntry<Params>[];
}

export interface UIHandle<Params extends object, Name extends UIName<Params>> {
  readonly name: Name;
  readonly instanceId: number;
  /** Replaces this instance's params without changing its stacking position. */
  update(params: Params[Name]): boolean;
  close(): boolean;
}
