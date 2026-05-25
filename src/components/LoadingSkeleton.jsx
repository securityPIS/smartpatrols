import React from 'react';

export default function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="h-8 bg-cyan-900/30 rounded-xl w-1/2"></div>
      <div className="h-40 bg-cyan-900/20 rounded-2xl"></div>
      <div className="h-28 bg-cyan-900/20 rounded-xl"></div>
      <div className="h-28 bg-cyan-900/20 rounded-xl"></div>
      <div className="h-28 bg-cyan-900/20 rounded-xl"></div>
    </div>
  );
}
