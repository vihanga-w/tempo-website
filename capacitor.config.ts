import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.tempomusic.app',
  appName: 'Tempo.',
  webDir: 'out',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0D0D0E",
      showSpinner: false,
    }
  }
  // server: {
  //   url: 'http://192.168.5.10:3000',
  //   cleartext: true,
  // }
};

export default config;
