import React from 'react';
import { useIncidents } from '../../context/AppContextRuntime';
import IncidentDetailView from '../views/IncidentDetailView';

export default function IncidentDetailModal() {
  const { selectedIncident } = useIncidents();
  const modalRef = React.useRef(null);
  
  if (!selectedIncident) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <IncidentDetailView isInline={false} />
    </div>
  );
}
