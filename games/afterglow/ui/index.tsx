import type { WorkUI } from '../../../src/ui/contracts';
import Layout from './Layout';
import PlaybackScreen from './screens/PlaybackScreen';
import ChoiceScreen from './screens/ChoiceScreen';
import EndingScreen from './screens/EndingScreen';

export default {
  Layout,
  screens: { playback: PlaybackScreen, choice: ChoiceScreen, ending: EndingScreen },
} satisfies WorkUI;
