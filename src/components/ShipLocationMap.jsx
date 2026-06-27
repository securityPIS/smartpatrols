import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Pusat default peta: sekitar perairan Indonesia (Laut Jawa) saat belum ada titik kapal.
const DEFAULT_CENTER = [-2.5, 118.0];
const DEFAULT_ZOOM = 4;
const SINGLE_POINT_ZOOM = 13;

// Marker memakai divIcon (SVG inline) supaya tidak bergantung pada aset gambar default
// Leaflet yang sering hilang setelah dibundel Vite (icon 404 di WebView Capacitor).
function createShipIcon() {
  return L.divIcon({
    className: 'ship-location-marker',
    html: `
      <span class="ship-location-pin">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path fill="#22d3ee" stroke="#0e7490" stroke-width="1.2"
            d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.6" fill="#0b1229" />
        </svg>
      </span>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPopupHtml(position) {
  const name = escapeHtml(position.ship || 'Tanpa Kapal');
  const coordLabel = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
  const timeLabel = position.capturedLabel ? escapeHtml(position.capturedLabel) : 'Waktu tidak diketahui';
  return `
    <div class="ship-location-popup">
      <strong>${name}</strong>
      <span>${escapeHtml(coordLabel)}</span>
      <span>${timeLabel}</span>
    </div>
  `;
}

export default function ShipLocationMap({ positions = [] }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const markerLayerRef = React.useRef(null);
  const iconRef = React.useRef(null);

  // Inisialisasi peta sekali saja.
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    iconRef.current = createShipIcon();
    mapRef.current = map;

    // Kontainer kadang baru mendapat ukuran final setelah layout selesai.
    const invalidateTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => {
      window.clearTimeout(invalidateTimer);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      iconRef.current = null;
    };
  }, []);

  // Render ulang marker setiap posisi berubah.
  React.useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();

    if (positions.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const latLngs = [];
    positions.forEach((position) => {
      const marker = L.marker([position.lat, position.lng], { icon: iconRef.current });
      marker.bindPopup(buildPopupHtml(position));
      marker.bindTooltip(position.ship || 'Tanpa Kapal', {
        direction: 'top',
        offset: [0, -24],
      });
      marker.addTo(markerLayer);
      latLngs.push([position.lat, position.lng]);
    });

    if (latLngs.length === 1) {
      map.setView(latLngs[0], SINGLE_POINT_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(latLngs).pad(0.2), { maxZoom: 14 });
    }
  }, [positions]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="ship-location-map h-full w-full overflow-hidden rounded-[1.4rem] border border-cyan-800/50"
        role="application"
        aria-label="Peta posisi terakhir kapal"
      />
    </div>
  );
}
