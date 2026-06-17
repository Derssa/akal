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
      const { name, type } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const container = await ContainerService.createContainer(projectId as string, name, type || 'ubuntu');
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

  public static async postgresExplorer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const explorerData = await ContainerService.getPostgresExplorer(id as string);
      res.json(explorerData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async postgresQuery(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { query, database } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }
      const result = await ContainerService.executePostgresQuery(id as string, database || 'postgres', query);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async mysqlExplorer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const explorerData = await ContainerService.getMysqlExplorer(id as string);
      res.json(explorerData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async mysqlQuery(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { query, database } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }
      const result = await ContainerService.executeMysqlQuery(id as string, database || 'mysql', query);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
