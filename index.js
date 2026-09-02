// App entry point - registers the RN component with the native host
import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Silence noisy deprecation warning from draggable-flatlist internals
LogBox.ignoreLogs(['InteractionManager']);

import App from './App';

// Wires App into React Native's AppRegistry; works in Expo Go + native builds
registerRootComponent(App);
