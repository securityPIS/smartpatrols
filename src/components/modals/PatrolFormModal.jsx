import React from 'react';
import { usePatrol } from '../../context/AppContextRuntime';
import PatrolFormView from '../views/PatrolFormView';

export default function PatrolFormModal() {
  const { activePatrolItem, activePatrolState } = usePatrol();
  const modalRef = React.useRef(null);
  
  if (!activePatrolItem || !activePatrolState) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070b19]/90 backdrop-blur-sm p-4 animate-in fade-in lg:hidden">
      <div ref={modalRef} className="w-full max-w-md h-full max-h-[85vh] flex flex-col">
        <PatrolFormView isInline={false} />
      </div>
    </div>
  );
}
