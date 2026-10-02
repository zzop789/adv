import type { ComponentType, ReactNode, RefObject } from 'react';
import type { GameInfo, PlaybackActions, PlaybackSnapshot } from '../runtime/types';

export interface PlaybackScreenProps {
  title: string;
  status: PlaybackSnapshot['status'];
  error: string | null;
  onPlay(): void;
  onRetry(): void;
}

export interface ChoiceScreenProps {
  prompt: string;
  options: ReadonlyArray<{ id: string; label: string; description?: string }>;
  onChoose(optionId: string): void;
}

export interface EndingScreenProps {
  title: string;
  description: string;
  onRestart(): void;
}

export interface SettingsScreenProps {
  volume: number;
  onVolumeChange(value: number): void;
  onFullscreen(): void;
  onClose(): void;
}

/** Add another screen's props here, then register its component in the UI host. */
export interface UIScreenParams {
  playback: PlaybackScreenProps;
  choice: ChoiceScreenProps;
  ending: EndingScreenProps;
  settings: SettingsScreenProps;
}

export interface WorkLayoutProps {
  game: GameInfo;
  playback: PlaybackSnapshot;
  storyKind: 'video' | 'choice' | 'end';
  actions: PlaybackActions & { togglePlayback(): void };
  videoHostRef: RefObject<HTMLDivElement | null>;
  slots: { playback: ReactNode; story: ReactNode; modal: ReactNode };
  openSettings(): void;
}

/** Work screens are ordinary components: they can also be rendered directly with props. */
export interface WorkUI {
  Layout: ComponentType<WorkLayoutProps>;
  screens: {
    playback: ComponentType<PlaybackScreenProps>;
    choice: ComponentType<ChoiceScreenProps>;
    ending: ComponentType<EndingScreenProps>;
    settings?: ComponentType<SettingsScreenProps>;
  };
}
