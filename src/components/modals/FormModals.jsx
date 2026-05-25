import React from 'react';
import { useShips, useUsers } from '../../context/AppContextRuntime';
import { ChevronDown, FileText, Upload, Save } from 'lucide-react';
import { detectDocumentType, getDocumentTypeLabel } from '../../utils/documentFiles';
import ShipFormView from '../views/ShipFormView';
import UserFormView from '../views/UserFormView';
import ShipDocumentFormView from '../views/ShipDocumentFormView';

export function ShipFormModal() {
  const { showShipForm } = useShips();
  const modalRef = React.useRef(null);
  if (!showShipForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <ShipFormView isInline={false} />
    </div>
  );
}

export function UserFormModal() {
  const { showUserForm } = useUsers();
  const modalRef = React.useRef(null);
  if (!showUserForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <UserFormView isInline={false} />
    </div>
  );
}

export function ShipDocumentFormModal() {
  const { showShipDocForm } = useShips();
  if (!showShipDocForm) return null;

  return (
    <ShipDocumentFormView isInline={false} />
  );
}
