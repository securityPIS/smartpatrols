import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    console.error("Chunk aplikasi gagal dimuat", event);
    event.preventDefault();

    if (navigator.onLine !== true) {
      return;
    }

    const latestUrl = new URL(window.location.href);
    latestUrl.searchParams.set("_chunkfix", Date.now().toString());
    window.location.replace(latestUrl.toString());
  });
}

class AppBootBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "App gagal dimuat",
    };
  }

  componentDidCatch(error, info) {
    console.error("App boot failed", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070b19] text-cyan-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[2rem] border border-cyan-800/50 bg-[#0b1229] p-6 text-center shadow-[0_0_30px_rgba(6,182,212,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-500">SmartPatrol</p>
            <h1 className="mt-3 text-2xl font-black text-white">Aplikasi Sedang Memuat Ulang</h1>
            <p className="mt-3 text-sm leading-relaxed text-cyan-200/75">
              Terjadi gangguan saat memuat tampilan awal. Silakan refresh sekali lagi. Jika masih berulang, console browser sekarang akan menampilkan error yang lebih jelas.
            </p>
            {this.state.errorMessage ? (
              <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-left text-xs text-rose-100/90">
                {this.state.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppBootBoundary>
    <App />
  </AppBootBoundary>,
);
