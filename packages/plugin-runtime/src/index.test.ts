import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '@wrgram/plugin-sdk';
import { PluginRuntime } from './index';

describe('permisos de complementos', () => {
  it('no concede permisos por defecto', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS);
    expect(runtime.isEnabled('wrgram.notes')).toBe(false);
    expect(() => runtime.require('wrgram.notes', 'notes:write')).toThrow();
  });
  it('habilita únicamente los permisos declarados', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS);
    runtime.enable('wrgram.notes');
    expect(runtime.can('wrgram.notes', 'notes:write')).toBe(true);
    expect(runtime.can('wrgram.notes', 'composer:write')).toBe(false);
  });
  it('revoca los permisos inmediatamente', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS);
    runtime.enable('wrgram.notes');
    runtime.revoke('wrgram.notes');
    expect(runtime.can('wrgram.notes', 'notes:read')).toBe(false);
  });
  it('no instala complementos desconocidos ni planeados', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS);
    expect(() => runtime.enable('unknown')).toThrow();
    expect(() => runtime.enable('wrgram.workflows')).toThrow();
  });
  it('descarta permisos inyectados, antiguos o incompletos', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS, {
      'unknown': ['notes:read'],
      'wrgram.notes': ['notes:read', 'notes:write', 'composer:write'],
      'wrgram.quick-replies': ['notes:read'],
    });
    expect(runtime.snapshot()).toEqual({});
  });
  it('restaura concesiones válidas y no expone su estado mutable', () => {
    const runtime = new PluginRuntime(BUILTIN_PLUGINS, { 'wrgram.notes': ['notes:read', 'notes:write'] });
    const snapshot = runtime.snapshot();
    snapshot['wrgram.notes'].length = 0;
    expect(runtime.can('wrgram.notes', 'notes:read')).toBe(true);
  });
  it('tolera almacenamiento corrupto y rechaza duplicados', () => {
    expect(new PluginRuntime(BUILTIN_PLUGINS, null).snapshot()).toEqual({});
    expect(new PluginRuntime(BUILTIN_PLUGINS, []).snapshot()).toEqual({});
    expect(new PluginRuntime(BUILTIN_PLUGINS, { 'wrgram.notes': ['notes:read', 'notes:read'] }).snapshot()).toEqual({});
    expect(() => new PluginRuntime([...BUILTIN_PLUGINS, BUILTIN_PLUGINS[0]])).toThrow();
  });
});
