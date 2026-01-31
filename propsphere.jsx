import React, { useState, useEffect, useRef, useMemo } from 'react';

// PropSphere - Global HF Propagation Visualizer
export default function PropSphere() {
  const [viewMode, setViewMode] = useState('globe'); // globe, flat, azimuthal
  const [rotation, setRotation] = useState({ x: 23.5, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [homeQTH, setHomeQTH] = useState({ lat: 30.5, lon: -97.8, grid: 'EM10', call: 'N5XXX' }); // Austin area
  const [targetLocation, setTargetLocation] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState(['terminator', 'muf']);
  const [timeOffset, setTimeOffset] = useState(0); // hours from now
  const [showPathAnalysis, setShowPathAnalysis] = useState(false);
  const [solarData, setSolarData] = useState({ sfi: 145, kp: 2.3, ssn: 98 });
  const [animating, setAnimating] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // Calculate current time with offset
  const displayTime = useMemo(() => {
    const now = new Date();
    now.setHours(now.getHours() + timeOffset);
    return now;
  }, [timeOffset]);

  // Calculate sun position
  const sunPosition = useMemo(() => {
    const dayOfYear = Math.floor((displayTime - new Date(displayTime.getFullYear(), 0, 0)) / 86400000);
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
    const hourAngle = ((displayTime.getUTCHours() + displayTime.getUTCMinutes() / 60) - 12) * 15;
    return { lat: declination, lon: -hourAngle };
  }, [displayTime]);

  // Calculate moon position (simplified)
  const moonPosition = useMemo(() => {
    const lunarCycle = 29.53;
    const daysSinceNewMoon = ((displayTime.getTime() / 86400000) % lunarCycle);
    const moonLon = (daysSinceNewMoon / lunarCycle) * 360 - 180 + sunPosition.lon;
    return { lat: sunPosition.lat * 0.9, lon: moonLon % 360 - 180 };
  }, [displayTime, sunPosition]);

  // Auto-rotate globe
  useEffect(() => {
    if (animating && viewMode === 'globe') {
      const animate = () => {
        setRotation(prev => ({ ...prev, y: (prev.y + 0.1) % 360 }));
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationRef.current);
    }
  }, [animating, viewMode]);

  // Calculate great circle distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Calculate bearing
  const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  };

  // Calculate band conditions for a path
  const calculateBandConditions = (distance) => {
    const { sfi, kp } = solarData;
    const isDay = Math.abs(homeQTH.lon - sunPosition.lon) < 90;
    const hops = Math.ceil(distance / 3000);
    
    const bands = [
      { name: '160m', freq: 1.8, nightOnly: true },
      { name: '80m', freq: 3.5, nightOnly: true },
      { name: '60m', freq: 5.3, nightOnly: false },
      { name: '40m', freq: 7, nightOnly: false },
      { name: '30m', freq: 10, nightOnly: false },
      { name: '20m', freq: 14, nightOnly: false },
      { name: '17m', freq: 18, nightOnly: false },
      { name: '15m', freq: 21, nightOnly: false },
      { name: '12m', freq: 24, nightOnly: false },
      { name: '10m', freq: 28, nightOnly: false },
      { name: '6m', freq: 50, nightOnly: false },
    ];

    return bands.map(band => {
      let score = 50;
      
      // Solar flux influence (higher = better for higher bands)
      const fluxBoost = (sfi - 70) / 2;
      if (band.freq > 14) score += fluxBoost;
      if (band.freq < 7) score -= fluxBoost * 0.3;
      
      // K-index influence (higher K = worse)
      score -= kp * 8;
      
      // Distance/hop penalty
      score -= hops * 5;
      
      // Day/night conditions
      if (band.nightOnly && isDay) score -= 40;
      if (!band.nightOnly && band.freq > 14 && !isDay) score -= 30;
      
      // MUF consideration
      const estimatedMUF = 10 + (sfi / 10) * (isDay ? 1.5 : 0.7);
      if (band.freq > estimatedMUF) score -= 50;
      
      score = Math.max(0, Math.min(100, score));
      
      return {
        ...band,
        score,
        status: score > 70 ? 'excellent' : score > 50 ? 'good' : score > 30 ? 'fair' : 'poor',
        snr: Math.round(score / 10 - 5 + Math.random() * 2),
      };
    });
  };

  // Path analysis data
  const pathAnalysis = useMemo(() => {
    if (!targetLocation) return null;
    
    const distance = calculateDistance(homeQTH.lat, homeQTH.lon, targetLocation.lat, targetLocation.lon);
    const bearing = calculateBearing(homeQTH.lat, homeQTH.lon, targetLocation.lat, targetLocation.lon);
    const longPath = (bearing + 180) % 360;
    const hops = Math.ceil(distance / 3000);
    const bands = calculateBandConditions(distance);
    const bestBand = bands.reduce((a, b) => a.score > b.score ? a : b);
    const difficulty = 5 - Math.floor(bestBand.score / 25);
    
    return {
      distance,
      bearing,
      longPath,
      hops,
      bands,
      bestBand,
      difficulty: Math.max(1, Math.min(5, difficulty)),
    };
  }, [targetLocation, homeQTH, solarData, sunPosition]);

  // Handle globe click to set target
  const handleGlobeClick = (e) => {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    
    if (viewMode === 'flat') {
      const lat = -y * 90;
      const lon = x * 180;
      setTargetLocation({ lat, lon, name: `${lat.toFixed(1)}°, ${lon.toFixed(1)}°` });
      setShowPathAnalysis(true);
    } else if (viewMode === 'globe') {
      // Simplified globe click - would need proper 3D math
      const adjustedY = (rotation.y - 180) % 360;
      const lon = (x * 90 - adjustedY) % 360;
      const lat = -y * 60;
      setTargetLocation({ lat, lon: lon > 180 ? lon - 360 : lon, name: `${lat.toFixed(1)}°, ${lon.toFixed(1)}°` });
      setShowPathAnalysis(true);
    }
  };

  // Mouse handlers for dragging
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setAnimating(false);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setRotation(prev => ({
      x: Math.max(-60, Math.min(60, prev.x + dy * 0.3)),
      y: (prev.y + dx * 0.3) % 360
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);
  
  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.5, Math.min(3, prev - e.deltaY * 0.001)));
  };

  const toggleLayer = (layer) => {
    setSelectedLayer(prev => 
      prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]
    );
  };

  // Preset locations
  const presetTargets = [
    { name: 'Tokyo, Japan', lat: 35.7, lon: 139.7 },
    { name: 'London, UK', lat: 51.5, lon: -0.1 },
    { name: 'Sydney, Australia', lat: -33.9, lon: 151.2 },
    { name: 'São Paulo, Brazil', lat: -23.5, lon: -46.6 },
    { name: 'Cape Town, SA', lat: -33.9, lon: 18.4 },
    { name: 'Moscow, Russia', lat: 55.8, lon: 37.6 },
  ];

  return (
    <div style={styles.container}>
      {/* Main Globe/Map View */}
      <div 
        style={styles.globeContainer}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleGlobeClick}
      >
        {viewMode === 'globe' ? (
          <GlobeView 
            rotation={rotation}
            zoom={zoom}
            sunPosition={sunPosition}
            moonPosition={moonPosition}
            homeQTH={homeQTH}
            targetLocation={targetLocation}
            selectedLayers={selectedLayer}
            solarData={solarData}
          />
        ) : viewMode === 'flat' ? (
          <FlatMapView
            sunPosition={sunPosition}
            homeQTH={homeQTH}
            targetLocation={targetLocation}
            selectedLayers={selectedLayer}
            solarData={solarData}
            zoom={zoom}
          />
        ) : (
          <AzimuthalView
            homeQTH={homeQTH}
            targetLocation={targetLocation}
            selectedLayers={selectedLayer}
            sunPosition={sunPosition}
          />
        )}
        
        {/* Crosshair */}
        <div style={styles.crosshair}>+</div>
        
        {/* Time Display */}
        <div style={styles.timeDisplay}>
          <div style={styles.utcTime}>{displayTime.toUTCString().slice(0, -4)} UTC</div>
          <div style={styles.localTime}>Local: {displayTime.toLocaleTimeString()}</div>
        </div>

        {/* View Mode Selector */}
        <div style={styles.viewModeSelector}>
          {['globe', 'flat', 'azimuthal'].map(mode => (
            <button
              key={mode}
              style={{...styles.viewModeBtn, ...(viewMode === mode ? styles.viewModeBtnActive : {})}}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'globe' ? '🌍' : mode === 'flat' ? '🗺️' : '🎯'}
              <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={() => setZoom(z => Math.min(3, z + 0.2))}>+</button>
          <button style={styles.zoomBtn} onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}>−</button>
          <button style={styles.zoomBtn} onClick={() => setAnimating(!animating)}>
            {animating ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      {/* Side Panel */}
      <div style={styles.sidePanel}>
        {/* Solar Conditions Header */}
        <div style={styles.solarHeader}>
          <h1 style={styles.logo}>PropSphere</h1>
          <p style={styles.tagline}>Global HF Propagation</p>
        </div>

        {/* Solar Data Cards */}
        <div style={styles.solarCards}>
          <div style={styles.solarCard}>
            <span style={styles.solarLabel}>SFI</span>
            <span style={{...styles.solarValue, color: '#ff6b35'}}>{solarData.sfi}</span>
          </div>
          <div style={styles.solarCard}>
            <span style={styles.solarLabel}>Kp</span>
            <span style={{...styles.solarValue, color: solarData.kp <= 3 ? '#00ff88' : '#ffaa00'}}>{solarData.kp}</span>
          </div>
          <div style={styles.solarCard}>
            <span style={styles.solarLabel}>SSN</span>
            <span style={{...styles.solarValue, color: '#ffd23f'}}>{solarData.ssn}</span>
          </div>
        </div>

        {/* Home QTH */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>📍 Your Location</h3>
          <div style={styles.qthInfo}>
            <div style={styles.qthMain}>
              <span style={styles.callsign}>{homeQTH.call}</span>
              <span style={styles.gridSquare}>{homeQTH.grid}</span>
            </div>
            <div style={styles.qthCoords}>
              {homeQTH.lat.toFixed(2)}°N, {Math.abs(homeQTH.lon).toFixed(2)}°W
            </div>
            <button style={styles.editBtn} onClick={() => setShowSettings(true)}>Edit</button>
          </div>
        </div>

        {/* Quick Targets */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>🎯 Quick Targets</h3>
          <div style={styles.targetGrid}>
            {presetTargets.map(target => (
              <button
                key={target.name}
                style={{
                  ...styles.targetBtn,
                  ...(targetLocation?.name === target.name ? styles.targetBtnActive : {})
                }}
                onClick={() => {
                  setTargetLocation(target);
                  setShowPathAnalysis(true);
                }}
              >
                {target.name.split(',')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Layer Controls */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>🗂️ Map Layers</h3>
          <div style={styles.layerGrid}>
            {[
              { id: 'terminator', name: 'Day/Night', color: '#ffd23f' },
              { id: 'greyline', name: 'Greyline', color: '#ff6b35' },
              { id: 'muf', name: 'MUF Zones', color: '#00ff88' },
              { id: 'aurora', name: 'Aurora Oval', color: '#aa44ff' },
              { id: 'absorption', name: 'D-Layer', color: '#ff4455' },
              { id: 'sporadic', name: 'Sporadic E', color: '#44ddff' },
            ].map(layer => (
              <button
                key={layer.id}
                style={{
                  ...styles.layerBtn,
                  borderColor: selectedLayer.includes(layer.id) ? layer.color : 'transparent',
                  background: selectedLayer.includes(layer.id) ? layer.color + '22' : 'rgba(255,255,255,0.05)'
                }}
                onClick={() => toggleLayer(layer.id)}
              >
                <span style={{...styles.layerDot, background: layer.color}}></span>
                {layer.name}
              </button>
            ))}
          </div>
        </div>

        {/* Time Scrubber */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>⏱️ Time Control</h3>
          <div style={styles.timeControl}>
            <input
              type="range"
              min="-12"
              max="12"
              value={timeOffset}
              onChange={(e) => setTimeOffset(parseInt(e.target.value))}
              style={styles.timeSlider}
            />
            <div style={styles.timeLabels}>
              <span>-12h</span>
              <span style={styles.timeNow}>{timeOffset === 0 ? 'NOW' : `${timeOffset > 0 ? '+' : ''}${timeOffset}h`}</span>
              <span>+12h</span>
            </div>
          </div>
        </div>

        {/* Path Analysis Panel */}
        {showPathAnalysis && pathAnalysis && (
          <div style={styles.pathPanel}>
            <div style={styles.pathHeader}>
              <h3 style={styles.pathTitle}>📡 Path Analysis</h3>
              <button style={styles.closeBtn} onClick={() => setShowPathAnalysis(false)}>×</button>
            </div>
            
            <div style={styles.pathTarget}>
              <span style={styles.pathTargetLabel}>Target:</span>
              <span style={styles.pathTargetName}>{targetLocation.name}</span>
            </div>

            <div style={styles.pathStats}>
              <div style={styles.pathStat}>
                <span style={styles.pathStatLabel}>Distance</span>
                <span style={styles.pathStatValue}>{Math.round(pathAnalysis.distance).toLocaleString()} km</span>
              </div>
              <div style={styles.pathStat}>
                <span style={styles.pathStatLabel}>Short Path</span>
                <span style={styles.pathStatValue}>{pathAnalysis.bearing.toFixed(0)}°</span>
              </div>
              <div style={styles.pathStat}>
                <span style={styles.pathStatLabel}>Long Path</span>
                <span style={styles.pathStatValue}>{pathAnalysis.longPath.toFixed(0)}°</span>
              </div>
              <div style={styles.pathStat}>
                <span style={styles.pathStatLabel}>Hops</span>
                <span style={styles.pathStatValue}>{pathAnalysis.hops}F</span>
              </div>
            </div>

            <div style={styles.difficultySection}>
              <span style={styles.difficultyLabel}>Difficulty</span>
              <div style={styles.difficultyStars}>
                {[1,2,3,4,5].map(i => (
                  <span key={i} style={{
                    ...styles.star,
                    color: i <= pathAnalysis.difficulty ? '#ff6b35' : '#333'
                  }}>★</span>
                ))}
              </div>
            </div>

            <div style={styles.bestBand}>
              <span style={styles.bestBandLabel}>Best Band Right Now</span>
              <div style={styles.bestBandValue}>
                <span style={styles.bestBandName}>{pathAnalysis.bestBand.name}</span>
                <span style={styles.bestBandFreq}>{pathAnalysis.bestBand.freq} MHz</span>
              </div>
            </div>

            <div style={styles.bandList}>
              <div style={styles.bandListHeader}>
                <span>Band</span>
                <span>Status</span>
                <span>SNR</span>
              </div>
              {pathAnalysis.bands.map(band => (
                <div key={band.name} style={styles.bandRow}>
                  <span style={styles.bandName}>{band.name}</span>
                  <span style={{
                    ...styles.bandStatus,
                    color: band.status === 'excellent' ? '#00ff88' : 
                           band.status === 'good' ? '#44dd66' :
                           band.status === 'fair' ? '#ffaa00' : '#ff4455'
                  }}>
                    {band.status}
                  </span>
                  <span style={styles.bandSNR}>
                    {band.snr > 0 ? '+' : ''}{band.snr} dB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Station Settings</h2>
            <div style={styles.formGroup}>
              <label>Callsign</label>
              <input 
                type="text" 
                value={homeQTH.call}
                onChange={(e) => setHomeQTH(prev => ({...prev, call: e.target.value}))}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Grid Square</label>
              <input 
                type="text" 
                value={homeQTH.grid}
                onChange={(e) => setHomeQTH(prev => ({...prev, grid: e.target.value}))}
                style={styles.input}
              />
            </div>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label>Latitude</label>
                <input 
                  type="number" 
                  value={homeQTH.lat}
                  onChange={(e) => setHomeQTH(prev => ({...prev, lat: parseFloat(e.target.value)}))}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>Longitude</label>
                <input 
                  type="number" 
                  value={homeQTH.lon}
                  onChange={(e) => setHomeQTH(prev => ({...prev, lon: parseFloat(e.target.value)}))}
                  style={styles.input}
                />
              </div>
            </div>
            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setShowSettings(false)}>Cancel</button>
              <button style={styles.saveBtn} onClick={() => setShowSettings(false)}>Save</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap');
        
        * { box-sizing: border-box; }
        
        input[type="range"] {
          -webkit-appearance: none;
          background: transparent;
        }
        input[type="range"]::-webkit-slider-track {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: #ff6b35;
          border-radius: 50%;
          margin-top: -6px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// Globe View Component (CSS 3D visualization)
function GlobeView({ rotation, zoom, sunPosition, moonPosition, homeQTH, targetLocation, selectedLayers, solarData }) {
  const globeSize = 400 * zoom;
  
  return (
    <div style={{
      ...globeStyles.container,
      transform: `scale(${zoom})`,
    }}>
      {/* Globe sphere */}
      <div style={{
        ...globeStyles.globe,
        width: globeSize,
        height: globeSize,
        transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
      }}>
        {/* Ocean base */}
        <div style={globeStyles.ocean}></div>
        
        {/* Continent shapes (simplified) */}
        <div style={globeStyles.continents}></div>
        
        {/* Grid lines */}
        <div style={globeStyles.gridLines}></div>
        
        {/* Day/Night terminator */}
        {selectedLayers.includes('terminator') && (
          <div style={{
            ...globeStyles.terminator,
            transform: `rotateY(${-sunPosition.lon}deg) rotateX(${-sunPosition.lat}deg)`,
          }}></div>
        )}
        
        {/* Greyline */}
        {selectedLayers.includes('greyline') && (
          <div style={{
            ...globeStyles.greyline,
            transform: `rotateY(${-sunPosition.lon}deg) rotateX(${-sunPosition.lat}deg)`,
          }}></div>
        )}
        
        {/* MUF overlay */}
        {selectedLayers.includes('muf') && (
          <div style={globeStyles.mufOverlay}></div>
        )}
        
        {/* Aurora oval */}
        {selectedLayers.includes('aurora') && solarData.kp >= 3 && (
          <>
            <div style={{...globeStyles.aurora, top: '5%'}}></div>
            <div style={{...globeStyles.aurora, bottom: '5%', transform: 'rotateX(180deg)'}}></div>
          </>
        )}
        
        {/* Home marker */}
        <div style={{
          ...globeStyles.marker,
          ...globeStyles.homeMarker,
          transform: `rotateY(${homeQTH.lon}deg) rotateX(${-homeQTH.lat}deg) translateZ(${globeSize/2 + 5}px)`,
        }}>
          <span style={globeStyles.markerPulse}></span>
          📍
        </div>
        
        {/* Target marker */}
        {targetLocation && (
          <div style={{
            ...globeStyles.marker,
            ...globeStyles.targetMarker,
            transform: `rotateY(${targetLocation.lon}deg) rotateX(${-targetLocation.lat}deg) translateZ(${globeSize/2 + 5}px)`,
          }}>
            🎯
          </div>
        )}
        
        {/* Sun position indicator */}
        <div style={{
          ...globeStyles.sunIndicator,
          transform: `rotateY(${sunPosition.lon}deg) rotateX(${-sunPosition.lat}deg) translateZ(${globeSize/2 + 20}px)`,
        }}>☀️</div>
      </div>
      
      {/* Atmosphere glow */}
      <div style={{
        ...globeStyles.atmosphere,
        width: globeSize + 40,
        height: globeSize + 40,
      }}></div>
    </div>
  );
}

// Flat Map View Component
function FlatMapView({ sunPosition, homeQTH, targetLocation, selectedLayers, solarData, zoom }) {
  const mapWidth = 800 * zoom;
  const mapHeight = 400 * zoom;
  
  const latToY = (lat) => (90 - lat) / 180 * mapHeight;
  const lonToX = (lon) => (lon + 180) / 360 * mapWidth;
  
  return (
    <div style={{
      ...flatStyles.container,
      width: mapWidth,
      height: mapHeight,
    }}>
      {/* Map background */}
      <div style={flatStyles.mapBg}></div>
      
      {/* Grid */}
      <svg style={flatStyles.svg} viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
        {/* Latitude lines */}
        {[-60, -30, 0, 30, 60].map(lat => (
          <line key={lat} 
            x1="0" y1={latToY(lat)} 
            x2={mapWidth} y2={latToY(lat)}
            stroke="rgba(255,255,255,0.1)" strokeWidth="1"
          />
        ))}
        {/* Longitude lines */}
        {[-120, -60, 0, 60, 120].map(lon => (
          <line key={lon}
            x1={lonToX(lon)} y1="0"
            x2={lonToX(lon)} y2={mapHeight}
            stroke="rgba(255,255,255,0.1)" strokeWidth="1"
          />
        ))}
        
        {/* Terminator */}
        {selectedLayers.includes('terminator') && (
          <rect
            x={lonToX(sunPosition.lon + 90)}
            y="0"
            width={mapWidth / 2}
            height={mapHeight}
            fill="rgba(0,0,30,0.5)"
          />
        )}
        
        {/* Greyline bands */}
        {selectedLayers.includes('greyline') && (
          <>
            <rect x={lonToX(sunPosition.lon + 85)} y="0" width="20" height={mapHeight} fill="rgba(255,107,53,0.3)" />
            <rect x={lonToX(sunPosition.lon - 95)} y="0" width="20" height={mapHeight} fill="rgba(255,107,53,0.3)" />
          </>
        )}
        
        {/* Path line */}
        {targetLocation && (
          <line
            x1={lonToX(homeQTH.lon)} y1={latToY(homeQTH.lat)}
            x2={lonToX(targetLocation.lon)} y2={latToY(targetLocation.lat)}
            stroke="#00ff88" strokeWidth="2" strokeDasharray="8,4"
          />
        )}
        
        {/* Home marker */}
        <circle cx={lonToX(homeQTH.lon)} cy={latToY(homeQTH.lat)} r="8" fill="#ff6b35" />
        <circle cx={lonToX(homeQTH.lon)} cy={latToY(homeQTH.lat)} r="12" fill="none" stroke="#ff6b35" strokeWidth="2" opacity="0.5" />
        
        {/* Target marker */}
        {targetLocation && (
          <circle cx={lonToX(targetLocation.lon)} cy={latToY(targetLocation.lat)} r="8" fill="#00ff88" />
        )}
        
        {/* Sun position */}
        <text x={lonToX(sunPosition.lon)} y={latToY(sunPosition.lat)} fontSize="24" textAnchor="middle" dominantBaseline="middle">☀️</text>
      </svg>
      
      {/* Labels */}
      <div style={{...flatStyles.label, left: '2%', top: '15%'}}>60°N</div>
      <div style={{...flatStyles.label, left: '2%', top: '50%'}}>EQ</div>
      <div style={{...flatStyles.label, left: '2%', top: '85%'}}>60°S</div>
    </div>
  );
}

// Azimuthal View Component
function AzimuthalView({ homeQTH, targetLocation, selectedLayers, sunPosition }) {
  const size = 500;
  const center = size / 2;
  
  // Convert lat/lon to azimuthal projection
  const toAzimuthal = (lat, lon) => {
    const dLon = (lon - homeQTH.lon) * Math.PI / 180;
    const lat1 = homeQTH.lat * Math.PI / 180;
    const lat2 = lat * Math.PI / 180;
    
    const bearing = Math.atan2(
      Math.sin(dLon) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    );
    
    const distance = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
    );
    
    const r = (distance / Math.PI) * (size / 2 - 20);
    const x = center + r * Math.sin(bearing);
    const y = center - r * Math.cos(bearing);
    
    return { x, y, bearing: bearing * 180 / Math.PI };
  };
  
  const targetPos = targetLocation ? toAzimuthal(targetLocation.lat, targetLocation.lon) : null;
  const sunPos = toAzimuthal(sunPosition.lat, sunPosition.lon);
  
  return (
    <div style={azStyles.container}>
      <svg width={size} height={size} style={azStyles.svg}>
        {/* Distance rings */}
        {[5000, 10000, 15000, 20000].map((dist, i) => (
          <circle key={dist}
            cx={center} cy={center}
            r={(dist / 20000) * (size / 2 - 20)}
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"
          />
        ))}
        
        {/* Bearing lines */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
          const rad = angle * Math.PI / 180;
          return (
            <line key={angle}
              x1={center} y1={center}
              x2={center + Math.sin(rad) * (size/2 - 10)}
              y2={center - Math.cos(rad) * (size/2 - 10)}
              stroke="rgba(255,255,255,0.1)" strokeWidth="1"
            />
          );
        })}
        
        {/* Bearing labels */}
        {[
          { angle: 0, label: 'N' },
          { angle: 90, label: 'E' },
          { angle: 180, label: 'S' },
          { angle: 270, label: 'W' },
        ].map(({ angle, label }) => {
          const rad = angle * Math.PI / 180;
          return (
            <text key={angle}
              x={center + Math.sin(rad) * (size/2 - 5)}
              y={center - Math.cos(rad) * (size/2 - 5)}
              fill="#666" fontSize="14" textAnchor="middle" dominantBaseline="middle"
              fontFamily="'Orbitron', sans-serif"
            >
              {label}
            </text>
          );
        })}
        
        {/* Path to target */}
        {targetPos && (
          <line
            x1={center} y1={center}
            x2={targetPos.x} y2={targetPos.y}
            stroke="#00ff88" strokeWidth="3" strokeDasharray="8,4"
          />
        )}
        
        {/* Home (center) */}
        <circle cx={center} cy={center} r="10" fill="#ff6b35" />
        <circle cx={center} cy={center} r="15" fill="none" stroke="#ff6b35" strokeWidth="2" opacity="0.5">
          <animate attributeName="r" values="15;25;15" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
        </circle>
        
        {/* Target */}
        {targetPos && (
          <circle cx={targetPos.x} cy={targetPos.y} r="8" fill="#00ff88" />
        )}
        
        {/* Sun */}
        <text x={sunPos.x} y={sunPos.y} fontSize="20" textAnchor="middle" dominantBaseline="middle">☀️</text>
      </svg>
      
      <div style={azStyles.centerLabel}>
        <span style={azStyles.callsign}>Your QTH</span>
        <span style={azStyles.bearingLabel}>Beam Heading View</span>
      </div>
    </div>
  );
}

// Styles
const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0f0f23 100%)',
    fontFamily: "'Inter', sans-serif",
    color: '#e0e0e0',
    overflow: 'hidden',
  },
  globeContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: 'grab',
    overflow: 'hidden',
    background: `
      radial-gradient(circle at 30% 30%, rgba(255,107,53,0.05) 0%, transparent 50%),
      radial-gradient(circle at 70% 70%, rgba(0,255,136,0.03) 0%, transparent 50%)
    `,
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '24px',
    color: 'rgba(255,255,255,0.2)',
    pointerEvents: 'none',
    fontFamily: 'monospace',
  },
  timeDisplay: {
    position: 'absolute',
    top: '20px',
    left: '20px',
    background: 'rgba(0,0,0,0.6)',
    padding: '12px 16px',
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
  },
  utcTime: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '18px',
    color: '#00ff88',
    fontWeight: 600,
  },
  localTime: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  viewModeSelector: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '8px',
    background: 'rgba(0,0,0,0.6)',
    padding: '8px',
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
  },
  viewModeBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    color: '#888',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
  viewModeBtnActive: {
    background: 'rgba(255,107,53,0.2)',
    color: '#ff6b35',
  },
  zoomControls: {
    position: 'absolute',
    right: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  zoomBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: '20px',
    borderRadius: '8px',
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
  },
  sidePanel: {
    width: '360px',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(20px)',
    borderLeft: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  solarHeader: {
    padding: '24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    textAlign: 'center',
  },
  logo: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '28px',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #ff6b35 0%, #ffd23f 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  tagline: {
    fontSize: '11px',
    color: '#666',
    margin: '4px 0 0 0',
    textTransform: 'uppercase',
    letterSpacing: '2px',
  },
  solarCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  solarCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
  },
  solarLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  solarValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '24px',
    fontWeight: 700,
    marginTop: '4px',
  },
  section: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    margin: '0 0 12px 0',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  qthInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  qthMain: {
    display: 'flex',
    gap: '12px',
    alignItems: 'baseline',
  },
  callsign: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '20px',
    fontWeight: 700,
    color: '#ff6b35',
  },
  gridSquare: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '14px',
    color: '#00ff88',
    background: 'rgba(0,255,136,0.1)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  qthCoords: {
    fontSize: '12px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
  editBtn: {
    alignSelf: 'flex-start',
    padding: '6px 12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#888',
    fontSize: '11px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  targetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  targetBtn: {
    padding: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    color: '#aaa',
    fontSize: '11px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  targetBtnActive: {
    borderColor: '#00ff88',
    background: 'rgba(0,255,136,0.1)',
    color: '#00ff88',
  },
  layerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  layerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    border: '2px solid transparent',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#aaa',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  layerDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  timeControl: {
    padding: '8px 0',
  },
  timeSlider: {
    width: '100%',
    cursor: 'pointer',
  },
  timeLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#666',
    marginTop: '8px',
  },
  timeNow: {
    color: '#ff6b35',
    fontWeight: 600,
  },
  pathPanel: {
    flex: 1,
    padding: '16px 24px',
    background: 'rgba(0,255,136,0.03)',
    borderTop: '2px solid rgba(0,255,136,0.3)',
    overflow: 'auto',
  },
  pathHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  pathTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    color: '#00ff88',
    margin: 0,
  },
  closeBtn: {
    width: '28px',
    height: '28px',
    border: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: '#888',
    fontSize: '18px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  pathTarget: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  pathTargetLabel: {
    fontSize: '12px',
    color: '#666',
  },
  pathTargetName: {
    fontSize: '12px',
    color: '#fff',
    fontWeight: 500,
  },
  pathStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  pathStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
  },
  pathStatLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
  },
  pathStatValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  difficultySection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  difficultyLabel: {
    fontSize: '12px',
    color: '#888',
  },
  difficultyStars: {
    display: 'flex',
    gap: '4px',
  },
  star: {
    fontSize: '18px',
  },
  bestBand: {
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(0,255,136,0.1) 0%, rgba(0,255,136,0.05) 100%)',
    border: '1px solid rgba(0,255,136,0.3)',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  bestBandLabel: {
    fontSize: '10px',
    color: '#00ff88',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  bestBandValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    marginTop: '8px',
  },
  bestBandName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '28px',
    fontWeight: 700,
    color: '#fff',
  },
  bestBandFreq: {
    fontSize: '14px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
  bandList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bandListHeader: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr 60px',
    padding: '8px 12px',
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  bandRow: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr 60px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
    alignItems: 'center',
  },
  bandName: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '12px',
    fontWeight: 600,
  },
  bandStatus: {
    fontSize: '11px',
    textTransform: 'capitalize',
  },
  bandSNR: {
    fontSize: '11px',
    color: '#888',
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: 'right',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#1a1a2e',
    padding: '32px',
    borderRadius: '16px',
    width: '400px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '18px',
    margin: '0 0 24px 0',
    color: '#fff',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '8px',
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#888',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    border: 'none',
    background: '#ff6b35',
    color: '#fff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
};

const globeStyles = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: '1000px',
  },
  globe: {
    position: 'relative',
    borderRadius: '50%',
    transformStyle: 'preserve-3d',
    transition: 'transform 0.1s ease-out',
    boxShadow: `
      inset -40px -20px 80px rgba(0,0,0,0.6),
      inset 20px 10px 60px rgba(255,255,255,0.05),
      0 0 60px rgba(0,150,255,0.3)
    `,
  },
  ocean: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0a2463 0%, #1e3a5f 50%, #0a2463 100%)',
  },
  continents: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: '50%',
    background: `
      radial-gradient(ellipse 30% 40% at 25% 35%, #2d5016 0%, transparent 100%),
      radial-gradient(ellipse 25% 30% at 55% 25%, #2d5016 0%, transparent 100%),
      radial-gradient(ellipse 15% 35% at 75% 45%, #2d5016 0%, transparent 100%),
      radial-gradient(ellipse 20% 15% at 45% 70%, #2d5016 0%, transparent 100%),
      radial-gradient(ellipse 30% 20% at 70% 75%, #1a3a0a 0%, transparent 100%)
    `,
    opacity: 0.8,
  },
  gridLines: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: '50%',
    background: `
      repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(255,255,255,0.03) 10%, rgba(255,255,255,0.03) 10.5%),
      repeating-linear-gradient(90deg, transparent, transparent 10%, rgba(255,255,255,0.03) 10%, rgba(255,255,255,0.03) 10.5%)
    `,
  },
  terminator: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: '50%',
    background: 'linear-gradient(90deg, transparent 0%, transparent 48%, rgba(0,0,30,0.7) 52%, rgba(0,0,30,0.7) 100%)',
    transformStyle: 'preserve-3d',
  },
  greyline: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: '50%',
    background: 'linear-gradient(90deg, transparent 0%, transparent 46%, rgba(255,107,53,0.4) 48%, rgba(255,210,63,0.4) 52%, transparent 54%, transparent 100%)',
    transformStyle: 'preserve-3d',
  },
  mufOverlay: {
    position: 'absolute',
    top: '20%', left: '20%', right: '20%', bottom: '20%',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,255,136,0.15) 0%, transparent 70%)',
  },
  aurora: {
    position: 'absolute',
    left: '10%', right: '10%',
    height: '20%',
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(0,255,100,0.3) 0%, rgba(100,0,255,0.2) 50%, transparent 100%)',
    filter: 'blur(10px)',
  },
  marker: {
    position: 'absolute',
    top: '50%', left: '50%',
    fontSize: '20px',
    transform: 'translate(-50%, -50%)',
    transformStyle: 'preserve-3d',
  },
  homeMarker: {
    filter: 'drop-shadow(0 0 8px rgba(255,107,53,0.8))',
  },
  targetMarker: {
    filter: 'drop-shadow(0 0 8px rgba(0,255,136,0.8))',
  },
  markerPulse: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: '30px', height: '30px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    border: '2px solid #ff6b35',
    animation: 'pulse 2s ease-out infinite',
  },
  sunIndicator: {
    position: 'absolute',
    top: '50%', left: '50%',
    fontSize: '24px',
    filter: 'drop-shadow(0 0 20px rgba(255,210,63,0.8))',
  },
  atmosphere: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'radial-gradient(circle, transparent 60%, rgba(100,180,255,0.1) 80%, rgba(100,180,255,0.2) 100%)',
    pointerEvents: 'none',
  },
};

const flatStyles = {
  container: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 0 40px rgba(0,150,255,0.2)',
  },
  mapBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'linear-gradient(180deg, #0a2463 0%, #1e3a5f 50%, #0a2463 100%)',
  },
  svg: {
    position: 'absolute',
    top: 0, left: 0,
    width: '100%',
    height: '100%',
  },
  label: {
    position: 'absolute',
    fontSize: '10px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
};

const azStyles = {
  container: {
    position: 'relative',
  },
  svg: {
    background: 'radial-gradient(circle, #1e3a5f 0%, #0a2463 100%)',
    borderRadius: '50%',
    boxShadow: '0 0 40px rgba(0,150,255,0.3)',
  },
  centerLabel: {
    position: 'absolute',
    bottom: '-40px',
    left: '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
  },
  callsign: {
    display: 'block',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    color: '#ff6b35',
    fontWeight: 700,
  },
  bearingLabel: {
    display: 'block',
    fontSize: '10px',
    color: '#666',
    marginTop: '4px',
  },
};
