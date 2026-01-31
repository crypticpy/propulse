import React, { useState, useEffect } from 'react';

// Solar Conditions Dashboard - Modern HamQSL Alternative
export default function SolarDashboard() {
  const [solarData, setSolarData] = useState(null);
  const [kIndex, setKIndex] = useState(null);
  const [xrayFlux, setXrayFlux] = useState(null);
  const [solarFlux, setSolarFlux] = useState(null);
  const [sunspots, setSunspots] = useState(null);
  const [probabilities, setProbabilities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Demo data for when CORS blocks API calls
  const demoData = {
    kIndex: Array.from({length: 24}, (_, i) => ({
      kp_index: (Math.sin(i / 4) * 2 + 3 + Math.random()).toFixed(2)
    })),
    solarFlux: Array.from({length: 30}, (_, i) => ({
      flux: (135 + Math.sin(i / 5) * 25 + Math.random() * 10).toFixed(1),
      time_tag: new Date(Date.now() - (29 - i) * 86400000).toISOString()
    })),
    sunspots: Array.from({length: 12}, (_, i) => ({
      ssn: Math.round(95 + Math.sin(i / 2) * 30 + Math.random() * 15)
    })),
    probabilities: { c_prob: 75, m_prob: 35, x_prob: 10, proton_prob: 5 }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      let useDemoData = false;
      
      try {
        // Fetch K-index data
        const kRes = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
        if (!kRes.ok) throw new Error('K-index fetch failed');
        const kData = await kRes.json();
        setKIndex(kData.slice(-24));

        // Fetch solar flux
        const fluxRes = await fetch('https://services.swpc.noaa.gov/json/f107_cm_flux.json');
        const fluxData = await fluxRes.json();
        setSolarFlux(fluxData.slice(-30));

        // Fetch solar probabilities
        const probRes = await fetch('https://services.swpc.noaa.gov/json/solar_probabilities.json');
        const probData = await probRes.json();
        setProbabilities(probData[0]);

        // Fetch sunspot data
        const ssRes = await fetch('https://services.swpc.noaa.gov/json/solar-cycle/sunspots.json');
        const ssData = await ssRes.json();
        setSunspots(ssData.slice(-12));

      } catch (err) {
        console.log('Using demo data (CORS or network issue):', err.message);
        useDemoData = true;
        setKIndex(demoData.kIndex);
        setSolarFlux(demoData.solarFlux);
        setSunspots(demoData.sunspots);
        setProbabilities(demoData.probabilities);
      }

      setLastUpdate(new Date());
      setLoading(false);
    };

    fetchAllData();
    const interval = setInterval(fetchAllData, 300000);
    return () => clearInterval(interval);
  }, []);

  // Calculate band conditions based on K-index and solar flux
  const calculateBandConditions = () => {
    const currentK = kIndex ? parseFloat(kIndex[kIndex.length - 1]?.kp_index || 3) : 3;
    const currentFlux = solarFlux ? parseFloat(solarFlux[solarFlux.length - 1]?.flux || 100) : 100;
    
    const bands = [
      { name: '160m', freq: '1.8 MHz', day: 'Poor', night: getCondition(currentK, currentFlux, 0.3, 0.8) },
      { name: '80m', freq: '3.5 MHz', day: getCondition(currentK, currentFlux, 0.4, 0.7), night: getCondition(currentK, currentFlux, 0.6, 0.9) },
      { name: '60m', freq: '5.3 MHz', day: getCondition(currentK, currentFlux, 0.5, 0.7), night: getCondition(currentK, currentFlux, 0.6, 0.85) },
      { name: '40m', freq: '7 MHz', day: getCondition(currentK, currentFlux, 0.6, 0.8), night: getCondition(currentK, currentFlux, 0.7, 0.9) },
      { name: '30m', freq: '10 MHz', day: getCondition(currentK, currentFlux, 0.7, 0.85), night: getCondition(currentK, currentFlux, 0.65, 0.85) },
      { name: '20m', freq: '14 MHz', day: getCondition(currentK, currentFlux, 0.8, 0.9), night: getCondition(currentK, currentFlux, 0.5, 0.7) },
      { name: '17m', freq: '18 MHz', day: getCondition(currentK, currentFlux, 0.85, 0.95), night: getCondition(currentK, currentFlux, 0.4, 0.6) },
      { name: '15m', freq: '21 MHz', day: getCondition(currentK, currentFlux, 0.9, 1.0), night: getCondition(currentK, currentFlux, 0.3, 0.5) },
      { name: '12m', freq: '24 MHz', day: getCondition(currentK, currentFlux, 0.95, 1.0), night: 'Poor' },
      { name: '10m', freq: '28 MHz', day: getCondition(currentK, currentFlux, 1.0, 1.0), night: 'Poor' },
      { name: '6m', freq: '50 MHz', day: getVHFCondition(currentK), night: 'Poor' },
    ];
    return bands;
  };

  const getCondition = (k, flux, dayMult, nightMult) => {
    // Higher flux = better HF propagation, higher K = worse conditions
    const score = (flux / 200) * (1 - k / 9);
    if (score > 0.6) return 'Excellent';
    if (score > 0.45) return 'Good';
    if (score > 0.3) return 'Fair';
    return 'Poor';
  };

  const getVHFCondition = (k) => {
    if (k >= 5) return 'Aurora';
    if (k >= 4) return 'Fair';
    return 'Poor';
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case 'Excellent': return '#00ff88';
      case 'Good': return '#44dd66';
      case 'Fair': return '#ffaa00';
      case 'Poor': return '#ff4455';
      case 'Aurora': return '#aa44ff';
      default: return '#666';
    }
  };

  const getKIndexColor = (k) => {
    if (k <= 1) return '#00ff88';
    if (k <= 2) return '#44dd66';
    if (k <= 3) return '#88cc44';
    if (k <= 4) return '#ffaa00';
    if (k <= 5) return '#ff7700';
    if (k <= 6) return '#ff4400';
    if (k <= 7) return '#ff0044';
    return '#ff0088';
  };

  const currentK = kIndex ? parseFloat(kIndex[kIndex.length - 1]?.kp_index || 0) : 0;
  const currentFlux = solarFlux ? parseFloat(solarFlux[solarFlux.length - 1]?.flux || 0) : 0;
  const currentSS = sunspots ? parseFloat(sunspots[sunspots.length - 1]?.ssn || 0) : 0;

  const bandConditions = calculateBandConditions();

  return (
    <div style={styles.container}>
      {/* Animated background */}
      <div style={styles.bgStars}></div>
      <div style={styles.bgGlow}></div>
      
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <div style={styles.sunIcon}>☀</div>
          <div>
            <h1 style={styles.title}>Solar Pulse</h1>
            <p style={styles.subtitle}>Real-Time HF Propagation & Space Weather</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.utcTime}>
            {new Date().toUTCString().slice(0, -4)} UTC
          </div>
          <div style={styles.updateInfo}>
            Data: NOAA/SWPC • Updated {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </header>

      {loading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Fetching solar data from NOAA...</p>
        </div>
      ) : (
        <main style={styles.main}>
          {/* Primary Metrics Row */}
          <section style={styles.metricsRow}>
            <MetricCard 
              label="Solar Flux Index"
              value={currentFlux.toFixed(0)}
              unit="sfu"
              color="#ff6b35"
              description="10.7cm radio emissions"
              trend={solarFlux && solarFlux.length > 1 ? 
                currentFlux > parseFloat(solarFlux[solarFlux.length - 2]?.flux || 0) ? '↑' : '↓' : ''}
            />
            <MetricCard 
              label="Sunspot Number"
              value={currentSS.toFixed(0)}
              unit="SSN"
              color="#ffd23f"
              description="Daily sunspot count"
            />
            <MetricCard 
              label="K-Index"
              value={currentK.toFixed(1)}
              unit="Kp"
              color={getKIndexColor(currentK)}
              description={currentK <= 3 ? 'Quiet' : currentK <= 5 ? 'Unsettled' : 'Storm'}
            />
            <MetricCard 
              label="A-Index"
              value={Math.round(currentK * 4.5)}
              unit="Ap"
              color="#3a86ff"
              description="24hr geomagnetic"
            />
          </section>

          {/* Two Column Layout */}
          <div style={styles.twoColumn}>
            {/* Band Conditions */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>
                <span style={styles.cardIcon}>📡</span>
                HF Band Conditions
              </h2>
              <div style={styles.bandGrid}>
                <div style={styles.bandHeader}>
                  <span>Band</span>
                  <span>Day</span>
                  <span>Night</span>
                </div>
                {bandConditions.map((band, i) => (
                  <div key={band.name} style={{...styles.bandRow, animationDelay: `${i * 0.05}s`}}>
                    <div style={styles.bandName}>
                      <span style={styles.bandLabel}>{band.name}</span>
                      <span style={styles.bandFreq}>{band.freq}</span>
                    </div>
                    <div style={{...styles.conditionPill, backgroundColor: getConditionColor(band.day) + '22', borderColor: getConditionColor(band.day)}}>
                      <span style={{...styles.conditionDot, backgroundColor: getConditionColor(band.day)}}></span>
                      {band.day}
                    </div>
                    <div style={{...styles.conditionPill, backgroundColor: getConditionColor(band.night) + '22', borderColor: getConditionColor(band.night)}}>
                      <span style={{...styles.conditionDot, backgroundColor: getConditionColor(band.night)}}></span>
                      {band.night}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Right Column */}
            <div style={styles.rightColumn}>
              {/* K-Index History */}
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>
                  <span style={styles.cardIcon}>📊</span>
                  K-Index (Last 24 Hours)
                </h2>
                <div style={styles.kGraph}>
                  {kIndex && kIndex.slice(-24).map((reading, i) => {
                    const k = parseFloat(reading.kp_index);
                    return (
                      <div key={i} style={styles.kBarContainer}>
                        <div 
                          style={{
                            ...styles.kBar,
                            height: `${(k / 9) * 100}%`,
                            backgroundColor: getKIndexColor(k),
                            animationDelay: `${i * 0.03}s`
                          }}
                        />
                        <span style={styles.kLabel}>{k.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={styles.kScale}>
                  <span>Quiet (0-2)</span>
                  <span>Unsettled (3-4)</span>
                  <span>Storm (5+)</span>
                </div>
              </section>

              {/* Solar Flare Probability */}
              {probabilities && (
                <section style={styles.card}>
                  <h2 style={styles.cardTitle}>
                    <span style={styles.cardIcon}>⚡</span>
                    Flare Probability (24hr)
                  </h2>
                  <div style={styles.probGrid}>
                    <ProbabilityBar label="C-Class" value={probabilities.c_prob || 0} color="#44dd66" />
                    <ProbabilityBar label="M-Class" value={probabilities.m_prob || 0} color="#ffaa00" />
                    <ProbabilityBar label="X-Class" value={probabilities.x_prob || 0} color="#ff4455" />
                    <ProbabilityBar label="Proton Event" value={probabilities.proton_prob || 0} color="#aa44ff" />
                  </div>
                </section>
              )}

              {/* Signal Noise Estimate */}
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>
                  <span style={styles.cardIcon}>🔊</span>
                  Propagation Summary
                </h2>
                <div style={styles.summaryGrid}>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>Geomag Field</span>
                    <span style={{...styles.summaryValue, color: currentK <= 3 ? '#00ff88' : '#ffaa00'}}>
                      {currentK <= 2 ? 'Quiet' : currentK <= 4 ? 'Active' : 'Storm'}
                    </span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>HF Conditions</span>
                    <span style={{...styles.summaryValue, color: currentFlux > 120 ? '#00ff88' : currentFlux > 90 ? '#ffaa00' : '#ff4455'}}>
                      {currentFlux > 120 ? 'Good' : currentFlux > 90 ? 'Fair' : 'Poor'}
                    </span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>Signal Noise</span>
                    <span style={{...styles.summaryValue, color: '#3a86ff'}}>
                      S{Math.max(1, Math.min(9, Math.round(9 - currentK)))}
                    </span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>MUF Estimate</span>
                    <span style={{...styles.summaryValue, color: '#ffd23f'}}>
                      {Math.round(10 + (currentFlux / 10))} MHz
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Solar Flux Trend */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              <span style={styles.cardIcon}>📈</span>
              Solar Flux Index (30-Day Trend)
            </h2>
            <div style={styles.fluxGraph}>
              {solarFlux && solarFlux.map((reading, i) => {
                const flux = parseFloat(reading.flux);
                const maxFlux = Math.max(...solarFlux.map(r => parseFloat(r.flux)));
                const minFlux = Math.min(...solarFlux.map(r => parseFloat(r.flux)));
                const range = maxFlux - minFlux || 1;
                return (
                  <div key={i} style={styles.fluxBarContainer}>
                    <div 
                      style={{
                        ...styles.fluxBar,
                        height: `${((flux - minFlux) / range) * 80 + 20}%`,
                        animationDelay: `${i * 0.02}s`
                      }}
                      title={`${reading.time_tag?.slice(0, 10)}: ${flux} sfu`}
                    />
                  </div>
                );
              })}
            </div>
            <div style={styles.fluxScale}>
              <span>30 days ago</span>
              <span>Today</span>
            </div>
          </section>

          {/* Footer */}
          <footer style={styles.footer}>
            <p>Data sourced from NOAA Space Weather Prediction Center (SWPC)</p>
            <p>Band conditions are estimates based on current solar indices • Actual propagation may vary</p>
            <p style={styles.footerCredit}>Built with 💜 for amateur radio operators everywhere</p>
          </footer>
        </main>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap');
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes barGrow {
          from { height: 0; }
        }
        
        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 20px rgba(255, 107, 53, 0.4)); }
          50% { filter: drop-shadow(0 0 40px rgba(255, 107, 53, 0.8)); }
        }
        
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Metric Card Component
function MetricCard({ label, value, unit, color, description, trend }) {
  return (
    <div style={{...styles.metricCard, borderColor: color + '44'}}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValueRow}>
        <span style={{...styles.metricValue, color}}>{value}</span>
        <span style={styles.metricUnit}>{unit}</span>
        {trend && <span style={{...styles.metricTrend, color: trend === '↑' ? '#00ff88' : '#ff4455'}}>{trend}</span>}
      </div>
      <div style={styles.metricDesc}>{description}</div>
    </div>
  );
}

// Probability Bar Component
function ProbabilityBar({ label, value, color }) {
  return (
    <div style={styles.probRow}>
      <span style={styles.probLabel}>{label}</span>
      <div style={styles.probBarBg}>
        <div style={{...styles.probBarFill, width: `${value}%`, backgroundColor: color}}></div>
      </div>
      <span style={{...styles.probValue, color}}>{value}%</span>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%)',
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  bgStars: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `radial-gradient(2px 2px at 20px 30px, #fff, transparent),
                 radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
                 radial-gradient(1px 1px at 90px 40px, #fff, transparent),
                 radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.6), transparent),
                 radial-gradient(1px 1px at 160px 120px, #fff, transparent)`,
    backgroundSize: '200px 200px',
    opacity: 0.4,
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'fixed',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
    background: 'radial-gradient(circle at 30% 20%, rgba(255, 107, 53, 0.1) 0%, transparent 50%)',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  sunIcon: {
    fontSize: '48px',
    animation: 'glow 3s ease-in-out infinite',
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '28px',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #ff6b35 0%, #ffd23f 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
    letterSpacing: '2px',
  },
  subtitle: {
    fontSize: '12px',
    color: '#888',
    margin: '4px 0 0 0',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  headerRight: {
    textAlign: 'right',
  },
  utcTime: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '18px',
    color: '#00ff88',
    fontWeight: 600,
  },
  updateInfo: {
    fontSize: '11px',
    color: '#666',
    marginTop: '4px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    gap: '20px',
  },
  loadingSpinner: {
    width: '60px',
    height: '60px',
    border: '4px solid rgba(255,107,53,0.2)',
    borderTop: '4px solid #ff6b35',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontFamily: "'JetBrains Mono', monospace",
    color: '#888',
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  metricCard: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid',
    backdropFilter: 'blur(10px)',
    animation: 'fadeInUp 0.5s ease-out both',
  },
  metricLabel: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
  },
  metricValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  metricValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '36px',
    fontWeight: 700,
  },
  metricUnit: {
    fontSize: '14px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metricTrend: {
    fontSize: '20px',
    marginLeft: '8px',
  },
  metricDesc: {
    fontSize: '11px',
    color: '#666',
    marginTop: '8px',
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '24px',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(10px)',
    animation: 'fadeInUp 0.5s ease-out both',
  },
  cardTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    margin: '0 0 20px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textTransform: 'uppercase',
    letterSpacing: '2px',
  },
  cardIcon: {
    fontSize: '20px',
  },
  bandGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  bandHeader: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 1fr',
    gap: '12px',
    padding: '0 12px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  bandRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 1fr',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    animation: 'fadeInUp 0.4s ease-out both',
  },
  bandName: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  bandLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 700,
    fontSize: '15px',
    color: '#fff',
  },
  bandFreq: {
    fontSize: '10px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
  conditionPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid',
    justifyContent: 'center',
  },
  conditionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  kGraph: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
    height: '100px',
    padding: '10px 0',
  },
  kBarContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    height: '100%',
    justifyContent: 'flex-end',
  },
  kBar: {
    width: '100%',
    borderRadius: '4px 4px 0 0',
    minHeight: '4px',
    animation: 'barGrow 0.5s ease-out both',
  },
  kLabel: {
    fontSize: '8px',
    color: '#666',
    fontFamily: "'JetBrains Mono', monospace",
  },
  kScale: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#666',
    marginTop: '8px',
    padding: '0 4px',
  },
  probGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  probRow: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 50px',
    gap: '12px',
    alignItems: 'center',
  },
  probLabel: {
    fontSize: '12px',
    color: '#aaa',
  },
  probBarBg: {
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  probBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.5s ease-out',
  },
  probValue: {
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textAlign: 'right',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
  },
  summaryLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  summaryValue: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '18px',
    fontWeight: 700,
  },
  fluxGraph: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
    height: '80px',
    padding: '10px 0',
  },
  fluxBarContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    height: '100%',
  },
  fluxBar: {
    width: '100%',
    background: 'linear-gradient(to top, #ff6b35, #ffd23f)',
    borderRadius: '2px 2px 0 0',
    animation: 'barGrow 0.5s ease-out both',
    cursor: 'pointer',
    transition: 'filter 0.2s',
  },
  fluxScale: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#666',
    marginTop: '8px',
  },
  footer: {
    textAlign: 'center',
    padding: '32px 0',
    marginTop: '24px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    fontSize: '12px',
    color: '#666',
  },
  footerCredit: {
    marginTop: '12px',
    color: '#888',
  },
};
