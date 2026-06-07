import React, { useEffect, useMemo } from 'react';
import { Siren, MapPin, Map as MapIcon } from 'lucide-react';
import { useIncidents, useRole, useSOS, useUI } from '../../context/AppContextRuntime';
import { startSOSAlarm, stopSOSAlarm } from '../../utils/sosAudio';

function getSOSAlertTimestamp(alert) {
  const directTimestamp = (
    Number.isFinite(alert?.resolvedAtClientMs)
      ? alert.resolvedAtClientMs
      : Number.isFinite(alert?.updatedAtClientMs)
        ? alert.updatedAtClientMs
        : Number.isFinite(alert?.senderAcknowledgedAtClientMs)
          ? alert.senderAcknowledgedAtClientMs
          : Number.isFinite(alert?.occurredAtTrustedMs)
            ? alert.occurredAtTrustedMs
            : new Date(
              alert?.resolvedAt
              || alert?.updatedAt
              || alert?.senderAcknowledgedAt
              || alert?.triggeredAt
              || alert?.createdAt
              || '',
            ).getTime()
  );

  return Number.isFinite(directTimestamp) ? directTimestamp : 0;
}

function isActiveSOSAlert(alert) {
  return String(alert?.status || '').toLowerCase() !== 'resolved';
}

function isAlertTargetedToUser(alert, userId) {
  if (!alert || !userId) return false;
  if (alert.senderUserId === userId) return true;
  if (!Array.isArray(alert.targetUserIds)) return true;
  return alert.targetUserIds.includes(userId);
}

export default function SOSAlertModal() {
  const { activeSOSAlert, sosHistory, handleSOSConfirm, handleSOSAcknowledgeSelf } = useSOS();
  const { allIncidents, setSelectedIncident } = useIncidents();
  const { currentUserId } = useRole();
  const { setCurrentPage } = useUI();

  const displaySOSAlert = useMemo(() => {
    const dedupedAlerts = Array.from(
      [activeSOSAlert, ...(Array.isArray(sosHistory) ? sosHistory : [])]
        .filter(Boolean)
        .reduce((alertMap, alert) => {
          const existingAlert = alertMap.get(alert.id);
          if (!existingAlert || getSOSAlertTimestamp(alert) >= getSOSAlertTimestamp(existingAlert)) {
            alertMap.set(alert.id, alert);
          }
          return alertMap;
        }, new Map())
        .values(),
    )
      .filter((alert) => isActiveSOSAlert(alert))
      .sort((left, right) => getSOSAlertTimestamp(right) - getSOSAlertTimestamp(left));

    return dedupedAlerts.find((alert) => isAlertTargetedToUser(alert, currentUserId)) || null;
  }, [activeSOSAlert, currentUserId, sosHistory]);

  const isSender = Boolean(currentUserId && displaySOSAlert?.senderUserId === currentUserId);
  const isTargetedToMe = Boolean(currentUserId && (
    isSender
    || !Array.isArray(displaySOSAlert?.targetUserIds)
    || displaySOSAlert.targetUserIds.includes(currentUserId)
  ));
  const isConfirmedByMe = Boolean(currentUserId && (
    isSender
      ? displaySOSAlert?.senderAcknowledgedBy === currentUserId
      : displaySOSAlert?.confirmedBy?.includes(currentUserId)
  ));

  useEffect(() => {
    if (displaySOSAlert && isTargetedToMe && !isConfirmedByMe) {
      startSOSAlarm();
    } else {
      stopSOSAlarm();
    }
    
    return () => {
      stopSOSAlarm();
    };
  }, [displaySOSAlert, isConfirmedByMe, isTargetedToMe]);

  if (!displaySOSAlert || !isTargetedToMe || isConfirmedByMe) return null;

  const onConfirm = () => {
    if (isSender) {
      handleSOSAcknowledgeSelf(displaySOSAlert);
    } else {
      handleSOSConfirm(displaySOSAlert);
    }
    if (setCurrentPage) {
      setCurrentPage('incidents');
    }
    const matchedIncident = allIncidents.find((incident) => incident.id === displaySOSAlert?.id);
    if (matchedIncident) setSelectedIncident(matchedIncident);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/90 backdrop-blur-md p-4 animate-sos-flash">
      <div className="bg-slate-900 border-2 border-red-500 rounded-2xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(239,68,68,0.5)] overflow-hidden text-center scale-up-center">
        <div className="flex justify-center mb-6">
          <Siren className="w-20 h-20 text-red-500 animate-pulse" />
        </div>
        
        <h1 className="text-3xl font-black text-red-500 mb-2 tracking-widest">DARURAT SOS</h1>
        
        <div className="bg-slate-800/80 rounded-xl p-4 mb-6 text-left border border-red-500/20">
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Pengirim Sinyal</span>
            <div className="text-lg text-white font-bold">{displaySOSAlert.senderName}</div>
            <div className="text-sm text-red-400">{displaySOSAlert.senderRole}</div>
          </div>
          
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Lokasi / Kapal</span>
            <div className="text-lg text-white">{displaySOSAlert.shipName || 'Tidak Diketahui'}</div>
          </div>

          {displaySOSAlert.sosType ? (
            <div className="mb-3">
              <span className="text-xs text-slate-400 block uppercase tracking-wider">Perihal</span>
              <div className="text-sm text-red-300 font-semibold leading-snug">{displaySOSAlert.sosType}</div>
            </div>
          ) : null}
          
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Waktu Kejadian</span>
            <div className="text-md text-white">
              {new Date(displaySOSAlert.triggeredAt).toLocaleString('id-ID')}
            </div>
          </div>

          {(displaySOSAlert.lat && displaySOSAlert.lng) ? (
            <div className="mt-4 p-3 bg-slate-900 rounded-lg flex items-start gap-3 border border-slate-700 hover:border-slate-500 transition-colors">
              <MapPin className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm text-slate-300 font-mono mb-1">
                  {displaySOSAlert.lat}, {displaySOSAlert.lng}
                </div>
                <a 
                  href={`https://maps.google.com/?q=${displaySOSAlert.lat},${displaySOSAlert.lng}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-cyan-400 text-sm hover:underline flex items-center gap-1 font-medium"
                >
                  <MapIcon className="w-4 h-4" /> Buka di Google Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-slate-900 rounded-lg flex items-center gap-2 border border-slate-700">
              <MapPin className="w-5 h-5 text-slate-500 shrink-0" />
              <span className="text-sm text-slate-400 italic">Posisi GPS tidak tersedia</span>
            </div>
          )}
        </div>

        <button
          onClick={onConfirm}
          className="w-full py-4 text-xl font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-transform active:scale-[0.98]"
        >
          {isSender ? 'BUKA TEMUAN SOS' : 'TERIMA & MENGERTI'}
        </button>
      </div>
    </div>
  );
}
