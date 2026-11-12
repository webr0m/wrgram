import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

// Pila de diálogos: solo el último responde a Escape ni al botón atrás de Android, así un panel
// abierto sobre otro no se cierra con las dos capas a la vez.
type Overlay = { close(): void };
const stack: Overlay[] = [];

export const overlayCount = () => stack.length;
export const isTopOverlay = (overlay: Overlay) => stack[stack.length - 1] === overlay;

export function registerOverlay(overlay: Overlay): () => void {
    stack.push(overlay);
    return () => { const index = stack.lastIndexOf(overlay); if (index >= 0) stack.splice(index, 1); };
}

/** Devuelve false solo si no había ningún panel abierto: entonces el llamador decide qué hacer. */
export function closeTopOverlay(): boolean {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
}

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[href],[tabindex]:not([tabindex="-1"])';

/** Escape, trampa de foco, foco inicial al abrir y devolución del foco al cerrar. */
export function useDialog(ref: RefObject<HTMLElement | null>, close: () => void): void {
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        const overlay: Overlay = { close: () => closeRef.current() };
        const unregister = registerOverlay(overlay);
        const section = ref.current;
        const previous = document.activeElement as HTMLElement | null;
        // Un campo con autoFocus ya tomó el foco al montar: quitárselo empeoraría el teclado.
        if (section && !section.contains(document.activeElement)) {
            (section.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? section).focus();
        }
        const key = (event: KeyboardEvent) => {
            if (!isTopOverlay(overlay) || event.isComposing) return;
            if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
            if (event.key !== 'Tab' || !section) return;
            const items = [...section.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (!items.length) { event.preventDefault(); section.focus(); return; }
            const active = document.activeElement;
            const atStart = active === items[0] || active === section || !section.contains(active);
            if (event.shiftKey && atStart) { event.preventDefault(); items[items.length - 1].focus(); }
            else if (!event.shiftKey && (active === items[items.length - 1] || !section.contains(active))) { event.preventDefault(); items[0].focus(); }
        };
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('keydown', key);
            unregister();
            if (previous?.isConnected) previous.focus();
        };
    }, []);
}

export function Modal({ title, children, close, className = '' }: { title: string; children: ReactNode; close(): void; className?: string }) {
    const ref = useRef<HTMLElement>(null);
    useDialog(ref, close);
    return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
        <section ref={ref} tabIndex={-1} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
            <header><h2>{title}</h2><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar" onClick={close}><X size={20}/></button></header>
            {children}
        </section>
    </div>;
}
