import { Request, Response } from 'express';
import { ContainerService } from '../services/containerService';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import docker from '../../../infrastructure/docker/DockerClient';

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
      const { name, type, subnetId } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      let isPublic = false;
      const config = await ProjectService.getNetworkConfig(projectId as string);
      if (config && subnetId) {
        const subnet = config.subnets?.find((s: any) => s.id === subnetId);
        if (subnet && subnet.type === 'public') {
          isPublic = true;
        }
      }

      const container = await ContainerService.createContainer(projectId as string, name, type || 'ubuntu', isPublic);
      
      // Auto-reapply policies after creating container so it gets added to mapped endpoints
      if (config) {
        NetworkService.clearPolicyHash(projectId as string);
        NetworkService.applyPolicy(projectId as string, config).catch(err => {
          console.error(`Failed to re-apply policy on create:`, err);
        });
      }

      res.status(201).json(container);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async start(req: Request, res: Response): Promise<void> {
    try {
      const containerId = req.params.id as string;
      let projectId: string | undefined;
      try {
        const inspectData = await docker.getContainer(containerId).inspect();
        projectId = inspectData.Config.Labels['akal.project.id'];
      } catch (inspectErr) {
        console.warn(`Failed to inspect container before starting:`, inspectErr);
      }

      await ContainerService.startContainer(containerId);

      if (projectId) {
        const config = await ProjectService.getNetworkConfig(projectId);
        if (config) {
          NetworkService.clearPolicyHash(projectId);
          NetworkService.applyPolicy(projectId, config).catch(err => {
            console.error(`Failed to re-apply network policy on start:`, err);
          });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async stop(req: Request, res: Response): Promise<void> {
    try {
      const containerId = req.params.id as string;
      let projectId: string | undefined;
      try {
        const inspectData = await docker.getContainer(containerId).inspect();
        projectId = inspectData.Config.Labels['akal.project.id'];
      } catch (inspectErr) {
        console.warn(`Failed to inspect container before stopping:`, inspectErr);
      }

      await ContainerService.stopContainer(containerId);

      if (projectId) {
        const config = await ProjectService.getNetworkConfig(projectId);
        if (config) {
          NetworkService.clearPolicyHash(projectId);
          NetworkService.applyPolicy(projectId, config).catch(err => {
            console.error(`Failed to re-apply network policy on stop:`, err);
          });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      const containerId = req.params.id as string;
      let projectId: string | undefined;
      try {
        const inspectData = await docker.getContainer(containerId).inspect();
        projectId = inspectData.Config.Labels['akal.project.id'];
      } catch (inspectErr) {
        console.warn(`Failed to inspect container before deleting:`, inspectErr);
      }

      await ContainerService.deleteContainer(containerId);

      if (projectId) {
        const config = await ProjectService.getNetworkConfig(projectId);
        if (config) {
          NetworkService.clearPolicyHash(projectId);
          NetworkService.applyPolicy(projectId, config).catch(err => {
            console.error(`Failed to re-apply network policy on delete:`, err);
          });
        }
      }

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

  public static async redisExplorer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const explorerData = await ContainerService.getRedisExplorer(id as string);
      res.json(explorerData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async redisQuery(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { query } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }
      const result = await ContainerService.executeRedisQuery(id as string, query);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async nosqlExplorer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const explorerData = await ContainerService.getNosqlExplorer(id as string);
      res.json(explorerData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async nosqlQuery(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { query } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }
      const result = await ContainerService.executeNosqlQuery(id as string, query);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async scale(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cpus, memory } = req.body;
      await ContainerService.scaleContainer(id as string, cpus, memory);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
