// Stands in for @provablehq/aleo-wallet-adaptor-react-ui: "show the wallet modal" opens NEAR Connect's wallet list.
import { useCallback, useState, type ReactNode } from 'react';
import { openWalletModal } from '../near-wallet';

export function WalletModalProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function useWalletModal(): { visible: boolean; setVisible: (open: boolean) => void } {
  const [visible, setVisibleState] = useState(false);
  const setVisible = useCallback((open: boolean) => {
    setVisibleState(open);
    if (open) openWalletModal().catch((err) => console.error('[wallet] could not open the NEAR wallet modal', err));
  }, []);
  return { visible, setVisible };
}
