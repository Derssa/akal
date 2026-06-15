import fs from 'fs';
import path from 'path';
import { ContainerManager } from '../../../infrastructure/docker/ContainerManager';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

const DB_PATH = path.join(__dirname, '../../../../projects.json');

export class ProjectService {
  private static readDB(): Project[] {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([]));
    }
    try {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private static writeDB(data: Project[]): void {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }

  public static async listProjects(): Promise<Project[]> {
    return this.readDB();
  }

  public static async createProject(name: string): Promise<Project> {
    const db = this.readDB();
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      createdAt: new Date().toISOString()
    };
    db.push(newProject);
    this.writeDB(db);
    return newProject;
  }

  public static async deleteProject(id: string): Promise<void> {
    const db = this.readDB();
    const filtered = db.filter(p => p.id !== id);
    this.writeDB(filtered);

    // Stop and delete all containers belonging to this project
    const containers = await ContainerManager.listContainersByProject(id);
    for (const c of containers) {
      try {
        await ContainerManager.deleteContainer(c.id);
      } catch (err) {
        console.error(`Failed to delete container ${c.id} during project cleanup:`, err);
      }
    }
  }
}
