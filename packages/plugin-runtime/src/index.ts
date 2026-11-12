import type { PluginManifest, PluginPermission } from '@wrgram/plugin-sdk';

export type PluginGrants = Record<string, PluginPermission[]>;

/** Control de capacidades para complementos propios. NO es un sandbox de código externo. */
export class PluginRuntime {
  private readonly manifests: Map<string, PluginManifest>;
  private grants: PluginGrants = {};

  constructor(manifests: readonly PluginManifest[], persistedGrants: unknown = {}) {
    this.manifests = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    if (this.manifests.size !== manifests.length) throw new Error('Hay identificadores de complementos duplicados.');
    if (!persistedGrants || typeof persistedGrants !== 'object' || Array.isArray(persistedGrants)) return;
    for (const manifest of manifests) {
      if (manifest.availability !== 'available') continue;
      const saved = Object.prototype.hasOwnProperty.call(persistedGrants, manifest.id)
        ? (persistedGrants as Record<string, unknown>)[manifest.id] : undefined;
      // Un cambio en los permisos del manifiesto requiere nuevo consentimiento.
      if (Array.isArray(saved) && saved.length === manifest.permissions.length &&
        new Set(saved).size === saved.length && manifest.permissions.every((permission) => saved.includes(permission))) {
        this.grants[manifest.id] = [...manifest.permissions];
      }
    }
  }

  enable(pluginId: string): void {
    const manifest = this.manifests.get(pluginId);
    if (!manifest || manifest.availability !== 'available') throw new Error('Complemento no disponible.');
    this.grants[pluginId] = [...manifest.permissions];
  }

  revoke(pluginId: string): void { delete this.grants[pluginId]; }

  isEnabled(pluginId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.grants, pluginId);
  }

  can(pluginId: string, permission: PluginPermission): boolean {
    return this.isEnabled(pluginId) && this.grants[pluginId].includes(permission);
  }

  require(pluginId: string, permission: PluginPermission): void {
    if (!this.can(pluginId, permission)) throw new Error(`Permiso no concedido: ${permission}`);
  }

  snapshot(): PluginGrants {
    return Object.fromEntries(Object.entries(this.grants).map(([id, permissions]) => [id, [...permissions]]));
  }
}
