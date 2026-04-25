import { EventBus } from './EventBus';

export interface DevControlPlugin {
  name: string;
  version: string;
  init(eventBus: EventBus): void;
}

export class PluginManager {
  private plugins: DevControlPlugin[] = [];

  constructor(private eventBus: EventBus) {}

  registerPlugin(plugin: DevControlPlugin) {
    this.plugins.push(plugin);
    console.log(`[PluginManager] Registered plugin: ${plugin.name} v${plugin.version}`);
  }

  loadPlugins() {
    console.log('[PluginManager] Loading plugins...');
    // In the future, this will auto-discover plugins from a /plugins directory or node_modules
    
    // Example: Registering a dummy built-in plugin
    this.registerPlugin({
      name: 'core-logger',
      version: '1.0.0',
      init: (bus: EventBus) => {
        bus.on('system:ready', (payload) => {
          console.log(`[CoreLogger] System is ready on port ${payload.port}`);
        });
      }
    });

    // Initialize all registered plugins
    for (const plugin of this.plugins) {
      try {
        plugin.init(this.eventBus);
      } catch (err) {
        console.error(`[PluginManager] Failed to initialize plugin ${plugin.name}:`, err);
      }
    }
  }
}
