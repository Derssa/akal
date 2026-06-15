import { Request, Response } from 'express';
import { ProjectService } from '../services/projectService';

export class ProjectController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const list = await ProjectService.listProjects();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }
      const project = await ProjectService.createProject(name);
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      await ProjectService.deleteProject(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
