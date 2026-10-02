import { Button, Dialog, Slider } from '../../ui-base';
import type { SettingsScreenProps } from '../contracts';

/** A standalone screen: props in, user callbacks out, with no session or file access. */
export function SettingsScreen({ volume, onVolumeChange, onFullscreen, onClose }: SettingsScreenProps) {
  return <Dialog title="播放设置" onClose={onClose} closeLabel="关闭设置" className="adv-settings-screen">
    <label className="adv-settings-volume">音量
      <Slider label="设置音量" value={volume} min={0} max={1} step={0.01}
        valueText={`${Math.round(volume * 100)}%`} onValueChange={onVolumeChange} />
      <output>{Math.round(volume * 100)}%</output>
    </label>
    <Button onClick={onFullscreen}>切换全屏显示</Button>
    <p className="adv-settings-note">关闭设置后返回原来的播放位置。</p>
  </Dialog>;
}
