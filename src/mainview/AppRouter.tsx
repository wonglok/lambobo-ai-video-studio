import { Routes, Route } from "react-router-dom";
import SetupPage from "./SetupPage";
import MediaStudio from "./MediaStudio";
import ProjectEditorPage from "./components/ProjectEditorPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/app" element={<MediaStudio />} />
      <Route path="/project/:id" element={<ProjectEditorPage />} />
    </Routes>
  );
}
