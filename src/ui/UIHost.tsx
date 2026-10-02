import { createContext, useContext, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { UIScreenParams } from './contracts';
import type { UIManager } from './ui-manager';

export type ScreenRegistry = { [Name in keyof UIScreenParams]: ComponentType<UIScreenParams[Name]> };
interface UIHostContext {
  manager: UIManager<UIScreenParams>;
  screens: ScreenRegistry;
}
const Context = createContext<UIHostContext | null>(null);

export function UIHost({ manager, screens, children }: UIHostContext & { children: ReactNode }) {
  return <Context.Provider value={{ manager, screens }}>{children}</Context.Provider>;
}

function useHost(): UIHostContext {
  const context = useContext(Context);
  if (!context) throw new Error('UI 界面必须放在 UIHost 内，或直接传入 props 独立渲染。');
  return context;
}

/** React callers use this hook; ordinary application code can receive the same manager. */
export function useUI(): UIManager<UIScreenParams> {
  return useHost().manager;
}

export function UIOutlet({ layer, topOnly = false }: { layer: string; topOnly?: boolean }) {
  const { manager, screens } = useHost();
  const { entries } = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const layerEntries = entries.filter((entry) => entry.layer === layer);
  // Native dialogs have their own top-layer order; only mount the active modal.
  const visible = topOnly ? layerEntries.slice(-1) : layerEntries;
  return <>{visible.map((entry) => {
    // Both maps use UIScreenParams; each manager entry retains its name/props pairing.
    const Screen = screens[entry.name] as ComponentType<typeof entry.params>;
    return <Screen key={entry.instanceId} {...entry.params} />;
  })}</>;
}
