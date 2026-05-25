import React from "react";
import { Camera, Trash2, X } from "lucide-react";
import { readImageFileAsDataUrl } from "../utils/images";

const badgeToneClasses = {
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  danger: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  neutral: "border-slate-700 bg-slate-900/70 text-slate-300",
};

export function StatusPill({ tone = "info", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeToneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function SectionHeading({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-cyan-300">
          <Icon className="h-4 w-4" />
          <p className="text-xs font-bold uppercase tracking-[0.28em]">{title}</p>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ModalShell({ title, subtitle, onClose, children, actions, maxWidth = "max-w-3xl" }) {
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className={`mx-auto flex h-full w-full ${maxWidth} flex-col overflow-hidden rounded-[28px] border border-cyan-500/20 bg-slate-950 soft-outline`}>
        <div className="flex items-start justify-between gap-4 border-b border-cyan-500/10 bg-slate-950/95 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-400">{subtitle}</p>
            <h3 className="mt-1 text-xl font-bold text-slate-50">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
        {actions ? <div className="border-t border-cyan-500/10 bg-slate-950/95 px-5 py-4 md:px-6">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.26em] text-cyan-300">{label}</span>
        {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function UploadField({ label, hint, previewUrl, onPick, onClear, accent = "cyan" }) {
  const accentClasses =
    accent === "warning"
      ? "border-amber-400/25 bg-amber-400/8 text-amber-200"
      : accent === "success"
        ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
        : "border-cyan-400/25 bg-cyan-400/8 text-cyan-200";

  const actionClasses =
    accent === "warning"
      ? "border-amber-400/30 hover:border-amber-300/50 hover:text-amber-100"
      : accent === "success"
        ? "border-emerald-400/30 hover:border-emerald-300/50 hover:text-emerald-100"
        : "border-cyan-400/30 hover:border-cyan-300/50 hover:text-cyan-100";

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      onPick({ url: dataUrl, name: file.name });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Gagal memproses gambar.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className={`rounded-3xl border p-4 ${accentClasses}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold">{label}</p>
          <p className="mt-1 text-xs text-slate-400">{hint}</p>
        </div>
        {previewUrl ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-rose-400/30 bg-rose-400/10 p-2 text-rose-200 transition hover:border-rose-300/50 hover:text-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="h-44 w-full rounded-2xl border border-white/10 object-cover" />
        ) : (
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-sm font-semibold transition ${actionClasses}`}
          >
            <Camera className="h-4 w-4" />
            <span>Pilih Foto Lokal</span>
            <input type="file" accept="image/*" className="sr-only" onChange={handleChange} />
          </label>
        )}
      </div>
    </div>
  );
}
