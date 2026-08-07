import { Routes, Route } from "react-router-dom";
import SetupPage from "./SetupPage";
import MediaStudio from "./MediaStudio";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/app" element={<MediaStudio />} />
    </Routes>
  );
}
