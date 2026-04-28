import { Route, Routes } from 'react-router-dom';
import { DevStagePage } from './routes/dev/stage.js';
import { EditorPage } from './routes/editor.js';
import { LandingPage } from './routes/landing.js';
import { ViewerPage } from './routes/viewer.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/c/:slug" element={<ViewerPage />} />
      <Route path="/c/:slug/edit" element={<EditorPage />} />
      <Route path="/dev/stage" element={<DevStagePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--sj-muted)' }}>
      <h1 style={{ marginBottom: 8 }}>404</h1>
      <p>page not found</p>
    </div>
  );
}
