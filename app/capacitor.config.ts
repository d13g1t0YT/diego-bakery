import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pe.diegobakery.app',
  appName: 'Diego Bakery',
  webDir: 'dist',
  server: {
    url: 'https://diego-bakery-api-clean-production.up.railway.app/app/',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f8f7f4'
  }
};

export default config;
