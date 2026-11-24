export type ReadDateResult =
  | { state: 'read'; date: number }
  | { state: 'unread' | 'tooOld' | 'userRestricted' | 'myRestricted' };

export type MessageViewer = { id: string; name: string; date: number };
export type MessageViewersResult = { viewers: MessageViewer[] };

export type ReadReceiptScope = { account: string; chat: string; topic: number };

function sameScope(left: ReadReceiptScope, right: ReadReceiptScope): boolean {
  return left.account === right.account && left.chat === right.chat && left.topic === right.topic;
}

export function createReadReceiptFlow<Result, Dialog>(deps: {
  scope: () => ReadReceiptScope;
  current: () => Dialog | undefined;
  show: (dialog: Dialog) => void;
  clear: () => void;
}) {
  let generation = 0;
  let owned: Dialog | undefined;
  const show = (dialog: Dialog) => { owned = dialog; deps.show(dialog); };
  const clear = () => {
    if (deps.current() === owned) deps.clear();
    owned = undefined;
  };
  const open = (load: () => Promise<Result | undefined>, loading: Dialog, loaded: (result: Result) => Dialog, failed: (retry: () => void) => void) => {
    const origin = deps.scope();
    const attempt = () => {
      if (!sameScope(deps.scope(), origin)) { clear(); return; }
      const ticket = ++generation;
      const fail = () => {
        if (ticket !== generation || deps.current() !== loading || !sameScope(deps.scope(), origin)) return;
        failed(attempt);
        owned = deps.current();
      };
      show(loading);
      void load().then(result => {
        if (ticket !== generation || deps.current() !== loading) return;
        if (!sameScope(deps.scope(), origin)) { clear(); return; }
        if (result === undefined) fail();
        else show(loaded(result));
      }, fail);
    };
    attempt();
  };
  open.invalidate = () => { generation++; clear(); };
  return open;
}

export function readDateLabel(result: ReadDateResult, format: (seconds: number) => string): string {
  switch (result.state) {
    case 'read': return `Leído el ${format(result.date)}.`;
    case 'unread': return 'Aún no lo ha leído.';
    case 'tooOld': return 'El mensaje es demasiado antiguo para consultar su lectura.';
    case 'userRestricted': return 'La otra persona oculta su hora de lectura.';
    case 'myRestricted': return 'Tu ajuste de privacidad impide consultar esta hora de lectura.';
  }
}
