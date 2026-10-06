'use client';

import * as React from 'react';
import { Store } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { Select } from '../components/form';
import type { Outlet } from './types';

interface OutletState {
  outlets: Outlet[];
  outlet: Outlet | null;
  outletId: string | null;
  setOutletId: (id: string) => void;
  loading: boolean;
}

const OutletContext = React.createContext<OutletState | null>(null);
const KEY = 'fg-outlet';

/** Current outlet for merchant screens; remembered per browser. */
export function OutletProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useApi<Outlet[]>('merchant/outlets');
  const [selected, setSelected] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setSelected(localStorage.getItem(KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const outlets = data ?? [];
  const outlet = outlets.find((o) => o.id === selected) ?? outlets[0] ?? null;
  const setOutletId = React.useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);
  const value = React.useMemo(
    () => ({ outlets, outlet, outletId: outlet?.id ?? null, setOutletId, loading: isLoading }),
    [outlets, outlet, setOutletId, isLoading],
  );
  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function useOutlet() {
  const ctx = React.useContext(OutletContext);
  if (!ctx) throw new Error('useOutlet must be used inside <OutletProvider>');
  return ctx;
}

export function OutletPicker() {
  const { outlets, outletId, setOutletId } = useOutlet();
  if (outlets.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <Store className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Outlet</span>
      <Select
        value={outletId ?? ''}
        onChange={(e) => setOutletId(e.target.value)}
        className="h-8 w-auto max-w-56"
      >
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
