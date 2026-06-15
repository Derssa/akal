import { useState } from 'react';
import CanvasPage from '../pages/CanvasPage/CanvasPage';
import TerminalModal from '../features/terminal/components/TerminalModal';

import ProjectsPage from '../pages/ProjectsPage/ProjectsPage';

interface TerminalInfo {
  id: string;
  name: string;
}

interface ProjectInfo {
  id: string;
  name: string;
}

function App() {
  const [activeProject, setActiveProject] = useState<ProjectInfo | null>(null);
  const [activeTerminal, setActiveTerminal] = useState<TerminalInfo | null>(null);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {!activeProject ? (
        <ProjectsPage 
          onSelectProject={(id, name) => setActiveProject({ id, name })} 
        />
      ) : (
        <CanvasPage 
          projectId={activeProject.id}
          projectName={activeProject.name}
          onBackToProjects={() => {
            setActiveProject(null);
            setActiveTerminal(null);
          }}
          onTerminalOpen={(id, name) => setActiveTerminal({ id, name })} 
        />
      )}

      {activeTerminal && (
        <TerminalModal
          containerId={activeTerminal.id}
          nodeName={activeTerminal.name}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}

export default App;
