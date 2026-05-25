/*
Tujuan: Merender gambar lokal/cloud secara aman, termasuk URL idb:// dari IndexedDB.
Caller: Halaman dan modal yang menampilkan foto patroli, insiden, kapal, user, dan onboarding.
Dependensi: React PureComponent dan imageStore IndexedDB.
Main Functions: Resolve source gambar async, tampilkan placeholder loading, dan render fallback saat gagal.
Side Effects: Membaca foto dari IndexedDB lokal tanpa menulis state aplikasi.
*/

import React from 'react';
import { loadImageFromDB } from '../utils/imageStore';

export default class AsyncImage extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      dataUrl: null,
      loading: true,
    };
    this._isMounted = false;
    this._resolveSeq = 0;
  }

  componentDidMount() {
    this._isMounted = true;
    this.resolveSource(this.props.src);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.src !== this.props.src) {
      this.resolveSource(this.props.src);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  async resolveSource(src) {
    if (!this._isMounted) return;
    const requestSeq = this._resolveSeq + 1;
    this._resolveSeq = requestSeq;
    const safeSrc = typeof src === 'string' ? src : '';

    if (!safeSrc) {
      this.setState({ dataUrl: null, loading: false });
      return;
    }

    if (!safeSrc.startsWith('idb://')) {
      this.setState({ dataUrl: safeSrc, loading: false });
      return;
    }

    this.setState({ dataUrl: null, loading: true });

    try {
      const result = await loadImageFromDB(safeSrc);
      if (!this._isMounted || this._resolveSeq !== requestSeq || this.props.src !== safeSrc) return;
      this.setState({ dataUrl: result, loading: false });
    } catch (error) {
      console.error('AsyncImage error:', error);
      if (!this._isMounted || this._resolveSeq !== requestSeq || this.props.src !== safeSrc) return;
      this.setState({ dataUrl: null, loading: false });
    }
  }

  render() {
    const { alt, className, fallbackLayout } = this.props;
    const { dataUrl, loading } = this.state;

    if (loading) {
      return (
        <div className={`animate-pulse bg-cyan-900/30 ${className || ''}`}>
          {fallbackLayout}
        </div>
      );
    }

    if (!dataUrl) {
      return fallbackLayout ? (
        <div className={className || ''}>{fallbackLayout}</div>
      ) : null;
    }

    return <img src={dataUrl} alt={alt || ''} className={className} />;
  }
}
