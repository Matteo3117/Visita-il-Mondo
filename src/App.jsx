import { useState, useEffect } from 'react';
import WorldMap from './components/WorldMap';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getIt, getApiCountryName } from './utils/countriesIT';
import it from 'date-fns/locale/it';

registerLocale('it', it);

function App() {
  const [countriesData, setCountriesData] = useState(() => {
    const saved = localStorage.getItem('countriesData');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        
        // V4 -> V5 Migration
        if (Object.values(parsed).some(v => v.status !== undefined) || Array.isArray(parsed)) {
           const migrated = {};
           if(Array.isArray(parsed)) {
              parsed.forEach(c => migrated[c] = { isVisited: true, visitedCities: [], isWishlist: false, wishlistCities: [] });
           } else {
              for (const [key, val] of Object.entries(parsed)) {
                 migrated[key] = {
                    isVisited: val.status === 'visited',
                    visitedCities: val.status === 'visited' ? [...(val.cities || [])] : [],
                    isWishlist: val.status === 'wishlist',
                    wishlistCities: val.status === 'wishlist' ? [...(val.cities || [])] : [],
                 };
              }
           }
           parsed = migrated;
        }
        
        // V5 -> V7 Standardized Migration
        const migratedSafe = {};
        for (const [key, val] of Object.entries(parsed)) {
            const migrateObj = (c) => {
               if (typeof c === 'string') return { name: c, startDate: '', endDate: '' };
               if (c.date !== undefined) return { name: c.name, startDate: c.date, endDate: '' }; 
               return c;
            };
            migratedSafe[key] = {
                 ...val,
                 visitedCities: (val.visitedCities || []).map(migrateObj),
                 wishlistCities: (val.wishlistCities || []).map(migrateObj),
                 totalCities: val.totalCities || 0
            };
        }
        return migratedSafe;
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  // NUOVO DB AEROPORTI SALVATI GLOBALE (Decoupled dalla mappa)
  const [globalAirports, setGlobalAirports] = useState(() => {
     const saved = localStorage.getItem('globalAirportsLogs');
     if (saved) return JSON.parse(saved);
     return { visited: [], wishlist: [] };
  });

  const [viewMode, setViewMode] = useState('map'); // 'map' oppure 'flightlog'
  const [activeTab, setActiveTab] = useState('visited'); 

  // --- STATO FLIGHT LOG (AEROPORTI) ---
  const [airportsDB, setAirportsDB] = useState([]);
  const [loadingAirports, setLoadingAirports] = useState(false);
  const [airportSearchText, setAirportSearchText] = useState("");
  const [showAirportDropdown, setShowAirportDropdown] = useState(false);
  const [draftAirport, setDraftAirport] = useState(null);

  // --- STATO MAPPA (CITTA) ---
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [fetchedCities, setFetchedCities] = useState([]);
  const [citySearchText, setCitySearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  
  // DRAFT LOGIC CONDIVISA
  const [draftItem, setDraftItem] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    localStorage.setItem('countriesData', JSON.stringify(countriesData));
    localStorage.setItem('globalAirportsLogs', JSON.stringify(globalAirports));
  }, [countriesData, globalAirports]);

  // Caricamento Dizioanrio Universal Aeroporti SOLO se l'utente va nella tab Flight Log
  useEffect(() => {
      if (viewMode === 'flightlog' && airportsDB.length === 0) {
          setLoadingAirports(true);
          // Oltre 7.000 aeroporti IATA JSON Statico GitHub velocissimo
          fetch('https://raw.githubusercontent.com/jbrooksuk/JSON-Airports/master/airports.json')
            .then(res => res.json())
            .then(data => {
               if(Array.isArray(data)){
                  const mapped = data
                     .filter(a => a.iata !== "\\N" && a.iata && a.iata.length === 3)
                     .map(a => `${a.iata} - ${a.name} (${a.city || ''}, ${getIt(a.country) || ''})`.replace(' (, )','').trim());
                  // Rimuoviamo duplicati velocemente
                  setAirportsDB([...new Set(mapped)]);
               }
            })
            .catch()
            .finally(() => setLoadingAirports(false));
      }
  }, [viewMode, airportsDB.length]);

  // Fetch Città 
  useEffect(() => {
    setFetchedCities([]);
    setCitySearchText("");
    setShowDropdown(false);
    setDraftItem(null); 
    setStartDate("");
    setEndDate("");
    
    if (selectedCountry) {
      setLoadingCities(true);
      fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: getApiCountryName(selectedCountry).toLowerCase() }) 
      })
      .then(res => res.json())
      .then(data => {
        if (!data.error && data.data && Array.isArray(data.data)) {
          setFetchedCities(data.data);
          
          setCountriesData(prev => {
             const newData = { ...prev };
             if (newData[selectedCountry] && newData[selectedCountry].totalCities !== data.data.length) {
                newData[selectedCountry] = { ...newData[selectedCountry], totalCities: data.data.length };
                return newData;
             }
             return prev;
          });
        }
      })
      .catch()
      .finally(() => setLoadingCities(false));
    }
  }, [selectedCountry]);

  // UTILITIES DATE
  const parseOrNull = (str) => {
     if (!str) return null;
     const d = new Date(str);
     return isNaN(d.getTime()) ? null : d;
  };
  const safeDateStr = (dateObj) => {
    if (!dateObj) return "";
    return new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };
  const formatRange = (startStr, endStr) => {
      const formatLoc = (dStr) => {
         if (!dStr) return null;
         try {
           const d = new Date(dStr);
           if (isNaN(d.getTime())) return null;
           return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
         } catch(e) { return null; }
      };
      
      const s = formatLoc(startStr);
      const e = formatLoc(endStr);
      
      if (s && e) return `${s} - ${e}`;
      if (s) return `Dal ${s}`;
      if (e) return `Fino al ${e}`;
      return 'Aggiungi Date +';
  };

  // LOGICI CITTA
  const handleReset = () => {
    if (window.confirm("Attenzione: Azzerare completamente il database Città e Aeroporti? Questa azione è irreversibile.")) {
      setCountriesData({});
      setGlobalAirports({visited: [], wishlist: []});
      setSelectedCountry(null);
    }
  };

  const getSafeCountry = (data, countryName) => {
    const c = data[countryName];
    if (!c) return { isVisited: false, visitedCities: [], isWishlist: false, wishlistCities: [], totalCities: 0 };
    return {
      isVisited: !!c.isVisited,
      visitedCities: Array.isArray(c.visitedCities) ? c.visitedCities.map(city => ({...city})) : [],
      isWishlist: !!c.isWishlist,
      wishlistCities: Array.isArray(c.wishlistCities) ? c.wishlistCities.map(city => ({...city})) : [],
      totalCities: c.totalCities || 0
    };
  };

  const handleCountryClick = (countryName) => {
    if (!countryName) return;
    if (selectedCountry === countryName) setSelectedCountry(null);
    else setSelectedCountry(countryName);
  };

  const handleToggleCountryStatus = () => {
    if (!selectedCountry) return;
    setCountriesData(prev => {
      const newData = { ...prev };
      const existing = getSafeCountry(newData, selectedCountry);
      if (activeTab === 'visited') existing.isVisited = !existing.isVisited;
      else existing.isWishlist = !existing.isWishlist;
      if (fetchedCities.length > 0) existing.totalCities = fetchedCities.length;
      newData[selectedCountry] = existing;
      if (!existing.isVisited && !existing.isWishlist) delete newData[selectedCountry];
      return newData;
    });
  };

  const requestAddItem = (name) => {
    setDraftItem({ name });
    setStartDate(""); 
    setEndDate("");
  };

  const confirmAddItem = () => {
    if (!selectedCountry || !draftItem) return;
    setCountriesData(prev => {
      const newData = { ...prev };
      const existing = getSafeCountry(newData, selectedCountry);
      const newItemObj = { name: draftItem.name, startDate, endDate };
      const targetList = activeTab === 'visited' ? 'visitedCities' : 'wishlistCities';
          
      if (activeTab === 'visited') existing.isVisited = true;
      else existing.isWishlist = true;
      
      if (!existing[targetList].some(x => x.name === draftItem.name)) {
          existing[targetList].push(newItemObj);
      }
      if (fetchedCities.length > 0) existing.totalCities = fetchedCities.length;
      
      newData[selectedCountry] = existing;
      return newData;
    });
    setDraftItem(null);
    setStartDate("");
    setEndDate("");
    setCitySearchText("");
    setShowDropdown(false);
  };

  const handleRemoveItem = (countryName, itemName) => {
    setCountriesData(prev => {
       const newData = { ...prev };
       const existing = getSafeCountry(newData, countryName);
       const targetList = activeTab === 'visited' ? 'visitedCities' : 'wishlistCities';
       existing[targetList] = existing[targetList].filter(x => x.name !== itemName);
       newData[countryName] = existing;
       return newData;
    });
  };

  // LOGICI FLIGHT LOG (AEROPORTI GLOBALI)
  const requestAddAirport = (name) => {
      setDraftAirport(name);
      setStartDate("");
      setEndDate("");
      setShowAirportDropdown(false);
  };

  const confirmAddAirport = () => {
     if(!draftAirport) return;
     setGlobalAirports(prev => {
        const newData = { visited: [...prev.visited], wishlist: [...prev.wishlist] };
        const tgt = activeTab === 'visited' ? newData.visited : newData.wishlist;
        if(!tgt.some(x => x.name === draftAirport)) {
           tgt.push({ name: draftAirport, startDate, endDate });
        }
        return newData;
     });
     setDraftAirport(null);
     setStartDate("");
     setEndDate("");
     setAirportSearchText("");
     setShowAirportDropdown(false);
  };

  const removeAirport = (name) => {
     setGlobalAirports(prev => {
        const newData = { visited: [...prev.visited], wishlist: [...prev.wishlist] };
        if (activeTab === 'visited') newData.visited = newData.visited.filter(x => x.name !== name);
        else newData.wishlist = newData.wishlist.filter(x => x.name !== name);
        return newData;
     });
  };

  // BUFFER RENDERIZATION
  const countryData = countriesData[selectedCountry];
  const isCurrentlyMarked = activeTab === 'visited' ? (countryData?.isVisited || false) : (countryData?.isWishlist || false);
  const currentCities = activeTab === 'visited' ? (countryData?.visitedCities || []) : (countryData?.wishlistCities || []);
  const activeList = activeTab === 'visited' ? Object.keys(countriesData).filter(c=>countriesData[c].isVisited).sort() : Object.keys(countriesData).filter(c=>countriesData[c].isWishlist).sort();
  const currentAirportsRenderList = activeTab === 'visited' ? globalAirports.visited : globalAirports.wishlist;

  const totalVisited = Object.keys(countriesData).filter(c=>countriesData[c].isVisited).length;
  const totalWishlist = Object.keys(countriesData).filter(c=>countriesData[c].isWishlist).length;
  
  const themeColorText = activeTab === 'visited' ? 'text-emerald-400' : 'text-orange-400';
  const themeColorBg = activeTab === 'visited' ? 'bg-emerald-500' : 'bg-orange-500';
  const themeWord = activeTab === 'visited' ? 'Nei miei Viaggi' : 'Nella Wishlist';

  return (
    <div className="min-h-screen text-slate-100 transition-colors duration-500 pb-20 overflow-x-hidden">
      
      <header className="bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800 p-4 sm:px-8 shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50">
        <h1 className="text-xl sm:text-3xl font-black tracking-tight flex items-center gap-3 cursor-default">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-indigo-400 drop-shadow-sm">
            Visita il Mondo
          </span>
        </h1>
        
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex gap-2">
             <span className="flex flex-col items-center bg-emerald-500/10 backdrop-blur-sm px-4 py-1.5 rounded-2xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Paesi Visit.</span>
                <span className="text-lg font-black text-emerald-300 leading-none">{totalVisited}</span>
             </span>
             <span className="flex flex-col items-center bg-sky-500/10 backdrop-blur-sm px-4 py-1.5 rounded-2xl border border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.1)]">
                <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">Scali Globali</span>
                <span className="text-lg font-black text-sky-300 leading-none">{globalAirports.visited.length}</span>
             </span>
          </div>
          <button onClick={handleReset} className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-2.5 rounded-full transition-all focus:outline-none ml-1 active:scale-90" title="Azzera Database">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* SELETTORE MODI: MAPPA VS AEROPORTI GLOBALI */}
      <div className="w-full flex justify-center mt-6 px-4">
         <div className="flex bg-slate-900/60 backdrop-blur-md p-1.5 rounded-full border border-slate-700/80 shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-20 relative">
            <button onClick={() => setViewMode('map')} className={`flex items-center gap-2 px-6 sm:px-8 py-2.5 rounded-full font-black text-sm sm:text-base transition-all duration-300 ${viewMode==='map' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)] scale-105' : 'text-slate-400 hover:text-white'}`}>
               Mappa
            </button>
            <button onClick={() => setViewMode('flightlog')} className={`flex items-center gap-2 px-6 sm:px-8 py-2.5 rounded-full font-black text-sm sm:text-base transition-all duration-300 ${viewMode==='flightlog' ? 'bg-sky-600 text-white shadow-[0_0_20px_rgba(2,132,199,0.5)] scale-105' : 'text-slate-400 hover:text-white'}`}>
               Aeroporti
            </button>
         </div>
      </div>

      <main className="flex-grow py-4 sm:p-6 lg:p-8 flex flex-col items-center justify-start w-full relative z-10 overflow-x-hidden">
        <div className="w-full max-w-6xl flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
          
          {/* TAB COMUNI (Visitati VS Wishlist) utilizzate da entrambe le interfacce */}
          <div className="relative flex p-1.5 rounded-[2rem] bg-slate-800/80 backdrop-blur-xl shadow-inner mb-6 sm:mb-10 w-[calc(100%-2rem)] max-w-sm mx-auto z-10 border border-slate-700/50">
             <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-0.375rem)] rounded-full shadow-lg transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${activeTab==='visited' ? 'left-1.5 bg-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'left-[calc(50%+0.1875rem)] bg-slate-950 shadow-[0_0_15px_rgba(249,115,22,0.15)]'}`}></div>
             
             <button onClick={() => { setActiveTab('visited'); setSelectedCountry(null); }} className={`relative flex-1 py-2.5 sm:py-3 font-bold text-sm sm:text-base rounded-full transition-colors duration-300 z-10 flex justify-center items-center gap-2 ${activeTab === 'visited' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}>
               {viewMode === 'map' ? 'Paesi e Città Visitate' : 'Scali Eseguiti'}
             </button>
             <button onClick={() => { setActiveTab('wishlist'); setSelectedCountry(null); }} className={`relative flex-1 py-2.5 sm:py-3 font-bold text-sm sm:text-base rounded-full transition-colors duration-300 z-10 flex justify-center items-center gap-2 ${activeTab === 'wishlist' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-300'}`}>
               {viewMode === 'map' ? 'Wish' : 'Wish Flight'}
             </button>
          </div>

          {/* RENDERING INTERFACCIA: MAPPA O FLIGHT LOG */}
          {viewMode === 'map' ? (
             <div className="w-full flex flex-col items-center">
                {selectedCountry && (
                  <div className={`w-[calc(100%-2rem)] max-w-2xl mx-auto border bg-slate-900/80 backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 mb-10 shadow-2xl transition-all animate-in zoom-in-95 duration-300 relative z-50 ${activeTab==='visited'?'border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.1)]':'border-orange-500/30 shadow-[0_0_40px_rgba(249,115,22,0.1)]'}`}>
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 mb-6">
                      <h3 className={`text-2xl sm:text-3xl font-black flex items-center gap-2 ${themeColorText}`}>
                        <span className="underline decoration-4 underline-offset-8">{getIt(selectedCountry)}</span>
                      </h3>
                      <button onClick={() => setSelectedCountry(null)} className="text-slate-400 hover:bg-slate-800 hover:text-white p-2 rounded-full font-bold transition">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <button 
                      onClick={handleToggleCountryStatus} 
                      className={`text-slate-950 px-5 py-4 rounded-2xl shadow-lg transition-all transform active:scale-95 font-black w-full text-base sm:text-lg mb-6 ${isCurrentlyMarked ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 shadow-none border border-slate-700' : themeColorBg + ' hover:bg-opacity-90 shadow-[0_0_20px_rgba(0,0,0,0.3)]'}`}
                    >
                      {isCurrentlyMarked ? `Rimuovi dalla mappa corrente` : `Aggiungi a '${themeWord}'`}
                    </button>

                    {isCurrentlyMarked && (
                      <div className="text-left mt-2 pt-2 animate-in fade-in duration-300 relative">
                        <h4 className="text-sm sm:text-base font-bold text-slate-300 mb-3 flex items-center justify-between">
                          Città tracciate
                          <span className={`text-xs px-2.5 py-1 rounded-xl text-slate-950 font-black flex gap-1 items-center ${themeColorBg}`}>
                             <span title="Città">{currentCities.length}</span>
                          </span>
                        </h4>
                        
                        {draftItem ? (
                           <div className={`mt-4 mb-5 border rounded-[1.5rem] p-5 shadow-lg animate-in zoom-in-95 duration-200 ${activeTab==='visited' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
                              <h5 className={`font-black text-xl mb-4 flex items-center gap-2 ${activeTab==='visited' ? 'text-emerald-400' : 'text-orange-400'}`}>
                                 {draftItem.name}
                              </h5>
                              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                                 <div className="flex-1">
                                    <label className={`text-[10px] sm:text-xs font-black uppercase tracking-widest mb-1.5 block drop-shadow-sm ${activeTab==='visited' ? 'text-emerald-500/80' : 'text-orange-500/80'}`}>Data di Partenza</label>
                                    <DatePicker selected={parseOrNull(startDate)} onChange={d => setStartDate(safeDateStr(d))} selectsStart startDate={parseOrNull(startDate)} endDate={parseOrNull(endDate)} locale="it" dateFormat="dd/MM/yyyy" showMonthDropdown showYearDropdown scrollableYearDropdown dropdownMode="select" placeholderText="Seleziona data..." className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-4 text-sm sm:text-base shadow-inner font-semibold transition-all cursor-pointer outline-none ${activeTab==='visited'?'bg-emerald-950/50 border-emerald-500/40 text-emerald-100 focus:ring-emerald-500/20':'bg-orange-950/50 border-orange-500/40 text-orange-100 focus:ring-orange-500/20'}`} calendarClassName={activeTab==='visited' ? 'custom-emerald-cal' : 'custom-orange-cal'} />
                                 </div>
                                 <div className="flex-1">
                                    <label className={`text-[10px] sm:text-xs font-black uppercase tracking-widest mb-1.5 block drop-shadow-sm ${activeTab==='visited' ? 'text-emerald-500/80' : 'text-orange-500/80'}`}>Data di Ritorno</label>
                                    <DatePicker selected={parseOrNull(endDate)} onChange={d => setEndDate(safeDateStr(d))} selectsEnd startDate={parseOrNull(startDate)} endDate={parseOrNull(endDate)} minDate={parseOrNull(startDate)} locale="it" dateFormat="dd/MM/yyyy" showMonthDropdown showYearDropdown scrollableYearDropdown dropdownMode="select" placeholderText="Ritorno (opz.)..." className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-4 text-sm sm:text-base shadow-inner font-semibold transition-all cursor-pointer outline-none ${activeTab==='visited'?'bg-emerald-950/50 border-emerald-500/40 text-emerald-100 focus:ring-emerald-500/20':'bg-orange-950/50 border-orange-500/40 text-orange-100 focus:ring-orange-500/20'}`} calendarClassName={activeTab==='visited' ? 'custom-emerald-cal' : 'custom-orange-cal'} />
                                 </div>
                              </div>
                              <div className="flex gap-3">
                                 <button onClick={confirmAddItem} className={`flex-grow px-4 py-3.5 rounded-xl font-bold shadow-lg transition-transform active:scale-[0.98] ${activeTab==='visited' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/30'}`}>Salva nel Diario</button>
                                 <button onClick={() => { setDraftItem(null); setStartDate(""); setEndDate(""); }} className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition">Uscita</button>
                              </div>
                           </div>
                        ) : (
                          <div className="flex flex-col gap-4 mb-5 shadow-inner bg-slate-950/40 p-3 sm:p-4 rounded-3xl border border-slate-800/80">
                              <form onSubmit={(e) => { e.preventDefault(); const v = citySearchText.trim(); if(v) requestAddItem(v); }} className="relative flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 pl-2">Aggiungi Città a '{getIt(selectedCountry)}'</label>
                                <div className="flex gap-2 relative">
                                  <input 
                                    type="text" 
                                    value={citySearchText}
                                    onChange={(e) => { setCitySearchText(e.target.value); setShowDropdown(true); }}
                                    onFocus={() => setShowDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                    placeholder={loadingCities ? "Sincronizzando API..." : "Cerca ingl. (oppure scrivi nome IT e Invio)..."} 
                                    className="flex-grow px-4 py-3 rounded-2xl border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 bg-slate-900 font-medium transition-all" 
                                    autoComplete="off" disabled={loadingCities}
                                  />
                                  <button type="submit" disabled={loadingCities || !citySearchText.trim()} className="bg-slate-700 hover:bg-indigo-600 focus:ring-4 focus:ring-indigo-500/30 text-white px-5 py-3 rounded-2xl text-xl font-bold shadow-md">+</button>
                                </div>
                                {showDropdown && fetchedCities.length > 0 && citySearchText.trim() && (
                                  <ul className="absolute top-[68px] left-0 w-[calc(100%-4rem)] bg-slate-800/95 backdrop-blur-xl border border-slate-700 mt-1 max-h-56 overflow-y-auto rounded-2xl shadow-xl z-50 text-left">
                                    {fetchedCities.filter(c => c.toLowerCase().includes(citySearchText.toLowerCase())).slice(0, 50).map((c, i) => (
                                      <li key={i} onMouseDown={(e) => { e.preventDefault(); requestAddItem(c); }} className="px-5 py-3.5 text-sm sm:text-base text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer border-b border-slate-700/50 font-semibold transition">{c}</li>
                                    ))}
                                  </ul>
                                )}
                              </form>
                          </div>
                        )}

                        {/* LISTA CITTA */}
                        {currentCities.length > 0 && (
                          <div className="flex flex-wrap gap-2.5 mt-2">
                             {currentCities.map(cityObj => {
                               const dateStr = formatRange(cityObj.startDate, cityObj.endDate);
                               return (
                                 <span key={cityObj.name} className="bg-slate-800 border border-slate-700 pl-3 pr-1 py-1.5 rounded-xl text-sm text-slate-200 font-bold flex items-center gap-2 shadow-sm transition-all hover:bg-slate-700">
                                   <span className="flex flex-col">
                                      {cityObj.name}
                                      {dateStr !== 'Aggiungi Date +' && <span className={`text-[9px] uppercase font-black tracking-widest mt-0.5 ${activeTab==='visited'?'text-emerald-500/80':'text-orange-500/80'}`}>{dateStr}</span>}
                                   </span>
                                   <button onClick={() => handleRemoveItem(selectedCountry, cityObj.name)} className="text-slate-400 hover:text-red-400 w-7 h-7 flex items-center justify-center rounded-lg transition font-black ml-1">✕</button>
                                 </span>
                               )
                             })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div className={`w-full aspect-[5/4] sm:aspect-[16/7] xl:aspect-[2/1] transition-opacity duration-300 ${selectedCountry ? 'opacity-90 grayscale-[10%]' : 'opacity-100'}`}>
                  <WorldMap countriesData={countriesData} onCountryClick={handleCountryClick} selectedCountry={selectedCountry} activeTab={activeTab} />
                </div>

                {/* Dashboard Città/Paesi in basso alla Mappa */}
                <div className="w-full mt-12 flex flex-col px-4 sm:px-0">
                  <h3 className="text-2xl sm:text-3xl font-black mb-6 flex items-center gap-4 text-slate-100">{activeTab === 'visited' ? 'Paesi e Città Visitate' : 'Wish'}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full">
                     {activeList.map(country => {
                         const cCts = activeTab === 'visited' ? (countriesData[country]?.visitedCities || []) : (countriesData[country]?.wishlistCities || []);
                         return (
                         <div key={`list-${country}`} onClick={() => handleCountryClick(country)} className="bg-slate-800/60 backdrop-blur-md p-5 rounded-3xl border border-slate-700/50 shadow-lg cursor-pointer hover:-translate-y-2 transition">
                           <h4 className={`font-black text-lg mb-4 flex items-center justify-between ${activeTab==='visited' ? 'text-emerald-400' : 'text-orange-400'}`}>
                             <span>{getIt(country)}</span>
                             <span className="text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-xl shadow-md border bg-slate-900/60 text-white flex items-center gap-1.5">
                                {cCts.length} {countriesData[country]?.totalCities ? <><span className="opacity-50">/ {countriesData[country].totalCities}</span><span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${activeTab==='visited' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-orange-500/30 text-orange-200'}`}>{((cCts.length / countriesData[country].totalCities) * 100).toFixed(1)}%</span></> : ''}
                             </span>
                           </h4>
                           <div className="flex flex-col gap-2 relative">
                             {cCts.map(c => <div key={c.name} className="text-sm font-bold text-slate-300">📍 {c.name}</div>)}
                           </div>
                         </div>
                     )})}
                  </div>
                </div>
             </div>
          ) : (
             /* ====== INTERFACCIA FLIGHT LOG (AEROPORTI GLOBALI) ====== */
             <div className="w-full max-w-4xl flex flex-col px-4 items-center py-6 animate-in slide-in-from-bottom-10 fade-in duration-500">
                 <div className="w-full bg-slate-900/80 backdrop-blur-2xl border border-sky-900/40 rounded-[2.5rem] p-6 sm:p-10 shadow-[0_20px_60px_rgba(2,132,199,0.15)] flex flex-col gap-6 relative overflow-visible z-50">
                    <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
                       <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-[100px]"></div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-6 relative z-10">
                        <div>
                           <h2 className="text-3xl sm:text-4xl font-black text-white flex items-center gap-3">Registra Aeroporto</h2>
                           <p className="text-slate-400 font-medium mt-2 text-sm sm:text-base">Ricerca tra <span className="text-sky-400 font-bold">7.000+ Aeroporti IATA</span> e traccia i tuoi decolli.</p>
                        </div>
                    </div>

                    {draftAirport ? (
                        <div className={`border rounded-[1.5rem] p-6 shadow-xl relative animate-in zoom-in-95 duration-200 bg-sky-950/20 border-sky-500/30`}>
                           <h5 className="font-black text-xl sm:text-2xl mb-6 text-sky-400 flex items-center gap-3">
                              {draftAirport}
                           </h5>
                           <div className="flex flex-col sm:flex-row gap-4 mb-8">
                              <div className="flex-1">
                                 <label className="text-xs font-black uppercase tracking-widest mb-2 block text-sky-500">Data Arrivo / Partenza</label>
                                 <DatePicker selected={parseOrNull(startDate)} onChange={d => setStartDate(safeDateStr(d))} selectsStart startDate={parseOrNull(startDate)} endDate={parseOrNull(endDate)} locale="it" dateFormat="dd/MM/yyyy" showMonthDropdown showYearDropdown scrollableYearDropdown dropdownMode="select" placeholderText="Seleziona data del volo..." className={`w-full px-5 py-4 rounded-xl border focus:outline-none focus:ring-4 text-base shadow-inner font-semibold transition-all cursor-pointer bg-slate-900 border-sky-900 text-slate-100 focus:ring-sky-500/30`} />
                              </div>
                           </div>
                           <div className="flex gap-4">
                              <button onClick={confirmAddAirport} className="flex-grow px-6 py-4 rounded-xl font-bold text-lg bg-sky-600 hover:bg-sky-500 text-white shadow-[0_10px_30px_rgba(2,132,199,0.3)] transition-all">Aggiungi al Logbook</button>
                              <button onClick={() => { setDraftAirport(null); setStartDate(""); setEndDate(""); }} className="px-8 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition">Annulla</button>
                           </div>
                        </div>
                    ) : (
                        <div className="relative font-sans pt-2">
                           <form onSubmit={(e) => { e.preventDefault(); const v = airportSearchText.trim(); if(v && !loadingAirports) requestAddAirport(v); }}>
                             <div className="flex gap-3 relative z-20">
                               <input 
                                 type="text" 
                                 value={airportSearchText}
                                 onChange={(e) => { setAirportSearchText(e.target.value); setShowAirportDropdown(true); }}
                                 onFocus={() => setShowAirportDropdown(true)}
                                 onBlur={() => setTimeout(() => setShowAirportDropdown(false), 200)}
                                 placeholder={loadingAirports ? "Sintonizzazione server IATA in corso..." : "Cerca aeroporto (es. 'Linate' o 'JFK')..."} 
                                 className="flex-grow px-6 py-5 rounded-2xl border-2 border-slate-700/80 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-500/20 text-lg disabled:bg-slate-900 bg-slate-950/80 text-white placeholder-slate-500 font-bold shadow-inner transition-all w-full" 
                                 autoComplete="off" disabled={loadingAirports}
                               />
                               <button type="submit" disabled={loadingAirports || !airportSearchText.trim()} className="bg-sky-600 hover:bg-sky-500 focus:ring-4 focus:ring-sky-500/30 disabled:bg-slate-800 disabled:text-slate-600 text-white px-8 rounded-2xl text-2xl font-black shadow-lg transition-all">+</button>
                             </div>
                             {showAirportDropdown && airportsDB.length > 0 && airportSearchText.trim() && (
                               <ul className="absolute top-[85px] left-0 w-[calc(100%-6.5rem)] bg-slate-800/95 backdrop-blur-2xl border-2 border-slate-700 mt-1 max-h-[300px] overflow-y-auto rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50">
                                 {airportsDB.filter(a => a.toLowerCase().includes(airportSearchText.toLowerCase())).slice(0, 100).map((a, idx) => (
                                   <li key={`air-${idx}`} onMouseDown={(e) => { e.preventDefault(); requestAddAirport(a); }} className="px-6 py-4 text-base text-slate-200 hover:bg-sky-900/60 hover:text-white cursor-pointer border-b border-slate-700/50 hover:pl-8 font-bold transition-all truncate">
                                      {a}
                                   </li>
                                 ))}
                                 {airportsDB.filter(a => a.toLowerCase().includes(airportSearchText.toLowerCase())).length === 0 && (
                                    <li className="px-6 py-4 text-slate-500 font-medium italic">Nessun aeroporto trovato con questo nome o IATA. Premere il tasto + per forzare l'inserimento libero personalizzato.</li>
                                 )}
                               </ul>
                             )}
                           </form>
                        </div>
                    )}
                 </div>

                 {/* DASHBOARD AEROPORTI TRACCIATI */}
                 <div className="w-full mt-10 p-2">
                     <h3 className="text-2xl font-black mb-6 text-slate-100 flex items-center gap-3">{activeTab === 'visited' ? 'Aeroporti Visitati' : 'Wish Flight'}</h3>
                     
                     {currentAirportsRenderList.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                           {/* Ordiniamo mostrando sempre prima gli scali inseriti più recentemente visualmente se possiedono date, sennò random */}
                           {currentAirportsRenderList.map(airportObj => {
                              const dateStr = formatRange(airportObj.startDate, airportObj.endDate);
                              return (
                                <div key={airportObj.name} className="bg-slate-800/80 backdrop-blur-md border border-slate-700 p-5 rounded-3xl shadow-lg flex flex-col relative group transition-all hover:bg-slate-700/80 hover:-translate-y-1 hover:border-sky-500/30">
                                   <div className="flex justify-between items-start mb-3 gap-2">
                                      <h4 className="text-lg font-black text-sky-400 leading-tight">{airportObj.name}</h4>
                                      <button onClick={() => removeGlobalAirport(airportObj.name)} className="text-slate-500 hover:text-red-400 bg-slate-900/50 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 transition">✕</button>
                                   </div>
                                   {dateStr !== 'Aggiungi Date +' ? (
                                      <div className="inline-flex items-center gap-2 mt-auto bg-slate-900/60 w-max px-3 py-1.5 rounded-lg border border-slate-700">
                                         <span className="text-xs uppercase font-black tracking-widest text-slate-400">{dateStr}</span>
                                      </div>
                                   ) : (
                                       <span className="text-xs italic text-slate-500 mt-auto">Data non specificata</span>
                                   )}
                                </div>
                              )
                           })}
                        </div>
                     ) : (
                        <div className="w-full flex justify-center py-20 bg-slate-900/40 rounded-3xl border border-dashed border-slate-700">
                           <p className="text-slate-500 font-bold text-lg">Non sono presenti aeroporti in questo Flight Log.</p>
                        </div>
                     )}
                 </div>
             </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App;
