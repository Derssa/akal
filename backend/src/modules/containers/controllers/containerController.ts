import { Request, Response } from 'express';
import { ContainerService } from '../services/containerService';

export class ContainerController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const list = await ContainerService.listContainers(projectId as string);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const container = await ContainerService.createContainer(projectId as string, name);
      res.status(201).json(container);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async start(req: Request, res: Response): Promise<void> {
    try {
      await ContainerService.startContainer(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async stop(req: Request, res: Response): Promise<void> {
    try {
      await ContainerService.stopContainer(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      await ContainerService.deleteContainer(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
