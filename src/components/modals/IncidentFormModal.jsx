import React from 'react';
import { useIncidents } from '../../context/AppContextRuntime';
import IncidentFormView from '../views/IncidentFormView';

export default function IncidentFormModal() {
  const { showIncidentModal } = useIncidents();
  const modalRef = React.useRef(null);
  if (!showIncidentModal) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <IncidentFormView isInline={false} />
    </div>
  );
}
