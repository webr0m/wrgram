import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MobileNavigation, type NavigationPage } from './MobileNavigation';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const render=(page:NavigationPage,extra:Record<string,unknown>={})=>renderToStaticMarkup(createElement(MobileNavigation,{
  page,account:createElement('span',{className:'mobile-account-avatar'},'A'),navigate:()=>{},openAccount:()=>{},t:text=>text,...extra,
}));

describe('barra móvil con cápsula de Telegram',()=>{
  it('preserves the four WRGram actions without adding unconnected destinations',()=>{
    const html=render('chats');
    expect(html.match(/<button /g)).toHaveLength(4);
    for(const label of ['Chats','Complementos','WR IA','Abrir menú de usuario'])expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('Llamadas');
  });
  it('moves one shared indicator rather than changing icon dimensions',()=>{
    for(const [index,page] of (['chats','plugins','assistant','settings'] as const).entries()){
      const html=render(page);
      expect(html).toContain(`--nav-index:${index}`);
      expect(html.match(/ selected"/g)).toHaveLength(1);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    }
  });
  it('identifies the account dialog and highlights it when open',()=>{
    const html=render('chats',{accountOpen:true});
    expect(html).toContain('--nav-index:3');
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="true"');
    expect(render('chats')).toContain('aria-expanded="false"');
  });
  it('bounds the visual unread badge while keeping the full accessible count',()=>{
    expect(render('chats',{unread:125})).toContain('aria-label="Chats (125)"');
    expect(render('chats',{unread:125})).toContain('>99+</span>');
    expect(render('chats')).not.toContain('class="mobile-nav-badge"');
  });
  it('supports the saved side layout, safe areas and reduced motion',()=>{
    expect(render('chats',{side:true})).toContain('mobile-nav mobile-nav-side');
    const css=source('./mobile-navigation.css');
    expect(css).toContain('var(--inset-bottom,env(safe-area-inset-bottom,0px))');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
    expect(css).toContain('@media(forced-colors:active)');
    expect(css).toContain('.mobile-nav-side .mobile-nav-indicator{display:none}');
    expect(source('./main.tsx')).toContain("import './mobile-navigation.css'");
  });
});

describe('integración visual de Mini Apps / Group Butler',()=>{
  const host=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MiniAppActivity.java');
  it('keeps the actual registered bot identity and resolves Mini Apps through Telegram',()=>{
    expect(source('./builtInApps.ts')).toContain("username:'GroupButlerEsp_bot'");
    const bridge=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
    expect(bridge).toContain('new TdApi.GetMainWebApp(');
    expect(bridge).toContain('BuiltInApps.require(id)');
  });
  it('colors the bottom container without overwriting the primary button tint',()=>{
    const method=host.slice(host.indexOf('private void setMiniAppBottomBar('),host.indexOf('private void showMiniAppPopup('));
    expect(method).toContain('bottomBar.setBackgroundColor(value)');
    expect(method).not.toContain('mainButton.setBackgroundTintList');
    expect(host).toContain('bottomBar.addView(mainButton)');
    expect(host).toContain('bottomBar.addView(secondaryButton)');
    expect(host).toContain('bottomBar.setPadding(0,0,0,safeBottom)');
  });
});
