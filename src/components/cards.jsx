import React, { memo } from "react";
import { ChevronRight } from "lucide-react";
import { createPosterDataUrl } from "../data/defaultData";
import { formatDateTime, formatTime } from "../utils/formatters";
import { StatusPill } from "./ui";

export const CheckpointCard = memo(function CheckpointCard({ item, onAction, onPreview, onOpenDetail }) {
  if (item.status === "completed") {
    const isIncident = item.resultType === "temuan";

    return (
      <button
        type="button"
        onClick={() => onOpenDetail(item.id)}
        className={`content-auto w-full rounded-[26px] border p-4 text-left transition hover:-translate-y-0.5 ${
          isIncident ? "border-amber-400/30 bg-amber-400/8" : "border-emerald-400/30 bg-emerald-400/8"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className={`truncate text-lg font-bold ${isIncident ? "text-amber-200" : "text-emerald-200"}`}>{item.name}</p>
              <StatusPill tone={isIncident ? "warning" : "success"}>{isIncident ? "Temuan" : "Aman"}</StatusPill>
            </div>
            <p className="mt-2 text-sm text-slate-300">{item.completedBy} • {formatTime(item.completedAt)}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-400">{item.kejadian || "Laporan patroli tersimpan."}</p>
          </div>
          <div className="flex items-center gap-2">
            {item.photoUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview(item.photoUrl);
                }}
                className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10"
              >
                <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
              </button>
            ) : null}
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="content-auto rounded-[26px] border border-cyan-500/14 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-bold text-slate-50">{item.name}</p>
          <p className="mt-1 text-sm text-slate-500">Belum ada laporan tersimpan untuk titik ini.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction(item.id, "aman")}
            className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-200 transition hover:border-emerald-300/50 hover:text-white"
          >
            Aman
          </button>
          <button
            type="button"
            onClick={() => onAction(item.id, "temuan")}
            className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-200 transition hover:border-amber-300/50 hover:text-white"
          >
            Temuan
          </button>
        </div>
      </div>
    </div>
  );
});

export const IncidentCard = memo(function IncidentCard({ incident, meta, onOpen }) {
  const isClosed = meta?.status === "closed";

  return (
    <button
      type="button"
      onClick={() => onOpen(incident.id)}
      className={`content-auto w-full rounded-[26px] border p-4 text-left transition hover:-translate-y-0.5 ${
        isClosed ? "border-slate-800 bg-slate-900/65" : "border-amber-400/25 bg-amber-400/8"
      }`}
    >
      <div className="flex gap-4">
        <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${isClosed ? "bg-slate-600" : incident.source === "patrol" ? "bg-emerald-400" : "bg-amber-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-lg font-bold ${isClosed ? "text-slate-300" : "text-amber-200"}`}>{incident.location}</p>
            <StatusPill tone={isClosed ? "neutral" : "warning"}>{isClosed ? "Closed" : incident.source === "patrol" ? "Dari patroli" : "Manual"}</StatusPill>
          </div>
          <p className="mt-2 text-sm text-slate-300">{formatDateTime(incident.reportedAt)} • {incident.reportedBy}</p>
          <p className="mt-2 line-clamp-2 text-sm text-slate-400">{incident.deskripsi || "Belum ada deskripsi."}</p>
        </div>
        {incident.photoUrl ? (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10">
            <img src={incident.photoUrl} alt={incident.location} className="h-full w-full object-cover" />
          </div>
        ) : null}
      </div>
    </button>
  );
});

export const UserCard = memo(function UserCard({ user, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(user)}
      className="content-auto flex w-full items-center gap-4 rounded-[26px] border border-cyan-500/14 bg-slate-900/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/30"
    >
      <img src={user.photoUrl || createPosterDataUrl(user.name.slice(0, 2).toUpperCase(), user.name, 0, true)} alt={user.name} className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-lg font-bold text-slate-50">{user.name}</p>
          <StatusPill tone={user.status === "active" ? "success" : "neutral"}>{user.status === "active" ? "On duty" : "Off duty"}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-cyan-200">{user.role} • {user.type}</p>
        <p className="mt-2 text-sm text-slate-400">{user.shipAssigned ? `Tugas aktif: ${user.shipAssigned}` : "Belum ada penugasan aktif."}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-500" />
    </button>
  );
});

export const ShipCard = memo(function ShipCard({ ship, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ship)}
      className="content-auto flex w-full gap-4 overflow-hidden rounded-[28px] border border-cyan-500/14 bg-slate-900/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/30"
    >
      <img src={ship.photoUrl} alt={ship.name} className="h-28 w-28 rounded-[22px] border border-white/10 object-cover" />
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-bold text-slate-50">{ship.name}</p>
          <StatusPill tone={ship.status === "UPP" ? "info" : "neutral"}>{ship.status}</StatusPill>
        </div>
        <p className="mt-2 text-sm text-cyan-200">{ship.type}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-400">
          <span>{ship.personnel.length} personel aktif</span>
          <span>{ship.customCheckpoints.length} titik inspeksi</span>
        </div>
      </div>
    </button>
  );
});
