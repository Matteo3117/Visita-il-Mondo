// src/components/WorldMap.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as d3Geo from 'd3-geo'; // Renamed d3 to d3Geo to avoid conflict with d3-zoom's d3
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import * as topojson from 'topojson-client';
import { getIt } from '../utils/countriesIT';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export default function WorldMap({ countriesData = {}, onCountryClick, selectedCountry, activeTab }) {
  const [geographies, setGeographies] = useState([]);
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const [transform, setTransform] = useState(zoomIdentity);
  const svgRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    fetch(geoUrl)
      .then(res => res.json())
      .then(worldData => {
        if (!isMounted) return;
        const features = topojson.feature(worldData, worldData.objects.countries).features;
        setGeographies(features);
      })
      .catch(err => console.error("Error loading map data:", err));
      
    return () => { isMounted = false; };
  }, []);

  // Inizializzazione Logica Zoom
  useEffect(() => {
    if (!svgRef.current || geographies.length === 0) return;
    
    const svg = select(svgRef.current);
    
    const zoomBehavior = zoom()
      .scaleExtent([1, 8]) // Zoom Minimo 1x, Massimo 8x
      .translateExtent([[0, 0], [800, 500]]) // Bordi fisici panning costretti al box base
      .on('zoom', (event) => {
        setTransform(event.transform);
      });
      
    svg.call(zoomBehavior);
    
    // Per reimpostare lo zoom dal tastino Reset in basso agganciamo il behavior al DOM Natively
    svg.node().__zoomBehavior = zoomBehavior;

    return () => {
      svg.on('.zoom', null); 
    };
  }, [geographies.length]);

  const projection = useMemo(() => {
    return d3Geo.geoMercator()
      .scale(130)
      .translate([400, 300]);
  }, []);

  const pathGenerator = d3Geo.geoPath().projection(projection);

  if (!geographies.length) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-slate-800/50 backdrop-blur-md rounded-3xl text-slate-400 font-bold animate-pulse shadow-xl border border-slate-700">
        Caricamento Mappa Vettoriale...
      </div>
    );
  }

  const isVisitedCtx = activeTab === 'visited';

  // Helper per resettare la mappa a scala 1x nativa e [0,0] coordinates con Transizione
  const handleResetZoom = (e) => {
     e.stopPropagation();
     if (svgRef.current) {
         const svg = select(svgRef.current);
         svg.transition().duration(750)
            .call(svg.node().__zoomBehavior.transform, zoomIdentity);
     }
  };

  return (
    <div className={`w-full h-full min-h-[300px] sm:min-h-[400px] max-w-5xl mx-auto border bg-slate-900/60 backdrop-blur-xl rounded-[2.5rem] overflow-hidden shadow-2xl flex items-center justify-center p-2 sm:p-4 relative transition-all duration-700 ease-in-out ${isVisitedCtx ? 'border-emerald-900/50 shadow-[0_0_50px_rgba(16,185,129,0.06)]' : 'border-orange-900/50 shadow-[0_0_50px_rgba(249,115,22,0.06)]'}`}>
      
      {/* Tasto Reset Zoom Floatante */}
      {transform.k > 1 && (
         <button 
           onClick={handleResetZoom}
           className={`absolute bottom-6 left-6 z-20 bg-slate-800/90 backdrop-blur-md text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 ${isVisitedCtx ? 'hover:border-emerald-500/50 border-emerald-900/30' : 'hover:border-orange-500/50 border-orange-900/30'}`}
         >
           📍 Ripristina Vista
         </button>
      )}

      {/* Suggerimento visivo per l'utente elegante nell'angolo */}
      {transform.k === 1 && (
         <div className="absolute top-4 right-6 z-10 text-[10px] uppercase tracking-widest font-black text-slate-500/50 pointer-events-none transition-opacity">
           Scroll Navigazione Mappa Attivo
         </div>
      )}

      {/* CSS CSS CSS: Animazioni Fluide DARK MODE, Stroke proporzionali allo zoom */}
      <style>
        {`
          .map-path { transition: fill 0.3s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.2s ease, stroke 0.3s ease; cursor: pointer; outline: none; }
          .path-visited:hover { fill: #059669 !important; stroke: #047857 !important; stroke-width: ${1.5 / transform.k}px !important; } /* Smeraldo 600 */
          .path-wishlist:hover { fill: #ea580c !important; stroke: #c2410c !important; stroke-width: ${1.5 / transform.k}px !important; } /* Arancio 600 */
          .path-neutral:hover { fill: #334155 !important; stroke: #1e293b !important; stroke-width: ${1 / transform.k}px !important; } /* Slate 700 */
          .svg-map-wrapper { cursor: grab; }
          .svg-map-wrapper:active { cursor: grabbing; }
        `}
      </style>

      <svg ref={svgRef} viewBox="0 0 800 500" className="w-full h-auto pointer-events-auto svg-map-wrapper">
        <g transform={transform.toString()}>
          {geographies.map((geo, i) => {
            const countryName = geo.properties.name || `Unknown-${i}`;
            const dataObj = countriesData[countryName] || {};
            
            const isMarked = isVisitedCtx ? dataObj.isVisited : dataObj.isWishlist;
            const isSelected = selectedCountry === countryName;

            let fillColor = "#1e293b"; // Slate 800 - Colore nazione Base SCURO
            let hoverClass = "path-neutral";
            
            // Colore Bordo per base Mappa (Dark minimal)
            let strokeColor = isSelected ? (isVisitedCtx ? "#047857" : "#c2410c") : "#0f172a"; // Bordo Slate 900 se non marcato
            
            // SEGRETO TECNICO: Scaliamo lo spessore del bordo inversamente allo zoom per non avere pixel giganti quando zoomiamo l'Europa!
            let strokeWidth = isSelected ? (2 / transform.k) : (0.6 / transform.k); 

            // Se il paese è colorato
            if (isMarked) {
              if (isVisitedCtx) {
                 fillColor = "#10b981"; // Emerald 500
                 hoverClass = "path-visited";
                 strokeColor = "#047857"; // Bordo Emerald
              } else {
                 fillColor = "#f97316"; // Orange 500
                 hoverClass = "path-wishlist";
                 strokeColor = "#c2410c"; 
              }
              strokeWidth = isSelected ? (2.5 / transform.k) : (1 / transform.k);
            }

            if (isSelected) {
              // Override React fillColor evidenziato per DARK MODE
              if (isVisitedCtx) {
                 fillColor = isMarked ? "#34d399" : "#475569"; // Emerald brillante o Slate focus
              } else {
                 fillColor = isMarked ? "#fb923c" : "#475569"; // Orange brillante
              }
            }

            return (
              <path
                key={`path-${i}`}
                d={pathGenerator(geo)}
                fill={fillColor}
                stroke={strokeColor} 
                strokeWidth={strokeWidth}
                className={`map-path ${hoverClass}`}
                onClick={(e) => {
                  setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                  onCountryClick && onCountryClick(countryName);
                }}
                onMouseEnter={(e) => { 
                  setTooltip({ show: true, content: getIt(countryName), x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                }}
                onMouseLeave={() => { 
                  setTooltip(prev => ({ ...prev, show: false }));
                }}
              />
            );
          })}
        </g>
      </svg>
      
      {/* Tooltip fluttuante (Native Dark Glassmorphism) */}
      {tooltip.show && (
        <div 
          className="fixed pointer-events-none z-50 bg-slate-950/90 backdrop-blur-md border border-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-2xl transform -translate-x-1/2 -translate-y-[150%] transition-all duration-75"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
