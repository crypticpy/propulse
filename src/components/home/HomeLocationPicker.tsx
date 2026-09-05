import { useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { isValidGrid, latLonToGrid } from "@/lib/utils/grid";
export function HomeLocationPicker() {
  const { location, choose, guest } = useHomeLocation();
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState("");
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const apply = (value: string) => { choose(value); setOpen(false); setError(""); };
  return <><button type="button" aria-label={location ? `Choose Home location: ${location.grid}` : "Set your location"} onClick={() => { setGrid(location?.grid ?? ""); setOpen(true); }}> {location ? `Location: ${location.grid}` : "Set your location"} ⌄</button>
    <AccessibleDialog open={open} onClose={() => setOpen(false)} title="Choose your location" description="Use a grid square without creating an account.">
      <div className="home-dashboard home-location-dialog"><form onSubmit={e => { e.preventDefault(); const next = grid.trim().toUpperCase(); if (!isValidGrid(next)) { setError("Enter a 4- or 6-character grid, such as DM79 or IO91wm."); return; } apply(next); }}>
        <label htmlFor="home-grid">Maidenhead grid</label><input id="home-grid" value={grid} onChange={e => setGrid(e.target.value)} placeholder="DM79 or IO91wm" autoComplete="off" maxLength={6} />
        {error && <p role="alert">{error}</p>}<div className="home-actions"><button type="submit">Use this location</button><button type="button" onClick={() => apply("global")}>Use global view</button>{!guest && <button type="button" onClick={() => apply("station")}>Use station location</button>}</div>
      </form><button type="button" disabled={locating} onClick={() => { if (!navigator.geolocation) { setError("Location is unavailable in this browser. Enter your grid instead."); return; } setLocating(true); navigator.geolocation.getCurrentPosition(pos => { setLocating(false); apply(latLonToGrid(pos.coords.latitude, pos.coords.longitude, 6)); }, () => { setLocating(false); setError("Your location could not be read. Enter your grid instead."); }, { timeout: 10000, maximumAge: 300000 }); }}>{locating ? "Finding location…" : "Use my approximate location"}</button><p className="home-note">Saved in this browser. This changes Home’s location, not your station setup.</p></div>
    </AccessibleDialog></>;
}
