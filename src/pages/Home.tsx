import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="text-center space-y-6">
        <div className="text-6xl animate-pulse-glow">☀️</div>
        <h1 className="font-orbitron text-4xl md:text-5xl font-black text-gradient-orange tracking-wider">
          PROPULSE
        </h1>
        <p className="text-gray-400 text-lg tracking-wide">
          The ionosphere, visualized
        </p>

        <div className="pt-8">
          <Link
            to="/solar"
            className="inline-flex items-center gap-2 px-8 py-4 bg-plasma-orange/20 border border-plasma-orange/50 rounded-xl text-plasma-orange font-semibold hover:bg-plasma-orange/30 transition-colors"
          >
            <span>Enter Solar Dashboard</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
