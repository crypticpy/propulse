import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { SolarPulse } from "@/pages/SolarPulse";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/solar" element={<SolarPulse />} />
      </Route>
    </Routes>
  );
}

export default App;
