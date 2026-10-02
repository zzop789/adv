import type { UIScreenParams } from '../contracts';
import type { UIHandle } from '../ui-manager';
import type { PlayerActions, PlayerSession, PlayerUIManager } from './types';

interface SettingsRequest {
  handle: UIHandle<UIScreenParams, 'settings'> | null;
  closeRequested: boolean;
  onClose(): void;
}

/** Each close callback belongs to the exact settings instance that created it. */
export class PlayerSettings {
  private request: SettingsRequest | null = null;
  private volume = Number.NaN;
  private disposed = false;

  constructor(
    private readonly ui: PlayerUIManager,
    private readonly session: PlayerSession,
    private readonly actions: PlayerActions,
  ) {}

  open(): void {
    if (this.disposed) return;
    this.volume = this.session.getSnapshot().playback.volume;
    const request: SettingsRequest = {
      handle: null,
      closeRequested: false,
      onClose: () => {
        if (request.handle) request.handle.close();
        else request.closeRequested = true;
      },
    };
    this.request = request;
    request.handle = this.ui.open('settings', this.props(request.onClose));
    if (request.closeRequested) request.handle.close();
    // Opening can synchronously change volume, replace the screen, or dispose this binding.
    if (!this.disposed && this.request === request) this.sync();
  }

  sync(): void {
    if (this.disposed) return;
    const volume = this.session.getSnapshot().playback.volume;
    const request = this.request;
    if (!request?.handle || volume === this.volume) return;
    this.volume = volume;
    if (!request.handle.update(this.props(request.onClose))) this.request = null;
  }

  dispose(): void {
    this.disposed = true;
    this.request = null;
  }

  private props(onClose: () => void): UIScreenParams['settings'] {
    return {
      volume: this.session.getSnapshot().playback.volume,
      onVolumeChange: (value) => this.session.setVolume(value),
      onFullscreen: this.actions.toggleFullscreen,
      onClose,
    };
  }
}
