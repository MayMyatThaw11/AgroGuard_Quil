import React, { useState } from 'react';
import type { RouteStop } from '../../lib/farmmap/engine/engineTypes.ts';
import { useT } from '../../lib/i18n.ts';
import { AqTabs } from '../aq/aqLayout.tsx';
import { BuyerBoard, type BuyerPlace } from './BuyerBoard.tsx';
import { DetailSection } from './detailParts.tsx';
import { SupplySearch } from './SupplySearch.tsx';

type Tab = 'find' | 'orders';

export const BuyerMapShell: React.FC<{ place: BuyerPlace; onDirections: (from: RouteStop, to: RouteStop) => void }> = ({ place, onDirections }) => {
  const t = useT();
  const [tab, setTab] = useState<Tab>('find');
  return (
    <div className="aq-fm-mk" data-ui-panel="buyer-shell">
      <DetailSection className="is-head">
        <AqTabs<Tab> value={tab} label={t('farmMap.buyer.title')} onChange={setTab} items={[{ value: 'find', label: t('farmMap.supply.tabFind') }, { value: 'orders', label: t('farmMap.supply.tabOrders') }]} />
      </DetailSection>
      {tab === 'find' ? <SupplySearch place={place} /> : <BuyerBoard place={place} onDirections={onDirections} />}
    </div>
  );
};
